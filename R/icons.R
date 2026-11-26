# Ícones SVG embutidos (sem CDN: funcionam offline e não dependem de terceiros).
# Traços no estilo "outline", 24x24, herdam a cor via currentColor.

.icon_paths <- list(
  play       = '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor" stroke="none"/>',
  pause      = '<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>',
  restart    = '<path d="M5 5v14"/><path d="M19 5 9 12l10 7V5z" fill="currentColor"/>',
  back       = '<path d="M11 19 4 12l7-7"/><path d="M20 19l-7-7 7-7"/>',
  forward    = '<path d="m13 5 7 7-7 7"/><path d="m4 5 7 7-7 7"/>',
  close      = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  camera     = '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>',
  switch_cam = '<path d="M20 8h-3.5L14 5h-4L7.5 8H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2z"/><path d="M9 14.5a3 3 0 0 0 5.2 1.6"/><path d="M15 13.5a3 3 0 0 0-5.2-1.6"/><path d="M14.2 17.8v-1.7h1.7"/><path d="M9.8 10.2v1.7H8.1"/>',
  mirror     = '<path d="M12 3v18" stroke-dasharray="2 2.5"/><path d="M9 7 4 17h5V7z"/><path d="M15 7l5 10h-5V7z" fill="currentColor"/>',
  fullscreen = '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  settings   = '<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="18" cy="18" r="2"/>',
  minus      = '<path d="M5 12h14"/>',
  plus       = '<path d="M12 5v14"/><path d="M5 12h14"/>',
  download   = '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  share      = '<path d="M12 3v13"/><path d="m7 8 5-5 5 5"/><path d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5"/>',
  trash      = '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  redo       = '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  clear      = '<path d="M20 20H9L4 15a1.5 1.5 0 0 1 0-2L13 4a1.5 1.5 0 0 1 2 0l5 5a1.5 1.5 0 0 1 0 2l-8 9"/><path d="m9 9 7 7"/>',
  paste      = '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  file       = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  video      = '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
  stop       = '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/>',
  info       = '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  frame      = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18" stroke-dasharray="2 2"/><path d="M16 3v18" stroke-dasharray="2 2"/>'
)

#' Gera um ícone SVG inline
#' @param name nome do ícone em `.icon_paths`.
#' @param class classes CSS adicionais.
svg_icon <- function(name, class = NULL) {
  path <- .icon_paths[[name]]
  if (is.null(path)) stop("Ícone desconhecido: ", name, call. = FALSE)
  htmltools::HTML(sprintf(
    '<svg class="icon%s" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">%s</svg>',
    if (is.null(class)) "" else paste0(" ", class),
    path
  ))
}

# Mapa de ícones enviado ao JavaScript (para trocar play/pause etc.)
icon_svg_string <- function(name) as.character(svg_icon(name))
