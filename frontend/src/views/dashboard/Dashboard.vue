<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';
import EmptyState from '@/components/ui/EmptyState.vue';

const auth = useAuthStore();
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-sv-text">Dashboard</h1>
      <p class="text-sv-muted">Visão geral do seu cofre</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="sv-card p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sv-muted text-sm">Total de recursos</p>
            <p class="text-3xl font-bold text-sv-text">–</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-sv-primary/10 flex items-center justify-center text-sv-primary">
            <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
      </div>

      <div class="sv-card p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sv-muted text-sm">Compartilhados comigo</p>
            <p class="text-3xl font-bold text-sv-text">–</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-sv-warning/10 flex items-center justify-center text-sv-warning">
            <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>
        </div>
      </div>

      <div class="sv-card p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sv-muted text-sm">Sessões ativas</p>
            <p class="text-3xl font-bold text-sv-text">1</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-sv-success/10 flex items-center justify-center text-sv-success">
            <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <div class="sv-card">
      <div class="flex items-center justify-between pb-4 border-b border-sv-border">
        <h3 class="text-lg font-semibold text-sv-text">Atividade recente</h3>
        <button class="sv-btn sv-btn-ghost text-sm">Ver tudo</button>
      </div>
      <EmptyState title="Sem atividade recente" description="Suas ações aparecerão aqui." />
    </div>
  </div>
</template>

