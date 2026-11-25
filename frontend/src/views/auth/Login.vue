<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import { useToast } from '@/composables/useToast';

const auth = useAuthStore();
const router = useRouter();
const { error: toastError } = useToast();

const email = ref('');
const password = ref('');
const emailError = ref<string | null>(null);
const passwordError = ref<string | null>(null);

const isLoading = computed(() => auth.loading);

async function handleLogin(e: Event) {
  e.preventDefault();
  emailError.value = null;
  passwordError.value = null;

  if (!email.value.trim()) {
    emailError.value = 'E-mail é obrigatório';
    return;
  }
  if (!password.value) {
    passwordError.value = 'Senha é obrigatória';
    return;
  }

  try {
    const result = await auth.login({
      email: email.value.trim(),
      password: password.value,
    });

    if (result.mfaRequired) {
      router.push({ name: 'MfaVerify', query: { challengeToken: result.challengeToken } });
    } else {
      const redirect = String(router.currentRoute.value.query.redirect ?? '');
      router.push(redirect || { name: 'Dashboard' });
    }
  } catch (err: any) {
    const msg = err.response?.data?.title || 'E-mail ou senha inválidos';
    toastError(msg);
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
        <h2 class="text-2xl font-bold text-sv-text">Entrar</h2>
        <p class="text-sv-muted text-sm">Acesse seu cofre de credenciais</p>
      </div>

      <form @submit="handleLogin" class="space-y-4">
        <Input
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          v-model="email"
          :error="emailError"
        />
        <Input
          label="Senha"
          type="password"
          placeholder="••••••••"
          v-model="password"
          :error="passwordError"
        />
        <Button type="submit" variant="primary" :loading="isLoading" class="w-full">
          Entrar
        </Button>
      </form>

      <div v-if="auth.error" class="mt-4 p-3 rounded-xl bg-sv-danger/10 border border-sv-danger/20 text-xs text-sv-danger text-center">
        {{ auth.error }}
      </div>

      <p class="mt-6 text-center text-sm text-sv-muted">
        Não tem uma conta? <span class="text-sv-primary hover:underline cursor-pointer">Solicite convite ao administrador</span>
      </p>
    </div>
  </div>
</template>
