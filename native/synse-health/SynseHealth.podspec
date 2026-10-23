require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# `ios.deployment_target` é 15.0: abaixo disso falta `HKSample.sourceRevision`
# com o nome do app, que é o que impede o Synse de reimportar o que ele mesmo
# escreveu no Saúde.
Pod::Spec.new do |s|
  s.name = 'SynseHealth'
  s.version = package['version']
  s.summary = package['description']
  s.license = 'UNLICENSED'
  s.homepage = 'https://synse.com.br'
  s.author = 'Synse'
  s.source = { :git => 'https://github.com/BrazZ7/SynseHUB.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.frameworks = 'HealthKit'
  s.swift_version = '5.9'
end
