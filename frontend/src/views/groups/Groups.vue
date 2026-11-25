<script setup lang="ts">
import EmptyState from '@/components/ui/EmptyState.vue';
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-sv-text">Grupos</h1>
    </div>

    <div class="sv-card p-6">
      <EmptyState title="Sem grupos" description="Crie ou participe de grupos para compartilhar credenciais." />
    </div>
  </div>
</template>
