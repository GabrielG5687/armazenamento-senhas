<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter, useRoute } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import { useToast } from '@/composables/useToast';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const { error: toastError } = useToast();

const code = ref('');
const challengeToken = ref<string | null>(route.query.challengeToken as string | null || null);
const codeError = ref<string | null>(null);

const isLoading = computed(() => auth.loading);

async function handleVerify(e: Event) {
  e.preventDefault();
  codeError.value = null;

  if (!code.value || code.value.length < 6) {
    codeError.value = 'Código inválido';
    return;
  }

  if (!challengeToken.value) {
    toastError('Sessão MFA expirada. Faça login novamente.');
    router.push({ name: 'Login' });
    return;
  }

  try {
    await auth.verifyMfa({
      challengeToken: challengeToken.value,
      code: code.value,
    });
    const redirect = String(router.currentRoute.value.query.redirect ?? '');
    router.push(redirect || { name: 'Dashboard' });
  } catch (err: any) {
    const msg = err.response?.data?.title || 'Código inválido';
    toastError(msg);
    codeError.value = msg;
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center px-4">
    <div class="sv-card w-full max-w-md">
      <div class="text-center mb-8">
        <svg class="h-10 w-10 mx-auto text-sv-primary mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 class="text-2xl font-bold text-sv-text">Verificação MFA</h2>
        <p class="text-sv-muted text-sm">Insira o código do seu aplicativo autenticador</p>
      </div>

      <form @submit="handleVerify" class="space-y-4">
        <Input
          label="Código de 6 dígitos"
          type="text"
          maxlength="6"
          placeholder="123456"
          v-model="code"
          :error="codeError"
        />
        <Button type="submit" variant="primary" :loading="isLoading" class="w-full">
          Verificar
        </Button>
      </form>

      <p class="mt-6 text-center text-sm text-sv-muted">
        Não recebeu o código? <span class="text-sv-primary hover:underline cursor-pointer">Fazer login novamente</span>
      </p>
    </div>
  </div>
</template>
