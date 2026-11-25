# Roadmap de Implementação

## Status atual

| Fase | Estado | Entregável |
|---|---|---|
| Fase 0 — Análise | concluída | `architecture/passbolt-analysis.md` |
| Fase 1 — Arquitetura | **em revisão** | `architecture/*`, `domains/*`, `diagrams/*`, ADRs, este roadmap |
| Fase 2 — Fundação técnica | não iniciada | projetos, Docker, Prisma, CI |
| Fase 3 — Domínios backend | não iniciada | implementação por domínio |
| Fase 4 — Frontend | não iniciada | telas e fluxos |
| Fase 5 — Segurança e hardening | não iniciada | hash chain, pentest, WAF |
| Fase 6 — Validação | não iniciada | matriz de testes, E2E, restore drill |

> **Gate de saída da Fase 1**: aprovação das 5 perguntas em `docs/README.md` e revisão dos ADRs.

## Fase 2 — Fundação técnica

**Objetivo**: subir a base sem regra de negócio.

- [ ] Criar monorepo (`backend/`, `frontend/`, `infra/`, `docs/`).
- [ ] Projeto NestJS com ESLint, Prettier, TypeScript strict, Jest.
- [ ] Prisma inicial + migration `000_init` (apenas extensões e tabelas de identidade).
- [ ] PostgreSQL e Redis no Docker Compose.
- [ ] Projeto Vue 3 + Vite + Router + Pinia + Axios.
- [ ] Design System mínimo (Button, Input, Modal, Toast, Table, EmptyState).
- [ ] Nginx local com TLS self-signed e proxy `/api`.
- [ ] Swagger/OpenAPI configurado.
- [ ] GitHub Actions: lint, typecheck, unit, integration, build.
- [ ] `.env.example`, `.gitignore`, `SECURITY.md`, `README.md`.
- [ ] Health checks `/health/live` e `/health/ready`.

**Gate**: `docker compose up` sobe a stack; health checks verdes; pipeline verde.

## Fase 3 — Domínios backend

Ordem por dependência. Cada domínio só é considerado concluído com testes e documentação atualizados.

| # | Domínio | Entregas | Dependências |
|---|---|---|---|
| 1 | Cryptography | validação de chave, fingerprint, envelope, chave do servidor | — |
| 2 | Users | CRUD, convite, ativação, chaves, status | Cryptography |
| 3 | Authentication + Sessions + MFA | login, MFA, refresh, sessões, recovery | Users, Cryptography |
| 4 | Permissions | matriz, policies, resolução efetiva | Users, Groups |
| 5 | Resource Types | schemas versionados, seed | — |
| 6 | Resources | CRUD, busca, move, soft delete | Resource Types, Permissions |
| 7 | Secrets | versões, envelopes, leitura, revogação | Resources, Permissions, Cryptography |
| 8 | Folders | hierarquia, template de permissão | Resources, Permissions |
| 9 | Groups | CRUD, membros, managers, rekey | Users, Permissions |
| 10 | Sharing | share, revoke, rekey, idempotência | Resources, Secrets, Groups, Permissions, Cryptography |
| 11 | Audit | eventos, consulta, exportação, hash chain | todos |
| 12 | Notifications + Administration | e-mail, settings, admin ops | Users, Groups, Audit |

### Ordem detalhada e gates

1. **Cryptography**
   - Validação de chave OpenPGP, fingerprint, UID, expiração.
   - Rejeição de material privado.
   - Envelope `sv1` validation.
   - Chave do servidor + JWKS.
   - **Gate**: testes de validação + contrato de ausência de decrypt.

2. **Users**
   - Convite, ativação, perfil, status, chaves.
   - **Gate**: convite expira, e-mail único, ativação completa, suspensão revoga sessões.

3. **Authentication + Sessions + MFA**
   - Login, lockout, MFA TOTP/WebAuthn, refresh rotation, step-up, recovery.
   - **Gate**: replay, reúso de refresh, MFA obrigatório, auditoria.

4. **Permissions**
   - `PermissionQueryPort`, policies, guard, resolução efetiva.
   - **Gate**: matriz completa de testes, último OWNER, grupo ativo/inativo.

5. **Resource Types + Resources**
   - Schemas, CRUD, busca, move.
   - **Gate**: busca sem vazamento, integridade de OWNER, move com permissão.

6. **Secrets**
   - Versões, envelopes, leitura, revogação, retenção.
   - **Gate**: envelope inválido rejeitado, revogação remove, concorrência, sem decrypt.

7. **Folders**
   - Hierarquia, ciclo, template de permissão.
   - **Gate**: aplicação em criação/move/alteração; não contínuo.

8. **Groups**
   - CRUD, membros, managers, rekey.
   - **Gate**: último manager, rekey pendente, remoção preserva acesso direto.

