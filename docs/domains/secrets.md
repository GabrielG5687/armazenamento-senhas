# Domínio — Secrets

## 1. Responsabilidade

Persistir, versionar e entregar **envelopes cifrados** de um recurso. O backend nunca decifra, nunca deriva chave e nunca armazena segredo em claro.

## 2. Modelo

```text
resource_secrets (versão corrente + histórico)
  └── resource_secret_recipients (1 envelope cifrado por usuário)
```

- Cada versão é imutável.
- `is_current = true` identifica a versão vigente.
- Cada destinatário recebe uma cópia cifrada com sua própria chave pública.
- Grupos não recebem envelope: a permissão é de grupo, mas os envelopes são materializados por membro ativo.

## 3. Regras de negócio

1. A criação de segredo exige `UPDATE` (ou `OWNER`) no recurso e chave pública ativa para cada destinatário.
2. O cliente envia os envelopes já cifrados e assinados; o servidor valida estrutura, checksum e fingerprint.
3. O servidor não aceita JSON em claro como "segredo"; se a versão de formato permitir metadados cifrados, o envelope é opaco.
4. O tamanho máximo por envelope é configurável (default 256 KiB) e por recurso (default 1 MiB).
5. A criação de uma nova versão incrementa `version`, marca a anterior como não corrente e mantém as versões antigas por retenção.
6. A leitura da versão corrente exige `READ` efetivo.
7. O acesso é auditado (`secret.accessed`) com usuário, recurso, versão e `request_id`, **sem** ciphertext.
8. A revogação de um usuário apaga os envelopes da versão corrente e impede novas versões para ele, mantendo o acesso de outros destinatários.
9. A exclusão do recurso apaga envelopes correntes e agenda expurgo das versões antigas.
10. Nenhum cache de segredo em Redis.
11. Concorrência: duas atualizações simultâneas são resolvidas por versão (`If-Match`) ou rejeitadas com 409.
12. Nenhuma resposta de API inclui ciphertext de destinatários que não o solicitante.
13. O expurgo de versões antigas remove envelopes e metadados, preservando apenas auditoria e checksums.

## 4. Invariantes

- Toda versão corrente tem ao menos um envelope para um usuário com acesso.
- Todo envelope aponta para uma chave ativa no momento da criação.
- Nenhum ciphertext sai sem `READ` efetivo.
- Nenhum ciphertext em log.
- Nenhuma operação de decifrar existe no backend.

## 5. Eventos

| Evento | Payload |
|---|---|
| `secret.version.created.v1` | `resourceId`, `version`, `formatVersion` |
| `secret.accessed.v1` | `resourceId`, `userId`, `version` |
| `secret.revoked.v1` | `resourceId`, `userId` |
| `secret.purged.v1` | `resourceId`, `version` |

## 6. API

| Método | Rota | Permissão | Observação |
|---|---|---|---|
| GET | `/resources/:id/secret` | READ | retorna envelope do solicitante |
| PUT | `/resources/:id/secret` | UPDATE | cria nova versão com envelopes |
| GET | `/resources/:id/secret/versions` | READ | metadados, sem ciphertext |
| GET | `/resources/:id/secret/versions/:v` | READ | envelope da versão, se houver acesso |

## 7. Contratos

```ts
interface SecretStorePort {
  createVersion(input: CreateSecretVersionInput): Promise<SecretVersion>;
  getCurrentVersion(resourceId: string): Promise<SecretVersion | null>;
  getRecipientEnvelope(resourceId: string, userId: string): Promise<SecretEnvelope | null>;
  replaceRecipients(resourceId: string, envelopes: SecretEnvelope[]): Promise<void>;
  revokeUser(resourceId: string, userId: string): Promise<void>;
}

// Não existe decrypt() neste porto.
```

## 8. Cenários de borda

| Cenário | Comportamento |
|---|---|
| Envelope de destinatário sem acesso | 403/422, transação revertida |
| Chave expirada | 422 |
| Payload acima do limite | 413 |
| Versão conflitante | 409 |
| Usuário sem chave | 422 |
| Revogação do último leitor | permitida? Sim, desde que reste OWNER; OWNER sem READ é inconsistência bloqueada |
| Expurgo de versão antiga | remove envelopes; mantém checksum/auditoria |
| Resource sem OWNER | bloqueado antes da operação |

## 9. Testes obrigatórios

- Criação de primeira versão e nova versão.
- Envelope válido/inválido.
- Leitura por READ/UPDATE/OWNER e negação sem acesso.
- Revogação remove envelope corrente.
- Concorrência de versões.
- Limites de tamanho.
- Ausência de decifrar (teste de contrato/reflection).
- Auditoria de acesso sem ciphertext.

## 10. Fora de escopo

- Cifra/decifra.
- Geração de envelopes.
- Schema de conteúdo (cliente).
- Rotação automática de senhas.