import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { http } from '@/services/http';
import type { LoginDto, MfaVerifyDto, TotpVerifyDto, LoginResult } from '@/types/auth';
import type { User, AuthenticatedUser } from '@/types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const session = ref<AuthenticatedUser | null>(null);
  const mfaRequired = ref(false);
  const challengeToken = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!session.value);
  const isMfaPending = computed(() => mfaRequired.value && !!challengeToken.value);

  function setError(msg: string | null) {
    error.value = msg;
  }

  async function init() {
    try {
      const res = await http.get<{ user: User }>('/auth/me');
      user.value = res.data.user;
      session.value = {
        id: res.data.user.id,
        email: res.data.user.email,
        role: res.data.user.role,
        sessionId: '',
        amr: [],
      };
    } catch {
      user.value = null;
      session.value = null;
    }
  }

  async function login(credentials: LoginDto) {
    loading.value = true;
    setError(null);
    try {
      const res = await http.post<LoginResult>('/auth/login', credentials);
      (window as any).__SV_ACCESS_TOKEN__ = res.data.accessToken ?? null;
      mfaRequired.value = !!res.data.mfaRequired;
      challengeToken.value = res.data.challengeToken ?? null;
      if (res.data.user) {
        user.value = res.data.user as User;
        session.value = {
          id: res.data.user.id,
          email: res.data.user.email,
          role: res.data.user.role as 'USER' | 'ADMIN',
          sessionId: '',
          amr: ['pwd'],
        };
      }
      return res.data;
    } catch (err: any) {
      setError(err.response?.data?.title || 'Erro ao fazer login');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function verifyMfa(dto: MfaVerifyDto) {
    loading.value = true;
    setError(null);
    try {
      const res = await http.post<LoginResult>('/auth/mfa/verify', dto);
      (window as any).__SV_ACCESS_TOKEN__ = res.data.accessToken ?? null;
      mfaRequired.value = false;
      challengeToken.value = null;
      if (res.data.user) {
        user.value = res.data.user as User;
        session.value = {
          id: res.data.user.id,
          email: res.data.user.email,
          role: res.data.user.role as 'USER' | 'ADMIN',
          sessionId: '',
          amr: ['pwd', 'totp'],
        };
      }
      return res.data;
    } catch (err: any) {
      setError(err.response?.data?.title || 'Código MFA inválido');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    try {
      await http.post('/auth/logout');
    } finally {
      (window as any).__SV_ACCESS_TOKEN__ = null;
      user.value = null;
      session.value = null;
      mfaRequired.value = false;
      challengeToken.value = null;
    }
  }

  async function setupTotp() {
    const res = await http.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/totp/setup');
    return res.data;
  }

  async function verifyTotpSetup(code: string) {
    await http.post('/auth/mfa/totp/verify', { code });
  }

  async function listSessions() {
    const res = await http.get<{ id: string; ip: string | null; userAgent: string | null; issuedAt: string; expiresAt: string }[]>('/auth/sessions');
    return res.data;
  }

  async function revokeSession(sessionId: string) {
    await http.delete(`/auth/sessions/${sessionId}`);
  }

  async function revokeOtherSessions() {
    await http.delete('/auth/sessions');
  }

  return {
    user,
    session,
    mfaRequired,
    challengeToken,
    loading,
    error,
    isAuthenticated,
    isMfaPending,
    setError,
    init,
    login,
    verifyMfa,
    logout,
    setupTotp,
    verifyTotpSetup,
    listSessions,
    revokeSession,
    revokeOtherSessions,
  };
});
