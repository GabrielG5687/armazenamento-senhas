<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Table from '@/components/ui/Table.vue';
import { usersService } from '@/services/users';
import { useToast } from '@/composables/useToast';
import type { User } from '@/types';

const router = useRouter();
const { error: toastError } = useToast();

const users = ref<User[]>([]);
const loading = ref(false);

const columns = [
  { key: 'displayName', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'role', label: 'Função' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Criado em' },
];

async function loadUsers() {
  loading.value = true;
  try {
    const res = await usersService.list(1, 50);
    users.value = res.items;
  } catch (err: any) {
    toastError(err.response?.data?.title || 'Erro ao carregar usuários');
  } finally {
    loading.value = false;
  }
}

onMounted(loadUsers);
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-sv-text">Usuários</h1>
        <p class="text-sv-muted">Gerencie contas de acesso ao sistema</p>
      </div>
      <Button variant="primary" @click="router.push({ name: 'UsersCreate' })">
        + Novo usuário
      </Button>
    </div>

    <div class="sv-card overflow-hidden">
      <Table :columns="columns" :rows="users" rowKey="id">
        <template #actions="{ row }">
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" class="text-xs">
              {{ String(row.role) }}
            </Button>
          </div>
        </template>
      </Table>
    </div>
  </div>
</template>
