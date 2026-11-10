import { createRouter, createWebHistory, type RouteLocationRaw } from 'vue-router';
import { store } from '../store';
import type { Role } from '../types';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    roles?: Role[];
  }
}

export const homeFor = (role: Role): RouteLocationRaw =>
  role === 'Validator' ? { name: 'dashboard' } : { name: 'my-requests' };

const currentRole = () => store.getters['auth/role'] as Role | null;

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/my-requests',
      name: 'my-requests',
      component: () => import('../views/MyRequestsView.vue'),
      meta: { roles: ['Requester'] },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/ValidatorDashboardView.vue'),
      meta: { roles: ['Validator'] },
    },
    {
      path: '/team',
      name: 'team',
      component: () => import('../views/TeamCalendarView.vue'),
      meta: { roles: ['Requester', 'Validator'] },
    },
    {
      path: '/events-test',
      name: 'events-test',
      component: () => import('../views/EventsTestView.vue'),
      meta: { public: true },
    },
    // Resolved by the guard below, once the session is known.
    { path: '/', name: 'home', component: { render: () => null } },
    { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
  ],
});

// A token kept from a previous visit is checked once, before the first navigation.
let restoringSession: Promise<void> | undefined;

router.beforeEach(async (to) => {
  restoringSession ??= store.dispatch('auth/restore');
  await restoringSession;
  const role = currentRole();

  if (to.meta.public) return to.name === 'login' && role ? homeFor(role) : true;
  if (!role) {
    return to.name === 'home'
      ? { name: 'login' }
      : { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'home' || (to.meta.roles && !to.meta.roles.includes(role))) return homeFor(role);
  return true;
});
