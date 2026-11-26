# Ponto único de entrada de roteiros no teleprompter.
#
# Qualquer origem de texto (digitação, colagem, arquivo, API, futura geração
# por IA na Solução Parlamentar etc.) deve chegar ao teleprompter por
# `load_script()`. Assim o componente de texto fica desacoplado de quem
# produz o conteúdo.
#
# Exemplo de uso futuro, dentro do server:
#
#   observeEvent(input$gerar, {
#     texto <- gerar_roteiro_ia(tema = input$tema, duracao = 60)
#     load_script(session, texto, source = "ia")
#   })

#' Envia um roteiro para o editor e para o teleprompter do cliente
#'
#' @param session sessão Shiny.
#' @param text texto bruto.
#' @param source rótulo livre da origem ("usuario", "ia", "arquivo"...).
#' @param update_editor se TRUE, substitui também o conteúdo do editor.
#' @return (invisível) o texto normalizado.
load_script <- function(session, text, source = "usuario", update_editor = TRUE) {
  text <- normalize_script(text)
  if (isTRUE(update_editor)) {
    shiny::updateTextAreaInput(session, "script", value = text)
  }
  push_script(session, text, source = source)
  invisible(text)
}

#' Envia ao JavaScript o roteiro já normalizado (sem tocar no editor)
push_script <- function(session, text, source = "usuario") {
  session$sendCustomMessage("tp:script", list(
    text = text,
    source = source,
    words = count_words(text)
  ))
}
