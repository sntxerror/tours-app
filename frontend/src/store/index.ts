import type { InjectionKey } from 'vue';
import { createStore, useStore as baseUseStore, type Plugin, type Store } from 'vuex';
import { auth, type AuthState } from './auth';
import { dashboard, type DashboardState } from './dashboard';
import { myRequests, type MyRequestsState } from './myRequests';
import { team, type TeamState } from './team';

export interface RootState {
  auth: AuthState;
  myRequests: MyRequestsState;
  dashboard: DashboardState;
  team: TeamState;
}

export const key: InjectionKey<Store<RootState>> = Symbol('store');

const resetDataOnLogout: Plugin<RootState> = (store) => {
  store.subscribe((mutation) => {
    if (mutation.type !== 'auth/clearSession') return;
    for (const module of ['myRequests', 'dashboard', 'team']) store.commit(`${module}/reset`);
  });
};

export const store = createStore<RootState>({
  modules: { auth, myRequests, dashboard, team },
  plugins: [resetDataOnLogout],
  strict: import.meta.env.DEV,
});

export function useStore(): Store<RootState> {
  return baseUseStore(key);
}
