<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, watchEffect } from 'vue'
import { ChevronRight, Pencil, X, ChevronsUpDown, GraduationCap, Users, Plus, Layers, Eye, EyeOff, Archive, ArchiveRestore } from 'lucide-vue-next'
import LoadCell from './LoadCell.vue'
import {
  promisedOf, PROMISE, toggleOverlap, listOf, listCounts, toggleHidden, toggleArchived, LIST_WORDS, type ListName, type Listable,
  state, loadOf, projectTotal, balanceOf, makeBalance, valueOf, plannedOf, fundedOf, differs, teachingOf, baseOf, personById, projectById,
  qYear, qNum, qLabel, dateToQ, shiftDate, nowQ, currentQ, fmt, initials,
  colorOf, tagOf, setCells, addAssignment, removeAssignment, jumpTo, takeSnapshot, pushUndo, pruneOutside,
  FULL_TIME, DAYS_PER_PM, days, shareOfFullTime, parsePm, unit, show, amount,
  MONTHS, mToQ, mLabel, currentM, perMonth, parseDays, plannedDays,
  phdOf, CHAPTER_STATUS, addChapter, cycleChapter, toggleMilestone, isoDate,
  type Assignment, type Person, type Project, type Phd, type Spanned, type Balance,
} from '../store'

/* Columns are quarters, or months in the Actuals lens. Bars and dates are always placed by quarter. */
const actuals = computed(() => state.lens === 'actuals')
const COL = computed(() => (actuals.value ? 54 : 72))
const U = computed(() => (actuals.value ? 3 : 1)) // columns per quarter
const PER = computed(() => U.value * 4) // columns per year
const toQ = (t: number) => (actuals.value ? mToQ(t) : t)
const nowCol = computed(() => (actuals.value ? currentM : currentQ))
const colLabel = (t: number) => (actuals.value ? MONTHS[((t % 12) + 12) % 12] : `Q${qNum(t)}`)
/** A cell value as text: actuals are days as typed, the rest is PM in the chosen unit. */
const disp = (v: number | undefined) => (actuals.value ? fmt(v) : show(v))
const LABEL = 328

interface Row { a: Assignment; project: Project; person: Person; promise?: boolean }
interface Group { id: string; project?: Project; person?: Person; phd?: Phd; owner?: Person; rows: Row[]; promise?: Row }

/* ---------- Time range ---------- */
const liveRange = computed(() => {
  let min = currentQ, max = currentQ
  for (const p of [...state.data.projects, ...state.data.phds]) { min = Math.min(min, p.start); max = Math.max(max, p.end) }
  const y0 = qYear(min)
  const y1 = Math.max(qYear(max) + 1, y0 + 3) // one spare year to drag into
  return { start: y0 * 4, end: y1 * 4 + 3 }
})
const frozenRange = ref<null | { start: number; end: number }>(null) // held still while dragging
const range = computed(() => frozenRange.value ?? liveRange.value)
const quarters = computed(() => {
  const out: number[] = []
  for (let t = range.value.start * U.value; t <= range.value.end * U.value + U.value - 1; t++) out.push(t)
  return out
})
const years = computed(() => [...new Set(quarters.value.map(t => Math.floor(t / PER.value)))])
const x = (q: number) => (q - range.value.start) * COL.value * U.value // position of a quarter (may be fractional)
const xc = (t: number) => (t - range.value.start * U.value) * COL.value // position of a column
const trackW = computed(() => quarters.value.length * COL.value)

/* ---------- Rows ---------- */
const NOBODY: Person = { id: '', name: 'Promised', capacity: 0, base: 0, teaching: [0, 0, 0, 0], start: null, end: null }
const groups = computed<Group[]>(() => {
  if (state.view === 'phds') {
    return state.data.phds.filter(p => listOf(p) === state.list.phds).map(phd => ({ id: phd.id, phd, owner: personById(phd.personId), rows: [] }))
  }
  const rows: Row[] = []
  for (const a of state.data.assignments) {
    const project = projectById(a.projectId), person = personById(a.personId)
    if (project && person) rows.push({ a, project, person })
  }
  if (state.view === 'projects') {
    const order = new Map(state.data.people.map((p, i) => [p.id, i]))
    return state.data.projects.filter(p => listOf(p) === state.list.projects).map(project => ({
      id: project.id, project,
      // The "Promised" row is edited like a person's row: same cells, same keys.
      promise: {
        a: { id: PROMISE + project.id, projectId: project.id, personId: '', pm: project.promised ?? {} },
        project, person: NOBODY, promise: true,
      },
      rows: rows.filter(r => r.project === project).sort((a, b) => order.get(a.person.id)! - order.get(b.person.id)!),
    }))
  }
  const order = new Map(state.data.projects.map((p, i) => [p.id, i]))
  return state.data.people.filter(p => listOf(p) === state.list.people).map(person => ({
    id: person.id, person,
    rows: rows.filter(r => r.person === person).sort((a, b) => order.get(a.project.id)! - order.get(b.project.id)!),
  }))
})
const visibleRows = computed(() => groups.value.filter(g => state.expanded[g.id]).flatMap(g => (g.promise && !actuals.value ? [g.promise, ...g.rows] : g.rows)))
const allExpanded = computed(() => groups.value.length > 0 && groups.value.every(g => state.expanded[g.id]))
function toggleAll() {
  const open = !allExpanded.value
  for (const g of groups.value) state.expanded[g.id] = open
}
const candidates = (g: Group) => g.project
  ? state.data.people.filter(p => !p.archived && !g.rows.some(r => r.person === p))
  : state.data.projects.filter(p => !p.archived && !g.rows.some(r => r.project === p))
