<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';
import { onMounted } from 'vue';
import Sidebar from '@/components/layout/Sidebar.vue';
import Topbar from '@/components/layout/Topbar.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';

const auth = useAuthStore();

onMounted(() => {
  auth.init().catch(() => {
    // falha silenciosa: sem sessão válida, mostra login
  });
});
</script>

<template>
  <div class="min-h-screen bg-sv-dark text-sv-text">
    <ToastContainer />

    <!-- Área autenticada -->
    <div v-if="auth.isAuthenticated" class="flex h-screen overflow-hidden">
      <Sidebar />
      <div class="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main class="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <router-view v-slot="{ Component, route: currentRoute }">
            <component
              :is="Component"
              :key="currentRoute.fullPath"
              class="max-w-7xl mx-auto"
            />
          </router-view>
        </main>
      </div>
    </div>

    <!-- Área pública (login, setup, mfa) -->
    <div v-else class="min-h-screen flex items-center justify-center bg-sv-dark">
      <router-view class="w-full max-w-md p-4" />
    </div>
  </div>
</template>
