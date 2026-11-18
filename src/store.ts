import { reactive, computed, watch, ref } from 'vue'
import { seed } from './seed'

/* ---------- Model ----------
 * Time is counted in quarters: q = year * 4 + (quarter - 1).
 * Effort is counted in person-months (PM) per quarter.
 */
export interface Person {
  id: string
  name: string
  capacity: number // contract, in PM per quarter
  archived?: boolean // alumni: left the team (for everyone)
  base: number // PM per quarter paid by the faculty: salary that needs no project funding
  teaching: number[] // standard teaching load in PM for Q1..Q4, repeating every year
  start: number | null // first quarter in the team (null = always)
  end: number | null // last quarter in the team (null = open-ended)
}
export interface Milestone {
  id: string
  title: string
  date: string // YYYY-MM-DD
  done?: boolean // used by PhD milestones
}
export interface Project {
  id: string
  name: string
  org: Org // who we participate as
  funder: string
  color: number // palette slot, see colorOf()
  promised?: Record<number, number> // quarter -> PM the project committed to deliver
  archived?: boolean // put away for everyone; still counts in people's load and in reports
  start: number
  end: number
  milestones: Milestone[]
}
export interface Assignment {
  id: string
  projectId: string
  personId: string
  pm: Record<number, number> // quarter -> person-months planned
  funded?: Record<number, number> // quarter -> PM this project pays, only where that differs from the plan
  actual?: Record<number, number> // month (year * 12 + month) -> days really worked
  /**
   * Overlapping effort: the same work also counts elsewhere (e.g. a fellowship that is planned as its own row).
   * It counts towards the project, but is not added to the person's load, and the project does not pay for it.
   */
  overlap?: Marks
  /**
   * Counts toward the person's PhD: project work that also advances their PhD.
   * Only a note for assessing the PhD; load and funding stay as they are.
   */
  phdWork?: Marks
}
/** Quarters a mark applies to: true = the whole run of the project, or one entry per quarter. */
export type Marks = boolean | Record<number, boolean>
export type MarkKey = 'overlap' | 'phdWork'
export const markAt = (m: Marks | undefined, q: number) => m === true || (!!m && typeof m === 'object' && !!m[q])
export const markAny = (m: Marks | undefined) => m === true || (!!m && typeof m === 'object' && Object.values(m).some(Boolean))
/* A PhD runs on top of project work: it has its own track, milestones and chapters, and takes no person-months. */
export type ChapterStatus = 'not_started' | 'in_progress' | 'finished'
export const CHAPTER_STATUS: Record<ChapterStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  finished: 'Finished',
}
export interface Chapter {
  id: string
  title: string
  status: ChapterStatus
}
export interface Phd {
  id: string
  personId: string
  title: string
  start: number
  end: number // expected end
  archived?: boolean // completed (for everyone)
  milestones: Milestone[]
  chapters: Chapter[]
}
/** Anything drawn as a bar on the timeline. */
export interface Spanned { id: string; start: number; end: number; milestones: Milestone[] }
export interface Data {
  people: Person[]
  projects: Project[]
  assignments: Assignment[]
  phds: Phd[]
}
export type Org = 'UGent' | 'imec'
export const ORGS: Org[] = ['UGent', 'imec']
/** Project tag, e.g. "UGent - Digital Europe". */
export const tagOf = (p: Project) => (p.funder ? `${p.org} - ${p.funder}` : p.org)
export type View = 'projects' | 'people' | 'phds'
/**
 * The same grid can be read in different ways:
 *  plan    - who works on what (time)
 *  funding - which project pays whom (salary cover)
 *  actuals - days really worked, per month (what gets reported)
 */
export type Lens = 'plan' | 'funding' | 'actuals'
export const LENSES: { id: Lens; label: string; hint: string }[] = [
  { id: 'plan', label: 'Plan', hint: 'Who works on what' },
  { id: 'funding', label: 'Funding', hint: 'Which project pays whom, and who is covered' },
  { id: 'actuals', label: 'Actuals', hint: 'Days really worked per month, for reporting' },
]

/* ---------- Themes ----------
 * A project stores a colour slot (0-9); each house style maps the slots to its own palette.
 * UGent: every project is UGent blue. imec: the chart accent order, then navy and greys.
 */
