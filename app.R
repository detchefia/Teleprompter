# Teleprompter web com gravação de vídeo
#
# Os arquivos em R/ são carregados automaticamente pelo Shiny (>= 1.5).
# Execute com:  shiny::runApp()

library(shiny)

options(shiny.maxRequestSize = 1 * 1024^2) # nenhum upload de vídeo é esperado

shinyApp(ui = app_ui, server = app_server)
