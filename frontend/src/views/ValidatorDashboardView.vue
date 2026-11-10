<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { errorStatus, toErrorMessage } from '../api/errors';
import AppButton from '../components/AppButton.vue';
import DecisionDialog from '../components/DecisionDialog.vue';
import EmptyState from '../components/EmptyState.vue';
import ErrorMessage from '../components/ErrorMessage.vue';
import LoadingState from '../components/LoadingState.vue';
import PaginationBar from '../components/PaginationBar.vue';
import StatusFilter from '../components/StatusFilter.vue';
import SuccessMessage from '../components/SuccessMessage.vue';
import VacationRequestTable from '../components/VacationRequestTable.vue';
import { useStore } from '../store';
import type { VacationRequest, VacationStatus } from '../types';
import { parseDashboardQuery, toDashboardQuery } from '../utils/dashboardQuery';

const store = useStore();
const route = useRoute();
const router = useRouter();
const state = computed(() => store.state.dashboard);
const userSelectId = 'dashboard-user';

// ---- Filters and page live in the URL, so refresh, back and shared links keep them.
const query = computed(() => parseDashboardQuery(route.query));

watch(
  query,
  (next) => {
    // The route also changes while leaving this page; that is not a new search.
    if (route.name === 'dashboard') void store.dispatch('dashboard/load', next);
  },
  { immediate: true },
);

function navigate(filters: { status: VacationStatus | null; userId: string | null }, page = 1) {
  return router.push({ query: toDashboardQuery(filters, page) });
}

const setStatus = (status: VacationStatus | null) => navigate({ ...query.value.filters, status });
const setUser = (event: Event) =>
  navigate({ ...query.value.filters, userId: (event.target as HTMLSelectElement).value || null });
const goToPage = (page: number) => navigate(query.value.filters, page);

// ---- Approve / reject
const decision = ref<{ mode: 'approve' | 'reject'; request: VacationRequest } | null>(null);
const busy = ref(false);
const dialogError = ref<string | null>(null);
const notice = ref<string | null>(null);
// Page-level message, for a decision that cannot be made any more (409).
const pageError = ref<string | null>(null);

function openDecision(mode: 'approve' | 'reject', request: VacationRequest) {
  dialogError.value = null;
  decision.value = { mode, request };
}

async function decide(comment: string) {
  if (!decision.value) return;
  const { mode, request } = decision.value;
  busy.value = true;
  dialogError.value = null;
  notice.value = null;
  pageError.value = null;
  try {
    await store.dispatch(`dashboard/${mode}`, {
      id: request.id,
      comment: comment || undefined,
    });
    decision.value = null;
    notice.value = `Request from ${request.user.name} ${mode === 'approve' ? 'approved' : 'rejected'}.`;
  } catch (e) {
    if (errorStatus(e) === 409) {
      // Another validator was faster (or the request changed): show the current state.
      decision.value = null;
      pageError.value = `${toErrorMessage(e)}. The list has been refreshed.`;
      void store.dispatch('dashboard/fetch');
    } else {
      dialogError.value = toErrorMessage(e);
    }
  } finally {
    busy.value = false;
  }
}

onMounted(() => store.dispatch('dashboard/fetchUsers'));
</script>

<template>
  <div :class="$style.page">
    <h1>Vacation requests</h1>

    <div :class="$style.filters">
      <StatusFilter :model-value="query.filters.status" @update:model-value="setStatus" />
      <div>
        <label :for="userSelectId">Requester</label>
        <select :id="userSelectId" :value="query.filters.userId ?? ''" @change="setUser">
          <option value="">All users</option>
          <option v-for="user in state.users" :key="user.id" :value="user.id">
            {{ user.name }}
          </option>
        </select>
      </div>
    </div>

    <SuccessMessage :message="notice" />
    <ErrorMessage :message="pageError ?? state.error" />

    <LoadingState v-if="state.loading && !state.page" />
    <template v-else-if="state.page">
      <EmptyState v-if="state.page.items.length === 0">
        No requests match the selected filters.
      </EmptyState>
      <template v-else>
        <VacationRequestTable
          :items="state.page.items"
          show-user
          :class="{ [$style.refreshing]: state.loading }"
        >
          <template #actions="{ request }">
            <template v-if="request.status === 'Pending'">
              <AppButton small variant="primary" @click="openDecision('approve', request)">
                Approve
              </AppButton>
              <AppButton small variant="danger" @click="openDecision('reject', request)">
                Reject
              </AppButton>
            </template>
          </template>
        </VacationRequestTable>
        <PaginationBar :meta="state.page.meta" @change="goToPage" />
      </template>
    </template>

    <DecisionDialog
      v-if="decision"
      :mode="decision.mode"
      :request="decision.request"
      :busy="busy"
      :error="dialogError"
      @confirm="decide"
      @close="decision = null"
    />
  </div>
</template>

<style module>
.page {
  display: grid;
  gap: var(--space-4);
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}
.filters > * {
  min-width: 12rem;
}
.refreshing {
  opacity: 0.6;
}
</style>
