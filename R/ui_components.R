# Componentes de interface reutilizáveis (HTML semântico, acessível).

#' Botão só com ícone (rótulo acessível obrigatório)
icon_button <- function(id, icon, label, class = NULL, ...) {
  htmltools::tags$button(
    type = "button", id = id,
    class = paste(c("btn-icon", class), collapse = " "),
    `aria-label` = label, title = label,
    svg_icon(icon), ...
  )
}

#' Botão com ícone e texto
text_button <- function(id, icon, label, class = "btn", ...) {
  htmltools::tags$button(
    type = "button", id = id, class = class,
    if (!is.null(icon)) svg_icon(icon),
    htmltools::tags$span(label), ...
  )
}

#' Controle de uma configuração do teleprompter
#'
#' Os controles NÃO são inputs do Shiny: o JavaScript os gerencia (e guarda
#' no aparelho) porque afetam apenas a exibição local. Todos os controles com
#' o mesmo `data-setting` ficam sincronizados.
#'
#' @param key nome da configuração em `tp_settings()`.
#' @param prefix prefixo do id (permite repetir o controle em outro painel).
setting_control <- function(key, prefix = "set") {
  s <- tp_settings()[[key]]
  id <- paste0(prefix, "-", key)
  tags <- htmltools::tags
  switch(s$type,
    range = tags$div(
      class = "field field-range",
      tags$label(`for` = id, tags$span(s$label),
                 tags$output(class = "field-value", `data-output` = key, `for` = id,
                             paste0(s$value, if (nzchar(s$unit)) paste0(" ", s$unit)))),
      tags$input(type = "range", id = id, `data-setting` = key, `data-unit` = s$unit,
                 min = s$min, max = s$max, step = s$step, value = s$value)
    ),
    select = tags$div(
      class = "field field-select",
      tags$label(`for` = id, s$label),
      tags$select(id = id, `data-setting` = key,
                  lapply(names(s$choices), function(nm) {
                    v <- s$choices[[nm]]
                    tags$option(value = v, selected = if (identical(v, s$value)) NA, nm)
                  }))
    ),
    check = tags$div(
      class = "field field-check",
      tags$input(type = "checkbox", id = id, `data-setting` = key,
                 checked = if (isTRUE(s$value)) NA),
      tags$label(`for` = id, s$label)
    ),
    stop("Tipo de configuração desconhecido: ", s$type, call. = FALSE)
  )
}

#' Botões de velocidade pré-definida
speed_presets <- function() {
  htmltools::tags$div(
    class = "chip-row", role = "group", `aria-label` = "Velocidades pré-definidas",
    lapply(names(tp_speed_presets), function(nm) {
      htmltools::tags$button(type = "button", class = "chip", `data-wpm` = tp_speed_presets[[nm]],
                             sprintf("%s · %d", nm, tp_speed_presets[[nm]]))
    })
  )
}
