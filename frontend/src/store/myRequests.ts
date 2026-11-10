import type { Module } from 'vuex';
import { toErrorMessage } from '../api/errors';
import * as requestsApi from '../api/vacationRequests';
import type { Page, VacationRequest, VacationRequestInput, VacationStatus } from '../types';
import type { RootState } from './index';

export interface MyRequestsState {
  page: Page<VacationRequest> | null;
  status: VacationStatus | null;
  pageNum: number;
  loading: boolean;
  error: string | null;
}

const initialState = (): MyRequestsState => ({
  page: null,
  status: null,
  pageNum: 1,
  loading: false,
  error: null,
});

// Only the latest fetch may write its result, so quick filter changes cannot show stale data.
let latestFetch = 0;

export const myRequests: Module<MyRequestsState, RootState> = {
  namespaced: true,

  state: initialState,

  mutations: {
    setStatus(state, status: VacationStatus | null) {
      state.status = status;
      state.pageNum = 1;
    },
    setPageNum(state, pageNum: number) {
      state.pageNum = pageNum;
    },
    setLoading(state, loading: boolean) {
      state.loading = loading;
    },
    setPage(state, page: Page<VacationRequest>) {
      state.page = page;
      state.error = null;
    },
    setError(state, error: string | null) {
      state.error = error;
    },
    reset(state) {
      Object.assign(state, initialState());
    },
  },

  actions: {
    async fetch({ state, commit, dispatch }) {
      const fetchId = ++latestFetch;
      commit('setLoading', true);
      try {
        const page = await requestsApi.listMine({
          status: state.status ?? undefined,
          page: state.pageNum,
        });
        if (fetchId !== latestFetch) return;
        // The last item of the last page was cancelled: step back to the new last page.
        if (page.items.length === 0 && state.pageNum > 1 && page.meta.totalPages > 0) {
          commit('setPageNum', page.meta.totalPages);
          return dispatch('fetch');
        }
        commit('setPage', page);
      } catch (error) {
        if (fetchId === latestFetch) commit('setError', toErrorMessage(error));
      } finally {
        if (fetchId === latestFetch) commit('setLoading', false);
      }
    },

    filterByStatus({ commit, dispatch }, status: VacationStatus | null) {
      commit('setStatus', status);
      return dispatch('fetch');
    },

    goToPage({ commit, dispatch }, pageNum: number) {
      commit('setPageNum', pageNum);
      return dispatch('fetch');
    },

    async create({ dispatch }, input: VacationRequestInput) {
      const created = await requestsApi.create(input);
      await dispatch('fetch');
      return created;
    },

    async update(
      { dispatch },
      { id, changes }: { id: string; changes: Partial<VacationRequestInput> },
    ) {
      const updated = await requestsApi.update(id, changes);
      await dispatch('fetch');
      return updated;
    },

    async cancel({ dispatch }, id: string) {
      await requestsApi.cancel(id);
      await dispatch('fetch');
    },
  },
};
