# Diagrama — Fluxo de Compartilhamento

## 1. Compartilhar recurso com usuários e grupos

```mermaid
sequenceDiagram
    autonumber
    participant O as Owner (cliente)
    participant FE as SPA
    participant API as NestJS
    participant DB as PostgreSQL

    O->>FE: seleciona recurso e destinatários
    FE->>API: GET /resources/:id (metadados + permissões)
    API-->>FE: recurso + permissões atuais
    FE->>API: GET /users/keys?ids=... (chaves ativas)
    API-->>FE: chaves públicas
    O->>O: verifica que é OWNER
    O->>O: decifra segredo corrente
    O->>O: cifra para cada destinatário (sv1)
    O->>FE: confirma lista de destinatários
    FE->>API: POST /sharing {resourceId, recipients, envelopes, idempotencyKey}
    API->>API: valida OWNER, níveis, chaves, envelopes
    API->>DB: BEGIN
    API->>DB: upsert resource_permissions
    API->>DB: insert resource_secret_recipients
    API->>DB: audit + outbox
    API->>DB: COMMIT
    API-->>FE: 200 {operationId, completed}
    FE-->>O: compartilhado
```

## 2. Grupo: adicionar membro (rekey obrigatório)

```mermaid
sequenceDiagram
    autonumber
    participant M as Manager (cliente)
    participant API as NestJS
    participant DB as PostgreSQL
    participant N as Novo membro

    M->>API: POST /groups/:id/members {userId}
    API->>API: valida MANAGER + chave ativa do novo membro
    API->>DB: lista recursos com permissão do grupo
    API-->>M: 202 {operationId, resources[]}
    loop para cada recurso
        M->>M: decifra segredo com sua chave
        M->>M: cifra para chave do novo membro
    end
    M->>API: POST /sharing/rekey/:operationId/complete {items[]}
    API->>API: valida envelopes e ator
    API->>DB: BEGIN
    API->>DB: insere group_members
    API->>DB: insere recipients
    API->>DB: audit + outbox
    API->>DB: COMMIT
    API-->>M: 200
    API-->>N: notificação de acesso (sem segredo)
```

> Se o cliente não concluir, a operação fica `PENDING`; o membro **não** recebe os envelopes e não consegue decifrar.

## 3. Grupo: remover membro (revogação)

```mermaid
sequenceDiagram
    autonumber
    participant M as Manager
    participant API as NestJS
    participant DB as PostgreSQL

    M->>API: DELETE /groups/:id/members/:userId
    API->>API: valida MANAGER e último manager
    API->>DB: BEGIN
    API->>DB: define removed_at
    API->>DB: identifica recursos com acesso somente via grupo
    API->>DB: remove envelopes desses recursos para o usuário
    API->>DB: mantém envelopes de acesso direto/outros grupos
    API->>DB: audit + outbox
    API->>DB: COMMIT
    API-->>M: 200 {revokedEnvelopes}
    API-->>M: notifica perda de acesso
```

## 4. Revogar usuário de um recurso

```mermaid
sequenceDiagram
    autonumber
    participant O as Owner
    participant API as NestJS
    participant DB as PostgreSQL

    O->>API: POST /sharing/revoke {resourceId, aroType: USER, aroId}
    API->>API: valida OWNER
    API->>DB: BEGIN
    API->>DB: remove resource_permission
    API->>DB: remove recipients da versão corrente
    API->>DB: bloqueia novas versões para o usuário
    API->>DB: audit
    API->>DB: COMMIT
    API-->>O: 200
```

## 5. Edição de segredo com re-cifra

```mermaid
sequenceDiagram
    autonumber
    participant O as Editor
    participant FE as SPA
    participant API as NestJS
    participant DB as PostgreSQL

    O->>FE: edita segredo
    FE->>API: GET /resources/:id (metadados + permissões)
    API-->>FE: destinatários atuais
    FE-->>O: confirma lista de destinatários da nova versão
    O->>O: decifra versão corrente, aplica edição
    O->>O: cifra nova versão para todos com READ+
    FE->>API: PUT /resources/:id/secret {version, envelopes, idempotencyKey}
    API->>API: valida UPDATE + envelopes
    API->>DB: BEGIN
    API->>DB: marca versão antiga is_current=false
    API->>DB: cria nova versão is_current=true
    API->>DB: insere recipients
    API->>DB: audit secret.version.created
    API->>DB: COMMIT
    API-->>FE: 200 {version}
```

## 6. Estados da operação de sharing

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> IN_PROGRESS: cliente envia envelopes
    IN_PROGRESS --> COMPLETED: persistido em transação
    PENDING --> FAILED: chave inválida
    IN_PROGRESS --> FAILED: envelope inválido
    PENDING --> EXPIRED: 24h
    IN_PROGRESS --> EXPIRED: 24h
    COMPLETED --> [*]
    FAILED --> [*]
    EXPIRED --> [*]
```

## 7. Matriz de decisão

| Operação | Exige | Efeito |
|---|---|---|
| Share usuário | OWNER | permissão + envelopes |
| Share grupo | OWNER | permissão de grupo + envelopes dos membros ativos |
| Add membro grupo | MANAGER + chave do membro | group_members + rekey |
| Remove membro grupo | MANAGER | remove envelopes derivados do grupo |
| Revogar usuário | OWNER | remove permissão + envelopes |
| Downgrade permissão | OWNER | atualiza nível; se perde READ, remove envelopes |
| Editar segredo | UPDATE | nova versão + envelopes para READ+ |
| Excluir recurso | UPDATE | soft delete + revoga envelopes |

## 8. Garantias

- Transação única entre permissão e envelopes.
- Idempotência por `Idempotency-Key`.
- Nenhum acesso concedido antes da conclusão do rekey.
- Nenhum recurso sem OWNER.
- Revogação remove a capacidade de obter versões futuras.
- Auditoria sem ciphertext.