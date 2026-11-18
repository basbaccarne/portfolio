<script setup lang="ts">
import { ref } from 'vue'
import { unlock, status } from '../sync'

/** The one screen people see before the shared team password is entered. */
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  if (!password.value || busy.value) return
  busy.value = true
  error.value = (await unlock(password.value)) ?? ''
  busy.value = false
  password.value = ''
}
</script>

<template>
  <div class="gate">
    <form class="gate-card" @submit.prevent="submit">
      <div class="brand"><span class="mark" />Portfolio</div>
      <template v-if="status === 'loading'">
        <p class="note">Loading the portfolio…</p>
      </template>
      <template v-else>
        <label>Team password
          <input v-model="password" type="password" autocomplete="current-password" autofocus />
        </label>
        <p v-if="error" class="gate-error">{{ error }}</p>
        <button class="primary" type="submit" :disabled="busy || !password">{{ busy ? 'Checking…' : 'Open' }}</button>
        <p class="note">This browser stays unlocked until you choose "Lock".</p>
      </template>
    </form>
  </div>
</template>
