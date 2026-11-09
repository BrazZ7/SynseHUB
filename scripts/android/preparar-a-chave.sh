#!/usr/bin/env bash
#
# Prepara a chave de assinatura do Android e diz exatamente o que colar no
# GitHub. Roda em qualquer sistema com Java — Linux, Windows (Git Bash ou WSL),
# macOS, ou um Codespace no navegador.
#
#   bash scripts/android/preparar-a-chave.sh
#
# ── O que ele faz ───────────────────────────────────────────────────────────
#
#   1. gera o keystore (uma vez na vida do produto);
#   2. escreve o base64 dele num arquivo, porque segredo do GitHub é texto;
#   3. imprime a lista do que colar, com o nome de cada segredo.
#
# ── O que ele não faz, de propósito ─────────────────────────────────────────
#
# **Não imprime a sua senha em lugar nenhum.** Ela é lida sem aparecer na tela,
# vai para o keytool por variável de ambiente — não por argumento, que ficaria
# visível em `ps` para qualquer processo da máquina — e some quando o script
# termina. Quem precisa dela depois é você, do seu gerenciador de senhas.
#
# **Não manda nada para nenhum lugar.** Os arquivos ficam na sua máquina. Subir
# o segredo para o GitHub é o passo que você faz no navegador, e é de propósito
# que seja assim: uma chave de assinatura que passa por um chat ou aparece num
# log de build deixou de ser sua.

set -euo pipefail

DESTINO="${1:-$HOME/synse-chave}"
KEYSTORE="$DESTINO/synse-release.jks"
BASE64="$DESTINO/synse-release.jks.base64.txt"
ALIAS="synse"

azul() { printf '\033[1;34m%s\033[0m\n' "$*"; }
erro() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

# ── Java existe? ────────────────────────────────────────────────────────────
if ! command -v keytool >/dev/null 2>&1; then
  erro "Não achei o 'keytool', que vem com o Java."
  cat >&2 <<'AJUDA'

Como resolver, do mais fácil para o menos:

  • Windows ou Linux com Android Studio instalado: o keytool já está lá, em
    jbr/bin dentro da pasta do Studio. Abra o terminal do Studio.
  • Ubuntu/Debian/WSL:  sudo apt install -y openjdk-17-jdk-headless
  • macOS com Homebrew: brew install openjdk@17
  • Termux no Android:  pkg install openjdk-17
  • Nenhum computador:  abra este repositório num Codespace do GitHub
    (botão Code → Codespaces → Create). Ele roda no navegador, já tem Java,
    e é a sua conta — a chave nasce lá dentro, não num log público.

AJUDA
  exit 1
fi

# ── Já existe chave? Então pare. ────────────────────────────────────────────
if [ -e "$KEYSTORE" ]; then
  erro "Já existe $KEYSTORE."
  erro "Gerar outra por cima troca a chave do produto, e a Play recusa"
  erro "atualização assinada com chave diferente. Se é mesmo isso que você"
  erro "quer, mova a antiga para outro lugar primeiro — não apague."
  exit 1
fi

azul "── A chave de assinatura do Synse ──"
cat <<'AVISO'

Isto acontece UMA VEZ na vida do produto.

  Perder esta chave = não poder mais atualizar o app na Play.
  Vazar esta chave  = outra pessoa poder assinar em seu nome.

Então, antes de continuar: tenha onde guardar. Gerenciador de senhas, com
cópia. Não o Drive sem senha, não anexo de e-mail, não aqui.

AVISO

read -r -p "Seu nome completo (vai dentro do certificado): " NOME
if [ -z "${NOME// }" ]; then
  erro "O nome não pode ficar vazio."
  exit 1
fi

# `read -s` não ecoa. Duas vezes, porque errar a senha aqui só aparece meses
# depois, na primeira atualização que você não consegue publicar.
read -r -s -p "Senha da chave (mínimo 6 caracteres): " SENHA; echo
read -r -s -p "A mesma senha, de novo: " CONFIRMA; echo

if [ "$SENHA" != "$CONFIRMA" ]; then
  erro "As duas senhas não são iguais. Nada foi criado; rode de novo."
  exit 1
fi
if [ "${#SENHA}" -lt 6 ]; then
  erro "O keytool exige pelo menos 6 caracteres. Nada foi criado."
  exit 1
fi
unset CONFIRMA

# O diretório nasce só aqui, depois de toda validação: antes disso o script
# diz "Nada foi criado" quando recusa, e isso tem de ser verdade.
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

# ── Gerar ───────────────────────────────────────────────────────────────────
# `-storepass:env` em vez de `-storepass`: por argumento, a senha fica visível
# na lista de processos da máquina enquanto o comando roda.
export SYNSE_SENHA="$SENHA"
unset SENHA

echo
azul "Gerando a chave (RSA 4096, 10.000 dias)… leva alguns segundos."
keytool -genkeypair \
  -keystore "$KEYSTORE" \
  -storepass:env SYNSE_SENHA \
  -keypass:env SYNSE_SENHA \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=$NOME, O=Synse, C=BR" \
  >/dev/null 2>&1

chmod 600 "$KEYSTORE"

# ── Virar texto ─────────────────────────────────────────────────────────────
# `-w 0` é GNU; o macOS usa `-i`. Tentar os dois é mais curto que detectar.
if base64 -w 0 "$KEYSTORE" > "$BASE64" 2>/dev/null; then :
else base64 -i "$KEYSTORE" | tr -d '\n' > "$BASE64"; fi
chmod 600 "$BASE64"

DIGITAL=$(keytool -list -v -keystore "$KEYSTORE" -storepass:env SYNSE_SENHA -alias "$ALIAS" 2>/dev/null \
  | grep -i 'SHA256:' | head -1 | sed 's/.*SHA256: *//')
unset SYNSE_SENHA

# ── O que fazer agora ───────────────────────────────────────────────────────
echo
azul "── Pronto. Agora quatro segredos no GitHub ──"
cat <<FIM

Abra:

  https://github.com/BrazZ7/SynseHUB/settings/secrets/actions

E crie quatro, com "New repository secret". Os nomes têm de ser exatamente
estes — o workflow procura por eles:

  1. ANDROID_KEYSTORE_BASE64
     O conteúdo de: $BASE64
     É uma linha longa. Abra o arquivo, selecione tudo, copie, cole.

  2. ANDROID_KEYSTORE_PASSWORD   a senha que você acabou de digitar
  3. ANDROID_KEY_ALIAS           $ALIAS
  4. ANDROID_KEY_PASSWORD        a mesma senha do item 2

Depois disso, o pacote assinado sai de:

  Actions → "Android — pacote assinado" → Run workflow

── Guarde isto antes de fechar o terminal ──

  $KEYSTORE
  e a senha, no gerenciador de senhas.

O GitHub guarda o segredo cifrado e **não devolve**: ele serve para assinar,
não como cópia de segurança. A cópia é sua.

Quando tiver guardado, o arquivo de base64 não precisa mais existir:

  rm "$BASE64"

── A digital deste certificado ──

  SHA-256: ${DIGITAL:-(não consegui ler)}

**Não é esta que vai na Vercel.** Com o App Signing da Play ligado — que é o
padrão —, a digital que faz o link abrir no app é a da chave **da Google**, e
ela aparece na Play Console em "Integridade do app → Assinatura de apps". Esta
aqui é a da sua chave de upload, e serve só para você reconhecer o arquivo.
Trocar as duas não dá erro nenhum: o link simplesmente continua abrindo no
navegador, para sempre.

FIM
