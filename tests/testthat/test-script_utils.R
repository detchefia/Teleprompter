test_that("normalize_script limpa espaços e quebras", {
  expect_equal(normalize_script(NULL), "")
  expect_equal(normalize_script(NA), "")
  expect_equal(normalize_script("  a  \r\nb\t\t c  "), "a\nb c")
  expect_equal(normalize_script("a\n\n\n\n\nb"), "a\n\nb")
  expect_equal(normalize_script("x y"), "x y")
})

test_that("count_words lida com acentos, hífens e apóstrofos", {
  expect_equal(count_words(""), 0L)
  expect_equal(count_words("Olá, mundo!"), 2L)
  expect_equal(count_words("Ação pública é guarda-chuva d'água"), 5L)
  expect_equal(count_words("2026 é o ano"), 4L)
})

test_that("count_paragraphs separa blocos", {
  expect_equal(count_paragraphs(""), 0L)
  expect_equal(count_paragraphs("um\ndois"), 1L)
  expect_equal(count_paragraphs("um\n\ndois\n\n\n\ntrês"), 3L)
})

test_that("estimate_duration e format_duration", {
  expect_equal(estimate_duration(140, 140), 60)
  expect_equal(estimate_duration(0, 140), 0)
  expect_equal(estimate_duration(100, "abc"), round(100 / 140 * 60))
  expect_equal(estimate_duration(400, 1), 400 / 40 * 60) # limite mínimo de 40 pal/min
  expect_equal(format_duration(0), "0:00")
  expect_equal(format_duration(65), "1:05")
  expect_equal(format_duration(3725), "1:02:05")
})

test_that("script_stats devolve resumo coerente", {
  s <- script_stats("Um dois três.\n\nQuatro cinco.", wpm = 150)
  expect_equal(s$words, 5L)
  expect_equal(s$paragraphs, 2L)
  expect_equal(s$seconds, 2)
  expect_equal(s$duration, "0:02")
  expect_true(nchar(sample_script()) > 100)
})
