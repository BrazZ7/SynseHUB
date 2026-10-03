-- =============================================================================
-- SynseHub · 0023 — Avaliação física
--
-- A tabela `assessments` existe desde a 0003 e o perfil do aluno já desenha o
-- gráfico e a tabela de medidas a partir dela. Nunca houve como escrever uma
-- linha: a aba estava pronta, esperando dado que ninguém podia inserir.
--
-- Duas coisas faltavam além do formulário.
--
-- **As dobras cutâneas.** Avaliação física em academia brasileira é adipômetro
-- e protocolo de Pollock. Guardar só o percentual de gordura digitado joga fora
-- a medida original — e é a medida que permite refazer a conta, comparar com a
-- avaliação anterior e descobrir que o número mudou porque o avaliador mudou,
-- não o aluno.
--
-- **O número derivado não pode ser digitado.** IMC, densidade corporal e
-- percentual de gordura saem de conta, e um valor digitado que discorda do peso
-- e da altura na mesma linha é pior que campo vazio: parece verdade. Um gatilho
-- recalcula na escrita, venha ela de onde vier — tela, importação ou SQL de
-- suporte.
--
-- As fórmulas são as de Jackson & Pollock, com conversão de densidade para
-- percentual pela equação de Siri. Ficam escritas aqui, com os coeficientes
-- visíveis, porque número de saúde errado é plausível: ninguém desconfia de
-- 18,4%.
-- =============================================================================

do $$ begin
  create type assessment_protocol as enum ('MANUAL', 'POLLOCK_3', 'POLLOCK_7');
exception when duplicate_object then null; end $$;

/*
 * As equações são específicas por sexo, e não existe versão validada fora
 * disso. O valor fica na avaliação, e não é lido do perfil na hora do cálculo:
 * quem avalia escolhe qual equação aplicar, o registro guarda a escolha, e a
 * conta continua reproduzível se o perfil mudar depois.
 */
do $$ begin
  create type assessment_sex as enum ('MALE', 'FEMALE');
exception when duplicate_object then null; end $$;

alter table assessments
  add column if not exists protocol          assessment_protocol not null default 'MANUAL',
  add column if not exists protocol_sex      assessment_sex,
  /** Idade no dia da avaliação. Guardada porque a equação usa idade, e a data de nascimento pode ser corrigida depois. */
  add column if not exists age_years         smallint check (age_years between 5 and 120),
  add column if not exists body_density      numeric(6,5),
  /* Dobras cutâneas em milímetros. */
  add column if not exists sf_chest          numeric(4,1) check (sf_chest >= 0 and sf_chest <= 100),
  add column if not exists sf_axilla         numeric(4,1) check (sf_axilla >= 0 and sf_axilla <= 100),
  add column if not exists sf_triceps        numeric(4,1) check (sf_triceps >= 0 and sf_triceps <= 100),
  add column if not exists sf_subscapular    numeric(4,1) check (sf_subscapular >= 0 and sf_subscapular <= 100),
  add column if not exists sf_abdominal      numeric(4,1) check (sf_abdominal >= 0 and sf_abdominal <= 100),
  add column if not exists sf_suprailiac     numeric(4,1) check (sf_suprailiac >= 0 and sf_suprailiac <= 100),
  add column if not exists sf_thigh          numeric(4,1) check (sf_thigh >= 0 and sf_thigh <= 100),
  add column if not exists updated_at        timestamptz not null default now();

comment on column assessments.protocol is
  'Como o percentual de gordura foi obtido. MANUAL aceita o valor digitado (bioimpedância, por exemplo); os de Pollock calculam a partir das dobras.';
comment on column assessments.body_density is
  'Densidade corporal calculada pelo protocolo. Nula quando o percentual foi digitado direto.';

-- ── As contas ────────────────────────────────────────────────────────────────

/**
 * Índice de massa corporal.
 *
 * Altura em centímetros, que é como se anota na ficha. Converter na hora do
 * cálculo evita a confusão clássica de gravar 1,75 numa coluna e 175 em outra.
 */
create or replace function calc_bmi(p_weight_kg numeric, p_height_cm numeric)
returns numeric
language sql immutable as $$
  select case
    when p_weight_kg is null or p_height_cm is null or p_height_cm <= 0 then null
    else round(p_weight_kg / power(p_height_cm / 100.0, 2), 2)
  end;
$$;

