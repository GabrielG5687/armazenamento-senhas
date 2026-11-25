<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goCreateResource() {
  router.push({ name: 'ResourceCreate' });
}
</script>

<template>
  <header class="sticky top-0 z-40 bg-sv-dark/80 backdrop-blur border-b border-sv-border">
    <div class="flex items-center justify-between px-6 py-3">
      <div class="flex items-center gap-4">
        <button class="sv-btn-ghost p-2 md:hidden rounded-lg hover:bg-sv-panel/50">
          <svg class="h-5 w-5 text-sv-text" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 class="text-sm font-semibold text-sv-text tracking-tight">SecureVault</h1>
      </div>
      <div class="flex items-center gap-2">
        <button class="sv-btn-ghost hidden md:flex items-center gap-2 px-3 rounded-lg hover:bg-sv-panel/50">
          <svg class="h-4 w-4 text-sv-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span class="text-xs text-sv-muted">Buscar</span>
        </button>
        <button
          type="button"
          class="sv-btn sv-btn-primary text-xs px-3 py-2"
          @click="goCreateResource"
        >
          Novo recurso
        </button>
      </div>
    </div>
  </header>
</template>
