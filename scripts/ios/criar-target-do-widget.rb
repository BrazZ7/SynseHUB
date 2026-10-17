#!/usr/bin/env ruby
# frozen_string_literal: true

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║ O target da Live Activity, criado sem Xcode                              ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# ── Por que este script existe ──────────────────────────────────────────────
#
# `native/synse-workout-activity/ios/Sources/SynseWorkoutLiveActivity.swift`
# tem a Live Activity inteira — 229 linhas, `ActivityConfiguration`, Dynamic
# Island. E ela não aparecia na tela bloqueada de ninguém, porque Live Activity
# exige uma **extensão** própria e o `App.xcodeproj` tinha um target só, o do
# aplicativo. O Swift compilava para dentro do app, onde um `Widget` não faz
# nada: o sistema só carrega widget de extensão.
#
# Criar esse target no Xcode são dez cliques. O problema é que não há Mac neste
# projeto — e editar `project.pbxproj` à mão, num arquivo que é um grafo de
# objetos com identificadores de 24 dígitos e referências cruzadas, produz no
# melhor caso um projeto que abre com erro. Aí o aplicativo inteiro para de
# compilar, não só o widget.
#
# A gem `xcodeproj` (a mesma do CocoaPods, Ruby puro) edita o projeto pela
# estrutura: ela gera os identificadores, mantém as referências e escreve o
# arquivo no formato que o Xcode escreveria. Roda em Linux.
#
# ── Idempotente, e por quê ──────────────────────────────────────────────────
#
# Rodar duas vezes não cria dois targets: o script confere pelo nome e sai.
# Isso é o que permite chamá-lo na CI a cada build, sem depender de alguém
# lembrar — e o que faz dele a fonte da verdade quando alguém apagar o
# `ios/` para regenerar o projeto do Capacitor.
#
# ── O que ele faz ───────────────────────────────────────────────────────────
#
#   1. Cria o target `SynseWorkoutWidget`, do tipo app-extension.
#   2. Põe nele os dois Swift que já existem — por referência, sem copiar — e
#      o `@main` que faltava.
#   3. Embute a extensão no aplicativo (PlugIns) e cria a dependência.
#   4. Liga `VERSIONING_SYSTEM = apple-generic` nos dois, para o `agvtool` da
#      CI conseguir numerar o build.
#   5. Compartilha o scheme `App`, que o projeto não tinha — e sem scheme
#      compartilhado `xcodebuild -scheme App` não acha nada.
#
# ── O que ele NÃO faz, e você precisa saber ─────────────────────────────────
#
# Não compila. Nada aqui prova que o Swift do widget compila, só que o projeto
# está descrito do jeito que a Apple espera. Quem prova é o build na CI
# (`codemagic.yaml`), e depois dele um iPhone de verdade — Live Activity na
# tela bloqueada não se verifica de outro jeito.

require 'xcodeproj'

RAIZ = File.expand_path('../..', __dir__)
PROJETO = File.join(RAIZ, 'ios/App/App.xcodeproj')

TARGET = 'SynseWorkoutWidget'
APP = 'App'

# O id da extensão é filho do id do app. A Apple exige esse prefixo, e é por ele
# que o Codemagic acha o perfil de provisionamento da extensão.
ID_DO_APP = 'br.com.synse.app'
ID_DA_EXTENSAO = "#{ID_DO_APP}.#{TARGET}"

# 16.1 e não 16.0: `ActivityConfiguration` não existe antes disso. O app segue
# em 15.0 — extensão com piso mais alto é permitido, e o iOS simplesmente não
# carrega o widget em aparelho antigo.
IOS_DA_EXTENSAO = '16.1'

# Os dois arquivos que a extensão compartilha com o plugin, pelo caminho
# relativo ao `.xcodeproj`. **Referência, não cópia**: duas cópias do contrato
# divergem, e quando divergem a Live Activity para de receber atualização sem
# erro nenhum.
COMPARTILHADOS = [
  '../../native/synse-workout-activity/ios/Sources/SynseWorkoutAttributes.swift',
  '../../native/synse-workout-activity/ios/Sources/SynseWorkoutLiveActivity.swift',
].freeze

def aviso(texto)
  puts texto
end

projeto = Xcodeproj::Project.open(PROJETO)
app = projeto.targets.find { |t| t.name == APP }
abort "Target #{APP} não encontrado em #{PROJETO}" if app.nil?

if projeto.targets.any? { |t| t.name == TARGET }
  aviso "#{TARGET} já existe. Nada a fazer."
  exit 0
end

# ── O target ────────────────────────────────────────────────────────────────
widget = projeto.new_target(:app_extension, TARGET, :ios, IOS_DA_EXTENSAO)

