<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X, Plus, Trash2, Archive, ArchiveRestore } from 'lucide-vue-next'
import {
  state, mutate, SLOTS, ORGS, CHAPTER_STATUS, colorOf, hasColors, qLabel, qOf,
  personById, projectById, phdById,
  setSpan, addMilestone, addChapter, deleteProject, deletePerson, deletePhd, toggleArchived, LIST_WORDS,
  type Spanned, type Phd, type ChapterStatus,
} from '../store'

const project = computed(() => (state.drawer?.type === 'project' ? projectById(state.drawer.id) : undefined))
const person = computed(() => (state.drawer?.type === 'person' ? personById(state.drawer.id) : undefined))
const phd = computed(() => (state.drawer?.type === 'phd' ? phdById(state.drawer.id) : undefined))
const open = computed(() => !!project.value || !!person.value || !!phd.value)
const entity = computed(() => project.value ?? person.value ?? phd.value)
const words = computed(() => LIST_WORDS[project.value ? 'projects' : phd.value ? 'phds' : 'people'])
const kind = computed(() => (project.value ? 'project' : phd.value ? 'PhD' : 'person'))

const quarterOptions: number[] = []
for (let q = qOf(2023, 1); q <= qOf(2033, 4); q++) quarterOptions.push(q)

const confirmDelete = ref(false)
watch(() => state.drawer?.id, () => { confirmDelete.value = false })

const val = (e: Event) => (e.target as HTMLInputElement).value
const checked = (e: Event) => (e.target as HTMLInputElement).checked
const optQ = (e: Event) => (val(e) === '' ? null : +val(e))
function set<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]) {
  if (obj[key] !== value) mutate(() => { obj[key] = value })
}
function setCapacity(e: Event) {
  const v = parseFloat(val(e).replace(',', '.'))
  if (person.value && Number.isFinite(v)) set(person.value, 'capacity', Math.min(Math.max(v, 0), 12))
}
const num = (e: Event) => {
  const v = parseFloat(val(e).replace(',', '.'))
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), 12) : 0
}
function setBase(e: Event) {
  if (person.value) set(person.value, 'base', Math.min(num(e), person.value.capacity))
}
function setTeaching(i: number, e: Event) {
  const p = person.value
  if (!p) return
  const next = [...p.teaching]
  next[i] = num(e)
  mutate(() => { p.teaching = next })
}
function removeMilestone(p: Spanned, id: string) {
  mutate(() => { p.milestones = p.milestones.filter(m => m.id !== id) })
}
function removeChapter(p: Phd, id: string) {
  mutate(() => { p.chapters = p.chapters.filter(c => c.id !== id) })
}
function doDelete() {
  if (!confirmDelete.value) { confirmDelete.value = true; return }
  if (project.value) deleteProject(project.value.id)
  else if (phd.value) deletePhd(phd.value.id)
  else if (person.value) deletePerson(person.value.id)
}
</script>

