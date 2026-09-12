import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalDocument, Section } from '@/components/synse/legal-document'
import { LEGAL } from '@/config/app'

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Que dados o Synse trata, por quê, com quem compartilha e por quanto tempo guarda.',
}

export default function PrivacidadePage() {
  return (
    <LegalDocument title="Política de Privacidade">
      <p>
        Este documento descreve o que o Synse faz com os seus dados. Ele é escrito para ser lido —
        se alguma parte estiver confusa, escreva para o contato no fim da página e ela será
        reescrita.
      </p>

      <Section title="Dois papéis diferentes, e a diferença importa">
        <p>
          Sobre os dados da sua <strong>conta pessoal</strong> — nome, e-mail, Synse ID, suas
          corridas, seus desafios — quem decide é o Synse, como controlador.
        </p>
        <p>
          Sobre os dados que existem <strong>por causa da sua academia</strong> — treinos prescritos,
          avaliações físicas, mensalidades, presenças — quem decide é a academia. Ali o Synse é
          operador: guarda e processa a pedido dela. Por isso, para apagar o que a academia
          registrou sobre você, o pedido começa nela; e por isso a academia continua vendo o que
          registrou mesmo depois de você sair, na medida em que a lei exigir dela.
        </p>
        <p>
          Seu Synse ID e o seu histórico pessoal são seus, e continuam com você se trocar de
          academia ou sair de todas.
        </p>
      </Section>

      <Section title="O que é coletado">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Cadastro:</strong> nome, e-mail, telefone, e a senha guardada apenas como hash
            pelo provedor de autenticação.
          </li>
          <li>
            <strong>Saúde:</strong> peso, medidas, objetivos, lesões e restrições que você ou seu
            profissional registrarem. A LGPD chama isso de dado sensível, e o tratamento depende do
            seu consentimento específico — que você dá, vê e retira na tela de privacidade do app.
          </li>
          <li>
            <strong>Atividade física e localização:</strong> ao gravar uma corrida no SynseRun, o
            app registra a posição do aparelho enquanto a gravação estiver ativa, junto de
            distância, tempo, ritmo e altimetria. A gravação só começa quando você toca em iniciar,
            e para quando você encerra.
          </li>
          <li>
            <strong>Pagamentos:</strong> valores, vencimentos e situação das cobranças. Os dados do
            cartão são digitados no ambiente do provedor de pagamento e{' '}
            <strong>nunca chegam ao Synse</strong> — não guardamos número completo, nem CVV.
          </li>
          <li>
            <strong>Uso:</strong> registros técnicos de acesso e erro, usados para operar e
            investigar problemas.
          </li>
        </ul>
      </Section>

      <Section title="Por que cada coisa é tratada">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Execução do contrato</strong> (art. 7º, V): manter sua conta, sua matrícula, seus
            treinos e suas cobranças funcionando.
          </li>
          <li>
            <strong>Consentimento</strong> (art. 7º, I e art. 11, I): dados de saúde, fotos de
            progresso, aparecer em rankings e comunicações de novidades. Cada um é registrado com a
            versão do documento e a data, e pode ser retirado.
          </li>
          <li>
            <strong>Obrigação legal</strong> (art. 7º, II): guarda de registros fiscais e de acesso
            pelos prazos que a lei exige.
          </li>
          <li>
            <strong>Legítimo interesse</strong> (art. 7º, IX): segurança, prevenção a fraude e
            manutenção do serviço, sempre no mínimo necessário.
          </li>
        </ul>
      </Section>

      <Section title="Com quem os dados são compartilhados">
        <p>
          Com a sua academia, quando você está vinculado a uma. Com o profissional que atende você,
          no que ele precisa para atender. E com os fornecedores que sustentam o serviço:
          infraestrutura de banco de dados e autenticação, hospedagem da aplicação, e o provedor de
          pagamentos que emite as cobranças.
        </p>
        <p>
          Esses fornecedores tratam dados a nosso mando e nos limites deste documento. Parte da
          infraestrutura pode estar fora do Brasil; nesse caso a transferência se apoia nas
          hipóteses do art. 33 da LGPD, com cláusulas contratuais de proteção.
        </p>
        <p>
          O Synse <strong>não vende</strong> os seus dados e não os entrega para publicidade de
          terceiros.
        </p>
      </Section>

      <Section title="Rankings e o que os outros veem">
        <p>
          Nada do que você registra aparece para outras pessoas por padrão. Ranking, comparação e
          qualquer exibição do seu nome ao lado dos seus números dependem do consentimento
          específico &quot;aparecer em rankings&quot;, que começa desligado e você pode desligar de
          novo quando quiser.
        </p>
      </Section>

      <Section title="Por quanto tempo fica guardado">
        <p>
          Enquanto a sua conta existir. Depois de encerrada, os dados pessoais são apagados ou
          anonimizados, salvo o que a lei mandar guardar — registros fiscais e de acesso — pelos
          prazos legais. Registros de consentimento são mantidos como prova do que foi autorizado e
          quando, inclusive depois da revogação: é essa guarda que permite responder mais tarde se o
          tratamento tinha base.
        </p>
      </Section>

      <Section title="Seus direitos">
        <p>
          A LGPD (art. 18) garante confirmação e acesso, correção, anonimização ou eliminação,
          portabilidade, informação sobre compartilhamento, e revogação do consentimento. No app,
          parte disso está a um toque na tela de privacidade. O resto — inclusive a exclusão da
          conta — você pede por{' '}
          <a className="text-synse-primary hover:underline" href={`mailto:${LEGAL.contactEmail}`}>
            {LEGAL.contactEmail}
          </a>
          , e a resposta vem em até 15 dias.
        </p>
      </Section>

      <Section title="Segurança">
        <p>
          O acesso aos dados é isolado por conta e por academia no próprio banco de dados, e não
          apenas na tela: uma requisição que tente ler dados de outra academia é negada no servidor.
          Senhas nunca trafegam nem ficam guardadas em texto. Nenhuma medida elimina risco por
          completo — se acontecer um incidente relevante, você e a ANPD serão comunicados.
        </p>
      </Section>

      <Section title="Menores de idade">
        <p>
          Menores de 16 anos só podem usar o Synse com consentimento específico de um dos pais ou do
          responsável legal, que a academia coleta no ato da matrícula. Entre 16 e 18, o uso depende
          de assistência do responsável.
        </p>
      </Section>

      <Section title="Mudanças neste documento">
        <p>
          Quando o texto mudar de forma relevante, a versão muda junto, e o app pede novamente o seu
          aceite — o registro anterior continua guardado com a versão antiga. Você pode conferir a
          versão em vigor no alto desta página e o que você aceitou na tela de privacidade do app.
        </p>
        <p>
          <Link href="/termos" className="text-synse-primary hover:underline">
            Ver os Termos de Uso
          </Link>
        </p>
      </Section>
    </LegalDocument>
  )
}
