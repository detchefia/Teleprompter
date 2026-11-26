# Montagem da página. Não usamos Bootstrap: a interface é própria, leve e
# pensada primeiro para o celular. O Shiny injeta automaticamente apenas o
# que precisa (jQuery + shiny.js).

APP_VERSION <- "1.3.0"

asset <- function(path) paste0(path, "?v=", APP_VERSION)

app_head <- function() {
  tags <- htmltools::tags
  tags$head(
    tags$meta(charset = "utf-8"),
    tags$meta(name = "viewport",
              content = "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"),
    tags$title("Teleprompter"),
    tags$meta(name = "description", content = "Teleprompter com gravação de vídeo direto no navegador do celular."),
    tags$meta(name = "theme-color", content = "#0b0d12"),
    tags$meta(name = "color-scheme", content = "dark"),
    tags$meta(name = "mobile-web-app-capable", content = "yes"),
    tags$meta(name = "apple-mobile-web-app-capable", content = "yes"),
    tags$meta(name = "apple-mobile-web-app-status-bar-style", content = "black-translucent"),
    tags$meta(name = "apple-mobile-web-app-title", content = "Teleprompter"),
    tags$link(rel = "manifest", href = "manifest.webmanifest"),
    tags$link(rel = "icon", type = "image/svg+xml", href = "icons/icon.svg"),
    tags$link(rel = "apple-touch-icon", href = "icons/apple-touch-icon.png"),
    tags$link(rel = "stylesheet", href = asset("css/app.css")),
    tags$script(id = "tp-config", type = "application/json", htmltools::HTML(tp_client_config()))
  )
}

app_scripts <- function() {
  files <- c("utils.js", "storage.js", "camera.js", "recorder.js", "mp4info.js", "finalize.js", "teleprompter.js", "app.js")
  lapply(files, function(f) htmltools::tags$script(src = asset(file.path("js", f))))
}

app_ui <- function(request) {
  ui <- htmltools::tagList(
    app_head(),
    # Sem indicadores de "ocupado" do Shiny: o servidor só processa texto.
    shiny::useBusyIndicators(spinners = FALSE, pulse = FALSE),
    htmltools::tags$noscript(htmltools::tags$p(class = "noscript",
      "Este aplicativo precisa de JavaScript habilitado para usar a câmera e gravar vídeo.")),
    editor_screen(),
    studio_screen(),
    review_dialog(),
    feedback_layers(),
    app_scripts()
  )
  attr(ui, "lang") <- "pt-BR"
  ui
}
