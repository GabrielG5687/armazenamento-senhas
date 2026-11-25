# Domínio — Permissions

## 1. Responsabilidade

Centralizar a autorização do sistema. Nenhum controller, use case ou job decide acesso por conta própria: todos chamam `PermissionQueryPort`.

## 2. Modelo

- **ACO** (objeto controlado): `RESOURCE` ou `FOLDER`.
- **ARO** (usuário de acesso): `USER` ou `GROUP`.
- **Nível**: `READ`, `UPDATE`, `OWNER`.

```text
resource_permissions (resource_id, aro_type, aro_id, level)
folder_permissions   (folder_id,   aro_type, aro_id, level)
```

## 3. Matriz de ações

### Recurso

| Ação | READ | UPDATE | OWNER |
|---|---|---|---|
| Ver metadados | ✔ | ✔ | ✔ |
| Ler segredo | ✔ | ✔ | ✔ |
| Editar metadados | ✖ | ✔ | ✔ |
| Editar segredo | ✖ | ✔ | ✔ |
| Excluir | ✖ | ✔ | ✔ |
| Compartilhar/alterar permissões | ✖ | ✖ | ✔ |
| Ver lista de permissões | ✔ | ✔ | ✔ |

### Pasta

| Ação | READ | UPDATE | OWNER |
|---|---|---|---|
| Ver pasta e permissões | ✔ | ✔ | ✔ |
| Renomear/editar | ✖ | ✔ | ✔ |
| Excluir | ✖ | ✔ | ✔ |
| Criar item na pasta | ✖ | ✔ | ✔ |
| Mover item para a pasta | ✖ | ✔ | ✔ |
| Editar permissões da pasta | ✖ | ✖ | ✔ |

## 4. Resolução de permissão efetiva

```text
nivel(usuário, ACO) =
  max(
    permissão_direta(usuário, ACO),
    max(permissão_grupo(g, ACO) para g em grupos_ativos(usuário))
  )
```

- `max(READ, UPDATE) = UPDATE`.
- `max(UPDATE, OWNER) = OWNER`.
- Grupos inativos, usuários suspensos e registros revogados são ignorados.
- A resolução é feita em uma única consulta com CTE/UNION, com índice `(aro_type, aro_id)`.

## 5. Ações e implicações

| Ação | Exige | Implica |
|---|---|---|
| `READ` | READ+ | acesso a metadados e envelope do solicitante |
| `UPDATE` | UPDATE+ | editar metadados/segredo, excluir, mover (com UPDATE no destino) |
| `DELETE` | UPDATE+ | soft delete do recurso |
| `SHARE` | OWNER | criar/alterar/remover permissões e envelopes |

## 6. Regras de negócio

1. Toda operação sensível valida a ação **antes** de tocar no domínio.
2. A autorização usa o ACO correto (recurso ou pasta) e o ARO do ator.
3. Permissão de grupo só vale se o grupo estiver ativo e o usuário com `group_members.removed_at is null`.
4. Permissão direta e de grupo são combinadas pelo **máximo**.
5. Um recurso/pasta deve ter ao menos um OWNER ativo; nenhuma operação pode remover o último.
6. `UPDATE` permite excluir, mas não compartilhar.
7. `OWNER` permite compartilhar, mas não implica acesso a segredos de versões às quais o usuário não tem envelope? Em nosso modelo, OWNER sem envelope é uma inconsistência; a operação deve garantir envelope.
8. Mover recurso exige `UPDATE` no recurso e `UPDATE` na pasta de destino.
9. Mover pasta exige `UPDATE` na pasta e no novo pai.
10. Alterar permissão de pasta aplica a máscara apenas aos itens em que o ator é OWNER.
11. A negação não revela detalhes: 404 para recurso inexistente/sem acesso; 403 quando a existência é conhecida pelo contexto.
12. Nenhuma verificação de permissão é feita no frontend como fonte de verdade.
13. Nenhuma permissão é concedida por tempo de sessão; ela vale até revogação explícita.
14. Toda alteração de permissão é auditada e idempotente.

## 7. Invariantes