# A versão acompanha a do app. Divergência aqui é recusa no envio: a App Store
# rejeita extensão com `CFBundleVersion` diferente do aplicativo.
versao_do_app = app.build_configurations.first.build_settings
marketing = versao_do_app['MARKETING_VERSION'] || '1.0'
build = versao_do_app['CURRENT_PROJECT_VERSION'] || '1'

widget.build_configurations.each do |config|
  config.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER' => ID_DA_EXTENSAO,
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'INFOPLIST_FILE' => "#{TARGET}/Info.plist",
    # O plist é nosso, escrito à mão: o gerado automaticamente não carrega o
    # `NSExtensionPointIdentifier`, e sem ele o sistema não reconhece a
    # extensão como widget.
    'GENERATE_INFOPLIST_FILE' => 'NO',
    'IPHONEOS_DEPLOYMENT_TARGET' => IOS_DA_EXTENSAO,
    'SWIFT_VERSION' => '5.0',
    'CODE_SIGN_STYLE' => 'Automatic',
    'MARKETING_VERSION' => marketing,
    'CURRENT_PROJECT_VERSION' => build,
    'VERSIONING_SYSTEM' => 'apple-generic',
    # iPhone e iPad.
    'TARGETED_DEVICE_FAMILY' => '1,2',
    # Extensão não vai para a pasta de instalação do app; ela é embutida.
    'SKIP_INSTALL' => 'YES',
    'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks',
    'ALWAYS_SEARCH_USER_PATHS' => 'NO',
    'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO',
  )
end

# ── Os arquivos ─────────────────────────────────────────────────────────────
grupo = projeto.main_group.new_group(TARGET, TARGET)
grupo.new_reference('Info.plist')
entrada = grupo.new_reference('SynseWorkoutWidgetBundle.swift')
widget.add_file_references([entrada])

# Os compartilhados ficam num grupo próprio para a origem deles ficar óbvia na
# árvore do Xcode — quem abrir o projeto precisa ver que o arquivo mora no
# plugin, e não dentro da extensão.
do_plugin = projeto.main_group.new_group('SynseWorkoutShared')
COMPARTILHADOS.each do |caminho|
  completo = File.join(RAIZ, 'ios/App', caminho)
  abort "Arquivo compartilhado não encontrado: #{completo}" unless File.exist?(completo)
  widget.add_file_references([do_plugin.new_reference(caminho)])
end

# ── A extensão dentro do aplicativo ─────────────────────────────────────────
#
# Sem estas duas coisas o target existe e não vai para lugar nenhum: o `.appex`
# é compilado e fica fora do `.app`, e o widget não aparece. A dependência
# garante a ordem; a fase de cópia põe o resultado em `PlugIns/`.
app.add_dependency(widget)

fase = app.copy_files_build_phases.find { |f| f.symbol_dst_subfolder_spec == :plug_ins }
fase ||= begin
  nova = app.new_copy_files_build_phase('Embed Foundation Extensions')
  nova.symbol_dst_subfolder_spec = :plug_ins
  nova.dst_path = ''
  nova
end
arquivo = fase.add_file_reference(widget.product_reference)
arquivo.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

# O app também precisa do `apple-generic`, senão o `agvtool new-version -all`
# da CI não tem onde escrever o número do build.
app.build_configurations.each do |config|
  config.build_settings['VERSIONING_SYSTEM'] ||= 'apple-generic'
end

projeto.save

# ── O scheme ────────────────────────────────────────────────────────────────
#
# O projeto do Capacitor vem sem scheme compartilhado: o Xcode cria um na
# primeira abertura, dentro de `xcuserdata`, que não é versionado. Em CI isso
# aparece como "scheme App not found" na primeira linha do build — antes de
# qualquer código ser compilado.
pasta_de_schemes = File.join(PROJETO, 'xcshareddata/xcschemes')
caminho_do_scheme = File.join(pasta_de_schemes, "#{APP}.xcscheme")

if File.exist?(caminho_do_scheme)
  aviso 'Scheme App já era compartilhado.'
else
  scheme = Xcodeproj::XCScheme.new
  scheme.add_build_target(app)
  scheme.set_launch_target(app)
  scheme.save_as(PROJETO, APP, true)
  aviso "Scheme compartilhado em #{caminho_do_scheme}"
end

aviso <<~FIM
  #{TARGET} criado.

    tipo           #{widget.product_type}
    bundle id      #{ID_DA_EXTENSAO}
    iOS mínimo     #{IOS_DA_EXTENSAO}
    fontes         #{widget.source_build_phase.files.count}
    embutido em    #{APP} (PlugIns)

  Isto descreve o projeto. Não compila nada: quem compila é o build na CI.
FIM
