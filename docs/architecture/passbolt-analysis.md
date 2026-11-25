# Engenharia Reversa do Passbolt — Análise

> **Aviso**: a pasta `reverse-engine/` fornecida no briefing **não existe** no workspace. Esta análise foi produzida a partir de fontes públicas oficiais (documentação, white paper e código aberto). Onde não há confirmação, o item está marcado como **hipótese**.

## 1. Fontes consultadas

| Fonte | Uso |
|---|---|
| [Passbolt Security White Paper v5.10 (mar/2026)](https://www.passbolt.com/docs/files/security_white_paper_-_passbolt_pro_edition_v5.10_-_(march_2026_-_rev10).pdf) | Modelo de segurança, ciclo de vida, chaves |
| [How Passbolt Secures Your Data](https://www.passbolt.com/docs/user/introduction/how-passbolt-secures-your-data/) | E2EE, metadados, recovery |
| [Roles and Permissions](https://www.passbolt.com/docs/admin/user-provisioning/roles-and-permissions/) | Matriz READ/UPDATE/OWNER, grupos, pastas |
| [How to share resources](https://www.passbolt.com/docs/user/basic-features/browser/share-resource/) | Compartilhamento, rekey, invariantes |
| [How to Work with Groups](https://www.passbolt.com/docs/user/advanced-features/groups/) | Grupos, entrada/saída, re-criptografia |
| [Introducing Folders](https://www.passbolt.com/blog/introducing-the-new-folders-feature) | Semântica de permissão de pasta |
| [OpenPGP in Passbolt](https://www.passbolt.com/docs/hosting/openpgp/) | Chaves do servidor e do usuário |
| [passbolt_api — entidades](https://github.com/passbolt/passbolt_api/tree/master/src/Model/Entity) | Nomes de campos e constantes |
| [Security White Paper v5.4](https://www.passbolt.com/docs/files/security_white_paper_-_passbolt_pro_edition_v5.4_-_(august_2025_-_rev9).pdf) | Histórico e detalhes de autenticação |

## 2. Fatos confirmados

### 2.1 Modelo de segurança

| Fato | Evidência / implicação para o projeto |
|---|---|
| O servidor nunca vê segredos em claro. | A cifragem/decifragem ocorre no cliente. O backend só persiste ciphertext. |
| Cada segredo é cifrado uma vez por usuário com acesso. | Modelo de **envelope por destinatário**, não cofre simétrico compartilhado. |
| O usuário possui par de chaves OpenPGP; a privada fica no dispositivo. | O backend armazena apenas chave pública, fingerprint e metadados. |
| A chave privada não é armazenada no servidor por padrão. | O escrow, se existir, precisa ser **cifrado pela passphrase no cliente** e opcional. |
| A passphrase nunca sai do dispositivo. | O servidor não participa do desbloqueio da chave privada. |
| Segredos são assinados digitalmente. | Formato de envelope deve suportar assinatura do autor. |
| A identidade do servidor é verificada pelo cliente (chave pública do servidor). | Publicar chave/JWKS do servidor e permitir pinning por fingerprint. |
| O Passbolt usa GnuPG no servidor para **autenticação** e pré-validação, não para decifrar segredos. | No nosso projeto, o servidor valida estrutura e assinaturas possíveis; não decifra. |
| Algoritmos: RSA 3072/4096 ou ECC Curve25519/EdDSA; AES-256; SHA-256/512. | Adotar ECC por padrão, RSA como compatibilidade. |

### 2.2 Permissões

| Fato | Implicação |
|---|---|
| Três níveis: **Owner**, **Update**, **Read**. | Mesma matriz no SecureVault. |
| Update pode editar e excluir; **não** pode compartilhar. | Regra explícita na policy. |
| Owner pode editar, excluir e **gerenciar permissões**. | Compartilhar exige OWNER. |
| Read apenas lê/utiliza. | Sem escrita. |
| Um recurso precisa ter **pelo menos um owner**. | Validação transacional. |
| Permissão efetiva considera a maior entre permissão direta e de grupo. | Resolução centralizada. |
| Permissão de pasta é **template**, aplicada em criação, movimentação e mudança de permissão da pasta. | Não impor continuamente; documentar exceções. |
| Mover item exige UPDATE no item e UPDATE na pasta de destino (regra geral). | Policy composta. |
| Só quem tem acesso a um segredo pode compartilhá-lo (limitação E2EE). | O servidor não consegue re-criptografar sozinho. |

### 2.3 Grupos e rekey

| Fato | Implicação |
|---|---|
| Grupo possui membros e **pelo menos um group manager**. | Modelo com papel MEMBER/MANAGER. |
| Adicionar membro a grupo exige que um manager **re-criptografe** os segredos do grupo no cliente. | Operação não pode ser feita só pelo servidor; precisa de cliente online. |
| Remover membro apaga os envelopes daquele usuário e remove acesso futuro. | Job transacional de revogação. |
| Só é possível adicionar membro a grupo que compartilha segredos se houver alguém com acesso para cifrar. | Fluxo de rekey obrigatório. |
| Sincronização de diretório não adiciona membros automaticamente a grupos com segredos. | Integrações futuras devem respeitar isso. |

### 2.4 Autenticação

| Fato | Implicação |
|---|---|
| Passbolt usa **GpgAuth**: desafio/resposta com chave privada, sem senha. | Nosso desenho usa senha + MFA, mas mantém abstração para desafio de chave. |
| Cada tentativa usa um desafio aleatório diferente. | Previne replay. |
| MFA disponível: TOTP, YubiKey/WebAuthn, Duo. | Adotar TOTP e WebAuthn. |
| Token de autenticação é persistido com expiração por tipo. | Sessões e refresh tokens com expiração e revogação. |

### 2.5 Dados e ciclo de vida

| Fato | Implicação |
|---|---|
| Metadados v5 podem ser cifrados opcionalmente. | Nosso v1 usa metadados em claro; v2 no roadmap. |
| Existe histórico de segredos e de permissões (plugins de log). | Nosso modelo versiona segredos e audita permissões. |
| Soft delete é usado em usuários, grupos, recursos. | Adotar `deleted_at` com expurgo posterior. |
| Chaves possuem `armored_key`, `fingerprint`, `key_id`, `bits`, `expires`, `uid`, `type`. | Modelo `user_public_keys` espelha esses campos. |
| Permissão usa `aco`/`aro` polimórfico e bitmask (READ=1, UPDATE=7, OWNER=15). | Nosso modelo usa enums + ARO/ACO explícitos; bitmask é alternativa. |

## 3. Inferências (não confirmadas)

| Inferência | Grau de confiança | Como validar |
|---|---|---|
| A tabela de pastas segue o mesmo padrão ACO/ARO de recursos. | Alto | Código do plugin de folders / API pública. |
| O histórico de segredos fica em plugin separado (`secrets_history`). | Alto | Repositório e schema. |
| A cópia de segredo por usuário é a única forma de acesso; não há DEK compartilhada. | Alto | White paper + entidades `Secret`. |
| O servidor valida a estrutura OpenPGP, mas não verifica assinatura de mensagens cifradas. | Médio | Código de validação; a assinatura só é verificável após decifrar. |
| O rekey de grupo é síncrono no cliente que executa a operação. | Alto | Docs de grupos. |
| O Passbolt não usa fila para re-criptografia. | Alto | Docs afirmam que processo em background não pode fazê-lo. |

## 4. O que adotar, adaptar ou rejeitar

### Adotar

- E2EE por envelope, uma cópia por usuário.
- Separação Resource (metadados) × Secret (cifrado).
- Permissões READ/UPDATE/OWNER com owner obrigatório.
- Permissão efetiva = maior entre direta e grupo.
- Grupos com manager e rekey obrigatório na entrada/saída.
- Pastas como template de permissão.
- Auditoria de ações sensíveis.
- Chave pública + fingerprint + versionamento de formato.
- Soft delete e expurgo.

### Adaptar

| Passbolt | SecureVault | Motivo |
|---|---|---|
| CakePHP + MariaDB/PostgreSQL | NestJS + Prisma + PostgreSQL | Stack obrigatória do briefing. |
| GpgAuth (desafio de chave) | Senha Argon2id + MFA + sessão JWT | Usabilidade e stack; abstração para desafio no futuro. |
| Extensão de navegador para renderizar a UI | SPA Vue 3 same-origin | Stack obrigatória; a extensão não é requisito. |
| Permissão bitmask + ACO/ARO genérico | Enums + tabelas de permissão explícitas | Clareza, integridade e tipagem. |
| `authentication_tokens` genérico | `user_sessions` + refresh tokens | Modelo mais simples e auditável. |
| Histórico em plugins | Tabelas versionadas + audit log | Controle e consulta. |
| Chave privada somente local | Local + escrow opcional cifrado | Recuperação entre dispositivos. |

### Rejeitar

- Armazenar chave privada em claro ou cifrada por chave do servidor.
- Descriptografar segredos no backend.
- Usar cofre simétrico compartilhado.
- Microsserviços para cada domínio.
- Criptografia caseira.
- Registrar payload de segredo em log.
- Aplicar permissão de pasta de forma contínua e irreversível.

## 5. Diferenças de segurança que precisam de decisão explícita

1. **Recuperação de conta**: Passbolt usa recovery kit e, opcionalmente, account recovery com aprovação de admin. Nosso desenho oferece recovery kit + escrow opcional cifrado pela passphrase. O escrow não permite ao admin ler segredos.
2. **Autenticação**: senha + MFA é mais fraca que desafio de chave contra phishing. Mitigações: WebAuthn (resistente a phishing), rate limit, device binding. O login por assinatura de desafio fica como evolução.
3. **Metadados em claro**: facilitam busca e administração, mas expõem nomes/URLs. A v2 cifrará metadados mantendo um índice pesquisável opcional (hash/tokens).
4. **Revoke de grupo**: a cópia corrente é apagada, mas o usuário pode ter guardado o segredo antes. Documentar que **revogação não é rotação**; para acesso sensível, trocar a senha.

## 6. Conclusão da análise

O Passbolt confirma que o modelo correto para este produto é **E2EE por envelope + permissões por recurso/pasta + grupos com rekey no cliente**. A stack proposta (NestJS + Vue + PostgreSQL) permite reproduzir esses princípios sem copiar a implementação. Os pontos que exigem decisão do revisor estão listados no `docs/README.md`.