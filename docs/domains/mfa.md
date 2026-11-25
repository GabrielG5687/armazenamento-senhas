# Domínio — MFA

## 1. Responsabilidade

Adicionar um segundo fator ao login primário e proteger operações sensíveis (step-up). MFA não substitui a autorização de recursos.

## 2. Métodos

| Método | Registro | Verificação | Recuperação |
|---|---|---|---|
| TOTP | `POST /mfa/totp/setup` gera segredo (uma vez, em claro apenas na resposta) | código de 6 dígitos, janela ±1 passo | códigos de recuperação |
| WebAuthn | `navigator.credentials.create` com challenge do servidor | `navigator.credentials.get`, validação de origem/counter | códigos de recuperação |
| Recovery codes | gerados no setup | 10 códigos de uso único | administrador (reemissão) |

## 3. Regras de negócio

1. O segredo TOTP é cifrado em repouso com chave do servidor (KMS envelope) e nunca logado.
2. O setup TOTP só é concluído após confirmação de um código válido.
3. O passo TOTP usado é memorizado (`last_used_step`) para bloquear replay.
4. WebAuthn usa challenge single-use, TTL 5 min, validação de `origin` e `rpId`.
5. O counter da credencial deve ser estritamente crescente.
6. Códigos de recuperação são hasheados com Argon2id, armazenados sem o código em claro e consumidos uma única vez.
7. A desativação de um método exige senha + outro método ativo (ou recovery code), para evitar lockout.
8. A organização pode exigir MFA para todos, para administradores ou para operações sensíveis.
9. Step-up: operações sensíveis exigem MFA recente (≤ 5 min) quando a política exigir.
10. A perda de todos os fatores exige recovery assistido por administrador, com verificação de identidade e auditoria.
11. Nenhum segredo TOTP ou material WebAuthn é incluído em log, auditoria ou resposta após o setup.
12. Dispositivos confiáveis não dispensam MFA em novas sessões, apenas reduzem notificações.

## 4. Invariantes

- Todo usuário ativo com política MFA exigida possui ao menos um método confirmado.
- Nenhum método duplicado ativo por usuário (TOTP único; WebAuthn múltiplo).
- Nenhum challenge reutilizável.
- Nenhum código de recuperação reutilizável.
- Nenhum segredo TOTP em claro no banco.

## 5. Eventos

| Evento | Payload |
|---|---|
| `mfa.totp.enabled.v1` | `userId` |
| `mfa.totp.disabled.v1` | `userId`, `actorId` |
| `mfa.webauthn.registered.v1` | `userId`, `credentialId`, `deviceName` |
| `mfa.webauthn.removed.v1` | `userId`, `credentialId` |
| `mfa.recovery_codes.regenerated.v1` | `userId` |
| `mfa.step_up.completed.v1` | `userId`, `method`, `operation` |
| `mfa.challenge.failed.v1` | `userId`, `method`, `reason` |

## 6. API

| Método | Rota | Observação |
|---|---|---|
| POST | `/mfa/totp/setup` | retorna segredo + QR (uma vez) |
| POST | `/mfa/totp/verify` | confirma setup |
| DELETE | `/mfa/totp` | exige senha + outro fator |
| POST | `/mfa/webauthn/register/options` | challenge |
| POST | `/mfa/webauthn/register/verify` | confirma |
| DELETE | `/mfa/webauthn/:id` | exige outro fator |
| POST | `/mfa/recovery-codes/regenerate` | exige senha |

## 7. Testes obrigatórios

- Setup TOTP inválido/válido/expirado.
- Replay de código TOTP.
- WebAuthn challenge inválido, origem inválida, counter regressivo.
- Recovery code usado/tentativa de reúso.
- Desativação bloqueando último fator.
- MFA exigido por política.
- Step-up expirado.
- Segredo TOTP não aparece em log/auditoria.
- Recovery assistido por admin.

## 8. Fora de escopo

- Push notification (Duo) — extensão.
- Biometria como fator server-side.
- Hardware token FIDO2 sem WebAuthn.
- SSO.