# Lógica do servidor.
#
# O servidor cuida apenas do TEXTO: normalização, estatísticas (palavras,
# duração estimada) e entrega do roteiro ao teleprompter. Câmera, gravação,
# rolagem e download acontecem no navegador; nenhum vídeo passa por aqui.

app_server <- function(input, output, session) {
  # Celulares perdem a conexão ao bloquear a tela; permite reconectar sem recarregar.
  session$allowReconnect(TRUE)

  # Texto digitado, com pequena espera para não reprocessar a cada tecla
  script_text <- shiny::debounce(shiny::reactive({
    normalize_script(input$script)
  }), 400)

  # Velocidade escolhida no cliente (enviada pelo JavaScript)
  wpm <- shiny::reactive({
    v <- suppressWarnings(as.numeric(input$tp_wpm))
    if (length(v) != 1 || is.na(v)) 140 else v
  })

  stats <- shiny::reactive(script_stats(script_text(), wpm()))

  output$stats <- shiny::renderUI({
    s <- stats()
    tags <- htmltools::tags
    if (s$words == 0) {
      return(tags$span(class = "stats-empty", "Nenhum texto ainda."))
    }
    htmltools::tagList(
      tags$span(tags$strong(format(s$words, big.mark = ".", decimal.mark = ",")), if (s$words == 1) " palavra" else " palavras"),
      tags$span(tags$strong(s$paragraphs), if (s$paragraphs == 1) " parágrafo" else " parágrafos"),
      tags$span("≈ ", tags$strong(s$duration), sprintf(" de leitura a %d pal/min", round(wpm())))
    )
  })

  # Mantém o teleprompter do cliente com a versão normalizada do roteiro.
  # (Se a conexão cair, o JavaScript usa o texto do editor diretamente.)
  shiny::observe({
    push_script(session, script_text(), source = "editor")
  })
}
