import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Dev-only plumbing check for the EventBridge -> SQS pipeline. Not part of the product UI.
    {
      path: '/events-test',
      name: 'events-test',
      component: () => import('../views/EventsTestView.vue'),
    },
    // Until the real pages (login, requests, validator, team) exist, land on the test page.
    { path: '/:pathMatch(.*)*', redirect: { name: 'events-test' } },
  ],
});
