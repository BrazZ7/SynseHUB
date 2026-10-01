# Sementes

Conteúdo para colar no SQL Editor do Supabase. **Não são migrations**: não
mudam estrutura, não entram em `schema_migrations` e não aparecem em
`/api/health?deep=1`. São carga de dado, e rodar duas vezes não faz diferença —
cada uma casa pela chave natural do que grava.

| Arquivo                | O que grava                                     |
| ---------------------- | ----------------------------------------------- |
| `programa-21-dias.sql` | O programa guiado `SYNSE_21` e os 21 dias dele. |

## Nada de comando de psql aqui

O SQL Editor do Supabase fala SQL e só: `\set`, `\i` e `:'variavel'` são do
cliente `psql` e morrem ali com `42601 syntax error at or near "\"`. Já custou
uma entrega — o arquivo foi testado numa cópia com essas linhas removidas, que
é o mesmo que não testar o arquivo. Onde a semente precisa de um valor seu, ela
traz um literal marcado com `TROQUE`.

`tests/db/seed-programa-21-dias.test.ts` roda a semente **byte por byte**,
sem filtro nem substituição, e falha se uma dessas linhas voltar.