export type Theme = 'ugent' | 'imec'
export const THEMES: { id: Theme; label: string }[] = [
  { id: 'ugent', label: 'UGent' },
  { id: 'imec', label: 'imec' },
]
const PALETTES: Record<Theme, string[]> = {
  ugent: ['#1E64C8'],
  imec: ['#3E98BD', '#52BDC1', '#90288D', '#1582BD', '#36337C', '#99BDE4', '#003E6B', '#3C3C3B', '#929497', '#2D6C85'],
}
export const SLOTS = Array.from({ length: 10 }, (_, i) => i)
const THEME_KEY = 'portfolio-theme'
export const theme = ref<Theme>(localStorage.getItem(THEME_KEY) === 'imec' ? 'imec' : 'ugent')
watch(theme, t => {
  document.documentElement.dataset.theme = t
  localStorage.setItem(THEME_KEY, t)
}, { immediate: true })
/** False when the active style gives every project the same colour. */
export const hasColors = computed(() => PALETTES[theme.value].length > 1)
export const colorOf = (slot: number) => {
  const p = PALETTES[theme.value]
  return p[((slot % p.length) + p.length) % p.length]
}

/* ---------- Effort units ----------
 * Planning is done in person-months (PM) per quarter. One PM is 17.5 working days,
 * so a full-time quarter is 3 PM = 52.5 days.
 */
export const DAYS_PER_PM = 17.5
export const FULL_TIME = 3 // PM per quarter
export const days = (pm: number) => Math.round(pm * DAYS_PER_PM)
export const shareOfFullTime = (pm: number) => Math.round((pm / FULL_TIME) * 100) + '%'
/** Display unit. Effort is always stored in PM; days are a view on it. */
export type Unit = 'pm' | 'days'
export const UNITS: { id: Unit; label: string }[] = [
  { id: 'pm', label: 'Months' },
  { id: 'days', label: 'Days' },
]
const UNIT_KEY = 'portfolio-unit'
export const unit = ref<Unit>(localStorage.getItem(UNIT_KEY) === 'days' ? 'days' : 'pm')
watch(unit, u => localStorage.setItem(UNIT_KEY, u))
export const unitLabel = computed(() => (unit.value === 'days' ? 'days' : 'PM'))
/** A PM value as a number in the chosen unit ('' for zero). */
export const show = (pm: number | undefined) => fmt(unit.value === 'days' ? (pm || 0) * DAYS_PER_PM : pm)
/** A PM value with its unit, e.g. "1.5 PM" or "26.25 days". */
export const amount = (pm: number) => `${show(pm) || '0'} ${unitLabel.value}`

/**
 * Reads typed effort as person-months. A plain number is in the chosen unit;
 * "26d" is always days, "1.5pm" always person-months, "50%" a share of a full-time quarter.
 */
export function parsePm(text: string): number {
  const t = text.trim().toLowerCase().replace(',', '.')
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return 0
  let pm: number
  if (t.endsWith('%')) pm = Math.round((n / 100) * FULL_TIME * 20) / 20
  else if (t.endsWith('d') || (unit.value === 'days' && !t.endsWith('m'))) {
    // Working in days: keep the exact day count. Otherwise snap to the nearest 0.05 PM (26d -> 1.5).
    pm = unit.value === 'days' ? Math.round((n / DAYS_PER_PM) * 10000) / 10000 : Math.round((n / DAYS_PER_PM) * 20) / 20
  } else pm = Math.round(n * 100) / 100
  return Math.min(Math.max(pm, 0), 12)
}

/* ---------- Time helpers ---------- */
export const qOf = (year: number, quarter: number) => year * 4 + quarter - 1
export const qYear = (q: number) => Math.floor(q / 4)
export const qNum = (q: number) => (((q % 4) + 4) % 4) + 1
export const qLabel = (q: number) => `Q${qNum(q)} ${qYear(q)}`

/** Fractional quarter position of a date, e.g. mid-Feb 2026 -> 8104.5 */
export function dateToQ(d: Date | string): number {
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : d
  const y = date.getFullYear()
  const qi = Math.floor(date.getMonth() / 3)
  const s = new Date(y, qi * 3, 1).getTime()
  const e = new Date(y, qi * 3 + 3, 1).getTime()
  return y * 4 + qi + (date.getTime() - s) / (e - s)
}
export function shiftDate(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return isoDate(d)
}
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const nowQ = dateToQ(new Date())
export const currentQ = Math.floor(nowQ)

