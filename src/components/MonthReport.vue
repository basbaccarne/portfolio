<script setup lang="ts">
import { computed, ref } from 'vue'
import { X, Copy } from 'lucide-vue-next'
import { state, fmt, mLabel, mToQ, fundedOf, isActive } from '../store'

/** Who worked how many days on what in the picked month: the table to send on. */
const m = computed(() => state.month)

const projects = computed(() =>
  state.data.projects.filter(p => state.data.assignments.some(a => a.projectId === p.id && a.actual?.[m.value])))

const rows = computed(() => state.data.people.map(person => {
  const cells = projects.value.map(project => {
    const a = state.data.assignments.find(x => x.projectId === project.id && x.personId === person.id)
    const days = a?.actual?.[m.value] || 0
    return { days, unpaid: !!a && days > 0 && !fundedOf(a, mToQ(m.value)) }
  })
  return { person, cells, total: cells.reduce((s, c) => s + c.days, 0) }
}))
const reported = computed(() => rows.value.filter(r => r.total > 0))
const silent = computed(() => rows.value.filter(r => !r.total && isActive(r.person, mToQ(m.value))).map(r => r.person.name))
const columnTotals = computed(() => projects.value.map((_, i) => reported.value.reduce((s, r) => s + r.cells[i].days, 0)))
const grandTotal = computed(() => reported.value.reduce((s, r) => s + r.total, 0))
const anyUnpaid = computed(() => reported.value.some(r => r.cells.some(c => c.unpaid)))

const copied = ref(false)
async function copy() {
  const lines = [
    ['Person', ...projects.value.map(p => p.name), 'Total'],
    ...reported.value.map(r => [r.person.name, ...r.cells.map(c => fmt(c.days)), fmt(r.total)]),
    ['Total', ...columnTotals.value.map(t => fmt(t)), fmt(grandTotal.value)],
  ]
  await navigator.clipboard.writeText(lines.map(l => l.join('\t')).join('\n'))
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<template>
  <div class="backdrop" @click.self="state.report = false">
    <div class="modal">
      <header>
        <h2>{{ mLabel(m) }}: days worked</h2>
        <button class="icon-btn" title="Close" @click="state.report = false"><X :size="16" /></button>
      </header>

      <div v-if="reported.length" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th v-for="p in projects" :key="p.id" class="num">{{ p.name }}</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in reported" :key="r.person.id">
              <td>{{ r.person.name }}</td>
              <td v-for="(c, i) in r.cells" :key="i" class="num">{{ fmt(c.days) }}<sup v-if="c.unpaid">*</sup></td>
              <td class="num strong">{{ fmt(r.total) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td v-for="(t, i) in columnTotals" :key="i" class="num">{{ fmt(t) }}</td>
              <td class="num strong">{{ fmt(grandTotal) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-else class="note">Nothing has been reported for this month yet. Use "Fill from plan" to start from the planned days.</p>

      <p v-if="anyUnpaid" class="note">* Worked on this project but not paid from it.</p>
      <p v-if="silent.length && reported.length" class="note">No days reported: {{ silent.join(', ') }}.</p>

      <footer>
        <button class="primary" :disabled="!reported.length" @click="copy"><Copy :size="15" /> {{ copied ? 'Copied' : 'Copy table' }}</button>
        <span class="note">Pastes straight into Excel or an e-mail.</span>
      </footer>
    </div>
  </div>
</template>
