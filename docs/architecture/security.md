# Segurança

## 1. Princípios

1. **Zero-knowledge server**: o servidor não possui meios de decifrar segredos, mesmo comprometido.
2. **Fail-closed**: erro de autorização = negação.
3. **Defense in depth**: TLS + headers + validação + autorização + criptografia + auditoria.
4. **Least privilege**: cada usuário recebe apenas o acesso necessário.
5. **Auditabilidade**: toda ação sensível é registrada sem expor conteúdo.
6. **Versionamento**: todo material cifrado é migrável.
7. **Sem criptografia caseira**: apenas OpenPGP.js/GnuPG/WebCrypto auditados.

## 2. Ativos e modelo de ameaças

| Ativo | Ameaça | Controle |
|---|---|---|
| Segredos em claro | Vazamento pelo servidor | E2EE, envelopes por destinatário |
| Chave privada | Roubo/exfiltração | Armazenamento local cifrado, timeout, WebAuthn |
| Passphrase | Phishing/keylogger | Nunca trafega; WebAuthn resistente a phishing |
| Sessão | Sequestro | Refresh httpOnly, rotação, device binding, reauth |
| Permissões | Escalada de privilégio | Policy central, testes, menor privilégio |
| Metadados | Reconhecimento | v1 em claro; v2 cifrado (roadmap) |
| Auditoria | Repúdio | Hash chain, append-only, export |
| Chave do servidor | Spoofing do servidor | Pinning de fingerprint + JWKS + TLS |
| Envelope | Forjar destinatário | Validar fingerprint contra chave ativa |
| Grupo | Membro removido mantém acesso | Revogação de envelopes + rekey |

### STRIDE resumido

| Categoria | Vetor | Mitigação |
|---|---|---|
| Spoofing | Login com credenciais roubadas | MFA, WebAuthn, rate limit, alerta de dispositivo |
| Tampering | Alterar envelope na rede | TLS + assinatura OpenPGP + checksum |
| Repudiation | Negar compartilhamento | Audit log com hash chain |
| Information disclosure | Erro/Log vazar segredo | Redaction, Problem Details genérico |
| Denial of service | Brute force / payload gigante | Rate limit, lockout, limites de payload |
| Elevation of privilege | Usar ID de outro recurso | Autorização por ACO/ARO em toda operação |

## 3. Arquitetura criptográfica

### 3.1 Chaves

| Chave | Proprietário | Uso | Onde fica |
|---|---|---|---|
| Chave OpenPGP do usuário | Usuário | Cifrar/decifrar/assinar segredos | Dispositivo (IndexedDB cifrada) |
| Chave pública do usuário | Servidor | Cifrar envelopes para o usuário | `user_public_keys` |
| Chave do servidor | Servidor | Identidade, JWKS, assinatura de tokens | `server_public_keys` (privada em KMS/arquivo) |
| Chave de TOTP | Servidor | Verificar MFA | Cifrada com KMS envelope key |
| Chave de JWT | Servidor | Assinar access tokens | KMS/arquivo montado |

### 3.2 Algoritmos (sv1)

| Uso | Algoritmo |
|---|---|
| Assinatura | EdDSA (Ed25519) |
| Cifra assimétrica | ECDH Curve25519 |
| Cifra simétrica | AES-256 (OpenPGP CFB) |
| Hash | SHA-256 |
| KDF da passphrase | Argon2id (m=19 MiB, t=2, p=1) |
| Senha de login | Argon2id (m=19 MiB, t=2, p=1) |
| TOTP | HMAC-SHA1 (RFC 6238, 6 dígitos, 30 s) |
| JWT | EdDSA (Ed25519) ou RS256 |
| WebAuthn | ES256/EdDSA |

### 3.3 Formato do envelope

```json
{
  "formatVersion": "sv1",
  "keyFingerprint": "AB12 ...",
  "algorithm": "curve25519/aes256/sha256",
  "armoredMessage": "-----BEGIN PGP MESSAGE----- ...",
  "signature": "-----BEGIN PGP SIGNATURE----- ...",
  "checksum": "sha256:<hex>"
}
```