<template>
  <Transition name="drawer">
    <aside v-if="open" class="drawer">
      <header>
        <h2>{{ project ? 'Project' : phd ? 'PhD' : 'Person' }}</h2>
        <button class="icon-btn" title="Close" @click="state.drawer = null"><X :size="16" /></button>
      </header>

      <div v-if="project" class="form">
        <label>Name
          <input :value="project.name" @change="set(project, 'name', val($event))" />
        </label>
        <div class="field">Participating as
          <div class="segmented small choice">
            <button v-for="o in ORGS" :key="o" :class="{ on: project.org === o }" @click="set(project, 'org', o)">{{ o }}</button>
          </div>
        </div>
        <label>Call / funder
          <input :value="project.funder" placeholder="e.g. Horizon Europe" @change="set(project, 'funder', val($event))" />
        </label>
        <div class="two">
          <label>Start
            <select :value="project.start" @change="setSpan(project, +val($event), project.end)">
              <option v-for="q in quarterOptions" :key="q" :value="q">{{ qLabel(q) }}</option>
            </select>
          </label>
          <label>End
            <select :value="project.end" @change="setSpan(project, project.start, +val($event))">
              <option v-for="q in quarterOptions" :key="q" :value="q">{{ qLabel(q) }}</option>
            </select>
          </label>
        </div>
        <div v-if="hasColors" class="field">Colour
          <div class="swatches">
            <button
              v-for="c in SLOTS" :key="c" class="swatch" :class="{ on: project.color === c }"
              :style="{ background: colorOf(c) }" :title="colorOf(c)" @click="set(project, 'color', c)"
            />
          </div>
        </div>

        <div class="field">Milestones
          <div v-for="m in project.milestones" :key="m.id" class="ms-row">
            <input :value="m.title" @change="set(m, 'title', val($event))" />
            <input type="date" :value="m.date" @change="val($event) && set(m, 'date', val($event))" />
            <button class="icon-btn" title="Remove milestone" @click="removeMilestone(project, m.id)"><X :size="14" /></button>
          </div>
          <button class="ghost" @click="addMilestone(project)"><Plus :size="14" /> Add milestone</button>
        </div>
      </div>

      <div v-else-if="phd" class="form">
        <label>Researcher
          <select :value="phd.personId" @change="set(phd, 'personId', val($event))">
            <option v-for="p in state.data.people" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label>Topic
          <input :value="phd.title" placeholder="Working title of the dissertation" @change="set(phd, 'title', val($event))" />
        </label>
        <div class="two">
          <label>Start
            <select :value="phd.start" @change="setSpan(phd, +val($event), phd.end)">
              <option v-for="q in quarterOptions" :key="q" :value="q">{{ qLabel(q) }}</option>
            </select>
          </label>
          <label>Expected end
            <select :value="phd.end" @change="setSpan(phd, phd.start, +val($event))">
              <option v-for="q in quarterOptions" :key="q" :value="q">{{ qLabel(q) }}</option>
            </select>
          </label>
        </div>

        <div class="field">Milestones
          <div v-for="m in phd.milestones" :key="m.id" class="ms-row check">
            <input type="checkbox" :checked="!!m.done" title="Achieved" @change="set(m, 'done', checked($event))" />
            <input :value="m.title" @change="set(m, 'title', val($event))" />
            <input type="date" :value="m.date" @change="val($event) && set(m, 'date', val($event))" />
            <button class="icon-btn" title="Remove milestone" @click="removeMilestone(phd, m.id)"><X :size="14" /></button>
          </div>
          <button class="ghost" @click="addMilestone(phd)"><Plus :size="14" /> Add milestone</button>
        </div>

        <div class="field">Dissertation chapters
          <div v-for="c in phd.chapters" :key="c.id" class="ms-row">
            <input :value="c.title" @change="set(c, 'title', val($event))" />
            <select :value="c.status" @change="set(c, 'status', val($event) as ChapterStatus)">
              <option v-for="(label, key) in CHAPTER_STATUS" :key="key" :value="key">{{ label }}</option>
            </select>
            <button class="icon-btn" title="Remove chapter" @click="removeChapter(phd, c.id)"><X :size="14" /></button>
          </div>
          <button class="ghost" @click="addChapter(phd)"><Plus :size="14" /> Add chapter</button>
        </div>
      </div>

      <div v-else-if="person" class="form">
        <label>Name
          <input :value="person.name" @change="set(person, 'name', val($event))" />
        </label>
        <label>Contract <span class="hint">person-months per quarter (full-time = 3)</span>
          <input :value="person.capacity" inputmode="decimal" @change="setCapacity" />
        </label>
        <label>Paid by the faculty <span class="hint">person-months per quarter that need no project funding</span>
          <input :value="person.base" inputmode="decimal" @change="setBase" />
        </label>
        <div class="field">Teaching per quarter
          <span class="hint">person-months, repeating every year. Semester 1 is mostly Q4, semester 2 is Q1 and Q2.</span>
          <div class="four">
            <label v-for="i in 4" :key="i">Q{{ i }}
              <input :value="person.teaching[i - 1]" inputmode="decimal" @change="setTeaching(i - 1, $event)" />
            </label>
          </div>
        </div>
        <div class="two">
          <label>In the team from
            <select :value="person.start ?? ''" @change="set(person, 'start', optQ($event))">
              <option value="">Always</option>
              <option v-for="q in quarterOptions" :key="q" :value="q">{{ qLabel(q) }}</option>
            </select>
          </label>
          <label>Until
            <select :value="person.end ?? ''" @change="set(person, 'end', optQ($event))">
              <option value="">Open-ended</option>
              <option v-for="q in quarterOptions" :key="q" :value="q">{{ qLabel(q) }}</option>
            </select>
          </label>
        </div>
      </div>

      <footer>
        <button
          v-if="entity" class="ghost"
          :title="entity.archived ? `${words.restore}, for everyone` : `${words.archive}, for everyone. Nothing is deleted and the effort still counts.`"
          @click="toggleArchived(entity)"
        >
          <component :is="entity.archived ? ArchiveRestore : Archive" :size="14" /> {{ entity.archived ? words.restore : words.archive }}
        </button>
        <button class="danger" @click="doDelete">
          <Trash2 :size="14" /> {{ confirmDelete ? 'Click again to delete' : `Delete ${kind}` }}
        </button>
      </footer>
    </aside>
  </Transition>
</template>
