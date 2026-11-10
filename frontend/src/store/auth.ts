import type { Module } from 'vuex';
import * as authApi from '../api/auth';
import { setAuthToken } from '../api/http';
import type { Role, User } from '../types';
import type { RootState } from './index';

export interface AuthState {
  token: string | null;
  user: User | null;
}

const TOKEN_KEY = 'vacation-manager.token';

// Storage can be unavailable (private mode, blocked cookies): the app then simply forgets the
// session on refresh instead of crashing.
function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* see readStoredToken */
  }
}

export const auth: Module<AuthState, RootState> = {
  namespaced: true,

  state: () => ({ token: readStoredToken(), user: null }),

  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    role: (state): Role | null => state.user?.role ?? null,
    isRequester: (state) => state.user?.role === 'Requester',
    isValidator: (state) => state.user?.role === 'Validator',
  },

  mutations: {
    setSession(state, { token, user }: { token: string; user: User }) {
      state.token = token;
      state.user = user;
    },
    setUser(state, user: User) {
      state.user = user;
    },
    clearSession(state) {
      state.token = null;
      state.user = null;
    },
  },

  actions: {
    async login({ commit }, credentials: authApi.Credentials) {
      const { accessToken, user } = await authApi.login(credentials);
      setAuthToken(accessToken);
      storeToken(accessToken);
      commit('setSession', { token: accessToken, user });
    },

    logout({ commit }) {
      setAuthToken(null);
      storeToken(null);
      commit('clearSession');
    },

    /** Turns a token kept from a previous visit back into a session; drops it if it is no longer valid. */
    async restore({ state, commit, dispatch }) {
      if (!state.token || state.user) return;
      setAuthToken(state.token);
      try {
        commit('setUser', await authApi.me());
      } catch {
        await dispatch('logout');
      }
    },
  },
};
