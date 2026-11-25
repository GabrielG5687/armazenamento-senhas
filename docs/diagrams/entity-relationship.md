# Diagrama — Entidade-Relacionamento

> Visão complementar ao `architecture/database.md`. Aqui o foco é a leitura dos relacionamentos e da resolução de permissão.

## 1. Núcleo de identidade

```mermaid
erDiagram
    users ||--o| user_profiles : "1:1"
    users ||--o{ user_public_keys : "1:N"
    users ||--o{ user_key_backups : "1:N (opt-in)"
    users ||--o{ user_devices : "1:N"
    users ||--o{ user_sessions : "1:N"
    users ||--o{ totp_credentials : "1:N"
    users ||--o{ webauthn_credentials : "1:N"
    users ||--o{ recovery_codes : "1:N"

    users {
      uuid id PK
      text email UK
      user_role role
      user_status status
      timestamptz deleted_at
    }
    user_sessions {
      uuid id PK
      uuid user_id FK
      uuid device_id FK
      text refresh_token_hash UK
      timestamptz expires_at
    }
    user_public_keys {
      uuid id PK
      uuid user_id FK
      text fingerprint UK
      boolean is_primary
    }
```

## 2. Recursos, segredos e destinatários

```mermaid
erDiagram
    resource_types ||--o{ resource_type_versions : "1:N"
    resource_types ||--o{ resources : "1:N"
    resource_type_versions ||--o{ resources : "schema na criação"
    resources ||--o{ resource_secrets : "1:N versões"
    resource_secrets ||--o{ resource_secret_recipients : "1:N envelopes"
    users ||--o{ resource_secret_recipients : "destinatário"
    users ||--o{ resource_secrets : "cria versão"

    resources {
      uuid id PK
      uuid resource_type_id FK
      int resource_type_version
      text name
      resource_status status
      timestamptz deleted_at
    }
    resource_secrets {
      uuid id PK
      uuid resource_id FK
      int version
      boolean is_current
      text format_version
      text checksum
    }
    resource_secret_recipients {
      uuid id PK
      uuid resource_secret_id FK
      uuid user_id FK
      text key_fingerprint
      text armored_message
    }
```

## 3. Permissões polimórficas

```mermaid
erDiagram
    resources ||--o{ resource_permissions : "ACO RESOURCE"
    folders ||--o{ folder_permissions : "ACO FOLDER"
    users ||--o{ resource_permissions : "ARO USER"
    groups ||--o{ resource_permissions : "ARO GROUP"
    users ||--o{ folder_permissions : "ARO USER"
    groups ||--o{ folder_permissions : "ARO GROUP"

    resource_permissions {
      uuid id PK
      uuid resource_id FK
      aro_type aro_type
      uuid aro_id
      permission_level level
    }
    folder_permissions {
      uuid id PK
      uuid folder_id FK
      aro_type aro_type
      uuid aro_id
      permission_level level
    }
```

> `aro_id` não possui FK por ser polimórfico; a aplicação valida `USER` ativo ou `GROUP` ativo antes de persistir.

## 4. Pastas e organização

```mermaid
erDiagram
    folders ||--o{ folders : "parent_id (hierarquia)"
    folders ||--o{ folder_resources : "1:N"
    resources ||--o{ folder_resources : "1:N"
    users ||--o{ folders : "criador"

    folder_resources {
      uuid id PK
      uuid folder_id FK
      uuid resource_id FK
      timestamptz added_at
      timestamptz removed_at
    }
```

> Unique parcial em `(resource_id)` garante **uma pasta ativa por recurso**.

## 5. Grupos e rekey

```mermaid
erDiagram
    groups ||--o{ group_members : "1:N"
    users ||--o{ group_members : "1:N"
    groups ||--o{ sharing_operations : "GROUP_REKEY"
    sharing_operations ||--o{ sharing_operation_items : "1:N"
    resources ||--o{ sharing_operation_items : "1:N"

    group_members {
      uuid id PK
      uuid group_id FK
      uuid user_id FK
      group_member_role role
      timestamptz removed_at
    }
    sharing_operations {
      uuid id PK
      sharing_operation_type operation
      sharing_operation_status status
      text idempotency_key UK
      jsonb payload
    }
    sharing_operation_items {
      uuid id PK
      uuid operation_id FK
      uuid resource_id FK
      sharing_operation_status status
      int envelope_count
    }
```

## 6. Resolução de permissão efetiva

```mermaid
flowchart TD
    A[Usuário] --> B[Permissões diretas\nresource_permissions ARO=USER]
    A --> C[Grupos ativos\ngroup_members]
    C --> D[Permissões de grupo\nresource_permissions ARO=GROUP]
    B --> E[max READ/UPDATE/OWNER]
    D --> E
    E --> F{Nível}
    F -->|READ| G[Ler metadados e envelope]
    F -->|UPDATE| H[Editar/excluir]
    F -->|OWNER| I[Compartilhar]
```

## 7. Auditoria

```mermaid
erDiagram
    users ||--o{ audit_logs : "ator (opcional)"
    resources ||--o{ audit_logs : "target (polimórfico)"
    groups ||--o{ audit_logs : "target (polimórfico)"

    audit_logs {
      uuid id PK
      timestamptz occurred_at
      uuid actor_id FK
      audit_actor_type actor_type
      text action
      text target_type
      uuid target_id
      jsonb metadata
      text prev_hash
      text entry_hash
    }
```

## 8. Observações de modelagem

1. Permissões são **polimórficas**, não uma tabela por tipo de ARO.
2. Segredos são **versionados** e possuem **um envelope por usuário**.
3. Grupos não possuem envelope: possuem permissão; o envelope é materializado por membro.
4. `folder_resources` garante uma única pasta ativa por recurso, com histórico de movimentação.
5. Auditoria é polimórfica por `target_type`/`target_id` e append-only.
6. Sessões consolidam refresh tokens; não há tabela separada.