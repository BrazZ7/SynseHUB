package br.com.synse.health

import android.content.Intent
import android.os.Build
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.BodyWaterMassRecord
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Leitura de peso e composição corporal do Health Connect.
 *
 * ── O que o Health Connect tem a mais que o HealthKit ────────────────────────
 *
 * Massa óssea, água corporal e taxa metabólica basal existem como tipos aqui e
 * não existem na Apple. O Synse lê os três — e é por isso que a mesma pessoa
 * com a mesma balança vê mais campos no Android. Não é bug: é o que cada
 * plataforma guarda.
 *
 * ── As três armadilhas de unidade ────────────────────────────────────────────
 *
 * 1. `BodyFatRecord.percentage` já vem em **0–100**, ao contrário da Apple, que
 *    entrega fração. Multiplicar aqui daria 2.200% de gordura.
 * 2. `BodyWaterMassRecord` é **massa**, não percentual. A conversão para
 *    percentual é do Synse, porque depende do peso daquela pesagem.
 * 3. `BasalMetabolicRateRecord` é **potência**. `inKilocaloriesPerDay` é a
 *    leitura certa; pegar `inWatts` daria um número cinquenta vezes menor.
 *
 * ── A negativa, aqui, é legível ──────────────────────────────────────────────
 *
 * Diferente do HealthKit, o Health Connect devolve a lista do que foi
 * concedido. Por isso o `authoritative: true`: quando este plugin diz que não
 * tem acesso, ele sabe.
 */
@CapacitorPlugin(name = "SynseHealth")
class SynseHealthPlugin : Plugin() {

  private val escopo = CoroutineScope(Dispatchers.Main)
  private var pedidoDePermissao: ActivityResultLauncher<Set<String>>? = null
  private var chamadaPendente: PluginCall? = null

  private val permissoes = setOf(
    HealthConnectClient.getReadPermission(WeightRecord::class),
    HealthConnectClient.getReadPermission(BodyFatRecord::class),
    HealthConnectClient.getReadPermission(LeanBodyMassRecord::class),
    HealthConnectClient.getReadPermission(BoneMassRecord::class),
    HealthConnectClient.getReadPermission(BodyWaterMassRecord::class),
    HealthConnectClient.getReadPermission(BasalMetabolicRateRecord::class),
  )

  override fun load() {
    /*
     * O contrato precisa ser registrado enquanto a Activity ainda não começou,
     * e por isso fica no `load()` e não na primeira chamada: registrar depois
     * de `onStart` lança IllegalStateException.
     */
    pedidoDePermissao = activity.registerForActivityResult(
      PermissionController.createRequestPermissionResultContract()
    ) { concedidas ->
      val chamada = chamadaPendente ?: return@registerForActivityResult
      chamadaPendente = null
      chamada.resolve(
        JSObject()
          .put("granted", concedidas.containsAll(permissoes))
          .put("authoritative", true)
      )
    }
  }

  private fun cliente(): HealthConnectClient? =
    when (HealthConnectClient.getSdkStatus(context)) {
      HealthConnectClient.SDK_AVAILABLE -> HealthConnectClient.getOrCreate(context)
      else -> null
    }

  @PluginMethod
  fun isAvailable(call: PluginCall) {
    val resposta = JSObject()
    when (HealthConnectClient.getSdkStatus(context)) {
      HealthConnectClient.SDK_AVAILABLE ->
        resposta.put("available", true).put("provider", "health_connect")

      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
        /*
         * Abaixo do Android 14 o Health Connect é um app da Play Store. Esta é
         * a única recusa que tem conserto do lado de quem usa, e por isso tem
         * código próprio: a tela oferece instalar em vez de dizer "não dá".
         */
        resposta.put("available", false).put("provider", null as String?)
          .put("reason", "NEEDS_INSTALL")

      else ->
        resposta.put("available", false).put("provider", null as String?)
          .put("reason", if (Build.VERSION.SDK_INT < 28) "UNSUPPORTED_PLATFORM" else "NEEDS_INSTALL")
    }
    call.resolve(resposta)
  }

