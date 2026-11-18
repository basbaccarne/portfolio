<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { FolderKanban, Users, GraduationCap, Plus, Undo2, ChevronLeft, ChevronRight, Check, FileText } from 'lucide-vue-next'
import Timeline from './components/Timeline.vue'
import Drawer from './components/Drawer.vue'
import MonthReport from './components/MonthReport.vue'
import Gate from './components/Gate.vue'
import { remote, status, syncError, resume, signOut } from './sync'
import {
  state, canUndo, undo, addProject, addPerson, addPhd, resetDemo, theme, THEMES, unit, UNITS, amount,
  balanceOf, LENSES, currentQ, qLabel, currentM, mLabel, fillFromPlan, replaceData,
} from './store'

const now = computed(() => {
  const lens = state.lens === 'funding' ? 'funding' : 'plan'
  const bs = state.data.people.map(p => balanceOf(p, currentQ, lens)).filter(b => !b.off)
  return {
    over: bs.filter(b => b.over).length,
    short: bs.filter(b => b.gap > 0.05).length,
    gap: bs.reduce((s, b) => s + Math.max(0, b.gap), 0),
  }
})

const months = computed(() => state.lens === 'actuals' && state.view !== 'phds')
function fill() {
  const n = fillFromPlan(state.month)
  state.readout = n
    ? `${mLabel(state.month)}: ${n} cells filled with the planned days. Correct what was different, or undo.`
    : `${mLabel(state.month)}: nothing to fill, every planned cell already has days.`
}

function onKey(e: KeyboardEvent) {
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo() }
  if (e.key === 'Escape' && !typing) { state.drawer = null; state.report = false }
}
onMounted(() => window.addEventListener('keydown', onKey))
onMounted(resume)

const signingOut = ref(false)
async function leave() {
  signingOut.value = true
  await signOut()
  signingOut.value = false // only reached when signing out was cancelled
}

/* ---------- Import / export ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `portfolio-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
async function importData(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const d = JSON.parse(await file.text())
    if (!Array.isArray(d.people) || !Array.isArray(d.projects) || !Array.isArray(d.assignments)) throw new Error('not a portfolio file')
    const what = `${d.people.length} people, ${d.projects.length} projects`
    if (!confirm(`Replace everything${remote ? ' in the shared database' : ''} with ${file.name} (${what})?`)) return
    replaceData(d)
    state.readout = `Imported ${file.name}: ${what}. Undo brings the previous data back.`
  } catch (err) {
    state.readout = `Could not import ${file.name}: ${err instanceof Error ? err.message : err}`
  }
}
const syncText = computed(() => ({
  local: 'Saved in this browser only',
  locked: '', loading: 'Loading…',
  saving: 'Saving…', saved: 'Saved to the shared database',
  error: `Not saved: ${syncError.value}`,
}[status.value]))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Gate v-if="remote && (status === 'locked' || status === 'loading')" />
  <div v-else class="app">
    <header class="topbar">
      <div class="brand"><span class="mark" />Portfolio</div>

      <div class="segmented" role="tablist">
        <button role="tab" :class="{ on: state.view === 'projects' }" @click="state.view = 'projects'">
          <FolderKanban :size="15" /> Projects
        </button>
        <button role="tab" :class="{ on: state.view === 'people' }" @click="state.view = 'people'">
          <Users :size="15" /> People
        </button>
        <button role="tab" :class="{ on: state.view === 'phds' }" @click="state.view = 'phds'">
          <GraduationCap :size="15" /> PhDs
        </button>
      </div>

      <div v-if="state.view !== 'phds'" class="segmented" role="group" aria-label="Lens">
        <button v-for="l in LENSES" :key="l.id" :class="{ on: state.lens === l.id }" :title="l.hint" @click="state.lens = l.id">{{ l.label }}</button>
      </div>

      <div v-if="months" class="stats">
        <button class="icon-btn" title="Previous month" @click="state.month--"><ChevronLeft :size="16" /></button>
        <span class="month">{{ mLabel(state.month) }}</span>
        <button class="icon-btn" title="Next month" :disabled="state.month >= currentM" @click="state.month++"><ChevronRight :size="16" /></button>
        <button class="ghost" title="Copy the planned days into every empty cell of this month" @click="fill"><Check :size="15" /> Fill from plan</button>
        <button class="ghost" title="Who worked how many days on what" @click="state.report = true"><FileText :size="15" /> Month report</button>
      </div>
      <div v-else class="stats">
        <span class="stat-q">{{ qLabel(currentQ) }}</span>
<template v-if="state.lens === 'funding'">
          <span class="pill" :class="now.short ? 'over' : 'ok'">{{ now.short }} not fully covered</span>
          <span class="pill" :class="now.gap > 0.05 ? 'over' : 'ok'">{{ amount(now.gap) }} uncovered</span>
        </template>
        <template v-else>
          <span class="pill" :class="now.over ? 'over' : 'ok'">{{ now.over }} over capacity</span>
          <span class="pill" :class="now.gap > 0.05 ? 'under' : 'ok'">{{ amount(now.gap) }} unallocated</span>
        </template>
      </div>

      <div class="actions">
        <div v-if="!months" class="segmented small" role="group" aria-label="Effort unit">
          <button
            v-for="u in UNITS" :key="u.id" :class="{ on: unit === u.id }"
            :title="u.id === 'pm' ? 'Show effort in person-months' : 'Show effort in person-days (1 PM = 17.5 days)'" @click="unit = u.id"
          >{{ u.label }}</button>
        </div>
        <div class="segmented small" role="group" aria-label="House style">
          <button v-for="t in THEMES" :key="t.id" :class="{ on: theme === t.id }" :title="`${t.label} house style`" @click="theme = t.id">
            {{ t.label }}
          </button>
        </div>
        <button class="ghost" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="undo"><Undo2 :size="15" /> Undo</button>
        <button class="primary" @click="state.view === 'projects' ? addProject() : state.view === 'people' ? addPerson() : addPhd()">
          <Plus :size="15" /> {{ state.view === 'projects' ? 'Project' : state.view === 'people' ? 'Person' : 'PhD' }}
        </button>
      </div>
    </header>

    <main class="stage">
      <Timeline />
      <Drawer />
      <MonthReport v-if="state.report" />
    </main>

    <footer class="statusbar">
      <span v-if="state.readout" class="readout">{{ state.readout }}</span>
      <span v-else-if="months">Actuals are days worked per month · dashed numbers are planned but not reported yet · click a cell and type the days · a dot marks days the project does not pay for</span>
      <span v-else-if="unit === 'pm'">1 PM = 17.5 working days · full time = 3 PM per quarter · click a cell and type PM (or days as 9d, or 50%) · drag across quarters to fill several</span>
      <span v-else>17.5 working days = 1 PM · full time = 52.5 days per quarter · click a cell and type days (or months as 1.5pm, or 50%) · drag across quarters to fill several</span>
      <span class="tools">
        <span :class="{ 'sync-error': status === 'error' }">{{ syncText }}</span>
        <label class="link-btn">Import data<input type="file" accept=".json,application/json" hidden @change="importData" /></label>
        <button class="link-btn" @click="exportData">Export</button>
        <button v-if="!remote" class="link-btn" @click="resetDemo">Reset demo data</button>
        <button
          v-else class="link-btn" :disabled="signingOut"
          title="Sign out on this browser only. You need the team password to get back in; nobody else is signed out and no data changes."
          @click="leave"
        >{{ signingOut ? 'Signing out…' : 'Sign out' }}</button>
      </span>
    </footer>
  </div>
</template>
