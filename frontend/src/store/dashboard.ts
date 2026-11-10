import type { Module } from 'vuex';
import { toErrorMessage } from '../api/errors';
import { listUsers } from '../api/users';
import * as requestsApi from '../api/vacationRequests';
import type { Page, User, VacationRequest, VacationStatus } from '../types';
import type { RootState } from './index';

export interface DashboardFilters {
  status: VacationStatus | null;
  userId: string | null;
}

/** The validator's view of every request. */
export interface DashboardState {
  page: Page<VacationRequest> | null;
  filters: DashboardFilters;
  pageNum: number;
  loading: boolean;
  error: string | null;
  /** Requesters, for the "filter by user" select. */
  users: User[];
}

const initialState = (): DashboardState => ({
  page: null,
  filters: { status: 'Pending', userId: null },
  pageNum: 1,
  loading: false,
  error: null,
  users: [],
});

let latestFetch = 0;

export const dashboard: Module<DashboardState, RootState> = {
  namespaced: true,

  state: initialState,

  mutations: {
    setQuery(state, { filters, pageNum }: { filters: DashboardFilters; pageNum: number }) {
      state.filters = filters;
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
    setUsers(state, users: User[]) {
      state.users = users;
    },
    reset(state) {
      Object.assign(state, initialState());
    },
  },

  actions: {
    async fetch({ state, commit }) {
      const fetchId = ++latestFetch;
      commit('setLoading', true);
      try {
        const page = await requestsApi.listAll({
          status: state.filters.status ?? undefined,
          userId: state.filters.userId ?? undefined,
          page: state.pageNum,
        });
        if (fetchId === latestFetch) commit('setPage', page);
      } catch (error) {
        if (fetchId === latestFetch) commit('setError', toErrorMessage(error));
      } finally {
        if (fetchId === latestFetch) commit('setLoading', false);
      }
    },

    /** Applies filters and page (the view keeps them in the URL) and loads the matching requests. */
    load({ commit, dispatch }, query: { filters: DashboardFilters; pageNum: number }) {
      commit('setQuery', query);
      return dispatch('fetch');
    },

    /** Loaded once per session; the filter still works by id if this fails. */
    async fetchUsers({ state, commit }) {
      if (state.users.length > 0) return;
      try {
        commit('setUsers', await listUsers('Requester'));
      } catch {
        /* the select then only offers "All users" */
      }
    },

    // Decisions throw on failure (e.g. 409 when another validator was faster) so the dialog can
    // show why; the list is refreshed either way by the view.

    async approve({ dispatch }, { id, comment }: { id: string; comment?: string }) {
      const decided = await requestsApi.approve(id, comment);
      await dispatch('fetch');
      return decided;
    },

    async reject({ dispatch }, { id, comment }: { id: string; comment: string }) {
      const decided = await requestsApi.reject(id, comment);
      await dispatch('fetch');
      return decided;
    },
  },
};
