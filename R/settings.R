# Definição única das configurações do teleprompter.
# O R gera os controles a partir desta lista e a envia ao JavaScript como JSON,
# de modo que limites e valores padrão ficam em um só lugar.

tp_settings <- function() {
  list(
    wpm        = list(type = "range", label = "Velocidade", min = 60, max = 260, step = 5, value = 140, unit = "pal/min"),
    fontSize   = list(type = "range", label = "Tamanho da letra", min = 18, max = 80, step = 1, value = 34, unit = "px"),
    lineHeight = list(type = "range", label = "Espaçamento entre linhas", min = 1, max = 2.2, step = 0.05, value = 1.4, unit = "×"),
    width      = list(type = "range", label = "Largura da área de leitura", min = 40, max = 100, step = 1, value = 92, unit = "%"),
    position   = list(type = "range", label = "Posição vertical (distância do topo)", min = 0, max = 60, step = 1, value = 3, unit = "%"),
    lines      = list(type = "range", label = "Linhas visíveis", min = 2, max = 14, step = 1, value = 5, unit = ""),
    opacity    = list(type = "range", label = "Escurecimento do fundo do texto", min = 0, max = 90, step = 5, value = 45, unit = "%"),
    # Resolução e taxa de bits de cada opção: QUALITY_PRESETS em www/js/utils.js
    quality    = list(type = "select", label = "Qualidade do vídeo (tamanho do arquivo)", value = "padrao",
                      choices = c("Leve \u2014 720p, cerca de 12 MB por minuto" = "leve",
                                  "Padrão \u2014 1080p, cerca de 27 MB por minuto" = "padrao",
                                  "Alta \u2014 1080p, cerca de 45 MB por minuto" = "alta")),
    countdown  = list(type = "select", label = "Contagem regressiva", value = "3",
                      choices = c("Desativada" = "0", "3 segundos" = "3", "5 segundos" = "5", "10 segundos" = "10")),
    mirrorPreview   = list(type = "check", label = "Espelhar minha imagem (só na tela, o vídeo fica normal)", value = TRUE),
    focusGuide      = list(type = "check", label = "Destacar a linha de leitura", value = TRUE),
    restartOnRecord = list(type = "check", label = "Voltar o texto ao início ao gravar", value = TRUE),
    scrollOnRecord  = list(type = "check", label = "Rolar o texto automaticamente ao gravar", value = TRUE),
    mirrorText      = list(type = "check", label = "Inverter o texto (para vidro de teleprompter físico)", value = FALSE)
  )
}

# Subconjunto mostrado no painel rápido do estúdio
tp_quick_settings <- c("wpm", "fontSize", "position", "width", "lines", "opacity")

tp_speed_presets <- c("Lento" = 110, "Normal" = 140, "Rápido" = 170)

#' Configuração serializada para o JavaScript
tp_client_config <- function() {
  s <- tp_settings()
  defaults <- lapply(s, function(x) x$value)
  limits <- lapply(Filter(function(x) x$type == "range", s),
                   function(x) list(min = x$min, max = x$max, step = x$step))
  choices <- lapply(Filter(function(x) x$type == "select", s), function(x) unname(x$choices))
  jsonlite::toJSON(
    list(version = APP_VERSION, defaults = defaults, limits = limits, choices = choices, icons = list(
      play = icon_svg_string("play"),
      pause = icon_svg_string("pause"),
      stop = icon_svg_string("stop")
    )),
    auto_unbox = TRUE
  )
}
