# Executa os testes: Rscript tests/testthat.R  (a partir da raiz do projeto)
library(testthat)
for (f in list.files("R", pattern = "[.]R$", full.names = TRUE)) source(f, encoding = "UTF-8")
test_dir("tests/testthat", reporter = "summary", stop_on_failure = TRUE)
