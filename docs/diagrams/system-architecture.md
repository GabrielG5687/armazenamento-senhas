# Diagrama — Arquitetura do Sistema

## 1. Contexto

```mermaid
flowchart LR
    U[Usuário] -->|HTTPS| W[Nginx]
    W -->|SPA| FE[Frontend Vue 3]
    W -->|/api| BE[API NestJS]
    BE --> DB[(PostgreSQL)]
    BE --> RD[(Redis)]
    BE --> Q[BullMQ Worker]
    Q --> DB
    Q --> RD
    Q --> M[SMTP]
    BE -->|WebSocket| U
    U -.->|OpenPGP| BE
```

## 2. Componentes internos

```mermaid
flowchart TB
    subgraph Cliente[Navegador]
      UI[Vue 3 + Pinia]
      SEC[Security: OpenPGP.js / WebCrypto / IndexedDB]
      UI --> SEC
    end
    subgraph Servidor[API NestJS]
      API[Controllers + Guards]
      APP[Use Cases + Policies]
      DOM[Domain]
      INFRA[Repositories Prisma]
      API --> APP --> DOM
      APP --> INFRA
      INFRA --> DB[(PostgreSQL)]
    end
    SEC -->|ciphertext| API
    API --> RD[(Redis)]
    API --> Q[Worker BullMQ]
    Q --> DB
    Q --> SMTP[SMTP]
    API -->|WebSocket| UI
```

## 3. Dependências entre módulos

```mermaid
flowchart LR
    AUTH[Authentication] --> SESS[Sessions]
    AUTH --> MFA[MFA]
    AUTH --> USERS[Users]
    USERS --> CRYPTO[Cryptography]
    RES[Resources] --> RT[Resource Types]
    RES --> PERM[Permissions]
    SECRET[Secrets] --> PERM
    FOLDERS[Folders] --> PERM
    GROUPS[Groups] --> PERM
    SHARING[Sharing] --> SECRET
    SHARING --> PERM
    SHARING --> GROUPS
    SHARING --> CRYPTO
    SHARING --> USERS
    AUTH --> AUDIT[Audit]
    USERS --> AUDIT
    RES --> AUDIT
    SECRET --> AUDIT
    SHARING --> AUDIT
    GROUPS --> AUDIT
    NOTIF[Notifications] --> USERS
    ADMIN[Administration] --> USERS
    ADMIN --> GROUPS
    ADMIN --> PERM
```

## 4. Topologia de deploy

```mermaid
flowchart LR
    I[Internet] --> LB[Nginx TLS]
    LB --> F[Frontend estático]
    LB --> A[API réplicas]
    LB --> WS[WebSocket]
    A --> PG[(Neon PostgreSQL + pooler)]
    A --> R[(Redis gerenciado)]
    W[Worker] --> PG
    W --> R
    W --> E[SMTP]
    A --> OT[OpenTelemetry]
    W --> OT
```

## 5. Fluxo de dados de um segredo

```mermaid
flowchart LR
    C[Cliente] -->|1. decifra| K[chave privada local]
    K -->|2. decifra envelope| P[plaintext JSON]
    P -->|3. edita| E[novo plaintext]
    E -->|4. cifra por destinatário| ENV[envelopes sv1]
    ENV -->|5. envia ciphertext| API
    API -->|6. valida e persiste| DB[(resource_secret_recipients)]
```

## 6. Fronteiras de confiança

| Zona | Confiança | Conteúdo |
|---|---|---|
| Cliente | Alta (usuário dono da chave) | segredos em claro, chave privada |
| API | Média (autenticada, mas sem chave) | ciphertext, metadados, permissões |
| Banco | Média (criptografia em repouso + acesso restrito) | ciphertext, metadados, audit |
| Redis | Baixa | apenas cache não sensível |
| Worker | Média | notificações, expurgo, projeções; sem segredos |

## 7. Decisões refletidas

- Modular monolith: um único deploy de API + worker.
- E2EE: o cliente é a única zona que vê plaintext.
- Sem microsserviços: fronteiras de módulo, não de processo.
- Escala horizontal da API; worker separado para filas.