/* Months, used for actuals: m = year * 12 + month (0-11), so a month's quarter is floor(m / 3). */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const mToQ = (m: number) => Math.floor(m / 3)
export const mLabel = (m: number) => `${MONTHS[((m % 12) + 12) % 12]} ${Math.floor(m / 12)}`
export const currentM = new Date().getFullYear() * 12 + new Date().getMonth()
/** Days in one month for an amount given in PM per quarter. */
export const perMonth = (pmPerQuarter: number) => (pmPerQuarter / 3) * DAYS_PER_PM
export function parseDays(text: string): number {
  const n = parseFloat(text.trim().replace(',', '.'))
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n * 100) / 100, 0), 31) : 0
}

export const fmt = (v: number | undefined) => (v ? String(Math.round(v * 100) / 100) : '')
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map(w => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase()

/* ---------- State ---------- */
const KEY = 'portfolio-prototype-v9'
/** With a shared database configured, nothing is kept in this browser: the data comes from there. */
const REMOTE = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY && import.meta.env.VITE_TEAM_EMAIL)
/** Fill in anything a stored or imported dataset may lack, so older files keep working. */
export function normalise(input: Partial<Data>): Data {
  const d: Data = { people: input.people ?? [], projects: input.projects ?? [], assignments: input.assignments ?? [], phds: input.phds ?? [] }
  for (const p of d.people) { p.base ??= 0; p.teaching ??= [0, 0, 0, 0]; p.start ??= null; p.end ??= null }
  for (const p of d.projects) { p.milestones ??= []; p.org ??= 'UGent'; p.funder ??= ''; p.color ??= 0 }
  for (const a of d.assignments) a.pm ??= {}
  for (const p of d.phds) { p.milestones ??= []; p.chapters ??= []; p.title ??= '' }
  return d
}
function load(): Data {
  if (REMOTE) return normalise({})
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d: Data = { phds: [], ...JSON.parse(raw) }
      for (const p of d.people) { p.base ??= 0; p.teaching ??= [0, 0, 0, 0] }
      return d
    }
  } catch { /* fall through to demo data */ }
  return seed()
}

export const state = reactive({
  data: load(),
  view: 'projects' as View,
  lens: 'plan' as Lens,
  list: { projects: 'active', people: 'active', phds: 'active' } as Record<View, ListName>, // which list each tab shows
  month: currentM - 1, // the month picked in the Actuals lens
  report: false, // month report open
  expanded: {} as Record<string, boolean>,
  drawer: null as null | { type: 'project' | 'person' | 'phd'; id: string },
  readout: null as null | string, // plain-language reading of the hovered or selected cell
  focus: null as null | string, // id of a group to scroll to and flash
})

watch(() => state.data, d => { if (!REMOTE) localStorage.setItem(KEY, JSON.stringify(d)) }, { deep: true })

/* ---------- Hiding and archiving ----------
 * Every project, person and PhD is in exactly one of three lists:
 *   archived - put away for everyone and stored with the record
 *              (projects: archived, people: alumni, PhDs: completed)
 *   hidden   - put away by this viewer only, remembered in this browser
 *   active   - everything else
 * Archived wins over hidden, so the two can never be mixed up on screen.
 * Neither removes anything: the effort still counts in loads, totals and reports.
 */
