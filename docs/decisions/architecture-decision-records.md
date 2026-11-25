# Architecture Decision Records (ADRs)

> Cada ADR registra uma decisão, o contexto, as alternativas e as consequências. Status: **proposto** até aprovação do revisor.

## ADR-001 — Modular Monolith

**Status**: proposto
**Contexto**: produto em fase inicial, equipe pequena, necessidade de segurança e consistência transacional.
**Decisão**: um único deploy de API NestJS organizado em módulos de domínio independentes, com worker BullMQ separado.
**Alternativas**: microsserviços por domínio; monolito modular sem fronteiras; serverless.
**Consequências**: deploy simples, transações locais, menor latência; exige disciplina de contratos. Escala horizontal da API e do worker quando necessário.
**Justificativa**: microsserviços não resolvem E2EE (o servidor não pode re-cifrar) e adicionam complexidade sem benefício no início.

## ADR-002 — DDD + Clean Architecture

**Status**: proposto
**Contexto**: regras de permissão e compartilhamento são complexas e críticas.
**Decisão**: domínio isolado de infraestrutura, com use cases, ports e policies testáveis.
**Alternativas**: CRUD orientado a controller; anemic domain model com serviços transacionais.
**Consequências**: mais arquivos e cerimônia; maior testabilidade e clareza. Mitigar com estrutura apenas onde há regra real.
**Justificativa**: a matriz de permissões e o rekey exigem invariantes explícitas.

## ADR-003 — NestJS + Prisma + PostgreSQL

**Status**: proposto
**Contexto**: stack obrigatória do briefing; ecossistema maduro; necessidade de migrations e tipagem.
**Decisão**: NestJS 11, Prisma, PostgreSQL 17 (Neon).
**Alternativas**: Fastify + Drizzle; TypeORM; MikroORM.
**Consequências**: geração de tipos, migrations SQL revisadas, limitações do Prisma para índices parciais (contornadas com SQL).
**Justificativa**: produtividade, DI nativa, integração com OpenAPI e BullMQ.

## ADR-004 — Vue 3 SPA same-origin

**Status**: proposto
**Contexto**: stack obrigatória; necessidade de manipular segredos no cliente.
**Decisão**: SPA Vue 3 + Vite servida pelo Nginx no mesmo domínio da API.
**Alternativas**: SSR (Nuxt); PWA; extensão de navegador.
**Consequências**: refresh token `SameSite=Strict` funciona sem CORS complexo; SEO irrelevante.
**Justificativa**: mesma origem simplifica cookies e CSP; a SPA é o único lugar com chave privada.

## ADR-005 — E2EE por envelope (uma cópia por usuário)

**Status**: proposto
**Contexto**: o servidor não pode ler segredos; usuários precisam compartilhar.
**Decisão**: cada versão de segredo é cifrada individualmente para cada destinatário; não há cofre simétrico compartilhado.
**Alternativas**: DEK por recurso cifrada para cada usuário; cofre simétrico; segredo cifrado só para o dono.
**Consequências**: custo de armazenamento O(n) por recurso; rekey obrigatório em mudanças de acesso; sem decifrar no servidor.
**Justificativa**: é o modelo do Passbolt, auditado e compatível com OpenPGP.

## ADR-006 — OpenPGP.js no cliente, sem decifrar no servidor

**Status**: proposto
**Contexto**: necessidade de biblioteca auditada e interoperável.
**Decisão**: OpenPGP.js para gerar/cifrar/decifrar/assinar; servidor usa `openpgp` apenas para validar estrutura e fingerprint.
**Alternativas**: WebCrypto puro; libsodium; GnuPG no servidor.
**Consequências**: bundle maior; operações de chave no navegador; testes de compatibilidade entre versões.
**Justificativa**: OpenPGP é padrão, auditável e permite recovery kit e interoperabilidade.

## ADR-007 — Chave privada local + escrow opcional cifrado

**Status**: proposto
**Contexto**: múltiplos dispositivos e recuperação.
**Decisão**: chave privada fica em IndexedDB cifrada pela passphrase; escrow opcional envia blob cifrado pelo cliente para `user_key_backups`.
**Alternativas**: chave somente local (sem recuperação); chave cifrada com chave do servidor (inaceitável); derivar chave da senha (inaceitável).
**Consequências**: perda da passphrase sem recovery kit/escrow = perda dos dados; escrow requer consentimento e KDF forte.
**Justificativa**: preserva zero-knowledge e permite recuperação sem servidor ver a chave.

