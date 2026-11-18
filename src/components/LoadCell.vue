<script setup lang="ts">
import { show, fmt, type Balance } from '../store'

/**
 * One quarter for a person or the team.
 * Grey track = the contract. Hatched part = what is fixed (teaching in the Plan lens,
 * the faculty-paid share in the Funding lens). Coloured fill = project work or project funding.
 * Everything is drawn against `scale` (a full-time quarter, or the team's capacity).
 */
const props = defineProps<{ b: Balance; scale: number; raw?: boolean }>()

/** Actuals are already in days (`raw`); everything else is PM shown in the chosen unit. */
const num = (v: number) => (props.raw ? fmt(v) : show(v))

const frac = (v: number) => (props.scale > 0 ? Math.min(Math.max(v / props.scale, 0), 1) : v > 0 ? 1 : 0)
const pct = (f: number) => f * 100 + '%'
</script>

<template>
  <div class="load" :class="{ alarm: b.alarm, over: b.over, off: b.off }">
    <template v-if="!b.off">
      <div class="gauge">
        <div class="gauge-cap" :style="{ width: pct(frac(b.capacity)) }" />
        <div v-if="b.fixed" class="gauge-fixed" :style="{ width: pct(frac(b.fixed)) }" />
        <div class="gauge-fill" :style="{ left: pct(frac(b.fixed)), width: pct(Math.min(frac(b.load), 1 - frac(b.fixed))) }" />
        <b>{{ num(b.load) || '0' }}</b>
      </div>
      <div class="gap">{{ b.word ? `${num(Math.abs(b.gap))} ${b.word}` : b.plan !== undefined ? `plan ${num(b.plan) || '0'}` : '' }}</div>
    </template>
  </div>
</template>