export type ListName = 'active' | 'hidden' | 'archived'
export interface Listable { id: string; archived?: boolean }
/** What "archived" is called on each tab. */
export const LIST_WORDS: Record<View, { archived: string; archive: string; restore: string }> = {
  projects: { archived: 'archived', archive: 'Archive', restore: 'Restore from archive' },
  people: { archived: 'alumni', archive: 'Move to alumni', restore: 'Back to the team' },
  phds: { archived: 'completed', archive: 'Mark as completed', restore: 'Reopen' },
}
const HIDDEN_KEY = 'portfolio-hidden-projects' // name kept from when only projects could be hidden
function readHidden(): string[] {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]') } catch { return [] }
}
const hiddenIds = ref<string[]>(readHidden())
watch(hiddenIds, ids => localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids)), { deep: true })
export const listOf = (e: Listable): ListName => (e.archived ? 'archived' : hiddenIds.value.includes(e.id) ? 'hidden' : 'active')
const recordsOf = (view: View): Listable[] => (view === 'projects' ? state.data.projects : view === 'people' ? state.data.people : state.data.phds)
export const listCounts = computed(() => {
  const out = {} as Record<View, Record<ListName, number>>
  for (const view of ['projects', 'people', 'phds'] as View[]) {
    const n: Record<ListName, number> = { active: 0, hidden: 0, archived: 0 }
    for (const e of recordsOf(view)) n[listOf(e)]++
    out[view] = n
  }
  return out
})
const unhide = (id: string) => { hiddenIds.value = hiddenIds.value.filter(x => x !== id) }
/** Hide for me, or show again. Personal, so not part of undo. */
export function toggleHidden(e: Listable) {
  if (hiddenIds.value.includes(e.id)) unhide(e.id)
  else hiddenIds.value = [...hiddenIds.value, e.id]
}
/** Archive for everyone, or restore. A restored record comes back as active for whoever restores it. */
export function toggleArchived(e: Listable) {
  unhide(e.id)
  mutate(() => { e.archived = !e.archived })
}
// Never leave someone looking at an empty Hidden or Archived list.
watch(listCounts, counts => {
  for (const view of ['projects', 'people', 'phds'] as View[]) {
    if (!counts[view][state.list[view]]) state.list[view] = 'active'
  }
})

/* ---------- Undo ---------- */
const undoStack = ref<string[]>([])
export const canUndo = computed(() => undoStack.value.length > 0)
export const takeSnapshot = () => JSON.stringify(state.data)
export function pushUndo(snapshot: string) {
  undoStack.value.push(snapshot)
  if (undoStack.value.length > 100) undoStack.value.shift()
}
export function undo() {
  const s = undoStack.value.pop()
  if (s) { state.data = JSON.parse(s); orderChanged.value++ }
}

/* ---------- Row order ----------
 * The order of projects, people and PhDs is the order of their arrays. It is shared:
 * the database stores it, so everyone sees the same order. Rows inside an expanded
 * project or person follow the same order.
 * `orderChanged` tells the sync layer that positions, not only contents, must be saved.
 */
export const orderChanged = ref(0)
/** Move one record so it sits just before or just after another one of the same kind. */
export function moveRecord(view: View, id: string, targetId: string, after: boolean) {
  if (id === targetId) return
  const list = (view === 'projects' ? state.data.projects : view === 'people' ? state.data.people : state.data.phds) as { id: string }[]
  const from = list.findIndex(x => x.id === id)
  if (from < 0 || list.findIndex(x => x.id === targetId) < 0) return
  mutate(() => {
    const [item] = list.splice(from, 1)
    const to = list.findIndex(x => x.id === targetId)
    list.splice(after ? to + 1 : to, 0, item)
  })
  orderChanged.value++
}
/** Run a change as one undoable step. */
export function mutate(fn: () => void) {
  pushUndo(takeSnapshot())
  fn()
}
/** Replace everything with an imported dataset (one undoable step). */
export function replaceData(input: Partial<Data>) {
  mutate(() => { state.data = normalise(input) })
  orderChanged.value++
  state.drawer = null
  state.expanded = {}
}
export function resetDemo() {
  mutate(() => { state.data = seed() })
  orderChanged.value++
  state.drawer = null
}

/* ---------- Derived ---------- */
export const plannedOf = (a: Assignment, q: number) => a.pm[q] || 0
/** What a project pays for someone in a quarter: the plan, unless it was set separately. */
const defaultFunded = (a: Assignment, q: number) => (markAt(a.overlap, q) ? 0 : a.pm[q] || 0)
export const fundedOf = (a: Assignment, q: number) => a.funded?.[q] ?? defaultFunded(a, q)
/** True where plan and funding are not the same (works here unpaid, or paid here without working). */
export const differs = (a: Assignment, q: number) => a.funded?.[q] !== undefined && a.funded[q] !== defaultFunded(a, q)
/** Planned days in a month: the quarter's plan spread evenly over its three months. */
export const plannedDays = (a: Assignment, m: number) => Math.round(perMonth(plannedOf(a, mToQ(m))) * 4) / 4
/** The number in a cell. `t` is a quarter, or a month in the Actuals lens (where the value is in days). */
export const valueOf = (a: Assignment, t: number, lens: Lens = state.lens) =>
  (lens === 'actuals' ? a.actual?.[t] || 0 : lens === 'funding' ? fundedOf(a, t) : plannedOf(a, t))

