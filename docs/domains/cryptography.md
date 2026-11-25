# Domínio — Cryptography (backend)

## 1. Responsabilidade

O módulo `Cryptography` do backend **não cifra nem decifra segredos de usuários**. Ele é o registro e o validador de material criptográfico:

- chaves públicas de usuários;
- fingerprints e metadados;
- chave pública do servidor (identidade/JWKS);
- validação estrutural de envelopes;
- versionamento de formatos.

A cifragem/decifragem acontece no cliente, com OpenPGP.js.

## 2. Chaves

### 2.1 Chave do usuário

| Campo | Regra |
|---|---|
| Algoritmo | `ed25519` (preferencial) ou `rsa` 3072/4096 |
| UID | deve conter o e-mail do usuário |
| Fingerprint | recomputado no servidor a partir do armor; deve coincidir com o informado |
| Expiração | opcional; se expirada, não pode receber envelopes |
| Material privado | **nunca** aceito; armor com `PRIVATE KEY` é rejeitado |
| Duplicidade | fingerprint único globalmente |

### 2.2 Chave do servidor

- Par OpenPGP (Ed25519) gerado na instalação; privada em KMS/arquivo montado.
- `kid` e `fingerprint` publicados em `GET /v1/server-key` e JWKS.
- Clientes fixam o fingerprint (`VITE_SERVER_KEY_FINGERPRINT`) e alertam em mudança.
- Rotação: nova chave ativa, antiga permanece para verificação por 30 dias, depois revogada.

## 3. Validação de envelope

O servidor recebe envelopes produzidos pelo cliente e valida **apenas estrutura**:

1. Armor OpenPGP válido e analisável.
2. `formatVersion` suportado (`sv1`).
3. `keyFingerprint` corresponde a uma chave ativa do destinatário.
4. Tamanho ≤ limite configurado.
5. `checksum` SHA-256 do armored message confere.
6. Presença de pacote de dados cifrados; ausência de material privado.

O servidor **não**:

- decifra o payload;
- verifica a assinatura interna (só é possível após decifrar);
- valida o JSON interno contra o schema do tipo de recurso (isso é feito no cliente);
- armazena chave privada.

## 4. Formato e versionamento

```json
{
  "formatVersion": "sv1",
  "keyFingerprint": "AB12...",
  "algorithm": "curve25519/aes256/sha256",
  "armoredMessage": "-----BEGIN PGP MESSAGE-----",
  "signature": "-----BEGIN PGP SIGNATURE-----",
  "checksum": "sha256:..."
}
```

| Versão | Algoritmos | Metadados | Estado |
|---|---|---|---|
| `sv1` | Ed25519/ECDH Curve25519, AES-256, SHA-256 | em claro | atual |
| `sv2` | híbrido pós-quântico (a definir) | cifrados | futuro |

## 5. Regras de negócio

1. Nenhuma chave pública é aceita sem fingerprint válido e UID compatível.
2. Nenhuma chave privada é aceita ou armazenada.
3. Nenhuma operação de API retorna chave privada.
4. Toda validação de chave gera auditoria (sem armor completo).
5. A troca de formato é feita por versão, com matriz de compatibilidade.
6. O servidor pode verificar assinaturas **detached** de metadados; não verifica assinatura de payload cifrado.
7. A chave do servidor nunca é usada para cifrar segredos de usuários.
8. Algoritmos obsoletos são rejeitados para novos envelopes; envelopes antigos permanecem legíveis até expurgo.

## 6. Invariantes

- Todo envelope referenciado existe e aponta para uma versão de segredo existente.
- Todo envelope tem um destinatário com chave ativa no momento da criação.
- Nenhum material privado em qualquer tabela ou log.
- Nenhum fingerprint duplicado.
- Toda migração de formato preserva a capacidade de decifrar versões anteriores.

## 7. Eventos

| Evento | Payload |
|---|---|
| `crypto.user_key.added.v1` | `userId`, `fingerprint`, `algorithm` |
| `crypto.user_key.revoked.v1` | `userId`, `fingerprint` |
| `crypto.server_key.rotated.v1` | `kid`, `fingerprint` |
| `crypto.envelope.rejected.v1` | `reason`, `resourceId?` (sem ciphertext) |

## 8. Contratos

```ts
interface PublicKeyDirectoryPort {
  getActiveKey(userId: string): Promise<UserPublicKey>;
  getActiveKeys(userIds: string[]): Promise<Map<string, UserPublicKey>>;
  assertKeyIsValid(userId: string, armoredPublicKey: string): Promise<KeyValidationResult>;
  getServerKey(): Promise<ServerKey>;
}

interface EnvelopeValidator {
  assertValid(input: {
    recipientUserIds: string[];
    envelopes: Array<{ userId: string; formatVersion: string; armoredMessage: string; checksum: string; keyFingerprint: string }>;
  }): Promise<void>;
}
```

## 9. Cenários de borda

| Cenário | Comportamento |
|---|---|
| Armor com chave privada | 422 |
| Fingerprint incompatível | 422 |
| UID com e-mail diferente | 422 |
| Chave expirada | 422 (não pode receber) |
| Envelope maior que o limite | 413/422 |
| Formato desconhecido | 422 com lista de versões suportadas |
| Servidor sem chave configurada | falha no boot |

## 10. Testes obrigatórios

- Validação de chave válida, expirada, revogada, privada, UID inválido.
- Fingerprint recompute.
- Envelope válido, armor corrompido, checksum inválido, destinatário sem chave.
- Limite de payload.
- Rotação da chave do servidor.
- Ausência de métodos de decrypt na surface pública.
- Teste de contrato: nenhum endpoint retorna chave privada.

## 11. Fora de escopo

- Cifra/decifra de segredos.
- Assinatura de operações de negócio.
- Gerenciamento de chave privada (cliente).
- Criptografia de backups (infraestrutura).