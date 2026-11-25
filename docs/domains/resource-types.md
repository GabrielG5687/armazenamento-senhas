# Domínio — Resource Types

## 1. Responsabilidade

Definir modelos versionados de credenciais, com schemas de campos, para que o cliente saiba como serializar/validar o conteúdo em claro antes de cifrar.

## 2. Tipos padrão (v1)

| Slug | Nome | Campos principais |
|---|---|---|
| `login-password` | Login e senha | `username`, `password` (secret), `uri`, `notes` |
| `database` | Banco de dados | `host`, `port`, `database`, `username`, `password` |
| `server` | Servidor | `hostname`, `port`, `username`, `password`, `sshKey` |
| `wifi` | Wi-Fi | `ssid`, `password`, `security` |
| `api-key` | API Key | `key`, `environment`, `scopes[]` |
| `token` | Token | `token`, `expiresAt`, `audience` |
| `custom` | Personalizado | definido pelo usuário/admin |

## 3. Schema versionado

Cada versão é imutável e declarada em JSON Schema:

```json
{
  "version": 1,
  "fields": [
    { "key": "username", "label": "Usuário", "type": "string", "required": false, "secret": false },
    { "key": "password", "label": "Senha", "type": "string", "required": true, "secret": true },
    { "key": "uri", "label": "URL", "type": "url", "required": false, "secret": false }
  ]
}
```

- `secret: true` indica que o campo só existe dentro do conteúdo cifrado.
- O servidor **não** consegue validar os valores (estão cifrados); a validação é feita no cliente.
- O servidor valida apenas que o schema é bem formado, versionado e pertence ao tipo.

## 4. Regras de negócio

1. Tipos padrão são criados por seed e não podem ser excluídos, apenas desativados.
2. Novos tipos exigem `ADMIN`.
3. Uma nova versão de schema nunca altera versões anteriores.
4. Recursos referenciam `resource_type_id` + `resource_type_version` no momento da criação.
5. Se o schema mudar, recursos antigos continuam na versão antiga até serem re-salvos pelo cliente.
6. O cliente deve recusar versões de schema que não suporte.
7. Campos secretos nunca aparecem em metadados, logs ou respostas não autorizadas.
8. O schema não pode conter expressões, scripts ou referências externas (segurança).
9. Tipos desativados não podem ser usados em novos recursos, mas os existentes continuam legíveis.

## 5. Invariantes

- Toda versão pertence a um tipo.
- Nenhuma versão é mutável após publicada.
- Todo recurso aponta para uma versão existente.
- Nenhum schema contém segredo.

## 6. Eventos

| Evento | Payload |
|---|---|
| `resource_type.created.v1` | `resourceTypeId`, `slug` |
| `resource_type.version.created.v1` | `resourceTypeId`, `version` |
| `resource_type.deactivated.v1` | `resourceTypeId` |

## 7. API

| Método | Rota | Permissão |
|---|---|---|
| GET | `/resource-types` | autenticado |
| GET | `/resource-types/:slug/versions/:version` | autenticado |
| POST | `/resource-types` | ADMIN |
| POST | `/resource-types/:slug/versions` | ADMIN |
| PATCH | `/resource-types/:slug` | ADMIN (ativar/desativar) |

## 8. Testes obrigatórios

- Seed dos tipos padrão.
- Criação de versão imutável.
- Validação de schema (sem script, sem campos duplicados).
- Recurso antigo mantém versão.
- Tipo desativado bloqueia novos recursos.
- Compatibilidade cliente/servidor.

## 9. Fora de escopo

- Validação de valores cifrados.
- Migração automática de conteúdo entre versões.
- Campos calculados ou referências dinâmicas.