function sumBy(key: 'personId' | 'projectId', lens: Lens) {
  const m: Record<string, Record<number, number>> = {}
  for (const a of state.data.assignments) {
    // Overlapping effort is real for the project, but is not extra time for the person.
    const skipLap = !!a.overlap && key === 'personId' && lens !== 'funding'
    const row = (m[a[key]] ??= {})
    const keys = lens === 'actuals' ? Object.keys(a.actual ?? {}) : [...Object.keys(a.pm), ...Object.keys(a.funded ?? {})]
    for (const q of new Set(keys)) {
      if (skipLap && markAt(a.overlap, lens === 'actuals' ? mToQ(+q) : +q)) continue
      const v = valueOf(a, +q, lens)
      if (v) row[+q] = (row[+q] || 0) + v
    }
  }
  return m
}
const sums = computed(() => ({
  plan: { person: sumBy('personId', 'plan'), project: sumBy('projectId', 'plan') },
  funding: { person: sumBy('personId', 'funding'), project: sumBy('projectId', 'funding') },
  actuals: { person: sumBy('personId', 'actuals'), project: sumBy('projectId', 'actuals') },
}))
export const loadOf = (personId: string, q: number, lens: Lens = state.lens) => sums.value[lens].person[personId]?.[q] || 0
export const projectTotal = (projectId: string, q: number, lens: Lens = state.lens) => sums.value[lens].project[projectId]?.[q] || 0

export const isActive = (p: Person, q: number) =>
  (p.start == null || q >= p.start) && (p.end == null || q <= p.end)
export const teachingOf = (p: Person, q: number) => (isActive(p, q) ? p.teaching?.[qNum(q) - 1] || 0 : 0)
export const baseOf = (p: Person, q: number) => (isActive(p, q) ? p.base || 0 : 0)

/**
 * One quarter for one person (or the team) in the current lens.
 *  plan:    capacity = contract, fixed = teaching,      load = planned on projects, gap = free time
 *  funding: capacity = contract, fixed = faculty-paid,  load = paid by projects,    gap = salary not covered
 *  actuals: the same per month and in days: fixed = teaching, load = days reported, plan = days planned
 */
export interface Balance {
  off: boolean // not in the team this quarter
  capacity: number
  fixed: number
  load: number
  gap: number // > 0: free / uncovered, < 0: over
  over: boolean
  alarm: boolean // needs attention in this lens
  word: '' | 'free' | 'uncovered' | 'over'
  plan?: number // actuals only: the planned days to compare with
}
export function makeBalance(lens: Lens, capacity: number, fixed: number, load: number, off = false): Balance {
  const gap = Math.round((capacity - fixed - load) * 1000) / 1000
  const over = gap < -0.05, short = gap > 0.05
  return {
    off, capacity, fixed, load, gap, over,
    alarm: over || (lens === 'funding' && short),
    word: over ? 'over' : !short || lens === 'actuals' ? '' : lens === 'funding' ? 'uncovered' : 'free',
  }
}
export function balanceOf(p: Person, q: number, lens: Lens = state.lens): Balance {
  if (lens === 'actuals') {
    const m = q, quarter = mToQ(m), inTeam = isActive(p, quarter), reported = loadOf(p.id, m, lens)
    const b = makeBalance(lens, inTeam ? perMonth(p.capacity) : 0, perMonth(teachingOf(p, quarter)), reported, m > currentM || (!inTeam && !reported))
    b.plan = Math.round(perMonth(loadOf(p.id, quarter, 'plan')) * 4) / 4 // to a quarter of a day
    return b
  }
  const active = isActive(p, q)
  const load = loadOf(p.id, q, lens)
  return makeBalance(lens, active ? p.capacity : 0, lens === 'funding' ? baseOf(p, q) : teachingOf(p, q), load, !active && !load)
}
/** Effort a project committed to for a quarter (0 = nothing agreed). */
export const promisedOf = (p: Project, q: number) => p.promised?.[q] || 0
/** Row id of a project's "Promised" row, which is edited like any other row of cells. */
export const PROMISE = 'promise:'
export const personById = (id: string) => state.data.people.find(p => p.id === id)
export const projectById = (id: string) => state.data.projects.find(p => p.id === id)
export const phdById = (id: string) => state.data.phds.find(p => p.id === id)
export const phdOf = (personId: string) => state.data.phds.find(p => p.personId === personId)
/**
 * Project work that counts toward a PhD in one quarter (or month, in days, for actuals),
 * with the projects it comes from. Only inside the PhD's own run.
 */