## ADR-008 — Autenticação: senha + MFA agora, desafio de chave depois

**Status**: proposto
**Contexto**: o Passbolt usa GpgAuth (desafio/resposta); a stack atual é web.
**Decisão**: login com e-mail + senha (Argon2id) + MFA (TOTP/WebAuthn); abstração `AuthenticationMethod` para futuro desafio de chave.
**Alternativas**: GpgAuth desde o início; WebAuthn-only; senha sem MFA.
**Consequências**: senha é um fator adicional fraco contra phishing; WebAuthn mitiga; recuperação mais simples.
**Justificativa**: usabilidade e prazo; a arquitetura não impede evoluir para desafio de chave.

## ADR-009 — Access token JWT + refresh opaco rotativo

**Status**: proposto
**Contexto**: API stateless, SPA, necessidade de revogação.
**Decisão**: JWT de 15 min em memória; refresh token opaco em cookie `HttpOnly; Secure; SameSite=Strict`, hasheado, rotacionado, com detecção de reúso.
**Alternativas**: JWT longo; sessão server-side com cookie; OAuth2/OIDC.
**Consequências**: refresh em tabela, rotação, detecção de roubo; access token não revogável individualmente até expirar.
**Justificativa**: equilíbrio entre segurança e simplicidade; revogação real via refresh/session.

## ADR-010 — Permissões consolidadas com ACO/ARO polimórfico

**Status**: proposto
**Contexto**: a lista inicial previa tabelas separadas por tipo de ARO.
**Decisão**: `resource_permissions` e `folder_permissions` com `(aro_type, aro_id)`; resolução pelo máximo.
**Alternativas**: tabelas `user_permissions`, `group_permissions` separadas; RBAC genérico; ABAC.
**Consequências**: menos duplicação, mais validação na aplicação; FK não é possível para `aro_id`.
**Justificativa**: evita divergência de regras e facilita testes; o custo de validação é pequeno.

## ADR-011 — Pasta como template de permissão

**Status**: proposto
**Contexto**: o Passbolt aplica permissões de pasta em operações específicas, não continuamente.
**Decisão**: permissões de pasta são aplicadas em criação, movimentação para dentro e alteração da permissão da pasta.
**Alternativas**: herança passiva em tempo real; permissão exclusiva da pasta.
**Consequências**: exceções são possíveis; é necessário explicar ao usuário; aplicação em lote pode ser custosa.
**Justificativa**: compatível com E2EE (só quem tem acesso pode compartilhar) e com a semântica do Passbolt.

## ADR-012 — Rekey de grupo no cliente, não no servidor

**Status**: proposto
**Contexto**: o servidor não possui a chave privada nem o conteúdo em claro.
**Decisão**: adicionar/remover membro gera operação `GROUP_REKEY`; o cliente do manager envia envelopes; o backend valida e persiste em transação.
**Alternativas**: re-cifra no servidor (impossível); chave de grupo compartilhada (vazamento); fila de re-cifra no servidor (impossível).
**Consequências**: operação pode ficar PENDING; requer cliente online; UX precisa de retentativa e notificação.
**Justificativa**: única forma de preservar E2EE.

## ADR-013 — Metadados em claro na v1, cifrados na v2

**Status**: proposto
**Contexto**: busca e administração precisam de metadados; Passbolt v5 permite cifrá-los.
**Decisão**: nome, usuário, URL e descrição em claro na v1; `sv2` prevê metadados cifrados com índice opcional.
**Alternativas**: cifrar tudo desde o início (perde busca); metadados cifrados com índice de tokens.
**Consequências**: exposição de metadados ao servidor na v1; migração de formato na v2.
**Justificativa**: simplicidade e busca; a decisão é revisável.

## ADR-014 — Single organization

**Status**: proposto
**Contexto**: o Passbolt CE é uma organização por instalação.
**Decisão**: sem `organization_id`; uma instalação atende uma organização.
**Alternativas**: multi-tenant desde o início; RLS por tenant.
**Consequências**: modelo mais simples; expansão para SaaS exigirá migração de todas as tabelas.
**Justificativa**: não há requisito de multi-tenant; evita complexidade prematura.

## ADR-015 — Soft delete + retenção

**Status**: proposto
**Contexto**: privacidade, recuperação de erros e LGPD.
**Decisão**: `deleted_at` em usuários, grupos, recursos, pastas e chaves; hard delete em envelopes revogados e tokens; expurgo configurável.
**Alternativas**: hard delete imediato; soft delete permanente.
**Consequências**: espaço em disco; jobs de expurgo; auditoria preservada.
**Justificativa**: recuperação operacional e conformidade.

