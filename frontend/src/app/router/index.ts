import { createRouter, createWebHistory, type NavigationGuardNext, type RouteLocationNormalized } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/auth/Setup.vue'),
    meta: { public: true },
  },
  {
    path: '/mfa',
    name: 'MfaVerify',
    component: () => import('@/views/auth/MfaVerify.vue'),
    meta: { requiresAuth: false, mfaPending: true },
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/dashboard/Dashboard.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/vault',
    name: 'Vault',
    component: () => import('@/views/resources/Vault.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/vault/new',
    name: 'ResourceCreate',
    component: () => import('@/views/resources/ResourceCreate.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/vault/:id',
    name: 'ResourceDetail',
    component: () => import('@/views/resources/ResourceDetail.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/folders',
    name: 'Folders',
    component: () => import('@/views/folders/Folders.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/users',
    name: 'Users',
    component: () => import('@/views/users/Users.vue'),
    meta: { requiresAuth: true, role: 'ADMIN' },
  },
  {
    path: '/users/new',
    name: 'UsersCreate',
    component: () => import('@/views/users/UsersCreate.vue'),
    meta: { requiresAuth: true, role: 'ADMIN' },
  },
  {
    path: '/groups',
    name: 'Groups',
    component: () => import('@/views/groups/Groups.vue'),
    meta: { requiresAuth: true, role: 'ADMIN' },
  },
  {
    path: '/settings/security',
    name: 'SettingsSecurity',
    component: () => import('@/views/settings/SettingsSecurity.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/logout',
    name: 'Logout',
    component: () => import('@/views/auth/Login.vue'),
    beforeEnter: (to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext) => {
      const auth = useAuthStore();
      auth.logout();
      next({ name: 'Login' });
    },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore();

  if (!auth.isAuthenticated && !auth.session?.id) {
    await auth.init();
  }

  if (to.meta.public) {
    if (auth.isAuthenticated && to.name !== 'Logout') {
      next({ name: 'Dashboard' });
    } else {
      next();
    }
    return;
  }

  if (!auth.isAuthenticated) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }

  if (to.meta.mfaPending && !auth.isMfaPending) {
    next({ name: 'Dashboard' });
    return;
  }

  next();
});

export default router;
