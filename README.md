<div align="center">

# SynseHub

**Saúde em equilíbrio com o seu futuro.**

Painel de gestão das academias do ecossistema Synse — alunos, planos, mensalidades,
treinos, check-in e pagamentos em um único produto.

</div>

---

## Testar agora

O projeto **sobe sem nenhuma configuração**. Sem credenciais de Supabase ele
entra em modo de demonstração, com uma academia completa em memória: 520 alunos,
12 meses de mensalidades, check-ins, treinos e avaliações.

### Na sua máquina

Requer **Node 22 ou mais recente**, disponível em [nodejs.org](https://nodejs.org).

```bash
git clone -b claude/kind-goldberg-c16nsx https://github.com/BrazZ7/SynseHUB.git
cd SynseHUB
npm install
npm run dev
```

Abra `http://localhost:3000` e escolha um perfil na tela de login.

### Com Docker

```bash
docker build -t synsehub .
docker run -p 3000:3000 synsehub
```

### Na Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBrazZ7%2FSynseHUB%2Ftree%2Fclaude%2Fkind-goldberg-c16nsx&project-name=synsehub&repository-name=synsehub)

Ou, para publicar o seu próprio repositório: em **vercel.com → Add New → Project**,
importe `BrazZ7/SynseHUB` e selecione o branch `claude/kind-goldberg-c16nsx`.
O Next.js é detectado automaticamente e **nenhuma variável de ambiente é
necessária** para o modo de demonstração.

### Roteiro de teste

| Perfil | O que vale a pena olhar |
| --- | --- |
| **Emerson Braz** (Proprietário) | Dashboard, financeiro, inadimplentes, Synse Pay |
| **Rafael Nunes** (Professor) | O mesmo dashboard **sem** receita nem inadimplência — o RBAC em ação |
| **Lucas Ferraz** (Recepção) | Check-in: busque um aluno e registre a presença |
| **Aluno Synse App** | A experiência do aluno: treino do dia, check-in, progresso, PIX |
| **Synse Plataforma** (Super admin) | `/synse-admin`: GMV, comissão e organizações |

Vale testar também: cadastrar um aluno em **Alunos → Novo aluno** (ele nasce com
Synse ID e primeira mensalidade), dar baixa numa cobrança em **Inadimplentes →
Cobrar → Registrar pagamento** e ver o painel recalcular, e reduzir a janela do
navegador até a largura de um celular.

---

## Visão do Synse

O Synse é um ecossistema de saúde, fitness e bem-estar operando em **B2B2C**:
a academia contrata a plataforma, e os alunos dela ganham acesso gratuito ao app.
A Synse também pode vender diretamente a esses usuários.

| Produto | O que é | Estado |
| --- | --- | --- |
| **SynseHub** | Painel administrativo da academia | Fase 1 implementada |
| **Synse App** | Área do aluno (PWA responsiva) | Primeira versão |
| **Synse Pay** | Cobranças, split e conciliação | Arquitetura + provedor simulado |
| **Synse+** | Assinatura premium do consumidor | Página de venda |
| **Synse Pro** | Profissionais independentes | Papel e permissões prontos |
| **Synse Market / AI / Corporate** | Marketplace, IA e corporativo | Arquitetura preparada |

### Synse ID

Cada pessoa tem um identificador vitalício no formato `SYN-XXXXXXXX`
(Crockford base32, sem `I`, `L`, `O` e `U`). Ele é **não sequencial** por decisão de
segurança: um ID não permite inferir outro nem estimar o tamanho da base.

A conta sobrevive ao vínculo com a academia. Um aluno que treina dois anos na
Academia Alpha e sai continua com a conta Synse, o histórico e o progresso —
respeitando consentimentos e regras de acesso.

---

## Arquitetura

```text
src/
  app/
    (auth)/          Login e escolha de perfil
    (hub)/           SynseHub — painel da academia
    (student)/       Synse App — experiência do aluno
    synse-admin/     Painel da plataforma (SUPER_ADMIN)
    api/             Webhooks e health check

  components/
    ui/              Primitivas (Radix + CVA), estilo shadcn/ui
    synse/           Componentes da marca: MetricCard, DataTable, ProgressRing…
      charts/        Gráficos Recharts com paleta validada

  features/          Um módulo por domínio: actions, services e telas
    auth/ students/ payments/ checkin/ workouts/ dashboard/ organizations/

  lib/
    auth/            Sessão, guardas de rota e server actions de acesso
    database/        Data sources (demo e Supabase) + clientes
    payments/        Interface PaymentProvider e adapters
    permissions/     RBAC e guarda de servidor
    validations/     Schemas Zod

  db/migrations/     SQL versionado: schema, índices, RLS
  types/             Modelo de domínio
  config/            Configuração pública e navegação
```

### Princípios que a estrutura sustenta

**Multi-tenancy em duas camadas.** Toda consulta filtra por `organization_id`
explicitamente, *e* o Postgres aplica Row Level Security por cima. A redundância é
intencional: se uma policy for afrouxada por engano, a aplicação continua isolada.

**Autorização no servidor.** O front-end usa `can()` apenas para esconder UI.
Cada server action passa por `requirePermission()` antes de tocar em dados.
Esconder um botão nunca é o controle de acesso.

**Gateway atrás de uma interface.** Nenhum código específico de Asaas existe fora de
`lib/payments/providers/asaas.ts`. O resto do sistema conhece apenas
`PaymentProvider` — trocar por Mercado Pago, Stripe ou Pagar.me não toca em regra
de negócio.

**Dinheiro só muda por confirmação externa.** O status de um pagamento muda a partir
de um webhook validado ou de uma consulta ao provedor. Nunca a partir do navegador.

**Lógica fora dos componentes.** Componentes React renderizam. Regra de negócio vive
em `features/*/service.ts`, acesso a dados em data sources, validação em schemas Zod.
As APIs já estão desenhadas para servir também um app React Native no futuro.

---

## Tecnologias

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS 3
Radix UI · Lucide Icons · Recharts · Zod · React Hook Form · TanStack Query
Supabase (Postgres, Auth, Storage, RLS)

---

## Instalação

```bash
git clone https://github.com/BrazZ7/SynseHUB.git
cd SynseHUB
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`.

### Modo demonstração

**Sem nenhuma configuração o projeto já sobe funcionando.** Sem credenciais de
Supabase, o SynseHub usa um data source em memória com uma academia completa:
520 alunos, 12 meses de mensalidades, check-ins, treinos e avaliações. O dataset é
determinístico — os mesmos números em qualquer máquina.

Na tela de login você escolhe o perfil com que quer entrar:

| Perfil | O que enxerga |
| --- | --- |
| **Emerson Braz** — Proprietário | Tudo na organização |
| **Marina Duarte** — Gerente | Operação, alunos e financeiro |
| **Rafael Nunes** — Professor | Treinos, avaliações e alunos; **sem** financeiro |
| **Lucas Ferraz** — Recepção | Check-in, matrículas e cobranças |
| **Aluno Synse App** | A experiência do aluno |
| **Synse Plataforma** — Super admin | Todas as organizações e o GMV |

Não existe senha em modo demonstração: a persona escolhida vira uma sessão em
cookie, e as permissões de cada papel valem normalmente — inclusive as restrições.
O modo só existe quando **não há** Supabase configurado.

### Como a demonstração guarda o que você altera

O dataset base é determinístico e **nunca é alterado**: ele é reconstruído
idêntico em qualquer processo. O que o visitante muda — matricular um aluno, dar
baixa numa cobrança, registrar presença — vira uma entrada num diário guardado
em cookie, reaplicada sobre o dataset base a cada leitura.

Essa separação resolve dois problemas de uma vez:

- **Funciona em serverless.** Na Vercel cada requisição pode cair numa execução
  diferente, com a própria memória. Uma escrita guardada em variável de módulo
  sumiria na navegação seguinte. Viajando no cookie, ela acompanha o visitante.
- **Isola quem testa.** Duas pessoas abrindo o mesmo link têm demonstrações
  independentes. Ninguém estraga a demonstração de ninguém.

O diário guarda no máximo 40 alterações e 3,5 KB. Ao estourar, as mais antigas
saem. O botão **Reiniciar demonstração**, no topo do painel, apaga o diário e
devolve tudo ao estado inicial.

---

## Variáveis de ambiente

Copie `.env.example` para `.env.local`. Nenhum segredo é versionado.

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | sim | URL pública (links de cobrança, webhooks) |
| `NEXT_PUBLIC_SYNSE_ENV` | sim | `development` · `staging` · `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | não¹ | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | não¹ | Chave anônima (sujeita à RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | não² | **Somente servidor.** Ignora RLS |
| `PAYMENT_PROVIDER` | sim | `mock` ou `asaas` |
| `ASAAS_API_KEY` | se `asaas` | Chave da API |
| `ASAAS_API_URL` | se `asaas` | Sandbox ou produção |
| `ASAAS_WEBHOOK_TOKEN` | se `asaas` | Token do webhook. **Sem ele, todo webhook é rejeitado** |
| `SYNSE_DEFAULT_PLATFORM_FEE_PERCENTAGE` | não | Comissão padrão (o valor efetivo vem do banco) |

¹ Sem as duas, a aplicação entra em modo demonstração.
² Necessária para processar webhooks e rodar o seed.

---

## Banco de dados

### Migrations

Quatro arquivos versionados em `src/db/migrations`, aplicados em ordem:

| Arquivo | Conteúdo |
| --- | --- |
| `0001_core.sql` | Perfis, organizações, equipe, planos, alunos, matrículas |
| `0002_payments.sql` | Contas, cobranças, pagamentos, split, webhooks, régua |
| `0003_training_health_content.sql` | Check-in, treinos, avaliações, nutrição, conteúdo, CRM, LGPD |
| `0004_rls.sql` | Row Level Security em todas as tabelas |

```bash
npm run db:migrate                      # lista as migrations e como aplicá-las
npm run db:migrate -- --print > db.sql  # SQL consolidado

# Aplicar via Supabase CLI
supabase link --project-ref <project-ref>
supabase db push
```

### Seed

```bash
npm run db:seed
```

Cria uma academia, seis profissionais, cinco planos, vinte alunos com mensalidades,
check-ins e avaliações.

**Nenhuma senha é gerada.** As contas de demonstração nascem no Supabase Auth com
e-mail confirmado e sem senha — o acesso é por magic link. Não existe credencial
fixa no repositório nem no banco.

---

## Estrutura de usuários e permissões

| Papel | Escopo |
| --- | --- |
| `SUPER_ADMIN` | Plataforma Synse: organizações, GMV, assinaturas, webhooks |
| `OWNER` | Controle completo da sua organização |
| `MANAGER` | Administrativo, sem alterar configurações nem estornar |
| `RECEPTIONIST` | Alunos, pagamentos, check-in e agenda |
| `TRAINER` | Treinos, avaliações e alunos atribuídos |
| `NUTRITIONIST` | Área nutricional dos pacientes autorizados |
| `PROFESSIONAL` | Profissional independente (Synse Pro) |
| `STUDENT` | Synse App |

A matriz completa está em `src/lib/permissions/permissions.ts` e é visível na
interface em **Configurações → Permissões**.

Três camadas independentes protegem cada acesso:

1. `requireHubSession(permission)` barra a rota antes de renderizar.
2. `requirePermission(session, permission)` barra cada server action.
3. Row Level Security barra a query, mesmo que as duas primeiras falhem.

---

## Synse Pay

### Trocando de provedor

```ts
// Todo o sistema depende apenas disto:
const provider = getPaymentProvider()
await provider.createPix({ ... })
```

Para adicionar um gateway, implemente `PaymentProvider`
(`src/lib/payments/provider.ts`) e registre na fábrica em
`src/lib/payments/index.ts`. Nenhuma tela muda.

### Split

A comissão da Synse **nunca** está fixa no código. Ela vem de
`organization_billing_settings` (percentual, taxa fixa e quem absorve a tarifa do
provedor) e é alterável apenas pela plataforma — a própria academia não edita a
própria comissão. O cálculo vive em `src/lib/payments/split.ts` e garante que a
soma feche com o valor cobrado, sem centavo perdido.

### Webhooks

```
POST /api/webhooks/payments/asaas
```

- O token do cabeçalho é comparado em **tempo constante**. Sem `ASAAS_WEBHOOK_TOKEN`
  configurado, todo webhook é rejeitado — nunca aceito por omissão.
- **Idempotência por constraint:** `webhook_events` tem `UNIQUE (provider, event_id)`.
  O mesmo evento reenviado falha no INSERT, é reconhecido e ignorado. Não existe
  liquidação em duplicidade.
- Uma confirmação grava, na mesma transação lógica: baixa da cobrança, registro do
  pagamento, split calculado e entrada na trilha de auditoria.

### Configurando o Asaas

```env
PAYMENT_PROVIDER=asaas
ASAAS_API_KEY=<sua-chave>
ASAAS_API_URL=https://api-sandbox.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=<token-forte-gerado-por-você>
```

Cadastre o webhook no painel do Asaas apontando para
`{NEXT_PUBLIC_APP_URL}/api/webhooks/payments/asaas` com o mesmo token.

> **Estado da integração:** o adapter foi escrito contra a API do Asaas mas **ainda
> não foi exercitado contra uma instância real**. O projeto roda com
> `PAYMENT_PROVIDER=mock` por padrão. Valide em sandbox — em especial o payload de
> split e o formato do webhook — antes de ir a produção.

---

## Privacidade e LGPD

Dados de saúde (avaliações físicas e planos nutricionais) recebem tratamento
próprio:

- Acesso restrito por papel **e** por policy no banco. Um recepcionista não lê
  avaliação física; um professor não lê plano nutricional.
- Plano nutricional individual só existe com profissional responsável: a coluna
  `author_staff_id` é `NOT NULL` com `ON DELETE RESTRICT`. O sistema não emite
  prescrição clínica nem interpreta medidas automaticamente.
- Consentimento versionado por finalidade, com data de aceite e de revogação.
- Ranking é opt-in duplo: o desafio precisa ter ranking ativo **e** o participante
  precisa ter autorizado. Métrica pessoal nunca aparece sem consentimento.
- Trilha de auditoria em operações críticas, imutável pelo cliente
  (`INSERT WITH CHECK (false)` na chave anônima).
- Minimização: nenhum dado de cartão trafega ou é armazenado pelo Synse.

---

## Scripts

```bash
npm run dev          # desenvolvimento
npm run build        # build de produção
npm run start        # servidor de produção
npm run lint         # ESLint
npm run typecheck    # TypeScript strict
npm run format       # Prettier
npm run db:migrate   # migrations
npm run db:seed      # dados de demonstração
```

---

## Identidade visual

Os tokens vivem em `src/app/globals.css` e são consumidos pelo Tailwind. O tema
escuro redefine apenas as variáveis — nenhuma classe de componente muda.

| Token | Claro | Escuro |
| --- | --- | --- |
| `--synse-bg` | `#F5FAF8` | `#041D1B` |
| `--synse-surface` | `#FFFFFF` | `#082925` |
| `--synse-primary` | `#00A98F` | `#17C4A5` |
| `--synse-cyan` | `#22C7D8` | `#35D6E6` |
| `--synse-text` | `#102B29` | `#E6F5F1` |

O gradiente da marca (`#00A98F → #22C7D8`) é reservado para áreas estratégicas:
logo, CTA principal, indicadores de progresso e banners.

**As paletas dos gráficos foram validadas** para banda de luminosidade, piso de
croma, separação sob daltonismo (protanopia, deuteranopia, tritanopia) e contraste
contra a superfície do card — nos dois temas, com passos próprios em cada um.
Os valores estão em `src/components/synse/charts/chart-theme.ts`.

O SynseHub é executivo; o Synse App é inspiracional. Ambos pertencem visivelmente à
mesma marca.

---

## Roadmap

### Fase 1 — implementada

Autenticação · Multi-tenancy com RLS · Layout e navegação por papel · Dashboard com
métricas derivadas · Gestão de alunos com filtros e paginação · Perfil do aluno em
abas · Planos · Mensalidades · Financeiro · Inadimplentes com régua · Synse Pay
simulado · Check-in por QR Code e recepção · Treinos · Synse App · Painel da
plataforma · Landing page

### Fase 2

Integração real de pagamento · Webhooks em produção · Split ao vivo · Assinaturas
recorrentes · Régua automatizada com disparo · Avaliações com registro pelo
profissional · Biblioteca de conteúdo · Receitas · Programas Synse 21/30/60/90 ·
Synse+

### Fase 3

Nutrição profissional · Synse Pro · Gamificação e desafios · CRM avançado ·
Marketplace · Wearables · Synse AI

**Synse AI** não é construída agora, mas a arquitetura já a acomoda: ela responderá
apenas sobre dados que o usuário autorizou e não substitui diagnóstico médico.

---

## O que ainda não está pronto

Honestidade sobre o estado atual:

- **Escritas em produção não foram exercitadas.** O data source Supabase foi escrito
  contra o schema das migrations, mas nenhuma instância real foi provisionada. O que
  roda hoje é o data source de demonstração.
- **O adapter do Asaas não foi testado contra a API.** Sem credenciais, o provedor
  padrão é `mock`, e a interface sinaliza isso em tela.
- **Não há suíte de testes automatizados.** A validação até aqui é typecheck, lint,
  build e verificação manual das rotas.
- **Módulos marcados "em breve"** na navegação (agenda, nutrição, conteúdos,
  desafios, CRM, relatórios, notificações) têm modelo de dados e permissões, mas
  ainda não têm tela.
- **O QR Code do totem** é um padrão visual determinístico, não um QR Code
  escaneável. A assinatura do payload com o segredo da organização entra junto com
  o app nativo.

---

<div align="center">

**Disciplina hoje. Liberdade sempre.**

Saúde é a base de tudo.

</div>
