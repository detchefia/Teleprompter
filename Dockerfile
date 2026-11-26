# Imagem de produção do teleprompter (R + Shiny).
# HTTPS deve ser feito por um proxy reverso (veja docker-compose.yml + Caddyfile).
FROM rocker/r-ver:4.4.2

RUN R -q -e "install.packages(c('shiny', 'jsonlite', 'htmltools'), repos = 'https://packagemanager.posit.co/cran/__linux__/jammy/latest')" \
 && useradd --create-home --shell /bin/bash shiny

WORKDIR /app
COPY app.R ./
COPY R ./R
COPY www ./www

USER shiny
EXPOSE 3838
CMD ["R", "-q", "-e", "shiny::runApp('/app', host = '0.0.0.0', port = 3838, launch.browser = FALSE)"]
