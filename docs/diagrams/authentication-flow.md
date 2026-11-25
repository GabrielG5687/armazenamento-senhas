# Diagrama — Fluxo de Autenticação

## 1. Login com senha e MFA

```mermaid
sequenceDiagram
    autonumber
    participant U as Usuário
    participant FE as SPA Vue
    participant API as NestJS
    participant DB as PostgreSQL
    participant M as MFA

    U->>FE: e-mail + senha
    FE->>API: POST /auth/login
    API->>DB: busca usuário, status, lockout
    API->>API: Argon2id(password)
    alt credenciais inválidas
        API->>DB: incrementa falha, aplica lockout
        API-->>FE: 401 genérico
    else credenciais válidas e MFA pendente
        API->>DB: cria challenge (TTL 5 min, uso único)
        API-->>FE: 202 {mfaRequired, challengeToken}
        U->>FE: código TOTP / WebAuthn
        FE->>API: POST /auth/mfa/verify
        API->>M: verifica fator
        alt fator inválido
            M-->>API: falha
            API-->>FE: 401
        else fator válido
            M-->>API: ok
        end
    end
    API->>DB: cria user_sessions + device
    API->>DB: grava refresh_token_hash
    API-->>FE: access token (memória) + cookie HttpOnly
    API->>DB: audit login.succeeded
```

## 2. Renovação de sessão

```mermaid
sequenceDiagram
    autonumber
    participant FE as SPA
    participant API as NestJS
    participant DB as PostgreSQL

    FE->>API: requisição autenticada
    API-->>FE: 401 token expirado
    FE->>API: POST /auth/refresh (cookie)
    API->>DB: busca hash do refresh token
    alt token válido e não expirado
        API->>DB: valida device, revogação, rotação
        API->>DB: marca replaced_by, grava novo hash
        API-->>FE: novo access token + cookie rotacionado
        FE->>API: retry da requisição original
    else token reutilizado
        API->>DB: revoga toda a família de sessões
        API-->>FE: 401 + limpar sessão
    else expirado/revogado
        API-->>FE: 401 + redirecionar login
    end
```

## 3. Logout e revogação

```mermaid
sequenceDiagram
    autonumber
    participant U as Usuário
    participant FE as SPA
    participant API as NestJS
    participant DB as PostgreSQL

    U->>FE: logout
    FE->>API: POST /auth/logout
    API->>DB: revoga sessão (revoked_at)
    API->>DB: audit auth.logout
    API-->>FE: 204 + cookie removido
    FE->>FE: limpa access token, chave em memória, caches
```

## 4. Step-up para operação sensível

```mermaid
sequenceDiagram
    autonumber
    participant U as Usuário
    participant FE as SPA
    participant API as NestJS

    U->>FE: compartilhar recurso
    FE->>API: POST /sharing
    API->>API: verifica política de step-up
    alt MFA recente ≤ 5 min
        API->>API: prossegue
    else MFA ausente/expirado
        API-->>FE: 403 {stepUpRequired}
        U->>FE: confirma MFA
        FE->>API: POST /auth/step-up
        API-->>FE: sessão atualizada (amr)
        FE->>API: retry POST /sharing
    end
```

## 5. Recuperação de acesso

```mermaid
sequenceDiagram
    autonumber
    participant U as Usuário
    participant API as NestJS
    participant DB as PostgreSQL
    participant E as E-mail

    U->>API: POST /auth/recover/request {email}
    API->>API: resposta genérica (não revela conta)
    API->>DB: cria token de recuperação (TTL 1h)
    API->>E: envia link
    U->>API: POST /auth/recover/confirm {token, nova senha, MFA}
    API->>DB: valida token, atualiza senha, revoga sessões
    API->>DB: audit recovery.completed
    API-->>U: exige novo login
```

## 6. Estados de uma sessão

```mermaid
stateDiagram-v2
    [*] --> Ativa: login + MFA
    Ativa --> Renovada: refresh
    Renovada --> Ativa: novo access token
    Ativa --> Revogada: logout
    Ativa --> Revogada: admin revoga
    Ativa --> Revogada: reúso de refresh
    Ativa --> Expirada: TTL
    Renovada --> Expirada: TTL
```

## 7. Pontos de controle

| Ponto | Controle |
|---|---|
| Senha | Argon2id + lockout + rate limit |
| MFA | TOTP/WebAuthn + replay protection |
| Access token | 15 min, memória, `sid`/`deviceId` |
| Refresh | httpOnly, rotação, reúso revoga família |
| Sessão | revogável por usuário/admin |
| Dispositivo | device_id + notificação de novo device |
| Step-up | operações sensíveis |
| Auditoria | login, falha, logout, MFA, recuperação |