/**
 * Densidade corporal por Jackson & Pollock.
 *
 * Três dobras — homens: peitoral, abdômen e coxa; mulheres: tríceps,
 * supra-ilíaca e coxa. Sete dobras: peitoral, axilar média, tríceps,
 * subescapular, abdominal, supra-ilíaca e coxa, para os dois.
 *
 * As faixas validadas são 18 a 61 anos para homens e 18 a 55 para mulheres.
 * Fora delas a conta é extrapolação — a função devolve o valor mesmo assim,
 * porque academia avalia gente de 65 anos, e é a tela que avisa. Recusar
 * deixaria a avaliação sem número nenhum, o que é pior.
 */
create or replace function calc_body_density(
  p_protocol assessment_protocol,
  p_sex assessment_sex,
  p_age numeric,
  p_sum_mm numeric
) returns numeric
language sql immutable as $$
  select case
    when p_protocol = 'MANUAL' or p_sex is null or p_age is null
      or p_sum_mm is null or p_sum_mm <= 0 then null

    when p_protocol = 'POLLOCK_3' and p_sex = 'MALE' then
      round(1.10938 - (0.0008267 * p_sum_mm) + (0.0000016 * p_sum_mm * p_sum_mm)
            - (0.0002574 * p_age), 5)

    when p_protocol = 'POLLOCK_3' and p_sex = 'FEMALE' then
      round(1.0994921 - (0.0009929 * p_sum_mm) + (0.0000023 * p_sum_mm * p_sum_mm)
            - (0.0001392 * p_age), 5)

    when p_protocol = 'POLLOCK_7' and p_sex = 'MALE' then
      round(1.112 - (0.00043499 * p_sum_mm) + (0.00000055 * p_sum_mm * p_sum_mm)
            - (0.00028826 * p_age), 5)

    when p_protocol = 'POLLOCK_7' and p_sex = 'FEMALE' then
      round(1.097 - (0.00046971 * p_sum_mm) + (0.00000056 * p_sum_mm * p_sum_mm)
            - (0.00012828 * p_age), 5)

    else null
  end;
$$;

/** Equação de Siri: densidade corporal vira percentual de gordura. */
create or replace function calc_body_fat(p_density numeric)
returns numeric
language sql immutable as $$
  select case
    when p_density is null or p_density <= 0 then null
    /*
     * O limite inferior existe porque a equação é uma reta ajustada, não uma
     * lei: densidades muito altas produzem percentual negativo, que não é uma
     * pessoa magra — é uma dobra medida errado. Zero é o piso honesto.
     */
    else greatest(round((495 / p_density) - 450, 2), 0)
  end;
$$;

-- ── O gatilho que impede número derivado digitado ────────────────────────────

create or replace function assessment_derive() returns trigger
language plpgsql as $$
declare
  v_soma numeric;
begin
  new.bmi := calc_bmi(new.weight, new.height);

  if new.protocol = 'MANUAL' then
    /*
     * Bioimpedância e outros aparelhos dão o percentual pronto. Aqui o valor
     * digitado vale — mas a densidade não, porque não foi medida.
     */
    new.body_density := null;
  else
    v_soma := case new.protocol
      when 'POLLOCK_3' then
        case new.protocol_sex
          when 'MALE'   then coalesce(new.sf_chest, 0) + coalesce(new.sf_abdominal, 0)
                             + coalesce(new.sf_thigh, 0)
          when 'FEMALE' then coalesce(new.sf_triceps, 0) + coalesce(new.sf_suprailiac, 0)
                             + coalesce(new.sf_thigh, 0)
        end
      when 'POLLOCK_7' then
        coalesce(new.sf_chest, 0) + coalesce(new.sf_axilla, 0) + coalesce(new.sf_triceps, 0)
        + coalesce(new.sf_subscapular, 0) + coalesce(new.sf_abdominal, 0)
        + coalesce(new.sf_suprailiac, 0) + coalesce(new.sf_thigh, 0)
    end;

    new.body_density := calc_body_density(new.protocol, new.protocol_sex, new.age_years, v_soma);
    new.body_fat_percentage := calc_body_fat(new.body_density);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists assessments_derive on assessments;
create trigger assessments_derive
  before insert or update on assessments
  for each row execute function assessment_derive();

comment on function assessment_derive() is
  'Recalcula IMC, densidade e percentual de gordura na escrita. Número derivado nunca vem do cliente: um valor que discorda do peso e da altura na mesma linha parece verdade.';

insert into schema_migrations (version) values ('0023_avaliacao_fisica.sql')
on conflict (version) do nothing;
