test_that("a UI contém os elementos essenciais", {
  html <- as.character(htmltools::renderTags(app_ui(NULL))$html)
  ids <- c("editor-screen", "script", "btn-open-studio", "studio", "camera-preview",
           "prompter", "prompter-text", "btn-record", "btn-play", "rec-time", "countdown",
           "review", "review-video", "btn-download", "btn-share", "btn-rerecord", "confirm", "toasts")
  for (id in ids) expect_match(html, sprintf('id="%s"', id), fixed = TRUE, info = id)
  # O vídeo de pré-visualização precisa tocar inline no iOS e ficar mudo (sem eco)
  expect_match(html, "playsinline", fixed = TRUE)
  expect_match(html, "muted", fixed = TRUE)
  # Nenhum <input type="file"> no HTML (o Shiny o enviaria ao servidor)
  expect_false(grepl('type="file"', html, fixed = TRUE))
  expect_equal(attr(app_ui(NULL), "lang"), "pt-BR")
})

test_that("todos os botões só-ícone têm rótulo acessível", {
  html <- as.character(htmltools::renderTags(app_ui(NULL))$html)
  btns <- regmatches(html, gregexpr('<button[^>]*class="btn-icon[^"]*"[^>]*>', html))[[1]]
  expect_gt(length(btns), 5)
  expect_true(all(grepl("aria-label=", btns)))
})

test_that("configurações: controles e JSON coerentes", {
  s <- tp_settings()
  for (k in names(s)) expect_s3_class(setting_control(k), "shiny.tag")
  cfg <- jsonlite::fromJSON(tp_client_config())
  expect_setequal(names(cfg$defaults), names(s))
  for (k in names(cfg$choices)) expect_true(cfg$defaults[[k]] %in% cfg$choices[[k]], info = k)
  expect_setequal(cfg$choices$quality, c("leve", "padrao", "alta"))
  expect_true(all(c("play", "pause", "stop") %in% names(cfg$icons)))
  for (k in names(cfg$limits)) {
    expect_true(cfg$defaults[[k]] >= cfg$limits[[k]]$min && cfg$defaults[[k]] <= cfg$limits[[k]]$max, info = k)
  }
  expect_error(svg_icon("nao-existe"))
})

test_that("arquivos estáticos referenciados existem", {
  www <- file.path("..", "..", "www")
  if (!dir.exists(www)) www <- "www"
  for (f in c("css/app.css", "js/utils.js", "js/storage.js", "js/camera.js", "js/recorder.js",
              "js/teleprompter.js", "js/app.js", "js/finalize.js", "js/mp4info.js", "vendor/mediabunny.min.js", "manifest.webmanifest", "icons/icon.svg",
              "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png")) {
    expect_true(file.exists(file.path(www, f)), info = f)
  }
})
