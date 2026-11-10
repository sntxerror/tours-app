<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { errorStatus, toErrorMessage } from '../api/errors';
import AppButton from '../components/AppButton.vue';
import ErrorMessage from '../components/ErrorMessage.vue';
import { homeFor } from '../router';
import { useStore } from '../store';
import type { Role } from '../types';

const store = useStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

const DEMO_PASSWORD = 'Password123!';
const demoAccounts: { role: Role; email: string }[] = [
  { role: 'Requester', email: 'alice@example.com' },
  { role: 'Validator', email: 'carol@example.com' },
];

/** Only same-site paths are followed, so a crafted link cannot send users to another site. */
function redirectTarget(): string | null {
  const redirect = route.query.redirect;
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : null;
}

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    await store.dispatch('auth/login', { email: email.value.trim(), password: password.value });
    await router.push(redirectTarget() ?? homeFor(store.getters['auth/role'] as Role));
  } catch (e) {
    error.value = errorStatus(e) === 401 ? 'Invalid email or password.' : toErrorMessage(e);
  } finally {
    busy.value = false;
  }
}

function fillDemo(account: string) {
  email.value = account;
  password.value = DEMO_PASSWORD;
}
</script>

<template>
  <div :class="$style.page">
    <h1 :class="$style.title">Vacation Manager</h1>
    <form :class="$style.card" @submit.prevent="submit">
      <h2 :class="$style.heading">Log in</h2>
      <div>
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="username" required autofocus />
      </div>
      <div>
        <label for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>
      <ErrorMessage :message="error" />
      <AppButton type="submit" variant="primary" :disabled="busy">
        {{ busy ? 'Logging in…' : 'Log in' }}
      </AppButton>
    </form>

    <section :class="$style.demo" aria-label="Demo accounts">
      <h2 :class="$style.demoTitle">Demo accounts</h2>
      <p :class="$style.demoText">Password for all of them: {{ DEMO_PASSWORD }}</p>
      <ul :class="$style.demoList">
        <li v-for="account in demoAccounts" :key="account.email">
          <button type="button" :class="$style.demoButton" @click="fillDemo(account.email)">
            {{ account.email }}
          </button>
          ({{ account.role }})
        </li>
      </ul>
    </section>
  </div>
</template>

<style module>
.page {
  display: grid;
  gap: var(--space-5);
  max-width: 24rem;
  margin: var(--space-6) auto;
}
.title {
  text-align: center;
}
.card {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  box-shadow: var(--shadow);
}
.heading {
  font-size: 1.125rem;
}
.demo {
  font-size: 0.875rem;
  color: var(--color-muted);
}
.demoTitle {
  font-size: 0.875rem;
}
.demoText {
  margin: var(--space-1) 0;
}
.demoList {
  margin: 0;
  padding-left: var(--space-5);
}
.demoButton {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-primary);
  text-decoration: underline;
  cursor: pointer;
}
</style>
