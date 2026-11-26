# Tela 2: estúdio (câmera em tela cheia + teleprompter + controles).
#
# Separação importante: o texto é uma camada HTML sobre o <video>. O gravador
# usa diretamente o MediaStream da câmera, portanto o texto (e o espelhamento
# da pré-visualização) nunca entram no arquivo final.

studio_screen <- function() {
  tags <- htmltools::tags
  tags$section(
    id = "studio", class = "studio", hidden = NA,
    role = "dialog", `aria-modal` = "true", `aria-label` = "Estúdio de gravação",

    # Camada 1: imagem da câmera (pré-visualização)
    tags$video(id = "camera-preview", class = "camera-preview",
               autoplay = NA, muted = NA, playsinline = NA,
               `webkit-playsinline` = NA, `aria-hidden` = "true"),

    # Camada 2: teleprompter (somente na tela)
    tags$div(id = "prompter", class = "prompter", `aria-label` = "Texto do teleprompter",
      tags$div(class = "prompter-viewport",
        tags$div(id = "prompter-text", class = "prompter-text")
      ),
      tags$div(class = "prompter-guide", `aria-hidden` = "true"),
      tags$div(id = "prompter-paused", class = "prompter-paused", `aria-hidden` = "true", "Pausado · toque para continuar")
    ),

    # Barra superior
    tags$div(class = "studio-top",
      icon_button("btn-close-studio", "close", "Fechar estúdio e voltar ao texto"),
      tags$div(id = "rec-indicator", class = "rec-indicator", role = "status", `aria-live` = "polite",
        tags$span(class = "rec-dot", `aria-hidden` = "true"),
        tags$span(id = "rec-label", "GRAVANDO"),
        tags$time(id = "rec-time", "00:00")
      ),
      tags$div(class = "studio-top-actions",
        icon_button("btn-switch-camera", "switch_cam", "Alternar câmera frontal/traseira"),
        icon_button("btn-frame", "frame", "Mostrar o quadro completo que será gravado", `aria-pressed` = "false"),
        icon_button("btn-mirror", "mirror", "Espelhar imagem na tela", `aria-pressed` = "true"),
        icon_button("btn-fullscreen", "fullscreen", "Tela cheia"),
        icon_button("btn-quick-settings", "settings", "Ajustes de leitura", `aria-expanded` = "false",
                    `aria-controls` = "quick-settings")
      )
    ),

    # Painel rápido de ajustes
    tags$div(id = "quick-settings", class = "quick-settings", hidden = NA,
      tags$div(class = "sheet-head",
        tags$h2("Ajustes de leitura"),
        icon_button("btn-quick-close", "close", "Fechar ajustes", class = "btn-icon-sm")
      ),
      speed_presets(),
      lapply(tp_quick_settings, setting_control, prefix = "quick")
    ),

    # Barra inferior
    tags$div(class = "studio-bottom",
      tags$div(class = "prompter-controls", role = "group", `aria-label` = "Controles do texto",
        icon_button("btn-restart", "restart", "Voltar o texto ao início"),
        icon_button("btn-back", "back", "Retroceder o texto"),
        icon_button("btn-play", "play", "Iniciar rolagem do texto", class = "btn-play"),
        icon_button("btn-forward", "forward", "Avançar o texto"),
        tags$div(class = "speed-control",
          icon_button("btn-slower", "minus", "Diminuir velocidade", class = "btn-icon-sm"),
          tags$output(id = "speed-value", class = "speed-value", `aria-live` = "polite", "140"),
          icon_button("btn-faster", "plus", "Aumentar velocidade", class = "btn-icon-sm")
        )
      ),
      tags$div(class = "record-controls", role = "group", `aria-label` = "Controles de gravação",
        text_button("btn-rec-cancel", "trash", "Cancelar", class = "btn btn-glass btn-sm rec-only"),
        tags$button(type = "button", id = "btn-record", class = "btn-record",
                    `aria-label` = "Iniciar gravação", title = "Iniciar gravação",
                    tags$span(class = "btn-record-inner")),
        text_button("btn-rec-pause", "pause", "Pausar", class = "btn btn-glass btn-sm rec-only"),
        text_button("btn-last-video", "video", "Último vídeo", class = "btn btn-glass btn-sm idle-only", hidden = NA)
      )
    ),

    # Contagem regressiva
    tags$div(id = "countdown", class = "countdown", hidden = NA, `aria-live` = "assertive",
      tags$span(id = "countdown-value", class = "countdown-value")
    ),

    # Mensagens de estado (permissão, erro, carregando)
    tags$div(id = "studio-status", class = "studio-status", hidden = NA,
      tags$div(class = "status-card", role = "alert",
        tags$div(class = "status-icon", svg_icon("camera")),
        tags$h2(id = "status-title", "Ativando a câmera…"),
        tags$p(id = "status-text", ""),
        tags$div(class = "status-actions",
          text_button("btn-status-retry", NULL, "Tentar novamente", class = "btn btn-primary"),
          text_button("btn-status-back", NULL, "Voltar ao texto", class = "btn btn-ghost")
        )
      )
    )
  )
}

# Janela de revisão do vídeo gravado
review_dialog <- function() {
  tags <- htmltools::tags
  tags$div(
    id = "review", class = "review", hidden = NA,
    role = "dialog", `aria-modal` = "true", `aria-labelledby` = "review-title",
    tags$div(class = "review-card",
      tags$div(class = "review-head",
        tags$h2(id = "review-title", "Pré-visualização do vídeo"),
        icon_button("btn-review-close", "close", "Fechar pré-visualização", class = "btn-icon-sm")
      ),
      tags$video(id = "review-video", class = "review-video", controls = NA,
                 playsinline = NA, `webkit-playsinline` = NA, preload = "metadata"),
      tags$p(id = "review-info", class = "review-info"),
      tags$div(class = "review-actions",
        text_button("btn-share", "share", "Salvar / Compartilhar", class = "btn btn-primary btn-wide"),
        text_button("btn-download", "download", "Baixar vídeo", class = "btn btn-secondary"),
        text_button("btn-rerecord", "redo", "Gravar novamente", class = "btn btn-ghost"),
        text_button("btn-discard", "trash", "Descartar", class = "btn btn-ghost btn-danger")
      ),
      tags$p(id = "review-hint", class = "review-hint"),
      # Diagnóstico: o usuário pode enviar um print disto quando algo der errado.
      tags$details(class = "review-tech",
        tags$summary("Detalhes técnicos"),
        tags$pre(id = "review-tech-text", class = "review-tech-text")
      )
    )
  )
}

# Diálogo de confirmação genérico e notificações
feedback_layers <- function() {
  tags <- htmltools::tags
  htmltools::tagList(
    tags$div(id = "confirm", class = "confirm", hidden = NA, role = "alertdialog",
             `aria-modal` = "true", `aria-labelledby` = "confirm-title", `aria-describedby` = "confirm-text",
      tags$div(class = "confirm-card",
        tags$h2(id = "confirm-title", ""),
        tags$p(id = "confirm-text", ""),
        tags$div(class = "confirm-actions",
          tags$button(type = "button", id = "confirm-cancel", class = "btn btn-ghost", "Cancelar"),
          tags$button(type = "button", id = "confirm-ok", class = "btn btn-primary", "Confirmar")
        )
      )
    ),
    tags$div(id = "toasts", class = "toasts", `aria-live` = "polite", `aria-atomic` = "false")
  )
}
