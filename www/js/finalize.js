/* Pós-processamento do vídeo gravado, no próprio aparelho.
 *
 * Objetivo: entregar sempre um MP4 "padrão de câmera" (H.264 + AAC, índice no
 * início), que o app Fotos, o WhatsApp e o Instagram aceitam.
 *
 * - O MediaRecorder gera MP4 fragmentado (ou WebM em alguns navegadores).
 * - Se o vídeo já é H.264/AAC, apenas reorganiza o arquivo (cópia, sem perda).
 * - Se não é, recodifica para H.264/AAC quando o navegador permite (WebCodecs).
 * - Se nada disso for possível, mantém o original e informa o motivo.
 *
 * Usa a biblioteca mediabunny (MPL-2.0, www/vendor), carregada só quando
 * necessária. Nada é enviado ao servidor. */
(function (TP) {
  "use strict";

  var LIB_URL = "vendor/mediabunny.min.js?v=1.60.0";
  var loading = null;

  var LABELS = {
    avc: "H.264", hevc: "HEVC", vp8: "VP8", vp9: "VP9", av1: "AV1",
    aac: "AAC", opus: "Opus", mp3: "MP3", vorbis: "Vorbis", flac: "FLAC"
  };

  function label(codec) { return codec ? (LABELS[codec] || String(codec).toUpperCase()) : "?"; }

  function load() {
    if (window.Mediabunny) return Promise.resolve(window.Mediabunny);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = LIB_URL;
      s.async = true;
      s.onload = function () {
        if (window.Mediabunny) resolve(window.Mediabunny);
        else { loading = null; reject(new Error("conversor não inicializou")); }
      };
      s.onerror = function () { loading = null; reject(new Error("falha ao carregar o conversor")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function withTimeout(promise, ms, what) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error("tempo esgotado: " + what)); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function openInput(MB, blob) {
    return new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(blob) });
  }

  /** Codecs e dimensões do arquivo gravado. */
  function probe(MB, blob) {
    var input = openInput(MB, blob);
    return Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]).then(function (t) {
      var v = t[0], a = t[1];
      return Promise.all([
        v ? v.getCodec() : null,
        v ? v.getDisplayWidth() : 0,
        v ? v.getDisplayHeight() : 0,
        a ? a.getCodec() : null
      ]).then(function (x) {
        return { video: x[0], width: x[1], height: x[2], audio: x[3], hasAudio: !!a };
      });
    });
  }

  /** Gera MP4 com índice no início. Com `standardCodecs`, exige H.264/AAC. */
  function convert(MB, blob, standardCodecs, onProgress) {
    var output = new MB.Output({
      format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new MB.BufferTarget()
    });
    var options = { input: openInput(MB, blob), output: output };
    if (standardCodecs) {
      options.video = { codec: "avc" };
      options.audio = { codec: "aac" };
    }
    return MB.Conversion.init(options).then(function (conv) {
      // Nunca aceitar perder uma trilha (ex.: áudio que não pôde ser convertido).
      if (!conv.isValid || (conv.discardedTracks && conv.discardedTracks.length)) {
        var why = (conv.discardedTracks || []).map(function (d) { return d.reason; }).join(", ");
        throw new Error("conversão incompleta" + (why ? " (" + why + ")" : ""));
      }
      if (onProgress) conv.onProgress = function (p) { onProgress(p); };
      return conv.execute().then(function () {
        var buf = output.target.buffer;
        if (!buf || !buf.byteLength) throw new Error("conversão vazia");
        return new Blob([buf], { type: "video/mp4" });
      });
    });
  }

  function copy(result) {
    var out = {};
    Object.keys(result).forEach(function (k) { out[k] = result[k]; });
    return out;
  }

  function describe(info) {
    if (!info) return "";
    var codecs = label(info.video) + (info.hasAudio ? " + " + label(info.audio) : "");
    var size = info.width && info.height ? " · " + info.width + "×" + info.height : "";
    return codecs + size;
  }

  /** Mede quadros/segundos de vídeo e áudio (leitor independente, mp4info.js). */
  function measure(blob) {
    if (!TP.mp4info) return Promise.resolve(null);
    return TP.mp4info.inspect(blob).catch(function (err) {
      console.warn("[teleprompter] leitura do MP4:", err);
      return null;
    });
  }

  /** O resultado perdeu imagem em relação ao original? */
  function lostVideo(raw, fin) {
    if (!raw || !raw.video) return false;          // sem medida do original: nada a comparar
    if (!fin || !fin.video) return true;
    return fin.video.duration < raw.video.duration - 1;
  }

  function secs(x) { return x.toFixed(1).replace(".", ",") + " s"; }

  function describeTracks(m) {
    if (!m) return "não medido";
    var parts = [];
    if (m.video) parts.push("vídeo " + secs(m.video.duration) + " (" + m.video.samples + " quadros)");
    else parts.push("sem vídeo");
    if (m.audio) parts.push("áudio " + secs(m.audio.duration));
    if (m.fragmented) parts.push("fragmentado em " + m.fragments);
    return parts.join(", ");
  }

  /**
   * Recebe o resultado do gravador e devolve outro pronto para salvar/compartilhar.
   * Nunca rejeita: em caso de falha devolve o original com `finalizeError`.
   *
   * Autoverificação: mede a trilha de vídeo do original e do resultado; se o
   * resultado tiver menos imagem que o original, ele é descartado. Se o próprio
   * original tiver imagem mais curta que o áudio, avisa (`videoGap`): a câmera
   * ou o navegador parou de enviar imagem durante a gravação.
   * @param {function(number)=} onProgress progresso 0..1 (só quando recodifica)
   */
  function process(result, onProgress) {
    if (!result) return Promise.resolve(result);
    var ms = Math.max(45000, Math.min(600000, (result.durationMs || 0) * 3));
    var raw = null;
    var work = Promise.all([load(), result.ext === "mp4" ? measure(result.blob) : Promise.resolve(null)]).then(function (x) {
      var MB = x[0];
      raw = x[1];
      return probe(MB, result.blob).then(function (info) {
        var standard = info.video === "avc" && (!info.hasAudio || info.audio === "aac");
        function attempt(standardCodecs, progress) {
          return convert(MB, result.blob, standardCodecs, progress).then(function (blob) {
            return measure(blob).then(function (fin) {
              if (lostVideo(raw, fin)) {
                throw new Error("a conversão perdeu imagem (" + describeTracks(fin) + "; original: " + describeTracks(raw) + ")");
              }
              return { blob: blob, fin: fin };
            });
          });
        }
        return attempt(true, standard ? null : onProgress).then(function (r) {
          return { blob: r.blob, fin: r.fin, transcoded: !standard,
            info: { video: "avc", audio: info.hasAudio ? "aac" : null, width: info.width, height: info.height, hasAudio: info.hasAudio } };
        }, function (err) {
          // Não foi possível garantir H.264/AAC: ao menos padroniza o MP4 original.
          if (result.ext !== "mp4") throw err;
          console.warn("[teleprompter] sem recodificação:", err);
          return attempt(false).then(function (r) {
            return { blob: r.blob, fin: r.fin, info: info, transcoded: false,
              warning: "formato " + describe(info) + " pode não ser aceito pelo Fotos/WhatsApp (" + ((err && err.message) || err) + ")" };
          });
        });
      });
    });
    return withTimeout(work, ms, "conversão").then(function (r) {
      var out = copy(result);
      out.blob = r.blob;
      out.size = r.blob.size;
      out.mimeType = "video/mp4";
      out.ext = "mp4";
      out.standardized = true;
      out.transcoded = r.transcoded;
      out.info = r.info;
      out.formatLabel = describe(r.info);
      // "Compatível" = H.264 + AAC (formato da câmera do iPhone).
      out.compatible = r.info.video === "avc" && (!r.info.hasAudio || r.info.audio === "aac");
      if (r.warning) out.finalizeWarning = r.warning;
      out.rawTracks = raw;
      out.finalTracks = r.fin;
      out.tracksText = { raw: describeTracks(raw), final: describeTracks(r.fin) };
      out.videoGap = TP.mp4info ? TP.mp4info.videoGap(r.fin || raw) : 0;
      if (out.videoGap) out.videoEnd = (r.fin || raw).video.duration;
      return out;
    }).catch(function (err) {
      console.warn("[teleprompter] preparação do vídeo:", err);
      var out = copy(result);
      out.finalizeError = (err && err.message) || String(err);
      out.rawTracks = raw;
      out.tracksText = { raw: describeTracks(raw), final: "original mantido" };
      out.videoGap = TP.mp4info ? TP.mp4info.videoGap(raw) : 0;
      if (out.videoGap) out.videoEnd = raw.video.duration;
      return out;
    });
  }

  TP.finalize = { preload: load, process: process, describe: describe };
})(window.TP = window.TP || {});
