# Domínio — Resources

## 1. Responsabilidade

Representar os metadados não secretos de uma credencial e seu ciclo de vida. **Resource nunca contém segredo em claro**; o conteúdo sensível vive em `Secrets`.

## 2. Separação obrigatória

| Conceito | Conteúdo | Busca | Cifrado |
|---|---|---|---|
| Resource | nome, usuário, URL, descrição, tipo, pasta, status | sim | não (v1) |
| Secret | senha, chave, token, notas | não | sim, por envelope |

## 3. Regras de negócio

1. Todo recurso pertence a um tipo (`resource_type`) e a uma versão de schema.
2. `name` é obrigatório; `username`, `uri` e `description` são opcionais.
3. `uri` deve ser válida (`http/https`, `ftp`, `ssh`, `wifi`, esquema customizado permitido) quando informada.
4. O criador é registrado em `created_by`; toda alteração em `updated_by`.
5. O recurso nasce com o criador como **OWNER**.
6. O recurso pode estar em no máximo uma pasta ativa (`folder_resources` com unique parcial).
7. Status: `ACTIVE`, `ARCHIVED`, `TRASHED`.
8. Exclusão é soft delete (`deleted_at`), com expurgo após 30 dias na lixeira.
9. Todo recurso deve ter ao menos um OWNER ativo; operações que violem isso são rejeitadas.
10. A listagem só retorna recursos para os quais o usuário tem ao menos `READ` efetivo (direta ou grupo).
11. A busca textual considera apenas metadados autorizados; nunca ignora permissão.
12. Metadados em claro são pesquisáveis; a v2 poderá cifrá-los (roadmap).
13. `metadata` JSONB é para dados flexíveis não sensíveis; não substitui relacionamentos.
14. Alteração de nome/URL/descrição não re-cifra segredo; alteração de segredo é feita em `Secrets`.
15. Recursos arquivados não aparecem na lista padrão, mas continuam acessíveis aos donos.
16. Exclusão revoga envelopes do segredo corrente (hard delete) e agenda expurgo das versões antigas.

## 4. Invariantes

- Nenhum recurso sem tipo.
- Nenhum recurso sem OWNER.
- Nenhum recurso em duas pastas ativas.
- Nenhuma listagem sem filtro de permissão.
- Nenhuma escrita sem `UPDATE`/`OWNER` conforme a operação.

## 5. Eventos

| Evento | Payload |
|---|---|
| `resource.created.v1` | `resourceId`, `ownerId`, `resourceTypeId`, `folderId?` |
| `resource.updated.v1` | `resourceId`, `changedFields[]` |
| `resource.moved.v1` | `resourceId`, `fromFolderId?`, `toFolderId?` |
| `resource.archived.v1` | `resourceId` |
| `resource.deleted.v1` | `resourceId`, `actorId` |

## 6. API

| Método | Rota | Permissão |
|---|---|---|
| GET | `/resources` | READ (filtra por acesso) |
| POST | `/resources` | UPDATE na pasta de destino (se houver) |
| GET | `/resources/:id` | READ |
| PATCH | `/resources/:id` | UPDATE |
| DELETE | `/resources/:id` | UPDATE |
| GET | `/resources/search?q=` | READ (filtra por acesso) |
| POST | `/resources/:id/move` | UPDATE no recurso + UPDATE na pasta destino |

## 7. Contratos

```ts
interface ResourcesPublicService {
  getResourceMeta(resourceId: string): Promise<ResourceMeta>;
  listReadableResourceIds(userId: string, filter?: ResourceFilter): Promise<string[]>;
  assertOwnerExists(resourceId: string): Promise<void>;
}
```

## 8. Cenários de borda

| Cenário | Comportamento |
|---|---|
| Recurso sem OWNER após remoção | 409, operação revertida |
| Mover para pasta sem UPDATE | 403 |
| Excluir recurso compartilhado | exige UPDATE; envelopes revogados |
| Nome duplicado | permitido (não há unicidade), desambiguado por ID |
| URI inválida | 422 |
| Busca sem permissão | não retorna o item |
| Recurso em lixeira | não aparece na busca padrão |

## 9. Testes obrigatórios

- CRUD com permissões READ/UPDATE/OWNER.
- Filtro de listagem por acesso direto e por grupo.
- Integridade de OWNER (criação, remoção, exclusão).
- Move entre pastas.
- Soft delete e expurgo.
- Busca sem vazamento.
- Validação de URI e tamanho de campos.

## 10. Fora de escopo

- Conteúdo do segredo.
- Permissões de pasta (ver `folders`).
- Cifragem de metadados.