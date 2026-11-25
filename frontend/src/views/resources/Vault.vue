<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Table from '@/components/ui/Table.vue';
import { useToast } from '@/composables/useToast';
import { resourcesService, type ResourceListItem } from '@/services/resources';

const router = useRouter();
const { success, error: toastError } = useToast();

const search = ref('');
const loading = ref(false);
const items = ref<ResourceListItem[]>([]);

const columns = [
  { key: 'name', label: 'Nome' },
  { key: 'username', label: 'Usuário' },
  { key: 'uri', label: 'URI' },
  { key: 'type', label: 'Tipo' },
  { key: 'updatedAt', label: 'Última alteração' },
];

const rows = computed(() =>
  items.value.map((item) => ({
    id: item.id,
    name: item.name,
    username: item.username ?? '–',
    uri: item.uri ?? '–',
    type: item.resourceType?.name ?? item.resourceType?.slug ?? '–',
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('pt-BR') : '–',
  })),
);

async function loadResources() {
  loading.value = true;
  try {
    const res = await resourcesService.list({
      q: search.value.trim() || undefined,
      pageSize: 50,
    });
    items.value = res.items;
  } catch (err: any) {
    toastError(err?.response?.data?.title || 'Erro ao carregar recursos');
  } finally {
    loading.value = false;
  }
}

function copyToClipboard(text: string) {
  if (!text || text === '–') return;
  navigator.clipboard.writeText(text);
  success('Copiado para a área de transferência');
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(loadResources, 300);
});

onMounted(loadResources);
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-sv-text">Cofre</h1>
        <p class="text-sv-muted">Suas credenciais armazenadas</p>
      </div>
      <Button variant="primary" @click="router.push({ name: 'ResourceCreate' })">
        Adicionar recurso
      </Button>
    </div>

    <div class="sv-card overflow-hidden">
      <div class="p-4 border-b border-sv-border">
        <input
          type="text"
          placeholder="Buscar recursos..."
          class="sv-input w-full max-w-md"
          v-model="search"
        />
      </div>
      <div v-if="loading" class="p-8 text-center text-sv-muted text-sm">
        Carregando...
      </div>
      <Table v-else :columns="columns" :rows="rows" rowKey="id">
        <template #actions="{ row }">
          <div class="flex gap-2">
            <button
              class="sv-btn sv-btn-ghost px-2 py-1.5 text-xs hover:bg-sv-panel"
              @click="router.push({ name: 'ResourceDetail', params: { id: String(row.id) } })"
            >
              Ver
            </button>
            <button
              class="sv-btn sv-btn-ghost px-2 py-1.5 text-xs hover:bg-sv-panel"
              @click="copyToClipboard(String(row.username ?? ''))"
            >
              Copiar
            </button>
          </div>
        </template>
      </Table>
    </div>
  </div>
</template>
