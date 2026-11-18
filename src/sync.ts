import { createClient } from '@supabase/supabase-js'
import { ref, watch } from 'vue'
import { state, normalise, type Data } from './store'

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
export async function lock() {
  await supabase?.auth.signOut()
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
  }
  state.data = normalise(pulled as unknown as Data)
  status.value = 'saved'
  if (!started) {
    started = true
    watch(() => state.data, schedule, { deep: true })
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
  try {
    for (const t of TABLES) {
      const rows = rowsOf(t)
      const now = new Map(rows.map(r => [r.id, canon(r)]))
      const upserts = rows
        .map((r, pos) => ({ id: r.id, data: JSON.parse(now.get(r.id)!), pos }))
        .filter(r => synced[t].get(r.id) !== now.get(r.id))
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
    }
    status.value = 'saved'
    syncError.value = ''
  } catch (e) {
    status.value = 'error'
    syncError.value = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
  } finally {
    pushing = false
    if (again) { again = false; push() }
  }
}

/* ---------- Following other people's changes ---------- */
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
        const i = list.findIndex(r => r.id === id)
        if (i >= 0) list.splice(i, 1)
        return
      }
      const row = payload.new as { id: string; data: Row; pos: number }
      const text = canon(row.data)
      if (synced[t].get(row.id) === text) return // our own save coming back
      synced[t].set(row.id, text)
      const i = list.findIndex(r => r.id === row.id)
      if (i >= 0) list[i] = row.data
      else list.splice(Math.min(row.pos, list.length), 0, row.data)
    })
  }
  channel.subscribe()
}
