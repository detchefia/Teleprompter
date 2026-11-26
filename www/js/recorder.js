/* Gravação com MediaRecorder.
 * Grava diretamente o MediaStream da câmera: o texto do teleprompter e o
 * espelhamento da pré-visualização (CSS) não fazem parte do arquivo. */
(function (TP) {
  "use strict";
  var U = TP.utils;

  var TIMESLICE_MS = 1000;

  function isSupported() {
    return typeof window.MediaRecorder === "function";
  }

  /** Formatos que produziram arquivo vazio neste aparelho (evitados nas próximas gravações). */
  function badMimes() { return (TP.storage && TP.storage.get("badMimes", [])) || []; }
  function markBadMime(mime) {
    var list = badMimes();
    if (list.indexOf(mime) === -1) list.push(mime);
    if (TP.storage) TP.storage.set("badMimes", list);
  }

  function supportedMime(platform) {
    if (!isSupported() || typeof MediaRecorder.isTypeSupported !== "function") return "";
    return U.pickMimeType(function (t) { return window.MediaRecorder.isTypeSupported(t); },
      U.mimeCandidates(platform, badMimes()));
  }

  /**
   * @param {MediaStream} stream
   * @param {{onError?:Function, onData?:Function, platform?:object}} opts
   */
  function Recorder(stream, opts) {
    this.stream = stream;
    this.opts = opts || {};
    this.chunks = [];
    this.rec = null;
    this.mimeType = "";
    this.startedAt = 0;
    this.pausedAt = 0;
    this.pausedTotal = 0;
    this._stopPromise = null;
    this._discard = false;
    this.requestedMime = "";
    this.diag = { events: 0, bytes: 0, error: "" };
  }

  Recorder.prototype.canPause = function () {
    return !!(this.rec && typeof this.rec.pause === "function" && typeof this.rec.resume === "function");
  };

  Recorder.prototype.state = function () { return this.rec ? this.rec.state : "inactive"; };

  Recorder.prototype.start = function () {
    if (!isSupported()) { var e = new Error("MediaRecorder indisponível"); e.name = "RecorderUnsupported"; throw e; }
    var self = this;
    var p = this.opts.platform || {};
    var safari = !!(p.safari || p.iOS);
    var mime = supportedMime(p);
    var hasAudio = this.stream.getAudioTracks().length > 0;
    var options = {};
    // Taxa de bits define o tamanho do arquivo (qualidade escolhida pelo usuário).
    // Se uma gravação anterior veio vazia com taxa fixa, este aparelho passa a
    // deixar o navegador decidir (camada de segurança).
    var vbr = Number(this.opts.videoBitsPerSecond) || 3500000;
    this.videoBitsPerSecond = vbr;
    this.usedBitrate = !(TP.storage && TP.storage.get("recNoBitrate", false));
    if (this.usedBitrate) {
      options.videoBitsPerSecond = vbr;
      if (hasAudio) options.audioBitsPerSecond = 128000;
    }
    if (mime) options.mimeType = mime;
    this.requestedMime = mime;

    try {
      this.rec = new MediaRecorder(this.stream, options);
    } catch (err) {
      // Alguns navegadores recusam opções específicas: deixa o navegador escolher.
      try { this.rec = new MediaRecorder(this.stream); mime = ""; }
      catch (err2) { err2.name = err2.name || "RecorderUnsupported"; throw err2; }
    }
    this.mimeType = this.rec.mimeType || mime || "";
    this.chunks = [];

    this.rec.ondataavailable = function (ev) {
      self.diag.events++;
      if (ev.data && ev.data.size > 0) {
        self.chunks.push(ev.data);
        self.diag.bytes += ev.data.size;
        if (self._onData) self._onData();
      }
    };
    this.rec.onerror = function (ev) {
      var err = (ev && ev.error) || new Error("Erro na gravação");
      self.diag.error = (err.name || "Error") + (err.message ? ": " + err.message : "");
      if (self.opts.onError) self.opts.onError(err);
    };

    // Fatias de 1 s em todos os navegadores, inclusive no Safari:
    // - o navegador entrega o vídeo aos poucos em vez de acumular tudo até o fim
    //   (suspeita de a imagem travar em gravações longas no iPhone);
    // - se algo falhar no meio, o que já foi gravado está preservado.
    // As fatias formam um MP4 fragmentado contínuo, reorganizado depois (finalize.js).
    this.timeslice = TIMESLICE_MS;
    this.rec.start(TIMESLICE_MS);

    this.startedAt = performance.now();
    this.pausedTotal = 0;
    this.pausedAt = 0;
  };

  Recorder.prototype.pause = function () {
    if (!this.canPause() || this.rec.state !== "recording") return false;
    try { this.rec.pause(); } catch (e) { return false; }
    this.pausedAt = performance.now();
    return true;
  };

  Recorder.prototype.resume = function () {
    if (!this.canPause() || this.rec.state !== "paused") return false;
    try { this.rec.resume(); } catch (e) { return false; }
    this.pausedTotal += performance.now() - this.pausedAt;
    this.pausedAt = 0;
    return true;
  };

  /** Tempo efetivamente gravado (sem pausas), em ms. */
  Recorder.prototype.elapsed = function () {
    if (!this.startedAt) return 0;
    var now = this.pausedAt || performance.now();
    return Math.max(0, now - this.startedAt - this.pausedTotal);
  };

  /** Finaliza e resolve com { blob, mimeType, ext, durationMs, size } (ou null se descartado/vazio). */
  Recorder.prototype.stop = function () {
    var self = this;
    if (this._stopPromise) return this._stopPromise;
    var durationMs = this.elapsed();
    this._stopPromise = new Promise(function (resolve) {
      if (!self.rec || self.rec.state === "inactive") { resolve(self._build(durationMs)); return; }
      var done = false, stopped = false, graceTimer = 0, hardTimer = 0;
      function finish() {
        if (done) return; done = true;
        self._onData = null;
        clearTimeout(graceTimer); clearTimeout(hardTimer);
        resolve(self._build(durationMs));
      }
      function settle(ms) { clearTimeout(graceTimer); graceTimer = setTimeout(finish, ms); }
      // Depois do "stop": se já há dados, espera um instante por um último pedaço
      // atrasado; se não há nenhum, espera mais (o navegador pode demorar).
      self._onData = function () { if (stopped) settle(400); };
      self.rec.addEventListener("stop", function () {
        stopped = true;
        settle(self.chunks.length ? 400 : 10000);
      }, { once: true });
      // Garantia para navegadores que não disparam "stop" (stream encerrado):
      // prazo generoso e proporcional à duração da gravação.
      hardTimer = setTimeout(finish, Math.max(15000, Math.min(120000, durationMs * 2)));
      // Sem requestData() no Safari: lá gravamos o arquivo inteiro de uma vez.
      var p = self.opts.platform || {};
      try {
        if (self.rec.state === "paused") self.rec.resume();
        if (!(p.safari || p.iOS) && self.rec.requestData && self.rec.state === "recording") self.rec.requestData();
      } catch (e) { /* ignora */ }
      try { self.rec.stop(); }
      catch (e) { self.diag.error = self.diag.error || String(e && e.name); stopped = true; finish(); }
    });
    return this._stopPromise;
  };

  /** Interrompe e descarta tudo. */
  Recorder.prototype.cancel = function () {
    this._discard = true;
    return this.stop();
  };

  Recorder.prototype._build = function (durationMs) {
    var chunks = this.chunks;
    this.chunks = [];
    if (this._discard) return null;
    if (!chunks.length) { this._markEmpty(); return null; }
    // Prefere o tipo real informado pelo navegador nos dados.
    var type = (chunks[0].type || (this.rec && this.rec.mimeType) || this.mimeType || "video/mp4").split(";")[0];
    var blob = new Blob(chunks, { type: type });
    if (!blob.size) { this._markEmpty(); return null; }
    return { blob: blob, mimeType: type, ext: U.extensionForMime(type), durationMs: durationMs, size: blob.size };
  };

  /** Gravação vazia: evita este formato nas próximas vezes neste aparelho. */
  Recorder.prototype._markEmpty = function () {
    // Primeiro desliga a taxa de bits fixa; se ainda falhar, evita o formato.
    if (this.usedBitrate) { if (TP.storage) TP.storage.set("recNoBitrate", true); }
    else if (this.requestedMime) markBadMime(this.requestedMime);
  };

  /** Resumo técnico curto, mostrado quando algo falha (ajuda no suporte). */
  Recorder.prototype.describe = function () {
    return "formato " + (this.requestedMime || "automático") + " > " + ((this.rec && this.rec.mimeType) || "?") +
      "; fatias " + (this.timeslice ? this.timeslice / 1000 + " s" : "não") +
      "; partes " + this.diag.events + "; bytes " + this.diag.bytes +
      (this.usedBitrate ? "; taxa " + (this.videoBitsPerSecond / 1e6) + " Mbps" : "; taxa automática") +
      (this.diag.error ? "; erro " + this.diag.error : "");
  };

  TP.recorder = {
    isSupported: isSupported,
    supportedMime: supportedMime,
    create: function (stream, opts) { return new Recorder(stream, opts); }
  };
})(window.TP = window.TP || {});
