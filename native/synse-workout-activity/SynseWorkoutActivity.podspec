require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# O CocoaPods lê daqui o que compilar no alvo iOS. `ios.deployment_target` é
# 16.1 porque é a versão em que o ActivityKit passou a existir — abaixo disso a
# Live Activity não compila.
Pod::Spec.new do |s|
  s.name = 'SynseWorkoutActivity'
  s.version = package['version']
  s.summary = package['description']
  s.license = 'UNLICENSED'
  s.homepage = 'https://synse.com.br'
  s.author = 'Synse'
  s.source = { :git => 'https://github.com/BrazZ7/SynseHUB.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '16.1'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
