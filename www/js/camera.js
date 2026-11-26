/* Acesso à câmera e ao microfone (getUserMedia) com tentativas progressivas. */
(function (TP) {
  "use strict";

  var AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function videoConstraints(facingMode, level, size) {
    // level 0: pedido completo; 1: só a câmera desejada; 2: qualquer câmera
    // Largura/altura em formato paisagem: os navegadores giram para retrato.
    if (level === 0) {
      size = size || { width: 1920, height: 1080 };
      return { facingMode: { ideal: facingMode }, width: { ideal: size.width }, height: { ideal: size.height }, frameRate: { ideal: 30, max: 30 } };
    }
    if (level === 1) return { facingMode: { ideal: facingMode } };
    return true;
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* ignora */ } });
  }

  /**
   * Abre a câmera. Resolve com { stream, hasAudio, facingMode, warning }.
   * Tenta primeiro vídeo+áudio; se o microfone não existir ou estiver ocupado,
   * continua só com vídeo (avisando o usuário). Erros de permissão não são
   * repetidos para não gerar vários pedidos ao usuário.
   */
  function open(facingMode, size) {
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      return Promise.reject({ name: "InsecureContext" });
    }
    if (!isSupported()) return Promise.reject({ name: "Unsupported" });

    var md = navigator.mediaDevices;
    var attempts = [
      { video: videoConstraints(facingMode, 0, size), audio: AUDIO },
      { video: videoConstraints(facingMode, 1), audio: true },
      { video: true, audio: true }
    ];

    function tryAt(i, lastErr) {
      if (i >= attempts.length) return Promise.reject(lastErr);
      return md.getUserMedia(attempts[i]).catch(function (err) {
        var n = err && err.name;
        if (n === "OverconstrainedError" || n === "ConstraintNotSatisfiedError") return tryAt(i + 1, err);
        throw err;
      });
    }

    return tryAt(0).then(function (stream) {
      return { stream: stream, hasAudio: stream.getAudioTracks().length > 0, facingMode: facingMode };
    }).catch(function (err) {
      var n = err && err.name;
      // Sem microfone (ou ocupado): segue apenas com vídeo.
      if (n === "NotFoundError" || n === "NotReadableError" || n === "DevicesNotFoundError") {
        return md.getUserMedia({ video: videoConstraints(facingMode, 1), audio: false }).then(function (stream) {
          return {
            stream: stream, hasAudio: false, facingMode: facingMode,
            warning: "Microfone indisponível: o vídeo será gravado sem áudio."
          };
        }, function () { throw err; });
      }
      throw err;
    });
  }

  /** Quantidade de câmeras (só é confiável depois da permissão). */
  function countCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve(0);
    return navigator.mediaDevices.enumerateDevices().then(function (list) {
      return list.filter(function (d) { return d.kind === "videoinput"; }).length;
    }).catch(function () { return 0; });
  }

  /** Descobre se a câmera em uso é frontal (quando o navegador informa). */
  function actualFacing(stream, requested) {
    try {
      var track = stream.getVideoTracks()[0];
      var s = track && track.getSettings ? track.getSettings() : {};
      if (s.facingMode === "user" || s.facingMode === "environment") return s.facingMode;
    } catch (e) { /* ignora */ }
    return requested;
  }

  TP.camera = { isSupported: isSupported, open: open, stop: stopStream, countCameras: countCameras, actualFacing: actualFacing };
})(window.TP = window.TP || {});
