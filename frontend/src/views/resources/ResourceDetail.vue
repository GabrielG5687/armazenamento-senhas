<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import { useToast } from '@/composables/useToast';
import { resourcesService } from '@/services/resources';
import { secretsService, type SecretVersionSummary } from '@/services/secrets';
import { getKey, listKeys } from '@/security/key-store';
import { decryptSecret } from '@/security/secret-codec';
import { LOCAL_KEY_PASSPHRASE } from '@/security/openpgp';

const route = useRoute();
const router = useRouter();
const { success, error: toastError } = useToast();

const resourceId = computed(() => String(route.params.id ?? ''));

const loading = ref(true);
const resource = ref<{
  id: string;
  name: string;
  username: string | null;
  uri: string | null;
  description: string | null;
  status: string;
  resourceType?: { name?: string; slug?: string };
  createdAt?: string;
  updatedAt?: string;
  secret?: { version: number; formatVersion: string; createdAt: string } | null;
} | null>(null);

const versions = ref<SecretVersionSummary[]>([]);
const password = ref<string | null>(null);
const secretError = ref<string | null>(null);
const reveal = ref(false);
const revealTimer = ref<ReturnType<typeof setTimeout> | null>(null);

async function loadResource() {
  if (!resourceId.value) return;
  loading.value = true;
  secretError.value = null;
  password.value = null;
  reveal.value = false;
  try {
    resource.value = await resourcesService.getById(resourceId.value);
    try {
      versions.value = await secretsService.listVersions(resourceId.value);
    } catch {
      versions.value = [];
    }
    await tryLoadSecret();
  } catch (err: any) {
    resource.value = null;
    toastError(err?.response?.data?.title || 'Não foi possível carregar o recurso');
  } finally {
    loading.value = false;
  }
}

async function tryLoadSecret() {
  try {
    const envelope = await secretsService.getCurrent(resourceId.value);
    let privateKey =
      (await getKey(envelope.keyFingerprint))?.privateKeyArmored ?? null;
    if (!privateKey) {
      const locals = await listKeys();
      privateKey = locals[0]?.privateKeyArmored ?? null;
    }
    if (!privateKey) {
      secretError.value = 'Chave privada local não encontrada para revelar a senha.';
      return;
    }
    const decrypted = await decryptSecret(
      envelope.armoredMessage,
      LOCAL_KEY_PASSPHRASE,
      privateKey,
    );
    password.value = String(decrypted.secret.password ?? '');
  } catch (err: any) {
    secretError.value =
      err?.response?.data?.title ||
      err?.message ||
      'Não foi possível descriptografar o segredo.';
  }
}

function clearRevealTimer() {
  if (revealTimer.value) {
    clearTimeout(revealTimer.value);
    revealTimer.value = null;
  }
}

function toggleReveal() {
  if (!password.value) return;
  reveal.value = !reveal.value;
  clearRevealTimer();
  if (reveal.value) {
    revealTimer.value = setTimeout(() => {
      reveal.value = false;
    }, 30_000);
  }
}

function copySecret() {
  if (!password.value) {
    toastError('Senha indisponível');
    return;
  }
  navigator.clipboard.writeText(password.value);
  success('Senha copiada (limpa em 30s)');
  reveal.value = true;
  clearRevealTimer();
  revealTimer.value = setTimeout(() => {
    reveal.value = false;
  }, 30_000);
}

watch(resourceId, loadResource);
onMounted(loadResource);
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <Button variant="ghost" type="button" @click="router.back">
          <svg class="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Button>
        <h1 class="text-2xl font-bold text-sv-text truncate">
          {{ loading ? 'Carregando…' : (resource?.name ?? 'Recurso') }}
        </h1>
      </div>
    </div>

    <div v-if="loading" class="sv-card p-6 text-sv-muted text-sm">
      Carregando recurso…
    </div>

    <template v-else-if="resource">
      <div class="sv-card grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
        <div class="space-y-3">
          <p class="text-sm text-sv-muted">Nome</p>
          <p class="text-sv-text font-medium">{{ resource.name }}</p>
          <p class="text-sm text-sv-muted">Usuário</p>
          <p class="text-sv-text font-medium">{{ resource.username || '–' }}</p>
          <p class="text-sm text-sv-muted">URI</p>
          <a
            v-if="resource.uri"
            :href="resource.uri"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sv-primary hover:underline text-sm break-all"
          >
            {{ resource.uri }}
          </a>
          <p v-else class="text-sv-text font-medium">–</p>
          <p class="text-sm text-sv-muted">Tipo</p>
          <p class="text-sv-text font-medium">
            {{ resource.resourceType?.name || resource.resourceType?.slug || '–' }}
          </p>
          <p class="text-sm text-sv-muted">Status</p>
          <span class="sv-badge sv-badge-read">{{ resource.status }}</span>
        </div>

        <div class="space-y-3">
          <p class="text-sm text-sv-muted">Senha</p>
          <div v-if="password" class="flex items-center gap-2 flex-wrap">
            <span class="text-mono text-sv-text font-medium truncate max-w-full">
              {{ reveal ? password : '••••••••' }}
            </span>
            <Button variant="ghost" type="button" @click="toggleReveal">
              {{ reveal ? 'Ocultar' : 'Revelar' }}
            </Button>
            <Button variant="ghost" type="button" @click="copySecret">
              Copiar
            </Button>
          </div>
          <p v-else class="text-sm text-sv-muted">
            {{ secretError || 'Nenhum segredo disponível para este recurso.' }}
          </p>
          <p v-if="password" class="text-xs text-sv-muted">
            A senha será ocultada automaticamente em 30s.
          </p>
          <p v-if="resource.description" class="text-sm text-sv-muted pt-2">Notas</p>
          <p v-if="resource.description" class="text-sv-text text-sm whitespace-pre-wrap">
            {{ resource.description }}
          </p>
        </div>
      </div>

      <div class="sv-card p-6">
        <h3 class="text-sm font-semibold text-sv-text mb-4 uppercase tracking-wider">
          Versões do segredo
        </h3>
        <div class="overflow-x-auto">
          <table class="sv-table">
            <thead>
              <tr>
                <th>Versão</th>
                <th>Formato</th>
                <th>Criado em</th>
                <th>Atual</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="version of versions" :key="version.version">
                <td class="font-mono text-sm">{{ version.version }}</td>
                <td class="text-sm">{{ version.formatVersion }}</td>
                <td class="text-sm">
                  {{ new Date(version.createdAt).toLocaleString('pt-BR') }}
                </td>
                <td>
                  <span v-if="version.isCurrent" class="sv-badge sv-badge-owner">Sim</span>
                  <span v-else class="text-sv-muted text-sm">Não</span>
                </td>
              </tr>
              <tr v-if="versions.length === 0">
                <td colspan="4" class="text-center py-6 text-sv-muted text-sm">
                  Nenhuma versão de segredo encontrada.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-else class="sv-card p-6 text-sv-muted text-sm">
      Recurso não encontrado.
    </div>
  </div>
</template>
