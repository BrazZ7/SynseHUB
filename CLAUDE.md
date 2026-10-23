# SynseHub — instruções do projeto

Painel de gestão das academias e app do aluno do ecossistema Synse. Next.js 15
(App Router, RSC, Server Actions), Supabase com RLS, Postgres como dono das
regras. Produto comercial multi-inquilino: cada academia é um inquilino, e o
isolamento entre elas é responsabilidade do banco, não da aplicação.

Referências que já existem e continuam valendo:

- `README.md` — como subir, modo de demonstração, roteiro de teste.
- `docs/pre-producao.md` — o que falta para produção, migrations pendentes e a
  regra de registro de cada uma.

## Comandos

| O quê | Comando |
| --- | --- |
| Testes | `npm test` |
| Só lógica pura | `npm run test:unit` |
| Só banco | `npm run test:db` |
| Tipos | `npm run typecheck` |
| Lint | `npm run lint` |
| Build | `npm run build` |

### O banco de teste precisa estar no ar

Os testes de banco **pulam em silêncio** quando não há Postgres, e uma suíte com
13 arquivos pulados termina em verde. Antes de confiar numa rodada completa:

```bash
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/synse-pgdata -o '-p 5433 -k /tmp' start"
```

Conferir o número de arquivos que rodaram, não só a cor do resultado.

## Regras inegociáveis

Vieram do dono do produto e de defeitos que já custaram caro:

- **Permissão se valida no servidor.** O front-end usa `can()` apenas para
  esconder UI. Toda escrita passa por `requirePermission` antes de tocar em
  dados, e a RLS ainda aplica por cima.
- **Nunca armazenar dados completos de cartão.**
- **Nunca confiar no front-end para confirmar pagamento.**
- **Nunca hard-code da taxa de 2%** — ela mora em `organization_billing_settings`.
- **Código específico de gateway fica no adapter**, não espalhado pelo sistema.
  O Asaas saiu por causa da taxa e não há substituto escolhido: hoje só existe o
  provedor simulado, e o Synse Pay está engavetado.
- **Segredos não entram no código.** `.env.local` local, `.env.example` versionado.
- **Nunca publicar métrica pessoal do usuário sem consentimento.**
- Nunca pedir nem aceitar chave de API, `service_role` ou senha colada no chat.

## Convenções que os testes protegem

- **Arquivo `'use server'` só exporta função assíncrona.** Constantes e tipos vão
  para um `state.ts` irmão. Guardado por `tests/unit/use-server-exports.test.ts`.
- **Toda migration termina se registrando:**
  ```sql
  insert into schema_migrations (version) values ('00NN_nome.sql') on conflict do nothing;
  ```
  Guardado por `tests/db/schema-migrations.test.ts`.
- **Publicar não é migrar.** A Vercel publica no push; o SQL é colado à mão no
  Supabase. Entre um e outro o código novo fala com o banco velho, então toda
  leitura tolera coluna ausente e `/api/health?deep=1` informa `pendingMigrations`.
- **Número derivado é calculado pelo banco, não recebido do cliente.** IMC,
  densidade corporal, percentual de gordura e lotação de turma são gravados por
  gatilho. Valor de saúde ou de vaga vindo do formulário não é confiável.
- Toda tabela nova entra com RLS e política explícita na mesma migration.

## Colaboração com o Codex CLI

O Codex entra como **revisor**, nunca como autor. Ele lê o repositório e aponta
problemas; quem altera o código é o Claude. Isso mantém uma única mão escrevendo
e um segundo par de olhos conferindo — que é o valor real de ter dois modelos.

### O fluxo

1. **Claude implementa** a funcionalidade e roda os testes.
2. **Ao concluir uma alteração relevante**, Claude chama o Codex para revisar.
   "Relevante" é: migration nova, regra de negócio, permissão, dinheiro, dado de
   saúde, ou qualquer mudança que atravesse mais de um arquivo. Ajuste de texto
   e correção de lint não precisam de revisão.
3. **A chamada é sempre em modo somente leitura:**
   ```bash
   codex exec --sandbox read-only "<prompt>"
   ```
   O prompt precisa conter **o objetivo da tarefa** e **o que mudou** — sem isso o
   Codex revisa o repositório inteiro e devolve generalidade. Modelo:

   ```bash
   codex exec --sandbox read-only "Objetivo: <o que a tarefa precisava resolver>.

   Alterações a revisar:
   - <arquivo>: <o que mudou e por quê>
   - <arquivo>: <idem>

   Aponte problemas concretos: correção, segurança, multi-inquilino (vazamento
   entre academias), condição de corrida e cobertura de teste. Para cada
   problema, cite o arquivo e a linha e proponha a correção. Não altere código."
   ```
4. **Codex responde** com problemas concretos, arquivos afetados e sugestões.
5. **Claude analisa cada apontamento.** Confirmado, corrige e roda os testes
   adequados. Não confirmado — e acontece, o revisor não tem o contexto todo —
   Claude diz por que não procede, em vez de mudar o código para agradar.
6. **No máximo duas rodadas de revisão por tarefa.** Se ao fim da segunda ainda
   houver divergência, ela vai para o usuário decidir, não para uma terceira volta.

### Limites

- **Nunca** `codex mcp-server`. A colaboração é por terminal.
- **Nunca** desligar a proteção de execução: sem `--dangerously-bypass-approvals-and-sandbox`,
  sem `--sandbox danger-full-access`, sem `--yolo`. A revisão é leitura.
- O Codex não recebe segredo: ele lê o repositório, e `.env.local` não está nele.

### Autenticação

`codex exec` exige credencial da OpenAI, que é separada da assinatura do Claude.
Conferir com `codex login status`. Sem credencial a revisão falha com 401 — nesse
caso Claude segue sem ela e **avisa** que a revisão não aconteceu, em vez de
relatar uma revisão que não houve.
