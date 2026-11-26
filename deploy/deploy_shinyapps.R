# Publica o app no shinyapps.io (HTTPS incluso, plano gratuito disponível).
#
# 1. Crie uma conta em https://www.shinyapps.io
# 2. Em Account > Tokens, copie nome da conta, token e secret.
# 3. Defina as variáveis de ambiente (NUNCA grave o token no código):
#      SHINYAPPS_ACCOUNT, SHINYAPPS_TOKEN, SHINYAPPS_SECRET
#    (por exemplo no arquivo ~/.Renviron, que não vai para o Git)
# 4. Na raiz do projeto:  Rscript deploy/deploy_shinyapps.R

if (!requireNamespace("rsconnect", quietly = TRUE)) {
  install.packages("rsconnect", repos = "https://cloud.r-project.org")
}

account <- Sys.getenv("SHINYAPPS_ACCOUNT")
token   <- Sys.getenv("SHINYAPPS_TOKEN")
secret  <- Sys.getenv("SHINYAPPS_SECRET")
if (!nzchar(account) || !nzchar(token) || !nzchar(secret)) {
  stop("Defina SHINYAPPS_ACCOUNT, SHINYAPPS_TOKEN e SHINYAPPS_SECRET.", call. = FALSE)
}

rsconnect::setAccountInfo(name = account, token = token, secret = secret)
rsconnect::deployApp(
  appDir = ".",
  appName = Sys.getenv("SHINYAPPS_APPNAME", "teleprompter"),
  appFiles = c("app.R", list.files("R", full.names = TRUE),
               list.files("www", recursive = TRUE, full.names = TRUE)),
  forceUpdate = TRUE,
  launch.browser = FALSE
)