function onAdd(g: Group, e: Event) {
  const el = e.target as HTMLSelectElement
  if (!el.value) return
  if (g.project) addAssignment(g.project.id, el.value)
  else addAssignment(el.value, g.person!.id)
  el.value = ''
}
const today = isoDate(new Date())
const chaptersDone = (p: Phd) => p.chapters.filter(c => c.status === 'finished').length
/** Open the Hidden or Archived list of this tab; clicking the open one goes back to the active list. */
const pickList = (l: ListName) => { state.list[state.view] = state.list[state.view] === l ? 'active' : l }
const curList = computed(() => state.list[state.view])
const counts = computed(() => listCounts.value[state.view])
const words = computed(() => LIST_WORDS[state.view])
/** The project, person or PhD a row stands for. */
const ent = (g: Group): Listable => (g.project ?? g.person ?? g.phd)!
const countLabel = computed(() => {
  const n = groups.value.length
  const noun = { projects: 'projects', people: 'people', phds: 'PhDs' }[state.view]
  if (curList.value === 'active') return `${n} ${noun}`
  if (curList.value === 'hidden') return `${n} hidden`
  return state.view === 'people' ? `${n} alumni` : `${n} ${words.value.archived}`
})
const spanText = (p: Spanned) => `${qLabel(p.start)} – ${qLabel(p.end)}`
/** Can this cell hold a value? Inside the project, and for actuals not in the future. */
const inSpan = (r: Row, t: number) => toQ(t) >= r.project.start && toQ(t) <= r.project.end && (!actuals.value || t <= currentM)
const clampQ = (r: Row, t: number) => {
  const last = r.project.end * U.value + U.value - 1
  return Math.min(Math.max(t, r.project.start * U.value), actuals.value ? Math.min(last, currentM) : last)
}
/** Dot on a cell: plan and funding differ, or (actuals) days worked that the project does not pay for. */
const marked = (r: Row, t: number) => (actuals.value ? valueOf(r.a, t) > 0 && !fundedOf(r.a, mToQ(t)) : differs(r.a, t))

/* ---------- Cell selection & editing ---------- */
const scroller = ref<HTMLElement>()
const sel = ref<null | { aid: string; a: number; b: number }>(null)
const editing = ref(false)
const editText = ref('')
let selectAllOnEdit = true
let selecting = false

const selRow = () => visibleRows.value.find(r => r.a.id === sel.value?.aid)
const inSel = (aid: string, q: number) => {
  const s = sel.value
  return !!s && s.aid === aid && q >= Math.min(s.a, s.b) && q <= Math.max(s.a, s.b)
}
function cellDown(e: PointerEvent, r: Row, q: number) {
  if (e.button !== 0 || !inSpan(r, q)) return
  if (editing.value) commitEdit()
  sel.value = e.shiftKey && sel.value?.aid === r.a.id ? { ...sel.value, b: q } : { aid: r.a.id, a: q, b: q }
  selecting = true
  window.addEventListener('pointerup', () => { selecting = false }, { once: true })
}
function cellEnter(r: Row, q: number) {
  if (selecting && sel.value?.aid === r.a.id && inSpan(r, q)) sel.value.b = q
  hover.value = inSpan(r, q) ? cellInfo(r, q, q) : null
}

