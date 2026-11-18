import { createClient } from '@supabase/supabase-js'
import { ref, watch } from 'vue'
import { state, normalise, orderChanged, type Data } from './store'

/**
 * Shared database (Supabase).
 *
 * Without the three settings below the app runs on this browser's local storage only.
 * With them, the team unlocks the app with one shared password: it signs in as the single
 * team user, loads everything, and from then on saves each change and follows the changes
 * other people make.
 *
 * Each person, project, allocation and PhD is one row (id, data, pos), so two people only
 * collide when they edit the very same row at the same moment; then the last save wins.
 * "pos" is the shared row order. It is only rewritten when someone reorders (or undoes,
 * or imports); ordinary edits keep the position the database already has.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const teamEmail = import.meta.env.VITE_TEAM_EMAIL as string | undefined

export const remote = !!(url && anonKey && teamEmail)
const supabase = remote ? createClient(url!, anonKey!) : null

export type SyncStatus = 'local' | 'locked' | 'loading' | 'saving' | 'saved' | 'error'
export const status = ref<SyncStatus>(remote ? 'locked' : 'local')
export const syncError = ref('')

const TABLES = ['people', 'projects', 'assignments', 'phds'] as const
type Table = (typeof TABLES)[number]
type Row = { id: string }

/** What the database is known to hold, per table: id -> canonical JSON of the row. */
const synced = Object.fromEntries(TABLES.map(t => [t, new Map<string, string>()])) as Record<Table, Map<string, string>>
/** The position the database holds for each row, per table. */
const syncedPos = Object.fromEntries(TABLES.map(t => [t, new Map<string, number>()])) as Record<Table, Map<string, number>>
/** Set when this browser changed the order and its new positions still have to be saved. */
let orderDirty = false
const rowsOf = (t: Table) => state.data[t] as Row[]

/** JSON with sorted keys, so the same row always gives the same text (Postgres reorders keys). */
function canon(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return '{' + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'
  }
  return JSON.stringify(v ?? null)
}

/* ---------- Unlocking ---------- */
/** Returns an error message, or null when the password was right. */
export async function unlock(password: string): Promise<string | null> {
  if (!supabase) return null
  const { error } = await supabase.auth.signInWithPassword({ email: teamEmail!, password })
  if (error) return error.message === 'Invalid login credentials' ? 'That is not the team password.' : error.message
  return start()
}
/** On page load: carry on if this browser was unlocked before. */
export async function resume() {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (data.session) await start()
}
/**
 * Sign this browser out: it shows the password screen again. Other browsers stay signed in,
 * and the data and password are untouched. Any change still waiting to be saved is saved first.
 */
export async function signOut() {
  if (!supabase) return
  clearTimeout(timer)
  while (pushing) await new Promise(r => setTimeout(r, 100))
  await push()
  if (status.value === 'error' && !confirm(`Your last change could not be saved (${syncError.value}). Sign out anyway and lose it?`)) return
  await supabase.auth.signOut()
  location.reload()
}

/* ---------- Loading ---------- */
let started = false
async function start(): Promise<string | null> {
  if (!supabase) return null
  status.value = 'loading'
  const pulled: Record<string, unknown[]> = {}
  for (const t of TABLES) {
    const { data, error } = await supabase.from(t).select('id, data, pos').order('pos')
    if (error) {
      status.value = 'locked'
      await supabase.auth.signOut()
      return `Could not read the database: ${error.message}`
    }
    pulled[t] = data.map(r => r.data)
    synced[t] = new Map(data.map(r => [r.id as string, canon(r.data)]))
    syncedPos[t] = new Map(data.map(r => [r.id as string, r.pos as number]))
  }
  state.data = normalise(pulled as unknown as Data)
  status.value = 'saved'
  if (!started) {
    started = true
    watch(() => state.data, schedule, { deep: true })
    watch(orderChanged, () => { orderDirty = true; schedule() })
    subscribe()
  }
  return null
}

/* ---------- Saving ---------- */
let timer: ReturnType<typeof setTimeout> | undefined
let pushing = false, again = false
function schedule() {
  status.value = 'saving'
  clearTimeout(timer)
  timer = setTimeout(push, 600)
}
async function push() {
  if (!supabase) return
  if (pushing) { again = true; return }
  pushing = true
  const writeOrder = orderDirty
  orderDirty = false
  try {
    for (const t of TABLES) {
      const rows = rowsOf(t)
      const now = new Map(rows.map(r => [r.id, canon(r)]))
      const known = syncedPos[t]
      let next = Math.max(-1, ...known.values()) + 1
      const posNow = new Map<string, number>()
      // Reordered here: every row takes its place in this browser's list.
      // Otherwise a row keeps the position the database has, and new rows go at the end.
      rows.forEach((r, i) => posNow.set(r.id, writeOrder ? i : known.get(r.id) ?? next++))
      const upserts = rows
        .filter(r => synced[t].get(r.id) !== now.get(r.id) || known.get(r.id) !== posNow.get(r.id))
        .map(r => ({ id: r.id, data: JSON.parse(now.get(r.id)!), pos: posNow.get(r.id)! }))
      const deletes = [...synced[t].keys()].filter(id => !now.has(id))
      if (upserts.length) {
        const { error } = await supabase.from(t).upsert(upserts)
        if (error) throw error
      }
      if (deletes.length) {
        const { error } = await supabase.from(t).delete().in('id', deletes)
        if (error) throw error
      }
      synced[t] = now
      syncedPos[t] = posNow
    }
    status.value = 'saved'
    syncError.value = ''
  } catch (e) {
    orderDirty = orderDirty || writeOrder // try the new order again with the next save
    status.value = 'error'
    syncError.value = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
  } finally {
    pushing = false
    if (again) { again = false; push() }
  }
}

/* ---------- Following other people's changes ---------- */
/** Put a table back in the database's order, e.g. after someone else reordered. */
const resortTimers: Partial<Record<Table, ReturnType<typeof setTimeout>>> = {}
function resortSoon(t: Table) {
  clearTimeout(resortTimers[t])
  resortTimers[t] = setTimeout(() => {
    if (orderDirty) return // our own reorder is waiting to be saved; it wins
    const pos = syncedPos[t]
    const list = rowsOf(t)
    const at = (r: Row) => pos.get(r.id) ?? Number.MAX_SAFE_INTEGER
    if (list.every((r, i) => i === 0 || at(list[i - 1]) <= at(r))) return
    list.sort((a, b) => at(a) - at(b))
  }, 150)
}

function subscribe() {
  if (!supabase) return
  const channel = supabase.channel('portfolio')
  for (const t of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, payload => {
      const list = rowsOf(t)
      if (payload.eventType === 'DELETE') {
        const id = (payload.old as Row).id
        if (!synced[t].has(id)) return // our own delete
        synced[t].delete(id)
        syncedPos[t].delete(id)
        const i = list.findIndex(r => r.id === id)
        if (i >= 0) list.splice(i, 1)
        return
      }
      const row = payload.new as { id: string; data: Row; pos: number }
      const text = canon(row.data)
      const moved = syncedPos[t].get(row.id) !== row.pos
      if (synced[t].get(row.id) === text && !moved) return // our own save coming back
      syncedPos[t].set(row.id, row.pos)
      if (synced[t].get(row.id) !== text) {
        synced[t].set(row.id, text)
        const i = list.findIndex(r => r.id === row.id)
        if (i >= 0) list[i] = row.data
        else list.push(row.data)
      }
      resortSoon(t)
    })
  }
  channel.subscribe()
}
