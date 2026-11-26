# Tela 1: edição do roteiro e configurações.

editor_screen <- function() {
  tags <- htmltools::tags
  tags$main(
    id = "editor-screen", class = "screen editor",
    tags$header(
      class = "app-header",
      tags$div(class = "brand",
        tags$span(class = "brand-mark", svg_icon("video")),
        tags$div(tags$h1("Teleprompter"), tags$p("Leia olhando para a câmera e grave no celular"))
      )
    ),

    tags$section(
      class = "card", `aria-labelledby` = "script-title",
      tags$div(class = "card-head",
        tags$h2(id = "script-title", "Roteiro"),
        tags$div(class = "toolbar", role = "toolbar", `aria-label` = "Ações do texto",
          text_button("btn-paste", "paste", "Colar", class = "btn btn-ghost btn-sm"),
          text_button("btn-open-file", "file", "Arquivo .txt", class = "btn btn-ghost btn-sm"),
          # O seletor de arquivo é criado pelo JavaScript na hora do clique: um
          # <input type="file"> no HTML seria capturado pelo Shiny e enviado ao servidor.
          text_button("btn-clear", "clear", "Limpar", class = "btn btn-ghost btn-sm")
        )
      ),
      tags$div(class = "script-field",
        tags$label(`for` = "script", class = "visually-hidden", "Texto do teleprompter"),
        tags$textarea(
          id = "script", class = "script-input",
          rows = 10, spellcheck = "true", autocomplete = "off",
          placeholder = "Digite ou cole aqui o texto que você vai falar…",
          # Texto de exemplo; o JavaScript o substitui pelo último texto salvo no aparelho.
          sample_script()
        )
      ),
      tags$div(id = "script-stats", class = "stats", `aria-live` = "polite",
               shiny::uiOutput("stats", inline = TRUE))
    ),

    tags$section(
      class = "card", `aria-labelledby` = "settings-title",
      tags$div(class = "card-head", tags$h2(id = "settings-title", "Leitura")),
      speed_presets(),
      tags$div(class = "settings-grid",
        setting_control("wpm"),
        setting_control("fontSize"),
        setting_control("lineHeight"),
        setting_control("width"),
        setting_control("position"),
        setting_control("lines"),
        setting_control("opacity")
      ),
      tags$details(class = "more",
        tags$summary("Gravação e exibição"),
        tags$div(class = "settings-list",
          setting_control("quality"),
          setting_control("countdown"),
          setting_control("mirrorPreview"),
          setting_control("focusGuide"),
          setting_control("restartOnRecord"),
          setting_control("scrollOnRecord"),
          setting_control("mirrorText")
        )
      ),
      tags$button(type = "button", id = "btn-reset-settings", class = "btn btn-link btn-sm",
                  "Restaurar padrões")
    ),

    tags$section(class = "card card-note",
      svg_icon("info"),
      tags$p(
        tags$strong("Privacidade: "),
        "o vídeo é gravado e salvo somente no seu aparelho. Nenhuma imagem ou som é enviado ao servidor.",
        " A câmera só é ativada quando você abre o estúdio."
      )
    ),

    tags$div(class = "cta-bar",
      text_button("btn-open-studio", "camera", "Abrir estúdio", class = "btn btn-primary btn-lg")
    )
  )
}