/* ---------- Plain-language readout (shown in the status bar) ---------- */
const hover = ref<string | null>(null)
const funding = computed(() => state.lens === 'funding')
const n0 = (v: number) => fmt(v) || '0'
/** One amount in the chosen unit, followed by its translation into the other one. */
const both = (pm: number) => (unit.value === 'days' ? `${show(pm)} days = ${n0(pm)} PM` : `${n0(pm)} PM = ${days(pm)} days`)
function gapText(b: Balance) {
  if (b.word) return `${amount(Math.abs(b.gap))} ${b.word}`
  return funding.value ? 'fully covered' : 'fully planned'
}
function balanceInfo(who: string, q: number, b: Balance) {
  if (actuals.value) {
    if (b.off) return `${who} · ${mLabel(q)}: ${q > currentM ? 'still to come' : 'not in the team'}`
    const over = b.over ? ` · ${n0(-b.gap)} more than the ${n0(b.capacity - b.fixed)} days available` : ''
    return `${who} · ${mLabel(q)}: ${n0(b.load)} days reported, ${n0(b.plan ?? 0)} planned${b.fixed ? `, ${n0(b.fixed)} teaching` : ''}${over}`
  }
  if (b.off) return `${who} · ${qLabel(q)}: not in the team`
  const body = funding.value
    ? `${amount(b.fixed)} paid by the faculty + ${amount(b.load)} by projects, of a ${amount(b.capacity)} contract`
    : `${both(b.load)} planned on projects${b.fixed ? ` + ${amount(b.fixed)} teaching` : ''}, of ${amount(b.capacity)}`
  return `${who} · ${qLabel(q)}: ${body} · ${gapText(b)}`
}
function cellInfo(r: Row, a: number, b: number) {
  const lo = Math.min(a, b), hi = Math.max(a, b), n = hi - lo + 1
  if (r.promise) {
    let promised = 0, total = 0
    for (let q = lo; q <= hi; q++) { promised += promisedOf(r.project, q); total += projectTotal(r.project.id, q) }
    const when = n > 1 ? `${qLabel(lo)} – ${qLabel(hi)}` : qLabel(lo)
    return `${r.project.name} · ${when}: ${promised ? `${both(promised)} promised` : 'nothing promised'} · ${verdict(total, promised)}`
  }
  if (actuals.value) {
    let done = 0, plan = 0
    for (let t = lo; t <= hi; t++) { done += valueOf(r.a, t); plan += plannedDays(r.a, t) }
    const unpaid = done > 0 && !fundedOf(r.a, mToQ(lo)) ? ' · not paid from this project' : ''
    return `${r.person.name} · ${r.project.name} · ${n > 1 ? `${mLabel(lo)} – ${mLabel(hi)}` : mLabel(lo)}: ${n0(done)} days reported, ${n0(plan)} planned${unpaid}`
  }
  const values: number[] = []
  for (let q = lo; q <= hi; q++) values.push(valueOf(r.a, q))
  const pm = values[0], sum = values.reduce((s, v) => s + v, 0)
  const none = funding.value ? 'not paid from this project' : 'nothing planned'
  const verb = funding.value ? 'paid by this project' : 'planned'
  const head = `${r.person.name} · ${r.project.name} · ${n > 1 ? `${qLabel(lo)} – ${qLabel(hi)}` : qLabel(lo)}: `
  if (n > 1) {
    const even = values.every(v => v === pm)
    return head + (sum ? `${even ? `${amount(pm)} per quarter, ` : ''}${both(sum)} ${verb} in total` : none)
  }
  const what = pm ? `${both(pm)} ${verb} (${shareOfFullTime(pm)} of full time)` : none
  const diff = differs(r.a, lo) ? ` · differs: ${amount(plannedOf(r.a, lo))} planned, ${amount(fundedOf(r.a, lo))} paid` : ''
  const first = r.person.name.split(' ')[0]
  const tail = r.a.overlap && !funding.value ? `overlaps ${first}'s other work, so it is not added to their load` : `${first}'s quarter: ${gapText(balanceOf(r.person, lo))}`
  return `${head}${what}${diff} · ${tail}`
}
const selInfo = computed(() => {
  const s = sel.value
  const r = s && visibleRows.value.find(x => x.a.id === s.aid)
  return s && r ? cellInfo(r, s.a, s.b) : null
})
watchEffect(() => { state.readout = hover.value ?? selInfo.value })
/** How the combined effort compares with what the project promised. */
function verdict(total: number, promised: number) {
  const word = funding.value ? 'paid' : 'planned'
  if (!promised) return `${amount(total)} ${word}`
  const d = total - promised
  if (Math.abs(d) < 0.05) return `${amount(total)} ${word}, as promised`
  return `${amount(total)} ${word} of ${amount(promised)} promised, ${amount(Math.abs(d))} ${d < 0 ? 'short' : 'more'}`
}
/** A bar segment: the total, or "total/promised" when the two differ. */
function barCell(p: Project, t: number) {
  const total = projectTotal(p.id, t)
  const pr = actuals.value ? 0 : promisedOf(p, t)
  if (!pr || Math.abs(total - pr) < 0.05) return { text: disp(total) || '·', cls: '' }
  return { text: `${disp(total) || '0'}/${disp(pr)}`, cls: total < pr ? 'short' : 'extra' }
}
function barInfo(p: Project, q: number) {
  if (actuals.value) return `${p.name} · ${mLabel(q)}: ${n0(projectTotal(p.id, q))} days reported across the team`
  const t = projectTotal(p.id, q), pr = promisedOf(p, q)
  const what = t ? `${both(t)} ${funding.value ? 'charged to this project' : 'across the team'}` : funding.value ? 'nobody paid from this project' : 'nobody planned'
  return `${p.name} · ${qLabel(q)}: ${what}${pr ? ` · ${verdict(t, pr)}` : ''}`
}
const share = (v: number) => Math.min(v / (actuals.value ? DAYS_PER_PM : FULL_TIME), 1) * 100 + '%' // of a full-time month or quarter
/** Line under a person's name: contract in the Plan lens, how long the salary is covered in the Funding lens. */
function timeLabel(p: Person) {
  if (actuals.value) return `${n0(loadOf(p.id, state.month))} days reported in ${mLabel(state.month)}`
  if (funding.value) {
    for (let q = currentQ; q <= range.value.end; q++) {
      const b = balanceOf(p, q)
      if (b.off) break
      if (b.gap > 0.05) return q === currentQ ? 'Not fully covered now' : `Covered until ${qLabel(q - 1)}`
    }
    return 'Covered'
  }
  const pct = Math.round((p.capacity / FULL_TIME) * 100)
  return `${pct === 100 ? 'Full-time' : pct + '%'} · ${amount(p.capacity)} per quarter`
}
/** The fixed row at the top of an expanded person: teaching (Plan) or the faculty-paid share (Funding). */
const fixedOf = (p: Person, q: number) => (actuals.value ? perMonth(teachingOf(p, mToQ(q))) : funding.value ? baseOf(p, q) : teachingOf(p, q))
const hasFixed = (p: Person) => (funding.value ? p.base > 0 : p.teaching.some(v => v > 0))
function startEdit(initial: string | null) {
  const s = sel.value
  const r = selRow()
  if (!s || !r) return
  selectAllOnEdit = initial === null
  editText.value = initial ?? disp(valueOf(r.a, s.a))
  editing.value = true
}
function applyValue(v: number | null) {
  const s = sel.value
  if (!s) return
  const qs: number[] = []
  for (let q = Math.min(s.a, s.b); q <= Math.max(s.a, s.b); q++) qs.push(q)
  setCells(s.aid, qs, v)
}
function commitEdit() {
  if (!editing.value) return
  editing.value = false
  applyValue(actuals.value ? parseDays(editText.value) : parsePm(editText.value))
  scroller.value?.focus({ preventScroll: true })
}
function cancelEdit() {
  editing.value = false
  scroller.value?.focus({ preventScroll: true })
}
function move(dq: number, drow: number, extend = false) {
  const s = sel.value
  let r = selRow()
  if (!s || !r) return
  if (drow) {
    const list = visibleRows.value
    r = list[Math.min(Math.max(list.indexOf(r) + drow, 0), list.length - 1)]
    const q = clampQ(r, s.b)
    sel.value = { aid: r.a.id, a: q, b: q }
    return
  }
  const q = clampQ(r, s.b + dq)
  sel.value = extend ? { ...s, b: q } : { aid: s.aid, a: q, b: q }
}
function onKey(e: KeyboardEvent) {
  if (editing.value || !sel.value || e.ctrlKey || e.metaKey || e.altKey) return
  const k = e.key
  if (/^[0-9.,]$/.test(k)) startEdit(k)
  else if (k === 'Enter' || k === 'F2') startEdit(null)
  else if (k === 'Delete' || k === 'Backspace') applyValue(null)
  else if (k === 'ArrowLeft') move(-1, 0, e.shiftKey)
  else if (k === 'ArrowRight') move(1, 0, e.shiftKey)
  else if (k === 'ArrowUp') move(0, -1)
  else if (k === 'ArrowDown') move(0, 1)
  else if (k === 'Tab') move(e.shiftKey ? -1 : 1, 0)
  else if (k === 'Escape') sel.value = null
  else return
  e.preventDefault()
}
function onEditKey(e: KeyboardEvent) {
  e.stopPropagation()
  if (e.key === 'Enter') { commitEdit(); move(0, 1) }
  else if (e.key === 'Tab') { e.preventDefault(); commitEdit(); move(e.shiftKey ? -1 : 1, 0) }
  else if (e.key === 'Escape') cancelEdit()
}
const vEdit = {
  mounted(el: HTMLInputElement) {
    el.focus()
    if (selectAllOnEdit) el.select()
  },
}
watch(() => [state.view, state.lens], () => { sel.value = null; editing.value = false })

