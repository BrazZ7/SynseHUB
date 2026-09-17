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
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat

/**
 * O treino como serviço em primeiro plano.
 *
 * Foreground service, e não uma notificação comum, por uma razão concreta: o
 * Android mata processo em segundo plano quando precisa de memória, e o treino
 * precisa sobreviver a quarenta minutos de tela bloqueada. A notificação
 * persistente é o preço — e é justamente o que o usuário quer ver.
 *
 * ── Por que layout próprio, e não o template do Android ─────────────────────
 *
 * O template padrão resolvia mal as duas coisas que mais importam aqui.
 *
 * O **visual**: ele desenha a notificação com as cores do sistema e os botões
 * no azul padrão do Android. A notificação de um treino em andamento é a única
 * presença do Synse na tela bloqueada, e ela precisa parecer o Synse.
 *
 * O **cronômetro**: `setUsesChronometer` renderiza a contagem no cantinho do
 * cabeçalho, onde mora o horário — e a barra de progresso que a notificação
 * também usava ocupava esse espaço. O resultado era o relógio parado em
 * "agora": o número só mudava quando o descanso acabava.
 *
 * Com `RemoteViews`, o `Chronometer` é um widget de verdade dentro do layout.
 * O sistema o anima segundo a segundo sozinho — o app continua sem acordar a
 * cada segundo, que seria bateria jogada fora.
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

    private fun intentRemota(acao: String): PendingIntent {
        val intent = Intent(this, WorkoutService::class.java).apply {
            action = ACTION_REMOTE
            putExtra(EXTRA_REMOTE_ACTION, acao)
        }
        return PendingIntent.getService(
            this,
            acao.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** O texto e os botões de cada fase, num lugar só. */
    private data class Conteudo(
        val titulo: String,
        val subtitulo: String,
        val primario: Pair<String, String>?,
        val secundario: Pair<String, String>?,
        val contando: Boolean,
    )

    private fun conteudo(s: WorkoutState): Conteudo = when (s.phase) {
        "REST" -> Conteudo(
            titulo = s.exerciseName.ifEmpty { "Descanso" },
            subtitulo = "Descanso · série ${s.setNumber}/${s.totalSets}",
            primario = "SKIP_REST" to "Pular descanso",
            secundario = "ADD_REST" to "+30s",
            contando = s.restEndsAt != null,
        )
        "REST_FINISHED" -> Conteudo(
            titulo = "Pronto para a próxima",
            subtitulo = "${s.exerciseName} · série ${s.setNumber}/${s.totalSets}",
            primario = "NEXT_SET" to "Iniciar série",
            secundario = null,
            contando = false,
        )
        else -> {
            val carga = s.weight?.let { " · ${it.toInt()} kg" } ?: ""
            Conteudo(
                titulo = s.exerciseName.ifEmpty { "Treino ativo" },
                subtitulo = "Série ${s.setNumber}/${s.totalSets} · ${s.reps} reps$carga",
                primario = "COMPLETE_SET" to "Concluir série",
                secundario = null,
                contando = false,
            )
        }
    }

    /**
     * Monta um dos dois layouts.
     *
     * `expandido` traz progresso e botões; o recolhido não tem altura para
     * eles. O cronômetro aparece nos dois, porque é o número que quem olha de
     * relance quer ver.
     */
    private fun montar(s: WorkoutState, c: Conteudo, expandido: Boolean): RemoteViews {
        val layout = if (expandido) R.layout.notification_treino_expandido else R.layout.notification_treino
        val views = RemoteViews(packageName, layout)

        views.setTextViewText(R.id.titulo, c.titulo)
        views.setTextViewText(R.id.subtitulo, c.subtitulo)

        if (c.contando && s.restEndsAt != null) {
            /*
             * A base do `Chronometer` é o relógio monotônico do sistema, não o
             * de parede: `restEndsAt` vem em epoch do JavaScript, e precisa ser
             * convertido. Sem a conversão, mudar o fuso ou o horário de verão
             * deslocaria a contagem inteira.
             */
            val base = SystemClock.elapsedRealtime() + (s.restEndsAt - System.currentTimeMillis())
            views.setChronometer(R.id.cronometro, base, null, true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                views.setChronometerCountDown(R.id.cronometro, true)
            }
            views.setViewVisibility(R.id.cronometro, View.VISIBLE)
            views.setViewVisibility(R.id.carga, View.GONE)
        } else {
            // Parar a contagem é o que impede o número de continuar correndo
            // depois que o descanso acabou.
            views.setChronometer(R.id.cronometro, SystemClock.elapsedRealtime(), null, false)
            views.setViewVisibility(R.id.cronometro, View.GONE)

            val carga = s.weight?.takeIf { it > 0 }?.let { "${it.toInt()} kg" }
            if (carga != null && s.phase == "SET") {
                views.setTextViewText(R.id.carga, carga)
                views.setViewVisibility(R.id.carga, View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.carga, View.GONE)
            }
        }

        if (expandido) {
            views.setProgressBar(R.id.progresso, 100, (s.progress * 100).toInt(), false)

            c.primario?.let { (acao, rotulo) ->
                views.setTextViewText(R.id.botao_primario, rotulo)
                views.setOnClickPendingIntent(R.id.botao_primario, intentRemota(acao))
                views.setViewVisibility(R.id.botao_primario, View.VISIBLE)
            } ?: views.setViewVisibility(R.id.botao_primario, View.GONE)

            c.secundario?.let { (acao, rotulo) ->
                views.setTextViewText(R.id.botao_secundario, rotulo)
                views.setOnClickPendingIntent(R.id.botao_secundario, intentRemota(acao))
                views.setViewVisibility(R.id.botao_secundario, View.VISIBLE)
            } ?: views.setViewVisibility(R.id.botao_secundario, View.GONE)
        }

        return views
    }

    private fun construir(): Notification {
        val s = state
        val c = conteudo(s)

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            // O ícone do Synse, e não o `ic_media_play` do Android, que fazia
            // o treino aparecer com o triângulo de "tocar mídia".
            .setSmallIcon(R.drawable.ic_synse_notification)
            /*
             * `setColor` tinge o ícone e o nome no cabeçalho do sistema.
             *
             * Sem `setColorized`: ele pintaria o fundo inteiro da notificação
             * com esta cor, e o cartão escuro do layout ficaria emoldurado de
             * verde. Além disso, fabricante que ignora o `colorized` deixaria o
             * texto claro sobre fundo claro — invisível. O cartão próprio
             * garante a aparência em qualquer aparelho.
             */
            .setColor(0xFF17C4A5.toInt())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            /*
             * `DecoratedCustomViewStyle` mantém o cabeçalho do sistema — ícone
             * e nome do app — e entrega o corpo ao layout próprio. Tentar
             * eliminar o cabeçalho é brigar com a plataforma: do Android 12 em
             * diante ele é imposto, e o resultado fica quebrado.
             */
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(montar(s, c, expandido = false))
            .setCustomBigContentView(montar(s, c, expandido = true))
            // O texto que aparece onde o layout próprio não chega: notificação
            // resumida no topo da tela, Android Auto, relógio pareado.
            .setContentTitle(c.titulo)
            .setContentText(c.subtitulo)

        if (s.phase == "REST_FINISHED") {
            // A única fase que pode tocar e vibrar: é o aviso de voltar à barra.
            builder.setOnlyAlertOnce(false)
                .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
        }

        return builder.build()
    }
}