  @PluginMethod
  fun requestPermissions(call: PluginCall) {
    val cliente = cliente()
    if (cliente == null) {
      call.resolve(JSObject().put("granted", false).put("authoritative", true))
      return
    }

    escopo.launch {
      val jaConcedidas = withContext(Dispatchers.IO) {
        cliente.permissionController.getGrantedPermissions()
      }
      if (jaConcedidas.containsAll(permissoes)) {
        call.resolve(JSObject().put("granted", true).put("authoritative", true))
        return@launch
      }

      val lancador = pedidoDePermissao
      if (lancador == null) {
        call.reject("Não foi possível abrir o pedido de permissão.")
        return@launch
      }
      chamadaPendente = call
      lancador.launch(permissoes)
    }
  }

  @PluginMethod
  fun openSettings(call: PluginCall) {
    context.startActivity(
      Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
    call.resolve()
  }

  @PluginMethod
  fun readSamples(call: PluginCall) {
    val cliente = cliente()
    if (cliente == null) {
      call.reject("Health Connect indisponível neste aparelho.")
      return
    }

    val de = runCatching { Instant.parse(call.getString("from")) }.getOrNull()
    val ate = runCatching { Instant.parse(call.getString("to")) }.getOrNull()
    if (de == null || ate == null) {
      call.reject("Janela de leitura inválida.")
      return
    }
    val teto = call.getInt("limit") ?: 2000
    val periodo = TimeRangeFilter.between(de, ate)

    escopo.launch {
      try {
        val amostras = withContext(Dispatchers.IO) {
          val saida = mutableListOf<JSObject>()

          suspend fun <T : Record> colher(
            classe: kotlin.reflect.KClass<T>,
            tipo: String,
            valorDe: (T) -> Double,
            instanteDe: (T) -> Instant,
          ) {
            /*
             * `pageToken` existe e não é usado: o teto vem da web e é o mesmo
             * que a janela de um ano comporta. Paginar aqui significaria o
             * nativo decidir quanto trazer, que é decisão da importação.
             */
            val pagina = cliente.readRecords(ReadRecordsRequest(classe, periodo, pageSize = teto))
            for (registro in pagina.records) {
              saida.add(
                JSObject()
                  .put("id", registro.metadata.id)
                  .put("type", tipo)
                  .put("value", valorDe(registro))
                  .put("measuredAt", instanteDe(registro).toString())
                  .put("sourceApp", registro.metadata.dataOrigin.packageName)
                  .put("sourceDevice", registro.metadata.device?.model)
              )
            }
          }

          colher(WeightRecord::class, "PESO", { it.weight.inKilograms }, { it.time })
          // Já em 0–100. Ver a armadilha 1 no topo.
          colher(BodyFatRecord::class, "GORDURA_PERCENTUAL", { it.percentage.value }, { it.time })
          colher(LeanBodyMassRecord::class, "MASSA_MAGRA", { it.mass.inKilograms }, { it.time })
          colher(BoneMassRecord::class, "MASSA_OSSEA", { it.mass.inKilograms }, { it.time })
          // Massa, não percentual. Ver a armadilha 2.
          colher(BodyWaterMassRecord::class, "AGUA_CORPORAL", { it.mass.inKilograms }, { it.time })
          // Potência: kcal/dia, nunca watt. Ver a armadilha 3.
          colher(
            BasalMetabolicRateRecord::class, "METABOLISMO_BASAL",
            { it.basalMetabolicRate.inKilocaloriesPerDay }, { it.time },
          )

          saida
        }

        val lista = JSArray()
        amostras.forEach { lista.put(it) }
        call.resolve(JSObject().put("samples", lista))
      } catch (erro: Exception) {
        call.reject("Não foi possível ler o Health Connect.", erro)
      }
    }
  }
}
