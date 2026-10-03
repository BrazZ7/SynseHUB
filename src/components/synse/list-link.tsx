'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, type ComponentProps } from 'react'

/**
 * ── O elo de linha de lista ──────────────────────────────────────────────────
 *
 * O `<Link>` do Next busca no servidor **todo elo que entra na tela**. Medido
 * no navegador: abrir a lista de alunos disparava 34 pedidos, 21 deles fichas
 * de aluno que ninguém pediu. Em produção cada um desses paga
 * `supabase.auth.getUser()` mais a leitura do perfil antes de renderizar
 * qualquer coisa — são duas idas à rede por pedido especulativo, competindo
 * com o clique que a pessoa de fato deu.
 *
 * `prefetch={false}` resolve o excesso e cria outro problema: medido, ele não
 * busca nem ao passar o mouse, então o clique fica esperando uma ida ao
 * servidor antes de a tela reagir.
 *
 * Este componente fica no meio: nada por entrar na tela, e a busca começa
 * quando o ponteiro chega em cima ou o dedo encosta. No desktop isso dá uns
 * 200 ms de vantagem antes do clique; no celular, o `touchstart` vem antes do
 * `click`, então rende algumas dezenas de milissegundos. Nos dois casos, uma
 * lista de cinquenta linhas busca só as que a pessoa olhou.
 *
 * `router.prefetch` é idempotente e o próprio Next guarda o resultado, mas a
 * marca local evita reentrar a cada tremida do mouse.
 */
export function ListLink({
  href,
  children,
  ...resto
}: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter()
  const jaBuscado = useRef(false)

  const aquecer = useCallback(() => {
    if (jaBuscado.current) return
    jaBuscado.current = true
    router.prefetch(href)
  }, [href, router])

  return (
    <Link
      href={href}
      prefetch={false}
      onPointerEnter={aquecer}
      onTouchStart={aquecer}
      onFocus={aquecer}
      {...resto}
    >
      {children}
    </Link>
  )
}
