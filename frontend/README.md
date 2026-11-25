# SecureVault — Frontend

SPA moderna em **Vue 3 + TypeScript + Vite + Pinia + Vue Router + Axios + Tailwind CSS**, alinhada à arquitetura documentada em `docs/architecture/frontend.md`.

## Stack

- Vue 3 (Composition API, `<script setup>`)
- TypeScript strict
- Vite + PWA (workbox)
- Pinia (estado global)
- Vue Router (rotas protegidas)
- Axios (HTTP com refresh automático de token)
- Tailwind CSS (design system próprio)
- OpenPGP.js (E2EE do lado do cliente)
- IndexedDB (key store cifrada)
- Vitest (testes)

## Estrutura

```
frontend/
├── src/
│   ├── app/router/          # Rotas + guards de auth/MFA
│   ├── components/
│   │   ├── ui/              # Design System (Button, Input, Modal, Toast, Table, EmptyState)
│   │   └── layout/          # Sidebar, Topbar
│   ├── composables/         # useToast
│   ├── security/            # openpgp, key-store (IndexedDB), secret-codec
│   ├── services/            # http (Axios com interceptors)
│   ├── stores/              # auth (Pinia)
│   ├── types/               # Tipos compartilhados
│   └── views/               # Login, MFA, Setup, Dashboard, Vault, ResourceDetail, ResourceCreate, Folders, Groups, SettingsSecurity
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Principais decisões de segurança

- **Access token vive apenas em memória** (`window.__SV_ACCESS_TOKEN__`), nunca em `localStorage`.
- **Refresh token é cookie `HttpOnly; Secure; SameSite=Strict`** gerenciado pelo backend.
- **Chave privada OpenPGP** é armazenada em **IndexedDB cifrada** com a senha do usuário; fica em memória apenas por tempo limitado (15 min).
- **Nenhum segredo em claro** é enviado ao servidor; envelopes são cifrados cliente-side.

## Rodar localmente

```bash
cd frontend
npm install
cp .env.example .env.local  # ajuste VITE_API_BASE_URL se necessário
npm run dev
```

Aplicação disponível em `http://localhost:5173`, com proxy `/api/v1` → `http://localhost:3000` (backend).

## Scripts

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | Build de produção (`vue-tsc` + `vite build`) |
| `npm run preview` | Preview do build |
| `npm test` | Testes unitários (Vitest) |

## Rotas

| Rota | Público? | Descrição |
|------|----------|-----------|
| `/login` | ✔ | Login com senha |
| `/setup` | ✔ | Configuração inicial TOTP |
| `/mfa` | — | Verificação de código MFA |
| `/` | — | Dashboard |
| `/vault` | — | Cofre de recursos |
| `/vault/:id` | — | Detalhe do recurso |
| `/vault/new` | — | Criar recurso |
| `/folders` | — | Gerenciamento de pastas |
| `/groups` | — | Grupos (admin) |
| `/settings/security` | — | Segurança da conta |
| `/logout` | — | Logout |
