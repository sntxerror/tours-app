<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { toErrorMessage } from '../api/errors';
import AppButton from '../components/AppButton.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import EmptyState from '../components/EmptyState.vue';
import ErrorMessage from '../components/ErrorMessage.vue';
import LoadingState from '../components/LoadingState.vue';
import ModalDialog from '../components/ModalDialog.vue';
import PaginationBar from '../components/PaginationBar.vue';
import StatusFilter from '../components/StatusFilter.vue';
import SuccessMessage from '../components/SuccessMessage.vue';
import VacationRequestForm from '../components/VacationRequestForm.vue';
import VacationRequestTable from '../components/VacationRequestTable.vue';
import { useStore } from '../store';
import type { VacationRequest, VacationRequestInput, VacationStatus } from '../types';
import { formatRange } from '../utils/dates';

const store = useStore();
const state = computed(() => store.state.myRequests);

// ---- New request
const newForm = ref<InstanceType<typeof VacationRequestForm> | null>(null);
const creating = ref(false);
const createError = ref<string | null>(null);
const notice = ref<string | null>(null);

async function createRequest(input: VacationRequestInput) {
  creating.value = true;
  createError.value = null;
  notice.value = null;
  try {
    const created = await store.dispatch('myRequests/create', input);
    newForm.value?.reset();
    notice.value = `Request for ${formatRange(created.startDate, created.endDate)} submitted.`;
  } catch (e) {
    createError.value = toErrorMessage(e);
  } finally {
    creating.value = false;
  }
}

// ---- Edit and cancel (pending requests only)
const editing = ref<VacationRequest | null>(null);
const cancelling = ref<VacationRequest | null>(null);
const actionBusy = ref(false);
const actionError = ref<string | null>(null);

function openEdit(request: VacationRequest) {
  actionError.value = null;
  editing.value = request;
}

function openCancel(request: VacationRequest) {
  actionError.value = null;
  cancelling.value = request;
}

function closeDialogs() {
  editing.value = null;
  cancelling.value = null;
}

/** Runs a dialog action; on failure the dialog stays open and shows the server's message. */
async function runAction(work: () => Promise<void>, success: string) {
  actionBusy.value = true;
  actionError.value = null;
  try {
    await work();
    closeDialogs();
    createError.value = null;
    notice.value = success;
  } catch (e) {
    actionError.value = toErrorMessage(e);
  } finally {
    actionBusy.value = false;
  }
}

const saveEdit = (input: VacationRequestInput) =>
  runAction(
    () => store.dispatch('myRequests/update', { id: editing.value!.id, changes: input }),
    'Request updated.',
  );

const confirmCancel = () =>
  runAction(() => store.dispatch('myRequests/cancel', cancelling.value!.id), 'Request cancelled.');

// ---- List
const setStatus = (status: VacationStatus | null) =>
  store.dispatch('myRequests/filterByStatus', status);
const goToPage = (page: number) => store.dispatch('myRequests/goToPage', page);

onMounted(() => store.dispatch('myRequests/fetch'));
</script>

<template>
  <div :class="$style.page">
    <h1>My vacation requests</h1>

    <section :class="$style.card" aria-labelledby="new-request-title">
      <h2 id="new-request-title" :class="$style.heading">New request</h2>
      <VacationRequestForm
        ref="newForm"
        submit-label="Submit request"
        :busy="creating"
        :error="createError"
        @submit="createRequest"
      />
    </section>

    <SuccessMessage :message="notice" />

    <section aria-labelledby="list-title">
      <div :class="$style.listHeader">
        <h2 id="list-title" :class="$style.heading">Submitted requests</h2>
        <StatusFilter :model-value="state.status" @update:model-value="setStatus" />
      </div>

      <ErrorMessage :message="state.error" />
      <LoadingState v-if="state.loading && !state.page" />
      <template v-else-if="state.page">
        <EmptyState v-if="state.page.items.length === 0">
          {{
            state.status
              ? `You have no ${state.status.toLowerCase()} requests.`
              : 'You have not submitted any requests yet.'
          }}
        </EmptyState>
        <template v-else>
          <VacationRequestTable
            :items="state.page.items"
            :class="{ [$style.refreshing]: state.loading }"
          >
            <template #actions="{ request }">
              <template v-if="request.status === 'Pending'">
                <AppButton small @click="openEdit(request)">Edit</AppButton>
                <AppButton small @click="openCancel(request)">Cancel</AppButton>
              </template>
            </template>
          </VacationRequestTable>
          <PaginationBar :meta="state.page.meta" @change="goToPage" />
        </template>
      </template>
    </section>

    <ModalDialog v-if="editing" title="Edit request" @close="closeDialogs">
      <VacationRequestForm
        :initial="editing"
        submit-label="Save changes"
        :busy="actionBusy"
        :error="actionError"
        @submit="saveEdit"
      />
    </ModalDialog>

    <ConfirmDialog
      v-if="cancelling"
      title="Cancel request"
      confirm-label="Cancel request"
      :busy="actionBusy"
      :error="actionError"
      @confirm="confirmCancel"
      @close="closeDialogs"
    >
      <p>
        Cancel your request for {{ formatRange(cancelling.startDate, cancelling.endDate) }}? This
        cannot be undone.
      </p>
    </ConfirmDialog>
  </div>
</template>

<style module>
.page {
  display: grid;
  gap: var(--space-5);
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
.listHeader {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.refreshing {
  opacity: 0.6;
}
</style>
