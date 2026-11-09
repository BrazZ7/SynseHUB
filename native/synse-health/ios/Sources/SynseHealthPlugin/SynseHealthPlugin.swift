import Capacitor
import Foundation
import HealthKit

/**
 Leitura de peso e composição corporal do Apple Saúde.

 ── O que o HealthKit tem, e o que ele não tem ────────────────────────────────

 Peso, percentual de gordura, massa magra e IMC existem como tipos. **Massa
 óssea, água corporal e metabolismo basal não existem** — o `basalEnergyBurned`
 que parece servir é energia *acumulada* num período, não a taxa metabólica
 basal; somar um dia inteiro dele e chamar de metabolismo basal daria um número
 parecido e errado. Ficam de fora.

 ── A negativa que não se pode ler ────────────────────────────────────────────

 O HealthKit não revela negativa de **leitura**: `authorizationStatus(for:)`
 só reporta escrita. É decisão de projeto da Apple — se o app soubesse que a
 pessoa escondeu um tipo, ele deduziria a condição de saúde dela pelo próprio
 silêncio. Na prática: depois da folha de permissão, consultar é a única forma
 de saber, e voltar vazio é ambíguo entre "negou" e "não tem dado". O
 `authoritative: false` leva essa ambiguidade até a tela, em vez de afirmar
 acesso que não se tem.
 */
@objc(SynseHealthPlugin)
public class SynseHealthPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SynseHealthPlugin"
  public let jsName = "SynseHealth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "readSamples", returnType: CAPPluginReturnPromise),
  ]

  private let store = HKHealthStore()

  /// Os tipos pedidos, e o que cada um vira do lado do Synse.
  private var tiposDeLeitura: Set<HKObjectType> {
    var tipos = Set<HKObjectType>()
    for identificador in [
      HKQuantityTypeIdentifier.bodyMass,
      .bodyFatPercentage,
      .leanBodyMass,
      .bodyMassIndex,
    ] {
      if let tipo = HKQuantityType.quantityType(forIdentifier: identificador) {
        tipos.insert(tipo)
      }
    }
    return tipos
  }

  @objc func isAvailable(_ call: CAPPluginCall) {
    guard HKHealthStore.isHealthDataAvailable() else {
      // iPad não tem o app Saúde. Não é falha: é a plataforma.
      call.resolve(["available": false, "provider": NSNull(), "reason": "NO_HEALTH_DATA"])
      return
    }
    call.resolve(["available": true, "provider": "apple_health"])
  }

  @objc func requestPermissions(_ call: CAPPluginCall) {
    guard HKHealthStore.isHealthDataAvailable() else {
      call.resolve(["granted": false, "authoritative": true])
      return
    }

    store.requestAuthorization(toShare: [], read: tiposDeLeitura) { apresentou, erro in
      if let erro {
        call.reject("Não foi possível pedir acesso ao Saúde.", nil, erro)
        return
      }
      /*
       `apresentou` diz que a folha foi mostrada sem erro — não que a leitura
       foi concedida. Ver o comentário no topo: no iOS isso não é legível.
       */
      call.resolve(["granted": apresentou, "authoritative": false])
    }
  }

  @objc func openSettings(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      // `x-apple-health://` abre o app Saúde; as permissões por app ficam lá.
      if let url = URL(string: "x-apple-health://"), UIApplication.shared.canOpenURL(url) {
        UIApplication.shared.open(url)
      } else if let ajustes = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(ajustes)
      }
      call.resolve()
    }
  }

  @objc func readSamples(_ call: CAPPluginCall) {
    guard
      let textoDe = call.getString("from"), let textoAte = call.getString("to"),
      let de = Self.data(de: textoDe), let ate = Self.data(de: textoAte)
    else {
      call.reject("Janela de leitura inválida.")
      return
    }
    let teto = call.getInt("limit") ?? 2000

    let periodo = HKQuery.predicateForSamples(withStart: de, end: ate, options: [.strictStartDate])
    let maisRecentesPrimeiro = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

    let pedidos: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
      (.bodyMass, "PESO", HKUnit.gramUnit(with: .kilo)),
      // `HKUnit.percent()` devolve FRAÇÃO (0,22). O ×100 aqui é o que impede
      // o Synse de publicar "0,22% de gordura".
      (.bodyFatPercentage, "GORDURA_PERCENTUAL", HKUnit.percent()),
      (.leanBodyMass, "MASSA_MAGRA", HKUnit.gramUnit(with: .kilo)),
      (.bodyMassIndex, "IMC", HKUnit.count()),
    ]

    let grupo = DispatchGroup()
    var coletadas: [[String: Any]] = []
    var falha: Error?
    let trava = NSLock()

    for (identificador, tipoSynse, unidade) in pedidos {
      guard let tipo = HKQuantityType.quantityType(forIdentifier: identificador) else { continue }
      grupo.enter()

      let consulta = HKSampleQuery(
        sampleType: tipo, predicate: periodo, limit: teto,
        sortDescriptors: [maisRecentesPrimeiro]
      ) { _, amostras, erro in
        defer { grupo.leave() }
        if let erro {
          trava.lock(); falha = falha ?? erro; trava.unlock()
          return
        }

        let convertidas: [[String: Any]] = (amostras as? [HKQuantitySample] ?? []).map { amostra in
          var valor = amostra.quantity.doubleValue(for: unidade)
          if tipoSynse == "GORDURA_PERCENTUAL" { valor *= 100 }

          return [
            "id": amostra.uuid.uuidString,
            "type": tipoSynse,
            "value": valor,
            "measuredAt": Self.iso.string(from: amostra.startDate),
            "sourceApp": amostra.sourceRevision.source.name,
            "sourceDevice": amostra.device?.name ?? NSNull(),
          ]
        }

        trava.lock(); coletadas.append(contentsOf: convertidas); trava.unlock()
      }

      store.execute(consulta)
    }

    grupo.notify(queue: .main) {
      if let falha {
        call.reject("Não foi possível ler o Saúde.", nil, falha)
        return
      }
      call.resolve(["samples": coletadas])
    }
  }

  /*
   Dois formatadores, e não um: `ISO8601DateFormatter` com
   `.withFractionalSeconds` **recusa** uma data sem os milissegundos, e sem a
   opção recusa uma com. O `toISOString()` do JavaScript sempre manda os
   milissegundos, mas depender disso faria a janela de leitura falhar inteira
   no dia em que alguém passasse uma data montada à mão — e a falha apareceria
   como "nenhuma pesagem encontrada", que não aponta para lugar nenhum.
   */
  private static let iso: ISO8601DateFormatter = {
    let formatador = ISO8601DateFormatter()
    formatador.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatador
  }()

  private static let isoSemFracao: ISO8601DateFormatter = {
    let formatador = ISO8601DateFormatter()
    formatador.formatOptions = [.withInternetDateTime]
    return formatador
  }()

  private static func data(de texto: String) -> Date? {
    iso.date(from: texto) ?? isoSemFracao.date(from: texto)
  }
}