Regras:

- `formatVersion` obrigatório.
- `keyFingerprint` deve corresponder à chave ativa do destinatário.
- `checksum` é calculado no cliente e verificado no servidor para detectar corrupção (não substitui assinatura).
- O servidor **não** decifra nem tenta validar o conteúdo; valida armor, tamanho, versão e fingerprint.
- Assinatura é verificada no cliente após decifrar.

### 3.4 Versionamento e migração

- `sv1`: OpenPGP ECC.
- `sv2` (futuro): metadados cifrados, possível híbrido pós-quântico (ML-KEM) — decisão em ADR futuro.
- Migração: cliente detecta `formatVersion` antigo e re-cifra ao editar/abrir, em lote, com job de acompanhamento.
- Nunca re-cifrar no servidor.

### 3.5 Armazenamento local da chave privada

- O OpenPGP.js gera o par de chaves no navegador.
- O bloco de chave privada é serializado e cifrado com **AES-256-GCM**, usando chave derivada da passphrase (Argon2id).
- O blob cifrado, o salt e os parâmetros do KDF são persistidos em IndexedDB.
- O desbloqueio decifra o blob e mantém a chave **apenas em memória**.
- Não usamos o S2K nativo do OpenPGP para a persistência: o envelope externo (AES-GCM + Argon2id) é o controle de acesso local. O formato OpenPGP permanece interoperável para recovery kit e exportação.

## 4. Ciclo de vida das chaves

1. **Geração**: no navegador, durante o setup; par ECC; passphrase define KDF.
2. **Publicação**: envio da chave pública + fingerprint; servidor valida formato, UID, expiração e ausência de chave duplicada.
3. **Uso**: desbloqueio por passphrase; chave em memória; timeout.
4. **Rotação**: nova chave gerada; revogação da antiga; re-cifra pendente dos segredos.
5. **Revogação**: marca `revoked_at`; envelopes novos usam a nova chave; envelopes antigos permanecem para histórico até expurgo.
6. **Recuperação**: recovery kit (arquivo) ou escrow opcional cifrado pela passphrase.

### 4.1 Escrow opcional

- O cliente cifra a chave privada com chave derivada da passphrase e envia o blob para `user_key_backups`.
- O servidor armazena bytes opacos; nunca deriva a chave nem vê a passphrase.
- Requer consentimento explícito e é desativado por padrão.
- Admin não consegue decifrar.

## 5. Autenticação

### 5.1 Login primário

- E-mail + senha (Argon2id).
- Resposta genérica: "credenciais inválidas" (não revela se o e-mail existe).
- Rate limit: 5 tentativas/min por IP + 10/h por conta; lockout exponencial (1, 5, 15, 60 min).
- Verificação opcional de senha vazada via HIBP k-anonymity (opt-in).
- MFA obrigatório conforme política da organização.

### 5.2 MFA

- TOTP: segredo cifrado em repouso (KMS), verificação com janela ±1 passo, replay protection.
- WebAuthn: passkeys, challenge single-use, counter.
- Códigos de recuperação: 10 códigos, hash Argon2id, uso único.
- Step-up: operações sensíveis (compartilhar, alterar chave, remover membro) exigem MFA recente (≤ 5 min) se a política exigir.

### 5.3 Sessão

