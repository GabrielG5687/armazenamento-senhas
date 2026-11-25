<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import { resourcesService } from '@/services/resources';
import { secretsService } from '@/services/secrets';
import { ensureUserKeys } from '@/security/ensure-user-keys';
import { encryptSecretForRecipients, FORMAT_VERSION } from '@/security/secret-codec';
import { checksumOf } from '@/security/checksum';

const router = useRouter();
const auth = useAuthStore();
const { success, error: toastError } = useToast();

const name = ref('');
const username = ref('');
const uri = ref('');
const password = ref('');
const notes = ref('');
const saving = ref(false);

const nameError = ref<string | null>(null);
const passwordError = ref<string | null>(null);
const uriError = ref<string | null>(null);

function normalizeUri(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:(\/\/)?\S+$/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

async function handleSave(e?: Event) {
  e?.preventDefault();
  nameError.value = null;
  passwordError.value = null;
  uriError.value = null;

  if (!name.value.trim()) {
    nameError.value = 'Nome é obrigatório';
    return;
  }
  if (!password.value) {
    passwordError.value = 'Senha é obrigatória';
    return;
  }

  const userId = auth.user?.id ?? auth.session?.id;
  if (!userId) {
    toastError('Sessão inválida. Faça login novamente.');
    return;
  }

  const normalizedUri = normalizeUri(uri.value);

  saving.value = true;
  try {
    const types = await resourcesService.listTypes();
    const resourceType =
      types.find((t) => t.slug === 'login-password') ?? types[0];
    if (!resourceType) {
      throw new Error('Nenhum tipo de recurso disponível');
    }

    const keys = await ensureUserKeys(userId, auth.user?.email);

    const created = await resourcesService.create({
      name: name.value.trim(),
      username: username.value.trim() || undefined,
      uri: normalizedUri,
      description: notes.value.trim() || undefined,
      resourceTypeId: resourceType.id,
    });

    const encrypted = await encryptSecretForRecipients(
      {
        username: username.value.trim() || undefined,
        password: password.value,
        uri: normalizedUri,
        notes: notes.value.trim() || undefined,
      },
      [keys.publicKeyArmored],
    );

    await secretsService.createVersion(created.id, {
      version: 1,
      formatVersion: encrypted.formatVersion || FORMAT_VERSION,
      envelopes: [
        {
          userId,
          armoredMessage: encrypted.encrypted,
          keyFingerprint: keys.fingerprint || encrypted.fingerprint,
          checksum: await checksumOf(encrypted.encrypted),
        },
      ],
    });

    success(`Recurso "${name.value.trim()}" criado`);
    await router.push({ name: 'Vault' });
  } catch (err: any) {
    const msg =
      err?.response?.data?.title ||
      err?.response?.data?.message ||
      err?.message ||
      'Não foi possível salvar o recurso';
    toastError(Array.isArray(msg) ? msg.join(', ') : String(msg));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <Button variant="ghost" type="button" @click="router.back">
        <svg class="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </Button>
      <h1 class="text-2xl font-bold text-sv-text">Novo recurso</h1>
    </div>

    <div class="sv-card p-6">
      <form class="space-y-5" @submit.prevent="handleSave">
        <Input label="Nome do recurso" v-model="name" :error="nameError" />
        <Input label="Usuário" v-model="username" />
        <Input label="URI / URL" v-model="uri" :error="uriError" placeholder="https://exemplo.com" />
        <Input label="Senha" type="password" v-model="password" :error="passwordError" />
        <Input label="Notas" v-model="notes" />

        <div class="pt-4 flex justify-end gap-2">
          <Button variant="ghost" type="button" :disabled="saving" @click="router.back">
            Cancelar
          </Button>
          <Button variant="primary" type="submit" :loading="saving" :disabled="saving">
            Salvar recurso
          </Button>
        </div>
      </form>
    </div>

    <div class="mt-6 p-4 rounded-xl bg-sv-panel/50 border border-sv-border/50 text-sm text-sv-muted">
      <p class="mb-2"><strong>Modo E2EE:</strong> Os segredos são cifrados no cliente antes de enviar ao servidor.</p>
      <p class="mb-0">Na primeira gravação, uma chave OpenPGP local é criada e registrada para proteger a senha.</p>
    </div>
  </div>
</template>