9. **Sharing**
   - Share, revoke, group rekey, idempotência, step-up.
   - **Gate**: transação atômica, OWNER obrigatório, idempotência, auditoria.

10. **Audit**
    - Eventos, consulta, exportação, hash chain.
    - **Gate**: sem segredos, append-only, integridade.

11. **Notifications + Administration**
    - E-mail, settings, admin ops.
    - **Gate**: filas, retries, admin authorization.

## Fase 4 — Frontend

| # | Entrega | Dependência |
|---|---|---|
| 1 | Auth (login, MFA, recovery, setup) | API auth |
| 2 | Security layer (OpenPGP, key store, codec, clipboard) | Cryptography |
| 3 | Dashboard + vault list | Resources |
| 4 | Resource detail, create/edit, reveal/copy | Resources, Secrets |
| 5 | Folders tree, move, permissions | Folders |
| 6 | Sharing dialog, pending rekey | Sharing |
| 7 | Groups + members | Groups |
| 8 | Users + settings + devices + keys | Users, MFA, Sessions |
| 9 | Audit + administration | Audit, Administration |

**Gate**: fluxos críticos E2E (login, criar recurso, compartilhar, revogar, rekey de grupo).

## Fase 5 — Segurança e hardening

- [ ] Hash chain de auditoria.
- [ ] WAF/regras OWASP no Nginx.
- [ ] Pentest externo.
- [ ] Revisão de headers/CSP.
- [ ] Testes de carga (k6) nos endpoints de leitura.
- [ ] Plano de resposta a incidentes.
- [ ] Rotação de chave do servidor documentada e testada.
- [ ] Backup/restore drill.
- [ ] SBOM e assinatura de imagem.
- [ ] Revisão de dependências.

## Fase 6 — Validação

- [ ] Matriz de testes READ/UPDATE/OWNER completa.
- [ ] Testes de revogação e remoção de grupo.
- [ ] Testes de concorrência.
- [ ] Testes de migrations up/down.
- [ ] E2E frontend.
- [ ] Testes de compatibilidade de formato `sv1`.
- [ ] Restore drill.
- [ ] Revisão documental final.

## Matriz de testes (resumo)

| Regra | READ | UPDATE | OWNER |
|---|---|---|---|
| Ler metadados | ✔ | ✔ | ✔ |
| Ler segredo | ✔ | ✔ | ✔ |
| Editar metadados | ✖ | ✔ | ✔ |
| Editar segredo | ✖ | ✔ | ✔ |
| Excluir | ✖ | ✔ | ✔ |
| Compartilhar | ✖ | ✖ | ✔ |
| Ver permissões | ✔ | ✔ | ✔ |
| Remover último OWNER | ✖ | ✖ | ✖ |
| Mover recurso | ✖ | ✔ + UPDATE destino | ✔ |
| Criar item em pasta | ✖ | ✔ | ✔ |
| Editar permissão de pasta | ✖ | ✖ | ✔ |
| Acesso por grupo | nível do grupo | nível do grupo | nível do grupo |
| Grupo removido | perde acesso derivado | perde | perde |
| Usuário suspenso | nega | nega | nega |

## Estimativas iniciais (sujeitas a revisão)

| Fase | Esforço estimado |
|---|---|
| Fundação | 1–2 semanas |
| Domínios backend | 4–6 semanas |
| Frontend | 3–5 semanas |
| Hardening | 1–2 semanas |
| Validação | 1 semana |
| **Total** | **10–16 semanas** com 1–2 devs full-stack |

## Riscos do roadmap

| Risco | Mitigação |
|---|---|
| Escopo de criptografia subestimado | Protótipo de envelope e teste de interoperabilidade na Fase 2 |
| Re-key de grupo depende de cliente | UX de operação PENDING + retentativa + notificação |
| Modelo de permissão divergente | Matriz de testes desde a Fase 3 |
| Metadados em claro | ADR-013 e plano `sv2` |
| Recuperação de conta | Recovery kit + escrow opcional documentados |
| Performance de listagem | Índices, cursor, read replica |

## Definição de pronto (Definition of Done)

Um domínio está pronto quando:

1. Regras de negócio implementadas e testadas.
2. Testes unitários, integração e autorização verdes.
3. API documentada no OpenAPI.
4. Nenhum acesso cruzado a repositório de outro módulo.
5. Nenhum segredo em log.
6. Eventos publicados/consumidos conforme catálogo.
7. Documentação `docs/domains/<modulo>.md` atualizada.
8. Code review aprovado.
9. Nenhum débito crítico de segurança.

## Próxima ação

**Aguardando aprovação do revisor** sobre:

1. Modelo de autenticação (senha + MFA vs. desafio de chave).
2. Criptografia de metadados na v1.
3. Escrow opcional da chave privada.
4. Single organization.
5. Retenção de versões antigas.

Após aprovação, iniciar a Fase 2.