## ADR-016 — Auditoria append-only com hash chain opcional

**Status**: proposto
**Contexto**: necessidade de resistência a adulteração.
**Decisão**: `audit_logs` sem update/delete; hash chain (`prev_hash`/`entry_hash`) na Fase 5; retenção configurável.
**Alternativas**: log externo (SIEM); blockchain; auditoria apenas em tabela.
**Consequências**: custo de escrita e verificação; exportação mais complexa.
**Justificativa**: detecção de adulteração sem dependência externa.

## ADR-017 — BullMQ sem operações criptográficas

**Status**: proposto
**Contexto**: filas para e-mail, expurgo, projeções.
**Decisão**: worker executa apenas tarefas não criptográficas; rekey é sempre iniciado por cliente autorizado.
**Alternativas**: worker com acesso a chaves (inaceitável); rekey em background (impossível sem plaintext).
**Consequências**: operações de rekey dependem de cliente; filas não substituem o fluxo de sharing.
**Justificativa**: preserva o modelo de segurança.

## ADR-018 — REST + OpenAPI, sem GraphQL

**Status**: proposto
**Contexto**: API para SPA e futuros clientes.
**Decisão**: REST versionado + OpenAPI 3.1; cliente TypeScript gerado.
**Alternativas**: GraphQL; tRPC; gRPC.
**Consequências**: cache HTTP simples, contratos explícitos, tooling maduro; over-fetch resolvido por filtros.
**Justificativa**: simplicidade e maturidade; GraphQL não agrega ao modelo E2EE.

## ADR-019 — Redis apenas para dados não sensíveis

**Status**: proposto
**Contexto**: performance e rate limit.
**Decisão**: Redis para cache de metadados públicos, sessões de rate limit, filas e locks; nunca segredos, chaves ou ciphertext.
**Alternativas**: cache de segredos (inaceitável); Redis como fonte de verdade (não).
**Consequências**: cache invalidado por eventos; sem ganho para leitura de segredos.
**Justificativa**: preserva zero-knowledge.

## ADR-020 — UUIDv7 e timestamps UTC

**Status**: proposto
**Contexto**: identificadores estáveis e ordenáveis.
**Decisão**: UUIDv7 gerado na aplicação; `timestamptz` em UTC.
**Alternativas**: UUIDv4; bigint sequencial; ULID.
**Consequências**: índices mais locais; geração no cliente/servidor; ordenação temporal.
**Justificativa**: performance e compatibilidade com PostgreSQL.

## ADR-021 — Idempotência e concorrência explícitas

**Status**: proposto
**Contexto**: compartilhamento e rekey podem ser repetidos.
**Decisão**: `Idempotency-Key` com TTL 24h; `If-Match`/version em recursos e segredos; transações com `FOR UPDATE` em permissões.
**Alternativas**: sem idempotência (duplicação); locks pessimistas globais.
**Consequências**: armazenamento de chaves; testes de concorrência.
**Justificativa**: operações sensíveis não podem ser aplicadas duas vezes.

## ADR-022 — Estratégia de testes

**Status**: proposto
**Contexto**: regras de segurança e permissão são críticas.
**Decisão**: unit + integration + API + authorization + concurrency + migration + E2E; matriz READ/UPDATE/OWNER.
**Alternativas**: apenas E2E; apenas unit.
**Consequências**: pipeline mais lento; maior confiança.
**Justificativa**: falhas de autorização não podem passar despercebidas.

## ADR-023 — Chave do servidor com pinning e JWKS

**Status**: proposto
**Contexto**: prevenir spoofing do servidor.
**Decisão**: par OpenPGP do servidor; JWKS + fingerprint fixado no cliente; rotação com sobreposição.
**Alternativas**: confiar apenas no TLS; sem pinning.
**Consequências**: rotação exige coordenação; clientes antigos precisam de suporte.
**Justificativa**: TLS não protege contra servidor comprometido; pinning adiciona defesa.

## ADR-024 — Versionamento de formato criptográfico

**Status**: proposto
**Contexto**: algoritmos evoluem (pós-quântico).
**Decisão**: `format_version` em segredos e envelopes; `sv1` atual; migração pelo cliente.
**Alternativas**: sem versionamento; re-cifra global.
**Consequências**: complexidade de compatibilidade; testes de matriz.
**Justificativa**: evita lock-in e perda de dados em futuras migrações.