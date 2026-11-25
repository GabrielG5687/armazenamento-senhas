<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';
import { useRoute, useRouter } from 'vue-router';
import { computed } from 'vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const userName = computed(() => auth.user?.email?.split('@')[0] ?? 'Usuário');
const isAdmin = computed(() => auth.user?.role === 'ADMIN');

function logout() {
  auth.logout();
  router.push({ name: 'Login' });
}

function isActive(routeName: string) {
  return route.name === routeName;
}

const nav = [
  { name: 'Dashboard', to: { name: 'Dashboard' }, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1H7m-6 0a1 1 0 011-1v-4a1 1 0 001-1h2a1 1 0 011 1v4a1 1 0 01-1 1z' },
  { name: 'Cofre', to: { name: 'Vault' }, icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-7m-7 0l-3 3m3-3l3 3' },
  { name: 'Pastas', to: { name: 'Folders' }, icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2zM1 7v10a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2 2H3a2 2 0 00-2 2z' },
];

const adminNav = [
  { name: 'Usuários', to: { name: 'Users' }, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-2a4 4 0 00-5.529-3.962C14.232 19.544 15.286 21 17 21z' },
  { name: 'Grupos', to: { name: 'Groups' }, icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m12-13V9m0 0V4a3 3 0 00-3-3H9a3 3 0 00-3 3v5m0 12h12m-9-3h3m-3 0v3m0 0v3m0-3h3m3-3v-3m0 0V9m-3 0V4a3 3 0 00-3-3H9a3 3 0 00-3 3v5m0 12h12m-9-3h3m-3 0v3m0 0v3m0-3h3m3-3v-3m0 0V9m-3 0V4a3 3 0 00-3-3H9a3 3 0 00-3 3v5m0 12h12m-9-3h3m-3 0v3m0 0v3m0-3h3m3-3v-3m0 0V9m-3 0V4a3 3 0 00-3-3H9a3 3 0 00-3 3v5m0 12h12m-9-3h3m-3 0v3m0 0v3m0-3h3m3-3v-3m0 0V9m-3 0V4a3 3 0 00-3-3H9a3 3 0 00-3 3v5m0 12h12m-9-3h3m-3 0v3m0 0v3m0-3h3m3-3v-3m0 0V9m-3 0V4a3 3 0 00-3-3H9a3 3 0 00-3 3v5m0 12h12m-9-3h3m-3 0v3m0 0v3m0-3h3m3-3v-3m0 0V9m-3 0V4a3 3 0 00-3-3H9a3 3 0 00-3 3v5' },
];
</script>

<template>
  <aside class="w-64 bg-sv-panel border-r border-sv-border flex-shrink-0 hidden md:flex flex-col">
    <div class="p-6 border-b border-sv-border">
      <div class="flex items-center gap-2">
        <svg class="h-7 w-7 text-sv-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span class="text-lg font-bold text-sv-text tracking-tight">SecureVault</span>
      </div>
    </div>

    <nav class="flex-1 px-4 space-y-1">
      <!-- Navegação principal -->
      <RouterLink
        v-for="item of nav"
        :key="item.name"
        :to="item.to"
        class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
        :class="{
          'bg-sv-primary/10 text-sv-primary': isActive(item.to.name),
          'text-sv-muted hover:text-sv-text hover:bg-sv-panel/50': !isActive(item.to.name),
        }"
      >
        <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="item.icon" />
        </svg>
        {{ item.name }}
      </RouterLink>

      <!-- Administração (apenas ADMIN) -->
      <div v-if="isAdmin" class="mt-6 px-4">
        <h4 class="text-xs font-semibold text-sv-muted uppercase tracking-wider mb-3">Administração</h4>
        <RouterLink
          v-for="item of adminNav"
          :key="item.name"
          :to="item.to"
          class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
          :class="{
            'bg-sv-primary/10 text-sv-primary': isActive(item.to.name),
            'text-sv-muted hover:text-sv-text hover:bg-sv-panel/50': !isActive(item.to.name),
          }"
        >
          <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="item.icon" />
          </svg>
          {{ item.name }}
        </RouterLink>
      </div>
    </nav>

    <div class="p-4 border-t border-sv-border">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-sv-border flex items-center justify-center text-xs font-medium">
          {{ userName.charAt(0).toUpperCase() }}
        </div>
        <div>
          <p class="text-sm font-medium text-sv-text truncate">{{ auth.user?.email }}</p>
          <p class="text-xs text-sv-muted capitalize">{{ auth.user?.role }}</p>
        </div>
      </div>
      <button
        @click="logout"
        class="mt-3 w-full sv-btn sv-btn-danger text-xs"
      >
        Sair
      </button>
    </div>
  </aside>
</template>
