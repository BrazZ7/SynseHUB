import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * O ícone de quando o Synse vira aplicativo na tela inicial do iPhone.
 *
 * ── O defeito que este teste existe para prender ─────────────────────────────
 *
 * O arquivo estava em `public/apple-icon.png`. Ele respondia 200 no endereço,
 * tinha o tamanho certo, aparecia no repositório — e **o iPhone nunca o viu**,
 * porque quem emite o `<link rel="apple-touch-icon">` é a convenção de arquivo
 * do Next, e ela só vale dentro de `src/app`. Em `public` o PNG é um arquivo
 * estático que ninguém aponta.
 *
 * O sintoma não é erro nenhum: "Adicionar à Tela de Início" funciona, e o iOS,
 * sem link para seguir, usa **uma captura da página** como ícone. Fica um
 * quadradinho com texto ilegível no lugar da marca, e nada em lugar algum diz
 * que faltou coisa. Foi assim em produção até 22/10/2026.
 *
 * Mover de volta para `public` recria o defeito sem quebrar um só teste de
 * tela, e é por isso que a verificação é o caminho do arquivo.
 *
 * ── Por que o tamanho entra ──────────────────────────────────────────────────
 *
 * O Next lê a largura e a altura do cabeçalho do PNG e escreve `sizes` a partir
 * delas. Um arquivo de 64×64 geraria `sizes="64x64"`: link válido, ícone
 * embaçado no aparelho. 180×180 é o que o iOS pede na densidade @3x.
 */

const RAIZ = join(__dirname, '..', '..', '..')

/** Largura e altura do IHDR — os primeiros 8 bytes são a assinatura do PNG. */
function tamanhoDoPng(caminho: string): { largura: number; altura: number } {
  const bytes = readFileSync(caminho)
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return { largura: bytes.readUInt32BE(16), altura: bytes.readUInt32BE(20) }
}

describe('o ícone do iOS na tela inicial', () => {
  it('mora onde a convenção do Next o lê, e não em `public`', () => {
    expect(existsSync(join(RAIZ, 'src/app/apple-icon.png'))).toBe(true)

    /*
     * A cópia em `public` não é inofensiva: as duas iam divergir, e a errada é
     * justamente a que responde no endereço que o link aponta.
     */
    expect(existsSync(join(RAIZ, 'public/apple-icon.png'))).toBe(false)
  })

  it('está versionado', () => {
    /*
     * A lição é do `apple-raiz.pem`: o `.gitignore` do Next ignora extensões
     * inteiras, o arquivo continua no disco e a suíte passa enquanto o deploy
     * sai sem ele. Conferir o disco não basta.
     */
    const rastreados = execSync('git ls-files src/app', { cwd: RAIZ, encoding: 'utf8' })
    expect(rastreados.split('\n')).toContain('src/app/apple-icon.png')
  })

  it('tem os 180×180 que o iOS pede', () => {
    expect(tamanhoDoPng(join(RAIZ, 'src/app/apple-icon.png'))).toEqual({
      largura: 180,
      altura: 180,
    })
  })

  it('declara o modo aplicativo, que é o que tira a barra do Safari', () => {
    /*
     * O iOS ignora o manifesto para instalar na tela inicial — ele lê estas
     * meta-tags. Sem `capable`, o atalho abre dentro do Safari, com barra de
     * endereço em cima e barra de navegação embaixo brigando com a do Synse.
     */
    const layout = readFileSync(join(RAIZ, 'src/app/layout.tsx'), 'utf8')
    expect(layout).toMatch(/appleWebApp:\s*\{/)
    expect(layout).toMatch(/capable:\s*true/)
  })
})
