<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-sv-text">Segurança</h1>
      <p class="text-sv-muted">Gerencie sua sessão, MFA e chaves criptográficas</p>
    </div>

    <div class="sv-card p-6">
      <h2 class="text-lg font-semibold text-sv-text mb-4">Sessão atual</h2>
      <p class="text-sm text-sv-text">{{ auth.user?.email }}</p>
      <p class="text-sm text-sv-muted mt-1">Função: {{ auth.user?.role }}</p>
    </div>

    <div class="sv-card p-6">
      <h2 class="text-lg font-semibold text-sv-text mb-4">MFA (TOTP)</h2>
      <p v-if="!auth.user" class="text-sm text-sv-muted">Configurar autenticação de dois fatores</p>
      <Button v-else variant="ghost" size="sm">Gerenciar MFA</Button>
    </div>

    <div class="sv-card p-6">
      <h2 class="text-lg font-semibold text-sv-text mb-4">Chaves criptográficas</h2>
      <p class="text-sm text-sv-muted mb-4">Sua chave privada OpenPGP é armazenada localmente (IndexedDB), cifrada com sua senha.</p>
      <div class="space-y-2">
        <Button variant="ghost" size="sm">Exportar recovery kit</Button>
        <Button variant="ghost" size="sm">Rotacionar senha da chave</Button>
      </div>
    </div>

    <div class="sv-card p-6">
      <h2 class="text-lg font-semibold text-sv-text mb-4">Sessões ativas</h2>
      <p class="text-sm text-sv-muted">Você pode revogar sessões em outros dispositivos.</p>
      <Button variant="danger" size="sm" class="w-fit">Revogar todas as outras sessões</Button>
    </div>
  </div>
</template>
