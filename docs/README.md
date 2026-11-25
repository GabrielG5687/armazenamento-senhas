# SecureVault — Documentação de Arquitetura

> Nome de trabalho: **SecureVault**. Sistema de gerenciamento e compartilhamento seguro de credenciais, inspirado nos princípios do Passbolt, com stack Node.js/NestJS + Vue 3 + PostgreSQL.

## Status

**Fase 2 — Arquitetura (para revisão).** Nenhuma funcionalidade foi implementada ainda. Esta documentação descreve a arquitetura proposta, o modelo de dados, os fluxos de segurança e as decisões técnicas. Após aprovação, segue a Fase 3 (fundação técnica).

## Como ler

| Perfil | Leitura recomendada |
|---|---|
| Decisor / revisor | `architecture/overview.md`, `decisions/architecture-decision-records.md`, `implementation-roadmap.md` |
| Backend | `architecture/backend.md`, `architecture/database.md`, `architecture/security.md`, `domains/*` |
| Frontend | `architecture/frontend.md`, `architecture/security.md`, `diagrams/authentication-flow.md` |
| Segurança | `architecture/security.md`, `domains/cryptography.md`, `domains/sharing.md`, `domains/audit.md` |
| DevOps | `architecture/infrastructure.md`, `diagrams/system-architecture.md` |

## Conteúdo

```text
docs/
├── architecture/
│   ├── overview.md              # visão geral, contexto, princípios, invariantes
│   ├── passbolt-analysis.md     # engenharia reversa: fatos confirmados x hipóteses
│   ├── backend.md               # módulos, camadas, contratos, eventos, API
│   ├── frontend.md              # estrutura, rotas, stores, camada criptográfica
│   ├── database.md              # modelo PostgreSQL + rascunho Prisma
│   ├── security.md              # modelo de ameaças, criptografia, auth, headers
│   └── infrastructure.md        # Docker, Nginx, CI/CD, observabilidade, backup
├── domains/
│   ├── authentication.md
│   ├── users.md
│   ├── cryptography.md
│   ├── resources.md
│   ├── resource-types.md
│   ├── secrets.md
│   ├── folders.md
│   ├── groups.md
│   ├── permissions.md
│   ├── sharing.md
│   ├── mfa.md
│   └── audit.md
├── diagrams/
│   ├── system-architecture.md
│   ├── entity-relationship.md
│   ├── authentication-flow.md
│   └── sharing-flow.md
├── decisions/
│   └── architecture-decision-records.md
└── implementation-roadmap.md
```

## Perguntas em aberto para o revisor

1. **Modelo de autenticação**: a proposta usa senha + MFA (TOTP/WebAuthn) com sessão JWT, e desenha uma abstração para futuro login por desafio/assinatura de chave (padrão Passbolt). Confirma ou prefere começar com desafio de chave?
2. **Criptografia de metadados**: a v1 propõe nome/URL/descrição em texto claro (pesquisáveis). O Passbolt v5 permite metadados cifrados. Aceita a v1 e o formato v2 no roadmap?
3. **Escrow da chave privada**: a proposta mantém a chave privada local (IndexedDB) e oferece backup opcional cifrado pela passphrase. Sem isso, a recuperação entre dispositivos depende de recovery kit. Confirma o opt-in?
4. **Multi-tenant**: a proposta é single-organization (como o Passbolt CE). Se o objetivo for SaaS multi-tenant, a decisão precisa ser revista antes da Fase 3.
5. **Retenção de versões antigas de segredos**: proposta de 30 dias para versões substituídas, com expurgo automático. Qual política a organização deseja?

> A connection string do Neon enviada no briefing foi considerada **comprometida** por ter transitado em texto claro. Ela não é versionada e deve ser rotacionada antes de qualquer uso. O projeto usará `.env.local` (fora do Git).