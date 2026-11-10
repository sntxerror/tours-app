<script setup lang="ts">
import { computed } from 'vue';
import type { TeamVacation } from '../types';
import { eachDay, formatRange, isWeekend, monthBounds, todayIso } from '../utils/dates';

const props = defineProps<{
  month: string;
  items: TeamVacation[];
  currentUserId?: string;
}>();

const days = computed(() => {
  const { from, to } = monthBounds(props.month);
  return eachDay(from, to).map((date) => ({
    date,
    label: Number(date.slice(8)),
    weekend: isWeekend(date),
    today: date === todayIso(),
  }));
});

const people = computed(() => {
  const byUser = new Map<string, { id: string; name: string; vacations: TeamVacation[] }>();
  for (const item of props.items) {
    const person = byUser.get(item.user.id) ?? { ...item.user, vacations: [] };
    person.vacations.push(item);
    byUser.set(item.user.id, person);
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
});

const isAway = (vacations: TeamVacation[], date: string) =>
  vacations.some((v) => v.startDate <= date && date <= v.endDate);
</script>

<template>
  <div :class="$style.wrapper">
    <table :class="$style.grid">
      <caption class="visually-hidden">
        Approved vacations in the month
      </caption>
      <thead>
        <tr>
          <th scope="col" :class="$style.name">Team member</th>
          <th
            v-for="day in days"
            :key="day.date"
            scope="col"
            :class="[$style.day, { [$style.weekend]: day.weekend, [$style.today]: day.today }]"
          >
            {{ day.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="person in people" :key="person.id">
          <th scope="row" :class="$style.name">
            {{ person.name }}
            <span v-if="person.id === currentUserId" :class="$style.you">(you)</span>
            <span class="visually-hidden">
              away {{ person.vacations.map((v) => formatRange(v.startDate, v.endDate)).join(', ') }}
            </span>
          </th>
          <td
            v-for="day in days"
            :key="day.date"
            :class="[
              $style.cell,
              {
                [$style.weekend]: day.weekend,
                [$style.today]: day.today,
                [$style.away]: isAway(person.vacations, day.date),
                [$style.own]: isAway(person.vacations, day.date) && person.id === currentUserId,
              },
            ]"
            aria-hidden="true"
          />
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style module>
.wrapper {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.grid th,
.grid td {
  border: 1px solid var(--color-border);
}
.name {
  position: sticky;
  left: 0;
  min-width: 9rem;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  text-align: left;
  white-space: nowrap;
  z-index: 1;
}
.day {
  min-width: 1.5rem;
  padding: var(--space-1) 0;
  font-weight: 500;
  text-align: center;
  color: var(--color-muted);
}
.cell {
  height: 2rem;
}
.weekend {
  background: var(--color-weekend);
}
.today {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}
.away {
  background: #8aa9ec;
}
.own {
  background: var(--color-primary);
}
.you {
  font-weight: 400;
  color: var(--color-muted);
}
</style>
