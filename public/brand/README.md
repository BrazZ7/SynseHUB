# Assets de marca — Synse

| Arquivo | Uso |
| --- | --- |
| `synse-symbol.svg` | Símbolo isolado (favicon, avatar, app icon, loaders) |
| `synse-logo.svg` | Assinatura horizontal (símbolo + wordmark) |

## Substituindo pelos arquivos oficiais

Os SVGs acima são a reconstrução vetorial da identidade Synse e servem como
fallback versionável. Para usar os arquivos oficiais entregues pelo time de
marca, salve-os como:

```
public/brand/synse-logo.png
public/brand/synse-symbol.png
```

e defina no `.env.local`:

```
NEXT_PUBLIC_BRAND_LOGO=/brand/synse-logo.png
NEXT_PUBLIC_BRAND_SYMBOL=/brand/synse-symbol.png
```

O componente `SynseLogo` lê essas variáveis e passa a renderizar a imagem
oficial no lugar do SVG embutido, sem nenhuma alteração de código.

## Regras de aplicação

- Área de respiro mínima ao redor da assinatura: metade da altura do símbolo.
- Nunca aplicar sombra dura, contorno ou distorção no símbolo.
- Sobre fundos escuros use o wordmark em branco (`SynseLogo` já faz isso via `tone="light"`).
- O gradiente da marca (`#00A98F → #22C7D8`) é reservado para áreas estratégicas:
  logo, CTA principal, indicadores de progresso e banners. Não usar como fundo de página.
