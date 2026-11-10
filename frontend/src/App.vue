<script setup lang="ts">
import { computed } from 'vue';
import AppHeader from './components/AppHeader.vue';
import { useStore } from './store';

const store = useStore();
const loggedIn = computed(() => store.getters['auth/isAuthenticated'] as boolean);
</script>

<template>
  <AppHeader v-if="loggedIn" />
  <main :class="$style.main"><RouterView /></main>
</template>

<style module>
.main {
  max-width: 64rem;
  margin: 0 auto;
  padding: var(--space-5) var(--space-4);
}
</style>
