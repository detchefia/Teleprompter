test_that("server calcula estatísticas e envia o roteiro ao cliente", {
  shiny::testServer(app_server, {
    session$setInputs(script = "Um dois três quatro.\n\nCinco seis.", tp_wpm = 120)
    session$elapse(500)
    s <- stats()
    expect_equal(s$words, 6L)
    expect_equal(s$paragraphs, 2L)
    expect_equal(s$seconds, 3)
    html <- as.character(output$stats$html)
    expect_match(html, "6</strong>[[:space:]]*palavras")
    expect_match(html, "120 pal/min", fixed = TRUE)
  })
})

test_that("load_script normaliza, atualiza o editor e devolve o texto", {
  shiny::testServer(app_server, {
    out <- load_script(session, "  Texto   gerado 


por IA ", source = "ia")
    expect_equal(out, "Texto gerado

por IA")
  })
})

test_that("push_script envia mensagem no formato esperado pelo JavaScript", {
  sent <- list()
  fake <- list(sendCustomMessage = function(type, message) sent[[length(sent) + 1]] <<- list(type = type, msg = message))
  push_script(fake, "Texto gerado

por IA", source = "ia")
  expect_equal(sent[[1]]$type, "tp:script")
  expect_equal(sent[[1]]$msg$source, "ia")
  expect_equal(sent[[1]]$msg$words, 4L)
  expect_equal(sent[[1]]$msg$text, "Texto gerado

por IA")
})