export function phdWorkOf(phd: Phd, t: number, lens: Lens = 'plan') {
  const q = lens === 'actuals' ? mToQ(t) : t
  const parts: { project: Project; v: number }[] = []
  if (q < phd.start || q > phd.end) return { total: 0, parts }
  for (const a of state.data.assignments) {
    if (a.personId !== phd.personId || !markAt(a.phdWork, q)) continue
    const v = lens === 'actuals' ? a.actual?.[t] || 0 : plannedOf(a, t)
    const project = projectById(a.projectId)
    if (v && project) parts.push({ project, v })
  }
  return { total: parts.reduce((s, x) => s + x.v, 0), parts }
}

/* ---------- Actions ---------- */
const uid = (prefix: string) => prefix + Math.random().toString(36).slice(2, 9)

/** Type a value into cells of the current lens. `null` clears: no plan, or funding back to following the plan. */
export function setCells(assignmentId: string, quarters: number[], value: number | null) {
  if (assignmentId.startsWith(PROMISE)) {
    const p = projectById(assignmentId.slice(PROMISE.length))
    if (p) mutate(() => {
      const f = (p.promised ??= {})
      for (const q of quarters) {
        if (value) f[q] = value
        else delete f[q]
      }
    })
    return
  }
  const a = state.data.assignments.find(x => x.id === assignmentId)
  if (!a) return
  mutate(() => {
    for (const q of quarters) {
      if (state.lens === 'actuals') {
        const f = (a.actual ??= {})
        if (value) f[q] = value
        else delete f[q]
      } else if (state.lens === 'funding') {
        const f = (a.funded ??= {})
        if (value === null || value === defaultFunded(a, q)) delete f[q]
        else f[q] = value
      } else {
        if (value) a.pm[q] = value
        else delete a.pm[q]
        if (a.funded && a.funded[q] === defaultFunded(a, q)) delete a.funded[q]
      }
    }
  })
}
/** Copy the planned days into every cell of a month that has no actuals yet. Returns how many were filled. */
export function fillFromPlan(m: number) {
  const todo = state.data.assignments.filter(a => !a.actual?.[m] && plannedDays(a, m) > 0)
  if (todo.length) mutate(() => { for (const a of todo) (a.actual ??= {})[m] = plannedDays(a, m) })
  return todo.length
}
/**
 * Switch a mark on or off for some quarters, or for the whole run when none are given.
 * A mark that covers every quarter of the project is stored as `true`, so it follows the project when it grows.
 */
