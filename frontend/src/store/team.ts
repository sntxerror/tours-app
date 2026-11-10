import type { Module } from 'vuex';
import { toErrorMessage } from '../api/errors';
import { listTeamVacations } from '../api/team';
import type { TeamVacation } from '../types';
import { currentMonth, monthBounds, shiftMonth } from '../utils/dates';
import type { RootState } from './index';

export interface TeamState {
  month: string;
  items: TeamVacation[];
  loading: boolean;
  error: string | null;
}

const initialState = (): TeamState => ({
  month: currentMonth(),
  items: [],
  loading: false,
  error: null,
});

let latestFetch = 0;

export const team: Module<TeamState, RootState> = {
  namespaced: true,

  state: initialState,

  mutations: {
    setMonth(state, month: string) {
      state.month = month;
    },
    setLoading(state, loading: boolean) {
      state.loading = loading;
    },
    setItems(state, items: TeamVacation[]) {
      state.items = items;
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
    async fetch({ state, commit }) {
      const fetchId = ++latestFetch;
      commit('setLoading', true);
      try {
        const items = await listTeamVacations(monthBounds(state.month));
        if (fetchId === latestFetch) commit('setItems', items);
      } catch (error) {
        if (fetchId === latestFetch) commit('setError', toErrorMessage(error));
      } finally {
        if (fetchId === latestFetch) commit('setLoading', false);
      }
    },

    goToMonth({ commit, dispatch }, month: string) {
      commit('setMonth', month);
      return dispatch('fetch');
    },

    nextMonth({ state, dispatch }) {
      return dispatch('goToMonth', shiftMonth(state.month, 1));
    },

    prevMonth({ state, dispatch }) {
      return dispatch('goToMonth', shiftMonth(state.month, -1));
    },

    thisMonth({ dispatch }) {
      return dispatch('goToMonth', currentMonth());
    },
  },
};
