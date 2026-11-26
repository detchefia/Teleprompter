/* Funções puras e utilitários sem dependência do DOM.
 * Carregado no navegador (window.TP.utils) e também no Node para testes. */
(function (root, factory) {
  var utils = factory();
  if (typeof module === "object" && module.exports) module.exports = utils;
  else { root.TP = root.TP || {}; root.TP.utils = utils; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clamp(v, min, max) {
    v = Number(v);
    if (!isFinite(v)) v = min;
    return Math.min(max, Math.max(min, v));
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /** 65000 ms -> "01:05"; 3725000 -> "1:02:05" */
  function formatClock(ms) {
    var total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h > 0 ? h + ":" + pad2(m) + ":" + pad2(s) : pad2(m) + ":" + pad2(s);
  }

  function formatBytes(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
  }

  /* Formatos em ordem de preferência. MP4 (H.264/AAC) primeiro por ser o mais
   * aceito por WhatsApp/Instagram/galeria; WebM como alternativa (Chrome/Firefox
   * antigos). A escolha real é feita perguntando ao navegador. */
  var MIME_CANDIDATES = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1.4D401F,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=h264,opus",
    "video/webm"
  ];

  /* Safari (iPhone/Mac): só MP4 (o Fotos e o WhatsApp não aceitam WebM) e
   * com H.264 + AAC pedidos explicitamente — sem codecs, o navegador escolhe
   * (o Chrome, por exemplo, grava VP9 + Opus dentro do MP4, que o iPhone recusa).
   * Perfil High/Main nível 4.2 comporta 1080p (o nível 3.0 usado na 1ª versão
   * não comporta nem 720p). Se um formato gerar arquivo vazio, o próximo é usado. */
  var SAFARI_CANDIDATES = [
    "video/mp4;codecs=avc1.64002A,mp4a.40.2",
    "video/mp4;codecs=avc1.4D402A,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4"
  ];

  /** Candidatos conforme a plataforma, sem os formatos que já falharam neste aparelho. */
  function mimeCandidates(platform, exclude) {
    var list = platform && (platform.iOS || platform.safari) ? SAFARI_CANDIDATES : MIME_CANDIDATES;
    exclude = exclude || [];
    return list.filter(function (m) { return exclude.indexOf(m) === -1; });
  }

  /** Retorna o primeiro MIME suportado ou "" (deixa o navegador decidir). */
  function pickMimeType(isTypeSupported, candidates) {
    candidates = candidates || MIME_CANDIDATES;
    if (typeof isTypeSupported !== "function") return "";
    for (var i = 0; i < candidates.length; i++) {
      try { if (isTypeSupported(candidates[i])) return candidates[i]; } catch (e) { /* ignora */ }
    }
    return "";
  }

  /* Qualidade = resolução pedida à câmera + taxa de bits da gravação.
   * Tamanho aproximado por minuto = (vídeo + 128 kbps de áudio) * 60 / 8. */
  var QUALITY_PRESETS = {
    leve:   { width: 1280, height: 720,  videoBitsPerSecond: 1500000 },
    padrao: { width: 1920, height: 1080, videoBitsPerSecond: 3500000 },
    alta:   { width: 1920, height: 1080, videoBitsPerSecond: 6000000 }
  };

  function qualityPreset(key) {
    return QUALITY_PRESETS[key] || QUALITY_PRESETS.padrao;
  }

  function extensionForMime(mime) {
    mime = String(mime || "").toLowerCase();
    if (mime.indexOf("mp4") !== -1) return "mp4";
    if (mime.indexOf("quicktime") !== -1) return "mov";
    if (mime.indexOf("x-matroska") !== -1) return "mkv";
    return "webm";
  }

  function buildFileName(date, ext) {
    var d = date instanceof Date ? date : new Date();
    return "teleprompter-" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      "-" + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + "." + (ext || "webm");
  }

  /** Mesma normalização feita no R (usada se o servidor estiver desconectado). */
  function normalizeText(text) {
    return String(text == null ? "" : text)
      .replace(/\r\n?/g, "\n")
      .replace(/ /g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function countWords(text) {
    var m = normalizeText(text).match(/[\p{L}\p{N}]+(['’-][\p{L}\p{N}]+)*/gu);
    return m ? m.length : 0;
  }

  /**
   * Velocidade de rolagem em px/s para ler `words` palavras distribuídas em
   * `contentHeight` px a `wpm` palavras por minuto. Assim a duração da rolagem
   * corresponde à estimativa mostrada ao usuário.
   */
  function pxPerSecond(wpm, contentHeight, words, fallbackLineHeight) {
    wpm = clamp(wpm, 20, 600);
    if (words > 0 && contentHeight > 0) return (contentHeight / words) * (wpm / 60);
    // Sem texto medido: ~6 palavras por linha
    return ((fallbackLineHeight || 40) / 6) * (wpm / 60);
  }

  /**
   * Conteúdo enviado à folha de compartilhamento: SOMENTE o arquivo.
   * Incluir title/text junto do vídeo faz o WhatsApp no iOS recusar
   * ("Esse item não pode ser compartilhado"), pois recebe itens mistos.
   */
  function sharePayload(file) {
    return { files: [file] };
  }

  /** Traduz erros de getUserMedia/MediaRecorder em mensagens amigáveis. */
  function friendlyMediaError(err, ctx) {
    ctx = ctx || {};
    var name = (err && (err.name || err.code)) || "Error";
    var msg = {
      title: "Não foi possível acessar a câmera",
      text: "Ocorreu um problema inesperado. Feche outros aplicativos que possam estar usando a câmera e tente novamente.",
      retry: true
    };
    switch (name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        msg.title = "Permissão negada";
        msg.text = "O acesso à câmera ou ao microfone foi bloqueado. Toque no ícone de cadeado (ou “aA” no Safari) " +
          "ao lado do endereço, permita câmera e microfone para este site e tente novamente.";
        break;
      case "NotFoundError":
      case "DevicesNotFoundError":
        msg.title = "Câmera não encontrada";
        msg.text = "Não encontramos uma câmera neste aparelho. Verifique se ela está conectada e habilitada.";
        break;
      case "NotReadableError":
      case "TrackStartError":
      case "AbortError":
        msg.title = "Câmera ocupada";
        msg.text = "A câmera ou o microfone está sendo usado por outro aplicativo (chamada de vídeo, outra aba…). " +
          "Feche-o e tente novamente.";
        break;
      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        msg.title = "Câmera incompatível";
        msg.text = "A câmera escolhida não aceita a configuração pedida. Tente alternar a câmera.";
        break;
      case "SecurityError":
      case "InsecureContext":
        msg.title = "Conexão não segura";
        msg.text = "O navegador só libera câmera e microfone em páginas HTTPS. Abra o endereço com https://.";
        msg.retry = false;
        break;
      case "Unsupported":
        msg.title = "Navegador sem suporte";
        msg.text = "Este navegador não permite usar a câmera. Use uma versão recente do Chrome, Safari, Edge ou Firefox.";
        msg.retry = false;
        break;
      case "RecorderUnsupported":
        msg.title = "Gravação indisponível";
        msg.text = "Este navegador mostra a câmera mas não consegue gravar vídeo. Atualize o sistema/navegador " +
          "ou use Chrome (Android) ou Safari (iOS 14.3+).";
        msg.retry = false;
        break;
    }
    if (ctx.inApp) {
      msg.text += " Se você abriu o link dentro de um aplicativo (Instagram, WhatsApp…), abra-o no navegador do aparelho.";
    }
    return msg;
  }

  function detectPlatform(ua, maxTouchPoints) {
    ua = String(ua || "");
    var iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (maxTouchPoints || 0) > 1);
    var android = /Android/i.test(ua);
    var safari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|Android/.test(ua);
    var inApp = /FBAN|FBAV|Instagram|Line\/|WhatsApp|MicroMessenger|; wv\)/i.test(ua);
    return { iOS: iOS, android: android, mobile: iOS || android || /Mobi/i.test(ua), safari: safari, inApp: inApp };
  }

  return {
    clamp: clamp,
    formatClock: formatClock,
    formatBytes: formatBytes,
    MIME_CANDIDATES: MIME_CANDIDATES,
    SAFARI_CANDIDATES: SAFARI_CANDIDATES,
    mimeCandidates: mimeCandidates,
    QUALITY_PRESETS: QUALITY_PRESETS,
    qualityPreset: qualityPreset,
    pickMimeType: pickMimeType,
    extensionForMime: extensionForMime,
    buildFileName: buildFileName,
    normalizeText: normalizeText,
    countWords: countWords,
    pxPerSecond: pxPerSecond,
    sharePayload: sharePayload,
    friendlyMediaError: friendlyMediaError,
    detectPlatform: detectPlatform
  };
});
