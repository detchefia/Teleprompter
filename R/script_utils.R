# Funções puras de tratamento do roteiro (texto do teleprompter).
# Não dependem de Shiny, o que facilita testes e reuso por outros módulos
# (por exemplo, uma futura geração de texto por IA).

#' Normaliza o texto do roteiro
#'
#' - converte quebras de linha Windows/Mac para "\n";
#' - remove espaços no fim das linhas e tabs repetidos;
#' - reduz 3+ linhas em branco para uma única linha em branco (parágrafo);
#' - remove espaços no início/fim do texto.
#'
#' @param text character(1) ou NULL.
#' @return character(1), possivelmente "".
normalize_script <- function(text) {
  if (is.null(text) || length(text) == 0 || all(is.na(text))) return("")
  text <- paste(as.character(text[!is.na(text)]), collapse = "\n")
  text <- enc2utf8(text)
  text <- gsub("\r\n?", "\n", text)
  text <- gsub(" ", " ", text, fixed = TRUE)
  text <- gsub("[ \t]+\n", "\n", text)
  text <- gsub("[ \t]{2,}", " ", text)
  text <- gsub("\n{3,}", "\n\n", text)
  trimws(text)
}

#' Conta palavras (sequências de letras/números, incluindo acentos)
count_words <- function(text) {
  text <- normalize_script(text)
  if (!nzchar(text)) return(0L)
  # \p{L}/\p{N}: letras e números Unicode (acentos), independente do locale
  pattern <- "[\\p{L}\\p{N}]+(?:['’-][\\p{L}\\p{N}]+)*"
  words <- regmatches(text, gregexpr(pattern, text, perl = TRUE))[[1]]
  length(words)
}

#' Conta parágrafos (blocos separados por linha em branco)
count_paragraphs <- function(text) {
  text <- normalize_script(text)
  if (!nzchar(text)) return(0L)
  length(strsplit(text, "\n\\s*\n")[[1]])
}

#' Estima a duração da leitura, em segundos
#'
#' @param words número de palavras.
#' @param wpm velocidade em palavras por minuto (limitada a 40..400).
estimate_duration <- function(words, wpm = 140) {
  wpm <- suppressWarnings(as.numeric(wpm))
  if (length(wpm) != 1 || is.na(wpm)) wpm <- 140
  wpm <- min(max(wpm, 40), 400)
  words <- max(0, as.numeric(words), na.rm = TRUE)
  round(words / wpm * 60)
}

#' Formata segundos como "m:ss" (ou "h:mm:ss")
format_duration <- function(seconds) {
  seconds <- max(0, round(as.numeric(seconds)), na.rm = TRUE)
  h <- seconds %/% 3600
  m <- (seconds %% 3600) %/% 60
  s <- seconds %% 60
  if (h > 0) sprintf("%d:%02d:%02d", h, m, s) else sprintf("%d:%02d", m, s)
}

#' Resumo estatístico do roteiro
#'
#' @return list(words, chars, paragraphs, seconds, duration)
script_stats <- function(text, wpm = 140) {
  text <- normalize_script(text)
  words <- count_words(text)
  seconds <- estimate_duration(words, wpm)
  list(
    words = words,
    chars = nchar(text, type = "chars"),
    paragraphs = count_paragraphs(text),
    seconds = seconds,
    duration = format_duration(seconds)
  )
}

#' Texto de exemplo exibido no primeiro acesso
sample_script <- function() {
  paste(
    "Olá! Este é o seu teleprompter.",
    "",
    "Cole ou escreva aqui o texto que você vai falar. Ajuste o tamanho da letra, a velocidade e a posição da área de leitura para que o texto fique bem perto da câmera.",
    "",
    "Quando estiver pronto, toque em “Abrir estúdio”, autorize a câmera e o microfone e aperte o botão vermelho para gravar. Haverá uma contagem regressiva e o texto começará a rolar sozinho.",
    "",
    "Toque sobre o texto para pausar ou continuar. O texto não aparece no vídeo final: apenas a sua imagem e a sua voz.",
    "",
    "Ao terminar, confira o vídeo, grave novamente se quiser, e salve no seu aparelho.",
    sep = "\n"
  )
}
