# Domínio — Audit

## 1. Responsabilidade

Registrar, de forma append-only, as ações relevantes de segurança e permitir consulta/exportação por administradores, sem jamais armazenar conteúdo sensível.

## 2. O que auditar

| Categoria | Eventos |
|---|---|
| Autenticação | login, logout, falha, MFA, step-up, recuperação |
| Sessão | criação, renovação, revogação |
| Usuário | convite, ativação, suspensão, exclusão, troca de chave |
| Recurso | criação, edição, movimentação, arquivamento, exclusão |
| Segredo | criação de versão, acesso, revogação, expurgo |
| Permissão | grant, update, revoke |
| Grupo | criação, membro adicionado/removido, manager promovido/rebaixado |
| Pasta | criação, edição, move, exclusão, aplicação de permissão |
| Administração | configuração alterada, rotação de chave, exportação |
| Sistema | falhas de integridade, operações PENDING expiradas |

## 3. O que nunca auditar

- Senha, passphrase, chave privada.
- Segredo em claro ou ciphertext.
- Segredo TOTP, material WebAuthn.
- Token de convite, refresh token, challenge token.
- Payload de envelope.

## 4. Estrutura

```json
{
  "id": "uuid",
  "occurredAt": "2026-11-12T20:00:00Z",
  "actorId": "uuid",
  "actorType": "USER",
  "action": "resource.secret.accessed",
  "targetType": "RESOURCE",
  "targetId": "uuid",
  "metadata": { "version": 3, "channel": "web" },
  "ip": "203.0.113.10",
  "userAgent": "Mozilla/5.0",
  "requestId": "req_...",
  "prevHash": "sha256:...",
  "entryHash": "sha256:..."
}
```

## 5. Regras de negócio

1. O registro é append-only: a aplicação não executa `UPDATE`/`DELETE`.
2. Eventos críticos (permissão, segredo, login, grupo) são escritos na **mesma transação** da operação, quando possível.
3. Eventos secundários podem ser enviados via outbox e projetados por worker.
4. A consulta é restrita a `ADMIN`, com paginação e filtros.
5. A exportação é assíncrona, gerada por worker e entregue por link curto/temporário (ou download autenticado), sem dados sensíveis.
6. A retenção default é 365 dias; o expurgo remove apenas registros fora da janela e preserva a cadeia de hash (último hash de cada dia).
7. A cadeia de hash (Fase 5) usa `prev_hash` + `entry_hash`; qualquer alteração quebra a cadeia e é detectada por verificação periódica.
8. O ator de sistema (`SYSTEM`) é usado para jobs; o ator `ADMIN` para ações administrativas manuais.
9. O IP e o user agent são preservados; dados pessoais além disso não são incluídos.
10. Nenhuma auditoria contém informação que permita reconstruir um segredo.

## 6. Invariantes

- Toda ação sensível gera exatamente um registro (ou um registro por item em lote).
- Nenhum registro sem `action`, `actor_type`, `occurred_at`.
- Nenhum registro alterável.
- Nenhuma cadeia de hash quebrada sem alerta.
- Nenhum dado sensível em `metadata`.

## 7. Eventos

O Audit **consome** eventos dos outros módulos; não publica eventos de domínio próprios além de:

| Evento | Payload |
|---|---|
| `audit.exported.v1` | `exportId`, `requestedBy`, `range` |
| `audit.integrity.failed.v1` | `brokenAt`, `recordId` |

## 8. API

| Método | Rota | Permissão |
|---|---|---|
| GET | `/audit?action=&targetType=&targetId=&actorId=&from=&to=&page=` | ADMIN |
| GET | `/audit/export` | ADMIN |
| GET | `/audit/integrity` | ADMIN |

## 9. Testes obrigatórios

- Registro de cada evento obrigatório.
- Ausência de campos sensíveis (varredura de payload).
- Append-only (UPDATE/DELETE bloqueados).
- Filtros e paginação.
- Permissão admin.
- Exportação sem segredos.
- Cadeia de hash válida/invadida.
- Retenção/expurgo preservando cadeia.

## 10. Fora de escopo

- SIEM externo (integração futura).
- Análise comportamental/UEBA.
- Retenção legal por jurisdição (configurável).
- Armazenamento em blockchain.