<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import { usersService } from '@/services/users';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const { success, error: toastError } = useToast();

const email = ref('');
const displayName = ref('');
const role = ref<'USER' | 'ADMIN'>('USER');

const emailError = ref<string | null>(null);
const displayNameError = ref<string | null>(null);

const isLoading = ref(false);

async function handleSave(e: Event) {
  e.preventDefault();
  emailError.value = null;
  displayNameError.value = null;

  if (!email.value.trim()) {
    emailError.value = 'E-mail é obrigatório';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    emailError.value = 'E-mail inválido';
    return;
  }
  if (!displayName.value.trim()) {
    displayNameError.value = 'Nome completo é obrigatório';
    return;
  }

  isLoading.value = true;
  try {
    await usersService.create({
      email: email.value.trim(),
      displayName: displayName.value.trim(),
      role: role.value,
    });
    success(`Usuário "${displayName.value}" criado com sucesso`);
    router.push({ name: 'Users' });
  } catch (err: any) {
    const msg = err.response?.data?.title || 'Erro ao criar usuário';
    toastError(msg);
    if (err.response?.data?.details) {
      emailError.value = msg;
    }
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="max-w-lg mx-auto">
    <div class="flex items-center justify-between mb-6">
      <Button variant="ghost" @click="router.back">
        <svg class="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </Button>
      <h1 class="text-2xl font-bold text-sv-text">Novo usuário</h1>
    </div>

    <div class="sv-card p-6">
      <form @submit="handleSave" class="space-y-5">
        <Input
          label="E-mail"
          type="email"
          placeholder="usuario@empresa.com"
          v-model="email"
          :error="emailError"
        />
        <Input
          label="Nome completo"
          v-model="displayName"
          :error="displayNameError"
        />
        <div class="mb-4">
          <label class="block text-sm font-medium text-sv-text mb-1.5">Perfil de acesso</label>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                value="USER"
                v-model="role"
                class="accent-sv-primary"
              />
              <span class="text-sm text-sv-text">Usuário</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                value="ADMIN"
                v-model="role"
                class="accent-sv-primary"
              />
              <span class="text-sm text-sv-text font-semibold text-sv-danger">Administrador</span>
            </label>
          </div>
          <p class="mt-1 text-xs text-sv-muted">
            Administradores podem gerenciar usuários, grupos e configurações do sistema.
          </p>
        </div>

        <div class="pt-4 flex justify-end gap-2">
          <Button variant="ghost" @click="router.back">Cancelar</Button>
          <Button variant="primary" type="submit" :loading="isLoading" class="w-fit">
            Criar usuário
          </Button>
        </div>
      </form>
    </div>

    <div class="mt-6 p-4 rounded-xl bg-sv-panel/50 border border-sv-border/50 text-sm text-sv-muted">
      <p class="mb-2"><strong>Após a criação:</strong> o usuário receberá um convite para definir sua senha.</p>
      <p class="mb-0">Usuários novos começam com status <em>PENDING</em> até ativarem a conta.</p>
    </div>
  </div>
</template>
