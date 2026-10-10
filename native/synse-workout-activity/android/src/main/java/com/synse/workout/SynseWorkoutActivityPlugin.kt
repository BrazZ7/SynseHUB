package com.synse.workout

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * A ponte entre o WebView e a notificação persistente.
 *
 * O contrato é o mesmo do iOS — `src/features/active-workout/platform/types.ts`
 * —, de propósito: a web fala com uma interface só, e quem troca de plataforma
 * não muda nada acima da ponte.
 */
@CapacitorPlugin(
    name = "SynseWorkoutActivity",
    permissions = [
        Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS]),
    ],
)
class SynseWorkoutActivityPlugin : Plugin() {

    override fun load() {
        // O toque no botão da notificação chega ao service, que repassa aqui.
        WorkoutService.onRemoteAction = { acao ->
            notifyListeners("remoteAction", JSObject().put("action", acao))
        }
    }

    @PluginMethod
    fun isSupported(call: PluginCall) {
        // Notificação com ações e canal existe desde a API 26. Abaixo disso o
        // app não roda de qualquer forma.
        call.resolve(JSObject().put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O))
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Antes do Android 13 não há permissão a pedir.
            return call.resolve(JSObject().put("granted", true))
        }
        if (concedida()) return call.resolve(JSObject().put("granted", true))
        requestPermissionForAlias("notifications", call, "aposPermissao")
    }

    @PermissionCallback
    private fun aposPermissao(call: PluginCall) {
        call.resolve(JSObject().put("granted", concedida()))
    }

    private fun concedida() =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    @PluginMethod
    fun start(call: PluginCall) {
        WorkoutService.state = estado(call)
        /*
         Iniciado aqui, no toque de "Começar treino", com o app em primeiro
         plano. O Android 12+ recusa iniciar foreground service a partir do
         segundo plano — deixar para o momento do descanso mataria o recurso
         justamente quando ele é necessário.
         */
        ContextCompat.startForegroundService(context, Intent(context, WorkoutService::class.java))
        call.resolve()
    }

    @PluginMethod
    fun update(call: PluginCall) {
        WorkoutService.state = estado(call)
        enviar(WorkoutService.ACTION_UPDATE)
        call.resolve()
    }

    @PluginMethod
    fun restFinished(call: PluginCall) {
        WorkoutService.state = estado(call).copy(phase = "REST_FINISHED")
        enviar(WorkoutService.ACTION_UPDATE)
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        enviar(WorkoutService.ACTION_STOP)
        call.resolve()
    }

    private fun enviar(acao: String) {
        val intent = Intent(context, WorkoutService::class.java).apply { action = acao }
        ContextCompat.startForegroundService(context, intent)
    }

    private fun estado(call: PluginCall) = WorkoutService.WorkoutState(
        exerciseName = call.getString("exerciseName") ?: "",
        setNumber = call.getInt("setNumber") ?: 1,
        totalSets = call.getInt("totalSets") ?: 1,
        reps = call.getInt("reps") ?: 0,
        weight = call.getDouble("weight"),
        phase = call.getString("phase") ?: "SET",
        // Epoch em milissegundos atravessa a ponte como número.
        restEndsAt = call.getDouble("restEndsAt")?.toLong(),
        progress = call.getDouble("progress") ?: 0.0,
    )
}
