<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AppButton from '../components/AppButton.vue';
import EmptyState from '../components/EmptyState.vue';
import ErrorMessage from '../components/ErrorMessage.vue';
import LoadingState from '../components/LoadingState.vue';
import TeamMonthGrid from '../components/TeamMonthGrid.vue';
import { useStore } from '../store';
import { formatMonth } from '../utils/dates';

const store = useStore();
const state = computed(() => store.state.team);
const userId = computed(() => store.state.auth.user?.id);

onMounted(() => store.dispatch('team/fetch'));
</script>

<template>
  <div :class="$style.page">
    <div>
      <h1>Team calendar</h1>
      <p :class="$style.subtitle">Approved vacations only. Your own are shown in dark blue.</p>
    </div>

    <div :class="$style.switcher">
      <AppButton small aria-label="Previous month" @click="store.dispatch('team/prevMonth')">
        ‹
      </AppButton>
      <h2 :class="$style.month" aria-live="polite">{{ formatMonth(state.month) }}</h2>
      <AppButton small aria-label="Next month" @click="store.dispatch('team/nextMonth')">
        ›
      </AppButton>
      <AppButton small @click="store.dispatch('team/thisMonth')">Today</AppButton>
    </div>

    <ErrorMessage :message="state.error" />
    <LoadingState v-if="state.loading && state.items.length === 0" />
    <EmptyState v-else-if="!state.loading && !state.error && state.items.length === 0">
      Nobody is on vacation in {{ formatMonth(state.month) }}.
    </EmptyState>
    <TeamMonthGrid
      v-else-if="state.items.length > 0"
      :month="state.month"
      :items="state.items"
      :current-user-id="userId"
      :class="{ [$style.refreshing]: state.loading }"
    />
  </div>
</template>

<style module>
.page {
  display: grid;
  gap: var(--space-4);
}
.subtitle {
  margin: var(--space-1) 0 0;
  color: var(--color-muted);
}
.switcher {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.month {
  min-width: 10rem;
  font-size: 1.125rem;
  text-align: center;
}
.refreshing {
  opacity: 0.6;
}
</style>
