package com.synse.workout

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * O treino como serviço em primeiro plano.
 *
 * Foreground service, e não uma notificação comum, por uma razão concreta: o
 * Android mata processo em segundo plano quando precisa de memória, e o treino
 * precisa sobreviver a quarenta minutos de tela bloqueada. A notificação
 * persistente é o preço — e é justamente o que o usuário quer ver.
 *
 * O cronômetro é `setUsesChronometer` com o instante do fim. O sistema anima
 * sozinho; o app não acorda a cada segundo, o que seria bateria jogada fora.
 */
class WorkoutService : Service() {

    companion object {
        const val CHANNEL_ID = "synse_treino_ativo"
        const val NOTIFICATION_ID = 4201
        const val ACTION_UPDATE = "com.synse.workout.UPDATE"
        const val ACTION_STOP = "com.synse.workout.STOP"
        const val ACTION_REMOTE = "com.synse.workout.REMOTE"
        const val EXTRA_REMOTE_ACTION = "remoteAction"

        /** Preenchido pelo plugin. O service só desenha o que está aqui. */
        @Volatile
        var state: WorkoutState = WorkoutState()

        /** O plugin registra aqui como repassar o toque ao WebView. */
        @Volatile
        var onRemoteAction: ((String) -> Unit)? = null
    }

    data class WorkoutState(
        val exerciseName: String = "",
        val setNumber: Int = 1,
        val totalSets: Int = 1,
        val reps: Int = 0,
        val weight: Double? = null,
        val phase: String = "SET",
        val restEndsAt: Long? = null,
        val progress: Double = 0.0,
    )

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        criarCanal()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_REMOTE -> {
                intent.getStringExtra(EXTRA_REMOTE_ACTION)?.let { onRemoteAction?.invoke(it) }
                return START_STICKY
            }
        }

        /*
         `startForeground` na primeira chamada e `notify` nas seguintes. Chamar
         `startForeground` de novo a cada atualização faz o sistema reavaliar a
         permissão e, no Android 12+, pode recusar quando o app está em segundo
         plano — matando o treino no meio.
         */
        if (intent?.action == ACTION_UPDATE) {
            manager().notify(NOTIFICATION_ID, construir())
        } else {
            startForeground(NOTIFICATION_ID, construir())
        }
        return START_STICKY
    }

    private fun manager() = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun criarCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val canal = NotificationChannel(
            CHANNEL_ID,
            "Treino ativo",
            // HIGH para o fim do descanso poder tocar e vibrar. A notificação
            // em si é ongoing, então não aparece como pop-up o tempo todo.
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Acompanha série e descanso durante o treino"
            setShowBadge(false)
        }
        manager().createNotificationChannel(canal)
    }

    private fun acaoRemota(acao: String, rotulo: String): NotificationCompat.Action {
        val intent = Intent(this, WorkoutService::class.java).apply {
            action = ACTION_REMOTE
            putExtra(EXTRA_REMOTE_ACTION, acao)
        }
        val pending = PendingIntent.getService(
            this,
            acao.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Action.Builder(0, rotulo, pending).build()
    }

    private fun construir(): Notification {
        val s = state
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(s.exerciseName.ifEmpty { "Treino ativo" })
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setProgress(100, (s.progress * 100).toInt(), false)

        when (s.phase) {
            "REST" -> {
                val fim = s.restEndsAt
                if (fim != null) {
                    /*
                     O cronômetro do sistema conta sozinho a partir da base.
                     `elapsedRealtime` porque o relógio de parede pode mudar
                     (fuso, ajuste automático) e deslocaria a contagem.
                     */
                    builder.setUsesChronometer(true)
                        .setChronometerCountDown(true)
                        .setWhen(System.currentTimeMillis() + (fim - System.currentTimeMillis()))
                }
                builder.setContentText("Descanso · série ${s.setNumber}/${s.totalSets}")
                    .addAction(acaoRemota("SKIP_REST", "Pular"))
                    .addAction(acaoRemota("ADD_REST", "+30s"))
            }
            "REST_FINISHED" -> {
                builder.setUsesChronometer(false)
                    .setContentTitle("Descanso concluído")
                    .setContentText("${s.exerciseName} · série ${s.setNumber}/${s.totalSets} pronta")
                    .setOnlyAlertOnce(false)
                    .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
                    .addAction(acaoRemota("NEXT_SET", "Iniciar série"))
            }
            else -> {
                val carga = s.weight?.let { " · ${it.toInt()} kg" } ?: ""
                builder.setUsesChronometer(false)
                    .setContentText("Série ${s.setNumber}/${s.totalSets} · ${s.reps} reps$carga")
                    .addAction(acaoRemota("COMPLETE_SET", "Concluir série"))
            }
        }

        return builder.build()
    }
}