- Todo ACO acessível tem ao menos um OWNER.
- Toda permissão aponta para um ARO existente e ativo (validado na escrita).
- Nenhuma permissão duplicada `(aco, aro)`.
- Nenhuma permissão sem ator registrado (`created_by`).
- Nenhuma operação sem policy correspondente.

## 8. Catálogo de policies

| Policy | Ação | Recurso/Pasta | Regra extra |
|---|---|---|---|
| `ResourceReadPolicy` | READ | recurso | existe e não está em lixeira |
| `ResourceUpdatePolicy` | UPDATE | recurso | não expirado |
| `ResourceDeletePolicy` | DELETE | recurso | UPDATE + OWNER remanescente |
| `ResourceSharePolicy` | SHARE | recurso | OWNER |
| `FolderReadPolicy` | READ | pasta | existe |
| `FolderUpdatePolicy` | UPDATE | pasta | não é raiz protegida |
| `FolderDeletePolicy` | DELETE | pasta | vazia ou destino definido |
| `FolderSharePolicy` | SHARE | pasta | OWNER |
| `MoveResourcePolicy` | MOVE | recurso+pasta | UPDATE no recurso e no destino |
| `MoveFolderPolicy` | MOVE | pasta+novo pai | UPDATE em ambos, sem ciclo |

## 9. Enforcement points

| Ponto | Como |
|---|---|
| Controller | `@RequirePermission` + `PermissionGuard` |
| Use case em lote | `PermissionQueryPort.assertCan` explícito |
| Job/worker | contexto de sistema + policy dedicada (nunca bypass) |
| Repositório | filtros de `userId`/`aro` aplicados na query |
| Evento | consumidor revalida permissão antes de agir |

## 10. Concorrência

- Operações de permissão usam transação com `SELECT ... FOR UPDATE` no ACO.
- Verificação de "último OWNER" dentro da transação.
- `updated_at`/`version` para detectar alteração concorrente.

## 11. API

| Método | Rota | Ação |
|---|---|---|
| GET | `/resources/:id/permissions` | READ |
| PUT | `/resources/:id/permissions` | SHARE |
| GET | `/folders/:id/permissions` | READ |
| PUT | `/folders/:id/permissions` | SHARE |
| GET | `/me/permissions` | resolve ACOs acessíveis ao usuário |

## 12. Eventos

| Evento | Payload |
|---|---|
| `permission.granted.v1` | `aco`, `aro`, `level`, `actorId` |
| `permission.updated.v1` | `aco`, `aro`, `from`, `to`, `actorId` |
| `permission.revoked.v1` | `aco`, `aro`, `level`, `actorId` |

## 13. Matriz de testes obrigatória

| Cenário | READ | UPDATE | OWNER |
|---|---|---|---|
| Ler recurso | permitido | permitido | permitido |
| Editar recurso | negado | permitido | permitido |
| Excluir recurso | negado | permitido | permitido |
| Compartilhar | negado | negado | permitido |
| Ver permissões | permitido | permitido | permitido |
| Remover último OWNER | negado | negado | negado |
| Acesso por grupo | conforme nível do grupo | conforme | conforme |
| Grupo sem acesso + direto READ | READ | READ | READ |
| Grupo UPDATE + direto READ | UPDATE | UPDATE | UPDATE |
| Grupo OWNER + direto READ | OWNER | OWNER | OWNER |
| Membro removido do grupo | perde acesso derivado | perde | perde |
| Grupo desativado | ignora | ignora | ignora |
| Usuário suspenso | nega | nega | nega |
| Pasta READ/UPDATE/OWNER | matriz de pasta | | |
| Mover sem UPDATE no destino | negado | negado | negado |

## 14. Testes complementares

- Acesso a recurso inexistente → 404.
- Acesso a recurso sem permissão → 404/403 sem vazamento.
- Concorrência de remoção do último OWNER.
- Alteração de permissão em lote com itens ignorados.
- Auditoria de cada negação.

## 15. Fora de escopo

- Permissões temporárias (time-based) — extensão futura.
- Permissões por campo.
- Compartilhamento externo anônimo.
- Delegação de manager.