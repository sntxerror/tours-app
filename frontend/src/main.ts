import { createApp } from 'vue';
import App from './App.vue';
import { onUnauthorized } from './api/http';
import { router } from './router';
import { key, store } from './store';
import './styles/base.css';

onUnauthorized(() => {
  void store.dispatch('auth/logout');
  const current = router.currentRoute.value;
  if (current.name !== 'login') {
    void router.replace({ name: 'login', query: { redirect: current.fullPath } });
  }
});

createApp(App).use(store, key).use(router).mount('#app');