export function toggleMark(id: string, key: MarkKey, quarters?: number[]) {
  const a = state.data.assignments.find(x => x.id === id)
  const p = a && projectById(a.projectId)
  if (!a || !p) return
  const span: number[] = []
  for (let q = p.start; q <= p.end; q++) span.push(q)
  const qs = quarters?.length ? quarters : span
  const on = !qs.every(q => markAt(a[key], q))
  mutate(() => {
    const cur = a[key]
    const m: Record<number, boolean> = cur === true ? Object.fromEntries(span.map(q => [q, true])) : { ...(typeof cur === 'object' ? cur : {}) }
    for (const q of qs) { if (on) m[q] = true; else delete m[q] }
    if (span.every(q => m[q])) a[key] = true
    else if (!Object.keys(m).length) delete a[key]
    else a[key] = m
  })
}
export function addAssignment(projectId: string, personId: string) {
  mutate(() => state.data.assignments.push({ id: uid('a_'), projectId, personId, pm: {} }))
}
export function removeAssignment(id: string) {
  mutate(() => { state.data.assignments = state.data.assignments.filter(a => a.id !== id) })
}
export function addProject() {
  const id = uid('prj_')
  mutate(() => state.data.projects.push({
    id, name: 'New project', org: 'UGent', funder: '', color: state.data.projects.length % SLOTS.length,
    start: currentQ, end: currentQ + 7, milestones: [],
  }))
  state.list.projects = 'active'
  state.expanded[id] = true
  state.drawer = { type: 'project', id }
  state.focus = id
}
export function addPerson() {
  const id = uid('per_')
  mutate(() => state.data.people.push({ id, name: 'New person', capacity: 3, base: 0, teaching: [0, 0, 0, 0], start: null, end: null }))
  state.expanded[id] = true
  state.list.people = 'active'
  state.drawer = { type: 'person', id }
  state.focus = id
}
export function deleteProject(id: string) {
  mutate(() => {
    state.data.projects = state.data.projects.filter(p => p.id !== id)
    state.data.assignments = state.data.assignments.filter(a => a.projectId !== id)
  })
  state.drawer = null
}
export function deletePerson(id: string) {
  mutate(() => {
    state.data.people = state.data.people.filter(p => p.id !== id)
    state.data.assignments = state.data.assignments.filter(a => a.personId !== id)
    state.data.phds = state.data.phds.filter(p => p.personId !== id)
  })
  state.drawer = null
}
/** Change a project's span; effort outside the new span is dropped. */
export function setSpan(p: Spanned, start: number, end: number) {
  mutate(() => {
    p.start = Math.min(start, end)
    p.end = Math.max(start, end)
    pruneOutside(p)
  })
}
export function pruneOutside(p: Spanned) {
  const promised = (p as Project).promised
  for (const q of Object.keys(promised ?? {})) if (+q < p.start || +q > p.end) delete promised![+q]
  for (const a of state.data.assignments) {
    if (a.projectId !== p.id) continue
    for (const q of Object.keys(a.pm)) if (+q < p.start || +q > p.end) delete a.pm[+q]
    for (const q of Object.keys(a.funded ?? {})) if (+q < p.start || +q > p.end) delete a.funded![+q]
    for (const key of ['overlap', 'phdWork'] as MarkKey[]) {
      const m = a[key]
      if (!m || m === true) continue
      for (const q of Object.keys(m)) if (+q < p.start || +q > p.end) delete m[+q]
      if (!Object.keys(m).length) delete a[key]
    }
  }
}
export function addMilestone(p: Spanned) {
  const mid = Math.min(Math.max(currentQ, p.start), p.end)
  const date = isoDate(new Date(qYear(mid), (qNum(mid) - 1) * 3 + 1, 15))
  mutate(() => p.milestones.push({ id: uid('m_'), title: 'New milestone', date }))
}
export function addPhd() {
  const person = state.data.people.find(p => !phdOf(p.id)) ?? state.data.people[0]
  if (!person) return
  const id = uid('phd_')
  mutate(() => state.data.phds.push({
    id, personId: person.id, title: '', start: currentQ, end: currentQ + 15, milestones: [], chapters: [],
  }))
  state.expanded[id] = true
  state.list.phds = 'active'
  state.drawer = { type: 'phd', id }
  state.focus = id
}
export function deletePhd(id: string) {
  mutate(() => { state.data.phds = state.data.phds.filter(p => p.id !== id) })
  state.drawer = null
}
export function addChapter(phd: Phd) {
  mutate(() => phd.chapters.push({ id: uid('ch_'), title: `Chapter ${phd.chapters.length + 1}`, status: 'not_started' }))
}
const CHAPTER_ORDER: ChapterStatus[] = ['not_started', 'in_progress', 'finished']
export function cycleChapter(c: Chapter) {
  mutate(() => { c.status = CHAPTER_ORDER[(CHAPTER_ORDER.indexOf(c.status) + 1) % 3] })
}
export function toggleMilestone(m: Milestone) {
  mutate(() => { m.done = !m.done })
}
/** Jump to the same allocation seen from the other side. */
export function jumpTo(view: View, id: string) {
  const target = view === 'projects' ? projectById(id) : view === 'people' ? personById(id) : phdById(id)
  if (target) state.list[view] = listOf(target)
  state.view = view
  state.expanded[id] = true
  state.focus = id
}
