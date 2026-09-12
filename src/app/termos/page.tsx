import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalDocument, Section } from '@/components/synse/legal-document'
import { LEGAL } from '@/config/app'

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'As regras de uso do Synse: conta, vínculo com academia, pagamentos e limites.',
}

export default function TermosPage() {
  return (
    <LegalDocument title="Termos de Uso">
      <p>
        Ao criar uma conta no Synse você concorda com o que está escrito aqui. Se não concordar com
        alguma parte, não crie a conta — e se já criou, pode encerrá-la a qualquer momento.
      </p>

      <Section title="O que o Synse é">
        <p>
          O Synse é um ecossistema de saúde e treino. O SynseHub é o painel que a academia usa para
          gerir alunos, planos, presenças e cobranças. O aplicativo do aluno mostra treino, evolução,
          desafios e corridas. O Synse Pay intermedia a cobrança da mensalidade entre a academia e o
          aluno.
        </p>
        <p>
          O Synse é uma <strong>ferramenta</strong>. Quem presta o serviço de treino é a academia ou
          o profissional que atende você — não o Synse.
        </p>
      </Section>

      <Section title="Sua conta e o Synse ID">
        <p>
          Cada pessoa tem uma conta, com um Synse ID vitalício. A conta é pessoal e intransferível, e
          você responde pelo que acontece nela: guarde a sua senha e não a compartilhe.
        </p>
        <p>
          Os dados que você informa precisam ser verdadeiros. Cadastro com dado falso pode ser
          suspenso — não por formalidade, mas porque treino e avaliação prescritos sobre informação
          errada fazem mal a você.
        </p>
      </Section>

      <Section title="Vínculo com academia">
        <p>
          Você pode usar o Synse sozinho ou vinculado a uma academia. O vínculo se faz com o código
          de convite dela, e a matrícula só passa a valer quando a academia confirmar.
        </p>
        <p>
          Enquanto o vínculo existir, a academia vê os dados necessários para atender você e é
          responsável pelo que registra. Ao sair, a sua conta pessoal e o seu histórico continuam com
          você.
        </p>
      </Section>

      <Section title="Pagamentos">
        <p>
          <strong>Mensalidade da academia.</strong> O valor, a periodicidade e as condições são
          definidos pela academia, e o contrato é entre você e ela. O Synse emite a cobrança e
          repassa o valor à academia, retendo apenas a comissão combinada com ela. Cancelamento,
          reembolso e ausências se resolvem com a academia.
        </p>
        <p>
          <strong>Assinaturas do Synse.</strong> Recursos adicionais da sua conta pessoal, e o perfil
          profissional, são assinaturas cobradas pelo próprio Synse, renovadas automaticamente até
          que você cancele. Cancelar interrompe a renovação seguinte; o período já pago continua
          valendo até o fim.
        </p>
        <p>
          Os dados do seu cartão são digitados no ambiente do provedor de pagamento e não são
          guardados pelo Synse.
        </p>
      </Section>

      <Section title="Treino, saúde e o que isto não é">
        <p>
          O conteúdo do Synse — treinos base, planos alimentares base, desafios, metas e estimativas
          como calorias — é <strong>informação de apoio, não indicação médica</strong>. Nada aqui
          diagnostica, trata ou substitui a avaliação de um profissional de saúde.
        </p>
        <p>
          Antes de começar ou mudar um programa de exercícios, especialmente se você tem alguma
          condição de saúde, converse com um médico. Se sentir dor, tontura ou falta de ar durante o
          exercício, pare.
        </p>
      </Section>

      <Section title="SynseRun: o que esperar do GPS">
        <p>
          A gravação de corrida usa o GPS do seu aparelho, e a precisão depende dele e do ambiente.
          Dentro de prédios, em ruas estreitas entre edifícios altos ou com o sinal fraco, a posição
          erra — o app mostra a margem declarada pelo aparelho justamente para isso ficar visível.
          Distância, ritmo e calorias são <strong>estimativas</strong>.
        </p>
        <p>
          No navegador, a gravação depende da tela ligada e do aplicativo aberto: se o celular
          bloquear ou o app for para segundo plano por muito tempo, o sistema operacional interrompe
          a leitura de posição e um trecho do percurso se perde. Isso é limite da plataforma, não
          defeito do Synse.
        </p>
        <p>
          Preste atenção ao trânsito e ao caminho. Não use o aplicativo enquanto dirige.
        </p>
      </Section>

      <Section title="Uso aceitável">
        <p>
          Não é permitido tentar acessar dados de outras pessoas ou de outras academias, sobrecarregar
          ou sondar a infraestrutura, automatizar cadastros, burlar limites de plano, nem enviar
          conteúdo ilegal, ofensivo ou de terceiros sem autorização.
        </p>
        <p>
          Falsear resultado de desafio ou de ranking também entra aqui: o prêmio é simbólico, mas a
          confiança de quem compete honestamente não é.
        </p>
      </Section>

      <Section title="Suspensão e encerramento">
        <p>
          Você pode encerrar sua conta quando quiser, escrevendo para{' '}
          <a className="text-synse-primary hover:underline" href={`mailto:${LEGAL.contactEmail}`}>
            {LEGAL.contactEmail}
          </a>
          . O Synse pode suspender ou encerrar contas que descumpram estes termos, com aviso prévio
          sempre que for possível dar.
        </p>
        <p>
          Encerrada a conta, os dados seguem o que está na{' '}
          <Link href="/privacidade" className="text-synse-primary hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </Section>

      <Section title="Disponibilidade e responsabilidade">
        <p>
          O Synse é oferecido no estado em que se encontra, e o serviço pode ficar indisponível por
          manutenção ou por falha de terceiros dos quais ele depende. Fazemos o possível para avisar
          e para restabelecer rápido.
        </p>
        <p>
          O Synse não responde pelo serviço prestado pela academia ou pelo profissional, nem por
          decisões que você tome com base nas estimativas do aplicativo. Responde, sim, pelo que a
          lei brasileira lhe atribui — inclusive o Código de Defesa do Consumidor, quando aplicável.
        </p>
      </Section>

      <Section title="Mudanças, lei e foro">
        <p>
          Quando estes termos mudarem de forma relevante, a versão muda junto e o aceite é pedido de
          novo, ficando registrado. Aplica-se a lei brasileira, e fica eleito o foro do domicílio do
          consumidor para as questões que dele decorrerem.
        </p>
      </Section>
    </LegalDocument>
  )
}