/* ---------- Dragging project bars ---------- */
type DragMode = 'move' | 'l' | 'r'
function dragStart(e: PointerEvent, p: Spanned, mode: DragMode) {
  if (e.button !== 0 || actuals.value) return // rescheduling is a planning action
  e.preventDefault()
  const x0 = e.clientX
  const snapshot = takeSnapshot()
  const orig = {
    start: p.start, end: p.end,
    dates: p.milestones.map(m => m.date),
    promised: { ...(p as Project).promised },
    pm: state.data.assignments.filter(a => a.projectId === p.id).map(a => ({ a, pm: { ...a.pm }, funded: { ...a.funded } })),
  }
  frozenRange.value = { ...liveRange.value }
  const R = frozenRange.value
  let last = 0
  document.body.classList.add('dragging', mode === 'move' ? 'drag-move' : 'drag-resize')

  const onMove = (ev: PointerEvent) => {
    let dq = Math.round((ev.clientX - x0) / COL.value)
    if (mode === 'move') dq = Math.min(Math.max(dq, R.start - orig.start), R.end - orig.end)
    if (mode === 'l') dq = Math.min(Math.max(dq, R.start - orig.start), orig.end - orig.start)
    if (mode === 'r') dq = Math.min(Math.max(dq, orig.start - orig.end), R.end - orig.end)
    if (dq === last) return
    last = dq
    if (mode !== 'r') p.start = orig.start + dq
    if (mode !== 'l') p.end = orig.end + dq
    if (mode === 'move') {
      // Effort and milestones travel with the project.
      for (const o of orig.pm) {
        o.a.pm = Object.fromEntries(Object.entries(o.pm).map(([q, v]) => [+q + dq, v]))
        if (o.a.funded) o.a.funded = Object.fromEntries(Object.entries(o.funded).map(([q, v]) => [+q + dq, v]))
      }
      p.milestones.forEach((m, i) => { m.date = shiftDate(orig.dates[i], dq * 3) })
      if ((p as Project).promised) (p as Project).promised = Object.fromEntries(Object.entries(orig.promised).map(([q, v]) => [+q + dq, v]))
    }
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    document.body.classList.remove('dragging', 'drag-move', 'drag-resize')
    frozenRange.value = null
    if (last !== 0) {
      if (mode !== 'move') pruneOutside(p)
      pushUndo(snapshot)
    }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}

/* ---------- Jumping between views ---------- */
const flashId = ref<string | null>(null)
watch(() => state.focus, async id => {
  if (!id) return
  state.focus = null
  await nextTick()
  const el = scroller.value?.querySelector<HTMLElement>(`[data-id="${id}"]`)
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  flashId.value = id
  setTimeout(() => { if (flashId.value === id) flashId.value = null }, 1400)
})

// Open with the previous quarter at the left edge rather than the oldest project.
const scrollToNow = () => { if (scroller.value) scroller.value.scrollLeft = x(currentQ - 1) }
onMounted(scrollToNow)
watch(actuals, () => nextTick(scrollToNow)) // months and quarters have different widths

/* ---------- Team totals ---------- */
function teamBalance(q: number): Balance {
  let capacity = 0, fixed = 0, load = 0, plan = 0
  for (const p of state.data.people) {
    const b = balanceOf(p, q)
    capacity += b.capacity; fixed += b.fixed; load += b.load; plan += b.plan ?? 0
  }
  const b = makeBalance(state.lens, capacity, fixed, load, actuals.value && q > currentM)
  if (actuals.value) b.plan = plan
  return b
}
</script>

<template>
  <div ref="scroller" class="tl" tabindex="0" :style="{ '--col': COL + 'px', '--per': PER, '--label': LABEL + 'px' }" :class="{ months: actuals }" @keydown="onKey">
    <div class="tl-inner" :style="{ width: LABEL + trackW + 'px' }">
      <!-- Header -->
      <div class="head">
        <div class="label head-label">
          <span>{{ countLabel }}</span>
<button
            v-if="counts.hidden" class="ghost" :class="{ active: curList === 'hidden' }"
            :title="curList === 'hidden' ? 'Back to the active list' : `Show the ${counts.hidden} you hid`"
            @click="pickList('hidden')"
          ><EyeOff :size="14" /> {{ counts.hidden }}</button>
          <button
            v-if="counts.archived" class="ghost" :class="{ active: curList === 'archived' }"
            :title="curList === 'archived' ? 'Back to the active list' : `Show ${words.archived} (${counts.archived})`"
            @click="pickList('archived')"
          ><Archive :size="14" /> {{ counts.archived }}</button>
          <button class="ghost" @click="toggleAll">
            <ChevronsUpDown :size="14" /> {{ allExpanded ? 'Collapse all' : 'Expand all' }}
          </button>
        </div>
        <div class="track head-track">
          <div class="years">
            <div v-for="y in years" :key="y" class="year">{{ y }}</div>
          </div>
          <div class="quarters">
            <div
              v-for="q in quarters" :key="q" class="quarter" :class="{ now: q === nowCol, picked: actuals && q === state.month }"
              :title="actuals ? `Pick ${mLabel(q)} for the month report` : undefined"
              @click="actuals && q <= currentM && (state.month = q)"
            >{{ colLabel(q) }}</div>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="body" @pointerleave="hover = null">
        <div class="now-col" :style="{ left: LABEL + xc(nowCol) + 'px' }" />
        <div class="today" :style="{ left: LABEL + x(nowQ) + 'px' }" />

        <template v-for="g in groups" :key="g.id">
          <div class="row group" :class="{ flash: flashId === g.id, open: state.expanded[g.id] }" :data-id="g.id">
            <div class="label" @click="state.expanded[g.id] = !state.expanded[g.id]">
              <ChevronRight class="chev" :size="16" />
              <template v-if="g.project">
                <span class="dot" :style="{ background: colorOf(g.project.color) }" />
                <div class="names">
                  <div class="name">{{ g.project.name }}</div>
                  <div class="meta">{{ tagOf(g.project) }} · {{ spanText(g.project) }}</div>
                </div>
                <span v-if="g.rows.length" class="stack" :title="g.rows.map(r => r.person.name).join(', ')">
                  <span v-for="r in g.rows.slice(0, 3)" :key="r.a.id" class="avatar sm">{{ initials(r.person.name) }}</span>
                  <span v-if="g.rows.length > 3" class="avatar sm">+{{ g.rows.length - 3 }}</span>
                </span>
              </template>
              <template v-else-if="g.person">
                <span class="avatar">{{ initials(g.person.name) }}</span>
                <div class="names">
                  <div class="name">{{ g.person.name }}</div>
                  <div class="meta">{{ timeLabel(g.person) }}</div>
                </div>
                <button
                  v-if="phdOf(g.person.id)" class="icon-btn" title="Pursuing a PhD: show it"
                  @click.stop="jumpTo('phds', phdOf(g.person.id)!.id)"
                ><GraduationCap :size="16" /></button>
              </template>
              <template v-else-if="g.phd">
                <span class="avatar">{{ initials(g.owner?.name ?? '?') }}</span>
                <div class="names">
                  <div class="name">{{ g.owner?.name ?? 'Unassigned' }}</div>
                  <div class="meta">{{ spanText(g.phd) }}</div>
                </div>
                <button
                  v-if="g.owner" class="icon-btn reveal" title="Show project workload"
                  @click.stop="jumpTo('people', g.owner.id)"
                ><Users :size="14" /></button>
              </template>
<!-- Exactly one way out of each list: hide or archive when active, undo that when not. -->
              <button
                v-if="listOf(ent(g)) !== 'archived'" class="icon-btn reveal"
                :title="listOf(ent(g)) === 'hidden' ? 'Show in your list again' : 'Hide from your own list (nobody else is affected)'"
                @click.stop="toggleHidden(ent(g))"
              ><component :is="listOf(ent(g)) === 'hidden' ? Eye : EyeOff" :size="14" /></button>
              <button
                v-if="listOf(ent(g)) !== 'hidden'" class="icon-btn reveal"
                :title="ent(g).archived ? `${words.restore}, for everyone` : `${words.archive}, for everyone (nothing is deleted)`"
                @click.stop="toggleArchived(ent(g))"
              ><component :is="ent(g).archived ? ArchiveRestore : Archive" :size="14" /></button>
              <button class="icon-btn reveal" title="Edit" @click.stop="state.drawer = { type: g.project ? 'project' : g.phd ? 'phd' : 'person', id: g.id }">
                <Pencil :size="14" />
              </button>
            </div>

            <!-- Project: draggable bar with PM totals and milestones -->
            <div v-if="g.project" class="track">
              <div
                class="bar"
                :style="{ left: x(g.project.start) + 3 + 'px', width: (g.project.end - g.project.start + 1) * COL * U - 6 + 'px', '--c': colorOf(g.project.color) }"
                @pointerdown="dragStart($event, g.project, 'move')"
              >
                <div class="handle l" @pointerdown.stop="dragStart($event, g.project, 'l')" />
                <div
                  v-for="i in (g.project.end - g.project.start + 1) * U" :key="i" class="bar-q" :class="barCell(g.project, g.project.start * U + i - 1).cls"
                  @pointerenter="hover = barInfo(g.project, g.project.start * U + i - 1)"
                >
                  {{ barCell(g.project, g.project.start * U + i - 1).text }}
                </div>
                <div class="handle r" @pointerdown.stop="dragStart($event, g.project, 'r')" />
              </div>
              <button
                v-for="m in g.project.milestones" :key="m.id" class="ms"
                :style="{ left: x(dateToQ(m.date)) + 'px', '--c': colorOf(g.project.color) }"
                :data-tip="`${m.title} · ${m.date}`"
                @click="state.drawer = { type: 'project', id: g.id }"
              />
            </div>

            <!-- PhD: draggable bar with the topic, chapter progress and tickable milestones -->
            <div v-else-if="g.phd" class="track">
              <div
                class="bar phd"
                :style="{ left: x(g.phd.start) + 3 + 'px', width: (g.phd.end - g.phd.start + 1) * COL * U - 6 + 'px' }"
                @pointerdown="dragStart($event, g.phd, 'move')"
              >
                <div class="handle l" @pointerdown.stop="dragStart($event, g.phd, 'l')" />
                <div class="bar-text">
                  {{ g.phd.title || 'Untitled PhD' }}<template v-if="g.phd.chapters.length"> · {{ chaptersDone(g.phd) }}/{{ g.phd.chapters.length }} chapters</template>
                </div>
                <div class="handle r" @pointerdown.stop="dragStart($event, g.phd, 'r')" />
              </div>
              <button
                v-for="m in g.phd.milestones" :key="m.id" class="ms"
                :class="{ done: m.done, late: !m.done && m.date < today }"
                :style="{ left: x(dateToQ(m.date)) + 'px' }"
                :data-tip="`${m.title} · ${m.date} · ${m.done ? 'done' : m.date < today ? 'overdue' : 'click when done'}`"
                @click="toggleMilestone(m)"
              />
            </div>

            <!-- Person: load vs capacity per quarter -->
            <div v-else-if="g.person" class="track">
              <LoadCell
                v-for="q in quarters" :key="q" :b="balanceOf(g.person, q)" :scale="actuals ? DAYS_PER_PM : FULL_TIME" :raw="actuals"
                @pointerenter="hover = balanceInfo(g.person.name, q, balanceOf(g.person, q))"
              />
            </div>
          </div>

          <template v-if="state.expanded[g.id] && g.phd">
            <div v-for="c in g.phd.chapters" :key="c.id" class="row child">
              <div class="label">
                <span class="name chapter">{{ c.title }}</span>
                <button class="status-btn" :class="c.status" title="Click to change status" @click="cycleChapter(c)">{{ CHAPTER_STATUS[c.status] }}</button>
              </div>
              <div class="track" />
            </div>
            <div class="row add">
              <div class="label">
                <button class="add-select" @click="addChapter(g.phd)"><Plus :size="13" /> Add chapter</button>
              </div>
              <div class="track" />
            </div>
          </template>

          <template v-else-if="state.expanded[g.id]">
            <div v-if="g.promise && !actuals" class="row child promise">
              <div class="label">
                <span class="name chapter">Promised</span>
                <span class="meta">in the proposal</span>
              </div>
              <div class="track">
                <div
                  v-for="q in quarters" :key="q" class="cell"
                  :class="{ out: !inSpan(g.promise, q), sel: inSel(g.promise.a.id, q) }"
                  @pointerdown="cellDown($event, g.promise, q)" @pointerenter="cellEnter(g.promise, q)" @dblclick="startEdit(null)"
                >
                  <input
                    v-if="editing && sel?.aid === g.promise.a.id && sel.a === q" v-model="editText" v-edit
                    class="cell-input" inputmode="decimal" @keydown="onEditKey" @blur="commitEdit" @pointerdown.stop
                  />
                  <span v-else-if="promisedOf(g.project!, q)" class="chip target"><b>{{ show(promisedOf(g.project!, q)) }}</b></span>
                </div>
              </div>
            </div>
            <div v-if="g.person && hasFixed(g.person)" class="row child">
              <div class="label">
                <span class="name chapter">{{ funding ? 'Paid by the faculty' : 'Teaching' }}</span>
                <span class="meta">{{ funding ? 'needs no project funding' : 'standard load per semester' }}</span>
              </div>
              <div class="track">
                <div v-for="q in quarters" :key="q" class="fcell">
                  <span v-if="fixedOf(g.person, q)" class="chip hatch"><b>{{ disp(fixedOf(g.person, q)) }}</b></span>
                </div>
              </div>
            </div>
            <div v-for="r in g.rows" :key="r.a.id" class="row child">
              <div class="label">
                <button
                  class="link" :title="g.project ? 'Show this person\'s workload' : 'Show this project'"
                  @click="g.project ? jumpTo('people', r.person.id) : jumpTo('projects', r.project.id)"
                >
                  <span v-if="g.project" class="avatar sm">{{ initials(r.person.name) }}</span>
                  <span v-else class="dot" :style="{ background: colorOf(r.project.color) }" />
                  <span class="name">{{ g.project ? r.person.name : r.project.name }}</span>
                  <span v-if="!g.project" class="meta">{{ tagOf(r.project) }}</span>
                </button>
                <button
                  class="icon-btn" :class="r.a.overlap ? 'lap-on' : 'reveal'"
                  :title="r.a.overlap
                    ? 'Overlapping effort: counts for the project, not on top of this person\'s other work. Click to count it as extra time again.'
                    : 'Mark as overlapping effort: the same work already counts elsewhere, so it is not extra time for this person'"
                  @click="toggleOverlap(r.a.id)"
                ><Layers :size="14" /></button>
                <button class="icon-btn reveal" title="Remove from project" @click="removeAssignment(r.a.id)"><X :size="14" /></button>
              </div>
              <div class="track">
                <div
                  v-for="q in quarters" :key="q" class="cell"
                  :class="{ out: !inSpan(r, q), sel: inSel(r.a.id, q), over: !!valueOf(r.a, q) && !r.a.overlap && balanceOf(r.person, q).over, lap: !!r.a.overlap, diff: marked(r, q) }"
                  :style="{ '--c': colorOf(r.project.color) }"
                  @pointerdown="cellDown($event, r, q)" @pointerenter="cellEnter(r, q)" @dblclick="startEdit(null)"
                >
                  <input
                    v-if="editing && sel?.aid === r.a.id && sel.a === q" v-model="editText" v-edit
                    class="cell-input" inputmode="decimal" @keydown="onEditKey" @blur="commitEdit" @pointerdown.stop
                  />
                  <span v-else-if="valueOf(r.a, q) || (!actuals && differs(r.a, q))" class="chip" :class="{ zero: !valueOf(r.a, q) }"><i :style="{ width: share(valueOf(r.a, q)) }" /><b>{{ disp(valueOf(r.a, q)) || '0' }}</b></span>
                  <span v-else-if="actuals && inSpan(r, q) && plannedDays(r.a, q)" class="chip ghost" title="Planned, not reported yet"><b>{{ fmt(plannedDays(r.a, q)) }}</b></span>
                </div>
              </div>
            </div>
            <div class="row add">
              <div class="label">
                <select v-if="candidates(g).length" class="add-select" @change="onAdd(g, $event)">
                  <option value="">+ Add {{ g.project ? 'person' : 'project' }}</option>
                  <option v-for="c in candidates(g)" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <span v-else class="meta">{{ g.project ? 'Everyone is on this project' : 'On every project' }}</span>
              </div>
              <div class="track" />
            </div>
          </template>
        </template>

        <div v-if="!groups.length" class="empty">Nothing here yet — add your first {{ state.view === 'projects' ? 'project' : state.view === 'people' ? 'person' : 'PhD' }}.</div>
      </div>

      <!-- Team totals -->
      <div v-if="state.view !== 'phds'" class="foot">
        <div class="label">
          <div class="names">
            <div class="name">{{ actuals ? 'Team actuals' : funding ? 'Team funding' : 'Team load' }}</div>
            <div class="meta">{{ actuals ? 'Days reported per month, against the plan' : funding ? 'Paid by projects, and what is still uncovered' : 'Planned effort, and what is still free' }}</div>
          </div>
        </div>
        <div class="track">
          <LoadCell
            v-for="q in quarters" :key="q" :b="teamBalance(q)" :scale="teamBalance(q).capacity" :raw="actuals"
            @pointerenter="hover = balanceInfo('Team', q, teamBalance(q))"
          />
        </div>
      </div>
    </div>
  </div>
</template>