- Access token: JWT EdDSA, 15 min, `sub`, `sid`, `deviceId`, `amr`, `acr`.
- Refresh token: opaco, 256 bits, **não** JWT; armazenado hasheado (SHA-256) no banco.
- Rotação a cada uso; detecção de reúso revoga toda a família de sessões.
- Cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`.
- Logout revoga `sid` e apaga cookie.
- Sessões administrativas podem ser revogadas individualmente ou em massa.

### 5.4 Dispositivos

- Cada login cria/atualiza `user_devices` (nome, UA, fingerprint da chave do dispositivo, último acesso).
- Novo dispositivo exige MFA e dispara notificação.
- Dispositivo confiável é opcional e expira em 90 dias.

## 6. Autorização

- Toda operação sensível passa por `PermissionQueryPort.assertCan`.
- ACO: `RESOURCE` ou `FOLDER`. ARO: `USER` ou `GROUP`.
- Permissão efetiva = máximo entre diretas e grupos.
- Ações: `READ`, `UPDATE`, `DELETE`, `SHARE`.
- `UPDATE` implica `READ`; `DELETE` exige `UPDATE`; `SHARE` exige `OWNER`.
- Recurso/pasta sem OWNER é um estado inválido e deve ser rejeitado antes de qualquer escrita.
- Controllers não decidem permissão; apenas o guard/policy.
- Testes obrigatórios para a matriz completa (ver `domains/permissions.md`).

## 7. Transporte e headers

- HTTPS obrigatório (HSTS 1 ano, `includeSubDomains`, `preload`).
- TLS 1.2+ (preferir 1.3).
- Headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.
- Cookies `Secure`, `HttpOnly`, `SameSite=Strict`.
- CORS: apenas origem da SPA; sem `*`.

## 8. Proteção contra ataques comuns

| Ataque | Controle |
|---|---|
| XSS | CSP sem `unsafe-inline`, Vue escaping, sanitização de HTML em descrições, `DOMPurify` se houver rich text |
| CSRF | SameSite=Strict + header `X-Requested-With` + origin check |
| SQL Injection | Prisma com queries parametrizadas; proibido `$queryRaw` com interpolação |
| SSRF | Allowlist de URLs de saída; bloqueio de redes internas |
| Path traversal | Sem upload de arquivos por usuário nesta fase |
| IDOR | Autorização por recurso em toda leitura/escrita |
| Brute force | Rate limit + lockout + MFA |
| Replay | Challenge single-use, `Idempotency-Key`, `jti` |
| Timing attack | Comparação em tempo constante (Argon2, HMAC) |

## 9. Segredos no backend

- O backend só recebe `ciphertext`.
- Nunca logar body de rotas de segredo.
- `secrets` não possui endpoint de decifrar.
- Nenhum cache de segredo em Redis.
- `ciphertext` só sai da API para usuário com `READ` efetivo.
- Limite de payload por envelope e por recurso.
- Expurgo de versões antigas conforme retenção.

## 10. Auditoria

- Eventos sensíveis: login, logout, falha de login, MFA, criação/edição/exclusão, compartilhamento, revogação, permissão, grupo, admin, exportação.
- Campos: `actor_id`, `action`, `target_type`, `target_id`, `metadata`, `ip`, `user_agent`, `request_id`, `occurred_at`.
- Nunca registrar senha, passphrase, chave privada, segredo em claro ou ciphertext.
- Append-only: sem `UPDATE`/`DELETE` na aplicação; retenção via job.
- Hash chain opcional (Fase 5): `prev_hash` + `entry_hash` para detecção de adulteração.

## 11. Gestão de vulnerabilidades

- `npm audit` e `pnpm audit` no CI.
- CodeQL e Semgrep.
- Dependabot/Renovate.
- SBOM (CycloneDX) por release.
- Divulgação responsável: `SECURITY.md`.
- Testes de penetração antes do 1.0.

## 12. Limitações residuais

1. Malware no dispositivo do usuário pode roubar a chave desbloqueada.
2. Revogação de acesso não apaga o que o usuário já copiou; para segredos sensíveis, rotacionar a senha.
3. Metadados v1 ficam expostos ao servidor (nome, URL, descrição).
4. Perda da passphrase sem recovery kit/escrow = perda dos dados.
5. O servidor pode negar acesso (DoS), mas não pode ler segredos.
6. A força de uma senha de login não protege os segredos; a passphrase é a barreira real.