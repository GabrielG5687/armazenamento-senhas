<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import { useToast } from '@/composables/useToast';

const auth = useAuthStore();
const router = useRouter();
const { success, error: toastError } = useToast();

const setupDone = ref(false);
const otpauthUrl = ref<string | null>(null);
const secret = ref<string | null>(null);
const codeInput = ref('');
const navigatorGlobal = globalThis.navigator;

async function handleSetup() {
  try {
    const result = await auth.setupTotp();
    otpauthUrl.value = result.otpauthUrl;
    secret.value = result.secret;
    setupDone.value = true;
    success('Chave TOTP gerada. Escaneie o QR code ou copie a chave secreta.');
  } catch (err: any) {
    toastError(err.response?.data?.title || 'Erro ao configurar MFA');
  }
}

async function confirmSetup(code: string) {
  try {
    await auth.verifyTotpSetup(code);
    router.push({ name: 'Dashboard' });
  } catch (err: any) {
    toastError(err.response?.data?.title || 'Código inválido');
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center px-4 py-8">
    <div class="sv-card w-full max-w-md">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-sv-text">Configurar MFA</h2>
        <p class="text-sv-muted text-sm">Adicione o SecureVault ao seu aplicativo autenticador</p>
      </div>

      <div v-if="!setupDone" class="space-y-4">
        <Button variant="primary" class="w-full" @click="handleSetup">
          Gerar chave TOTP
        </Button>
      </div>

      <div v-else class="space-y-4">
        <div class="bg-sv-panel border border-sv-border rounded-xl p-4">
          <h3 class="text-sm font-semibold text-sv-text mb-2">Chave secreta</h3>
          <div class="flex items-center gap-2">
            <span class="text-mono text-xs text-sv-text break-all">{{ secret }}</span>
            <button
              class="sv-btn-ghost px-2 py-1 rounded hover:bg-sv-panel text-sv-primary"
              @click="() => navigatorGlobal.clipboard.writeText(secret ?? '')"
            >
              Copiar
            </button>
          </div>
          <p class="mt-2 text-xs text-sv-muted">Guarde esta chave em local seguro.</p>
        </div>

        <div v-if="otpauthUrl" class="bg-sv-panel border border-sv-border rounded-xl p-4">
          <h3 class="text-sm font-semibold text-sv-text mb-2">URL OTPAuth</h3>
          <div class="flex items-center gap-2">
            <span class="text-mono text-xs text-sv-text break-all">{{ otpauthUrl }}</span>
            <button
              class="sv-btn-ghost px-2 py-1 rounded hover:bg-sv-panel text-sv-primary"
              @click="() => navigatorGlobal.clipboard.writeText(otpauthUrl ?? '')"
            >
              Copiar
            </button>
          </div>
        </div>

        <div class="pt-4 border-t border-sv-border">
          <p class="text-sm text-sv-muted mb-3">Depois de adicionar ao app, informe o código de 6 dígitos:</p>
          <input
            type="text"
            maxlength="6"
            class="sv-input w-full mb-3"
            placeholder="123456"
            v-model="codeInput"
          />
          <Button variant="primary" class="w-full" @click="confirmSetup(codeInput)">
            Confirmar configuração
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
