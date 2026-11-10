<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '../store';
import AppButton from './AppButton.vue';

const store = useStore();
const router = useRouter();

const user = computed(() => store.state.auth.user);
const isValidator = computed(() => store.getters['auth/isValidator'] as boolean);

async function logout() {
  await store.dispatch('auth/logout');
  await router.push({ name: 'login' });
}
</script>

<template>
  <header :class="$style.header">
    <div :class="$style.inner">
      <span :class="$style.brand">Vacation Manager</span>
      <nav :class="$style.nav" aria-label="Main">
        <RouterLink v-if="isValidator" :to="{ name: 'dashboard' }" :class="$style.link">
          Dashboard
        </RouterLink>
        <RouterLink v-else :to="{ name: 'my-requests' }" :class="$style.link">
          My requests
        </RouterLink>
        <RouterLink :to="{ name: 'team' }" :class="$style.link">Team calendar</RouterLink>
      </nav>
      <div v-if="user" :class="$style.user">
        <span>{{ user.name }}</span>
        <span :class="$style.role">{{ user.role }}</span>
        <AppButton small @click="logout">Log out</AppButton>
      </div>
    </div>
  </header>
</template>

<style module>
.header {
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-5);
  max-width: 64rem;
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
}
.brand {
  font-weight: 700;
}
.nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  flex: 1;
}
.link {
  padding: var(--space-1) 0;
  border-bottom: 2px solid transparent;
  color: var(--color-muted);
  text-decoration: none;
}
.link:hover {
  color: var(--color-text);
}
/* Class added by RouterLink on the page being shown. */
.link[aria-current='page'] {
  border-bottom-color: var(--color-primary);
  color: var(--color-text);
}
.user {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  font-size: 0.9375rem;
}
.role {
  padding: 0 var(--space-2);
  border-radius: 999px;
  background: var(--color-primary-soft);
  font-size: 0.8125rem;
  color: var(--color-primary);
}
</style>
