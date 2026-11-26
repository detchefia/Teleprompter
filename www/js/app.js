/* Orquestra a interface: editor, estúdio, contagem, gravação e revisão.
 * Tudo que envolve câmera e vídeo acontece aqui no navegador. */
(function (TP) {
  "use strict";
  var U = TP.utils, S = TP.storage;
  var $ = function (id) { return document.getElementById(id); };

  var cfg = JSON.parse($("tp-config").textContent);
  var platform = U.detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  document.documentElement.classList.toggle("is-ios", platform.iOS);
  document.documentElement.classList.toggle("is-touch", "ontouchstart" in window || navigator.maxTouchPoints > 0);

  var el = {
    script: $("script"), studio: $("studio"), video: $("camera-preview"),
    prompter: $("prompter"), prompterText: $("prompter-text"),
    play: $("btn-play"), record: $("btn-record"), recPause: $("btn-rec-pause"), recCancel: $("btn-rec-cancel"),
    recTime: $("rec-time"), recLabel: $("rec-label"), lastVideo: $("btn-last-video"),
    switchCam: $("btn-switch-camera"), mirror: $("btn-mirror"), frame: $("btn-frame"), fullscreen: $("btn-fullscreen"),
    quick: $("quick-settings"), quickBtn: $("btn-quick-settings"), speed: $("speed-value"),
    countdown: $("countdown"), countdownValue: $("countdown-value"),
    status: $("studio-status"), statusTitle: $("status-title"), statusText: $("status-text"),
    statusRetry: $("btn-status-retry"),
    review: $("review"), reviewVideo: $("review-video"), reviewInfo: $("review-info"), reviewHint: $("review-hint"),
    share: $("btn-share"), toasts: $("toasts")
  };

  var state = {
    settings: null,
    facing: "user",
    stream: null,
    hasAudio: false,
    cameraCount: 0,
    recorder: null,
    rec: "idle",          // idle | countdown | recording | paused | stopping
    recording: null,      // último vídeo: { blob, url, file, name, saved, ... }
    timer: 0,
    countdownTimer: 0,
    wakeLock: null,
    studioOpen: false,
    lastFocus: null
  };

  /* ------------------------------------------------------------ Ajustes */

  function loadSettings() {
    var saved = S.get("settings", {}) || {};
    var s = {};
    Object.keys(cfg.defaults).forEach(function (k) {
      var def = cfg.defaults[k], v = saved.hasOwnProperty(k) ? saved[k] : def;
      if (cfg.limits[k]) v = U.clamp(v, cfg.limits[k].min, cfg.limits[k].max);
      else if (typeof def === "boolean") v = !!v;
      else v = String(v);
      // Opção que deixou de existir (versão antiga do app): volta ao padrão.
      if (cfg.choices && cfg.choices[k] && cfg.choices[k].indexOf(v) === -1) v = def;
      s[k] = v;
    });
    return s;
  }

  function formatSetting(key, v) {
    var ctrl = document.querySelector('[data-setting="' + key + '"]');
    var unit = ctrl ? ctrl.getAttribute("data-unit") : "";
    if (key === "lineHeight") v = Number(v).toFixed(2).replace(".", ",");
    return v + (unit ? " " + unit : "");
  }

  function syncControls() {
    var s = state.settings;
    document.querySelectorAll("[data-setting]").forEach(function (c) {
      var k = c.getAttribute("data-setting");
      if (c.type === "checkbox") c.checked = !!s[k];
      else c.value = s[k];
    });
    document.querySelectorAll("[data-output]").forEach(function (o) {
      o.textContent = formatSetting(o.getAttribute("data-output"), s[o.getAttribute("data-output")]);
    });
    document.querySelectorAll(".chip[data-wpm]").forEach(function (c) {
      c.classList.toggle("is-active", Number(c.getAttribute("data-wpm")) === Number(s.wpm));
    });
    el.speed.textContent = s.wpm;
    el.mirror.setAttribute("aria-pressed", String(!!s.mirrorPreview));
  }

  var saveTimer = 0;
  function setSetting(key, value) {
    if (cfg.limits[key]) value = U.clamp(value, cfg.limits[key].min, cfg.limits[key].max);
    state.settings[key] = value;
    syncControls();
    applySettings();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { S.set("settings", state.settings); }, 300);
    if (key === "wpm") sendToShiny("tp_wpm", value);
  }

  function applySettings() {
    prompter.applySettings(state.settings);
    applyMirror();
  }

  function bindSettings() {
    document.querySelectorAll("[data-setting]").forEach(function (c) {
      var k = c.getAttribute("data-setting");
      c.addEventListener(c.type === "range" ? "input" : "change", function () {
        var v = c.type === "checkbox" ? c.checked : (c.type === "range" ? Number(c.value) : c.value);
        setSetting(k, v);
      });
    });
    document.querySelectorAll(".chip[data-wpm]").forEach(function (c) {
      c.addEventListener("click", function () { setSetting("wpm", Number(c.getAttribute("data-wpm"))); });
    });
    $("btn-reset-settings").addEventListener("click", function () {
      state.settings = JSON.parse(JSON.stringify(cfg.defaults));
      S.set("settings", state.settings);
      syncControls(); applySettings();
      sendToShiny("tp_wpm", state.settings.wpm);
      toast("Ajustes restaurados.");
    });
  }

  /* ------------------------------------------------------------ Shiny */

  function sendToShiny(name, value) {
    if (window.Shiny && typeof window.Shiny.setInputValue === "function") {
      try { window.Shiny.setInputValue(name, value); } catch (e) { /* ainda conectando */ }
    }
  }

  if (window.Shiny && typeof window.Shiny.addCustomMessageHandler === "function") {
    window.Shiny.addCustomMessageHandler("tp:script", function (msg) {
      // Roteiro vindo do servidor (hoje: editor normalizado; no futuro: IA, arquivos...).
      if (msg && msg.source !== "editor" && typeof msg.text === "string") {
        el.script.value = msg.text;
        saveScript();
      }
      if (state.studioOpen && msg && typeof msg.text === "string" && msg.source !== "editor") {
        prompter.setText(msg.text);
      }
    });
  }
  // Os eventos do Shiny são disparados via jQuery (não chegam a addEventListener).
  var $doc = window.jQuery ? window.jQuery(document) : null;
  $doc && $doc.on("shiny:connected", function () {
    document.body.classList.remove("is-offline");
    sendToShiny("tp_wpm", state.settings.wpm);
  });
  $doc && $doc.on("shiny:disconnected", function () {
    // Câmera, teleprompter e gravação não dependem do servidor.
    document.body.classList.add("is-offline");
    if (!state.studioOpen) toast("Conexão com o servidor perdida. O teleprompter e a gravação continuam funcionando; recarregue a página para atualizar as estatísticas.", "warn", 8000);
  });

  /* ------------------------------------------------------------ Roteiro */

  function currentScript() { return U.normalizeText(el.script.value); }

  function saveScript() { S.set("script", el.script.value); }

  function setScript(text) {
    el.script.value = text;
    // Notifica o Shiny (o binding do textarea escuta o evento "input").
    el.script.dispatchEvent(new Event("input", { bubbles: true }));
    if (window.jQuery) window.jQuery(el.script).trigger("change");
    saveScript();
  }

  function bindEditor() {
    // Salva a cada alteração: no celular o app pode ser fechado a qualquer momento.
    el.script.addEventListener("input", saveScript);

    $("btn-clear").addEventListener("click", function () {
      if (!el.script.value.trim()) return;
      confirmDialog({ title: "Limpar o texto?", text: "Todo o roteiro será apagado do editor.", ok: "Limpar", danger: true })
        .then(function (yes) { if (yes) { setScript(""); el.script.focus(); } });
    });

    $("btn-paste").addEventListener("click", function () {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        el.script.focus();
        toast("Toque e segure no campo de texto e escolha “Colar”.");
        return;
      }
      navigator.clipboard.readText().then(function (txt) {
        if (!txt) { toast("A área de transferência está vazia."); return; }
        var ta = el.script, start = ta.selectionStart || 0, end = ta.selectionEnd || 0;
        setScript(ta.value.slice(0, start) + txt + ta.value.slice(end));
        toast("Texto colado.");
      }).catch(function () {
        el.script.focus();
        toast("Não foi possível ler a área de transferência. Toque e segure no campo e escolha “Colar”.");
      });
    });

    $("btn-open-file").addEventListener("click", function () {
      // Criado na hora (e fora do DOM) para o Shiny não enviá-lo ao servidor.
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".txt,.md,text/plain";
      input.addEventListener("change", function () {
        var f = input.files && input.files[0];
        if (!f) return;
        if (f.size > 2 * 1024 * 1024) { toast("Arquivo muito grande (máx. 2 MB).", "error"); return; }
        var reader = new FileReader();
        reader.onload = function () { setScript(String(reader.result || "")); toast("Texto carregado de “" + f.name + "”."); };
        reader.onerror = function () { toast("Não foi possível ler o arquivo.", "error"); };
        reader.readAsText(f, "utf-8");
      });
      input.click();
    });

    $("btn-open-studio").addEventListener("click", openStudio);
  }

  /* ------------------------------------------------------------ Teleprompter */

  var prompter = new TP.Prompter(el.prompter, el.prompterText, {
    onState: function (playing) {
      el.play.innerHTML = playing ? cfg.icons.pause : cfg.icons.play;
      var label = playing ? "Pausar rolagem do texto" : "Iniciar rolagem do texto";
      el.play.setAttribute("aria-label", label); el.play.title = label;
    },
    onEnd: function () { if (state.rec === "recording") toast("Fim do texto."); }
  });

  function bindPrompterControls() {
    el.play.addEventListener("click", function () { prompter.toggle(); });
    $("btn-restart").addEventListener("click", function () { prompter.restart(); });
    $("btn-back").addEventListener("click", function () { prompter.nudge(-3); });
    $("btn-forward").addEventListener("click", function () { prompter.nudge(3); });
    $("btn-slower").addEventListener("click", function () { setSetting("wpm", state.settings.wpm - 10); });
    $("btn-faster").addEventListener("click", function () { setSetting("wpm", state.settings.wpm + 10); });

    var pending = false;
    function remeasure() {
      if (pending) return; pending = true;
      requestAnimationFrame(function () { pending = false; if (state.studioOpen) prompter.measure(prompter.progress()); });
    }
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", function () { setTimeout(remeasure, 300); });
  }

  /* ------------------------------------------------------------ Estúdio */

  function openStudio() {
    if (state.studioOpen) return;
    state.studioOpen = true;
    state.lastFocus = document.activeElement;
    el.studio.hidden = false;
    document.body.classList.add("studio-open");
    try { history.pushState({ studio: true }, ""); } catch (e) { /* ignora */ }
    prompter.setText(currentScript());
    applySettings();
    prompter.restart();
    updateRecUI();
    requestWakeLock();
    startCamera(state.facing);
    // Carrega o conversor de vídeo em segundo plano (fica em cache).
    setTimeout(function () { TP.finalize.preload().catch(function () { /* tenta de novo ao gravar */ }); }, 2500);
    el.record.focus({ preventScroll: true });
  }

  function closeStudio(fromHistory) {
    if (!state.studioOpen) return;
    if (state.rec === "recording" || state.rec === "paused") {
      if (fromHistory) { try { history.pushState({ studio: true }, ""); } catch (e) { /* ignora */ } }
      confirmDialog({ title: "Finalizar gravação?", text: "A gravação em andamento será finalizada para você revisar o vídeo.", ok: "Finalizar" })
        .then(function (yes) { if (yes) stopRecording(); });
      return;
    }
    if (state.rec === "countdown") cancelCountdown();
    state.studioOpen = false;
    prompter.pause();
    closeQuick();
    stopCamera();
    releaseWakeLock();
    exitFullscreen();
    el.studio.hidden = true;
    el.review.hidden = true;
    document.body.classList.remove("studio-open");
    if (!fromHistory && history.state && history.state.studio) { try { history.back(); } catch (e) { /* ignora */ } }
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus({ preventScroll: true });
  }

  window.addEventListener("popstate", function () {
    if (!el.review.hidden) { closeReview(); try { history.pushState({ studio: true }, ""); } catch (e) { /* ignora */ } return; }
    if (state.studioOpen) closeStudio(true);
  });

  function showStatus(title, text, opts) {
    opts = opts || {};
    el.statusTitle.textContent = title;
    el.statusText.textContent = text || "";
    el.statusRetry.hidden = !opts.retry;
    $("btn-status-back").hidden = !!opts.loading;
    el.status.classList.toggle("is-loading", !!opts.loading);
    el.status.hidden = false;
  }
  function hideStatus() { el.status.hidden = true; }

  function startCamera(facing) {
    stopCamera();
    showStatus("Ativando a câmera…", "Se o navegador perguntar, permita o uso da câmera e do microfone.", { loading: true });
    var token = (state.camToken = (state.camToken || 0) + 1);
    return TP.camera.open(facing, U.qualityPreset(state.settings.quality)).then(function (res) {
      if (token !== state.camToken || !state.studioOpen) { TP.camera.stop(res.stream); return; }
      state.stream = res.stream;
      state.hasAudio = res.hasAudio;
      state.facing = TP.camera.actualFacing(res.stream, facing);
      el.video.muted = true;
      el.video.srcObject = res.stream;
      var p = el.video.play();
      if (p && p.catch) p.catch(function () { /* autoplay bloqueado: o vídeo está mudo, tenta de novo no toque */ });
      res.stream.getTracks().forEach(function (t) {
        t.addEventListener("ended", function () { onTrackEnded(res.stream, t); });
      });
      applyMirror();
      hideStatus();
      if (res.warning) toast(res.warning, "warn", 6000);
      if (!TP.recorder.isSupported()) {
        var m = U.friendlyMediaError({ name: "RecorderUnsupported" });
        toast(m.text, "error", 8000);
      }
      TP.camera.countCameras().then(function (n) {
        state.cameraCount = n;
        el.switchCam.hidden = n < 2;
      });
      requestAnimationFrame(function () { prompter.measure(prompter.progress()); });
    }).catch(function (err) {
      if (token !== state.camToken) return;
      console.warn("[teleprompter] câmera:", err);
      var m = U.friendlyMediaError(err, platform);
      showStatus(m.title, m.text, { retry: m.retry });
    });
  }

  function stopCamera() {
    if (state.stream) TP.camera.stop(state.stream);
    state.stream = null;
    try { el.video.srcObject = null; } catch (e) { /* ignora */ }
  }

  function onTrackEnded(stream, track) {
    if (stream !== state.stream) return; // stream antigo (troca de câmera)
    if (state.rec === "recording" || state.rec === "paused") {
      toast("A câmera ou o microfone foi interrompido. O que já foi gravado foi mantido.", "warn", 7000);
      stopRecording();
    }
    if (track.kind === "video" && state.studioOpen) {
      showStatus("Câmera desligada", "A câmera foi interrompida pelo sistema ou por outro aplicativo.", { retry: true });
    }
  }

  function applyMirror() {
    var mirror = state.settings.mirrorPreview && state.facing === "user";
    el.video.classList.toggle("is-mirrored", !!mirror);
  }

  /* ------------------------------------------------------------ Gravação */

  function isBusy() { return state.rec === "recording" || state.rec === "paused" || state.rec === "stopping"; }

  function updateRecUI() {
    var r = state.rec;
    el.studio.classList.toggle("is-recording", r === "recording" || r === "paused" || r === "stopping");
    el.studio.classList.toggle("is-rec-paused", r === "paused");
    el.studio.classList.toggle("is-countdown", r === "countdown");
    var recLabel = r === "idle" ? "Iniciar gravação" : (r === "countdown" ? "Cancelar contagem" : "Finalizar gravação");
    el.record.setAttribute("aria-label", recLabel); el.record.title = recLabel;
    el.record.disabled = r === "stopping";
    el.recLabel.textContent = r === "paused" ? "PAUSADO" : "GRAVANDO";
    var canPause = !!(state.recorder && state.recorder.canPause());
    el.recPause.hidden = !canPause;
    el.recPause.innerHTML = (r === "paused" ? cfg.icons.play : cfg.icons.pause) + "<span>" + (r === "paused" ? "Continuar" : "Pausar") + "</span>";
    el.recPause.setAttribute("aria-label", r === "paused" ? "Continuar gravação" : "Pausar gravação");
    el.switchCam.disabled = r !== "idle";
    el.lastVideo.hidden = !(r === "idle" && state.recording);
  }

  function onRecordButton() {
    if (state.rec === "idle") return beginRecordingFlow();
    if (state.rec === "countdown") return cancelCountdown();
    if (state.rec === "recording" || state.rec === "paused") return stopRecording();
  }

  function beginRecordingFlow() {
    if (!state.stream) { toast("A câmera ainda não está ativa.", "warn"); return; }
    if (!TP.recorder.isSupported()) {
      var m = U.friendlyMediaError({ name: "RecorderUnsupported" });
      toast(m.text, "error", 8000); return;
    }
    var go = function () { closeQuick(); runCountdown(Number(state.settings.countdown) || 0, startRecording); };
    if (state.recording && !state.recording.saved) {
      confirmDialog({
        title: "Gravar novamente?",
        text: "O vídeo anterior ainda não foi salvo e será descartado.",
        ok: "Descartar e gravar", danger: true
      }).then(function (yes) { if (yes) { discardRecording(); go(); } });
    } else go();
  }

  function runCountdown(seconds, done) {
    if (state.settings.restartOnRecord) prompter.restart();
    prompter.pause();
    if (!seconds) { done(); return; }
    state.rec = "countdown"; updateRecUI();
    el.countdown.hidden = false;
    var n = seconds;
    function step() {
      if (state.rec !== "countdown") return;
      if (n > 0) {
        show(String(n)); n--;
        state.countdownTimer = setTimeout(step, 1000);
      } else {
        show("GRAVANDO", true);
        state.countdownTimer = setTimeout(function () { el.countdown.hidden = true; done(); }, 450);
      }
    }
    function show(txt, final) {
      el.countdownValue.textContent = txt;
      el.countdownValue.classList.toggle("is-final", !!final);
      // reinicia a animação
      el.countdownValue.classList.remove("tick"); void el.countdownValue.offsetWidth; el.countdownValue.classList.add("tick");
    }
    step();
  }

  function cancelCountdown() {
    clearTimeout(state.countdownTimer);
    el.countdown.hidden = true;
    state.rec = "idle"; updateRecUI();
  }

  function startRecording() {
    if (!state.stream) { state.rec = "idle"; updateRecUI(); return; }
    var rec = TP.recorder.create(state.stream, {
      platform: platform,
      videoBitsPerSecond: U.qualityPreset(state.settings.quality).videoBitsPerSecond,
      onError: function (err) {
        console.warn("[teleprompter] gravação:", err);
        toast("Ocorreu um erro na gravação (" + ((err && err.name) || "erro") + "). O que já foi gravado foi mantido.", "error", 9000);
        stopRecording();
      }
    });
    try { rec.start(); } catch (err) {
      console.warn("[teleprompter] start:", err);
      var m = U.friendlyMediaError(err && err.name === "RecorderUnsupported" ? err : { name: "RecorderUnsupported" });
      toast(m.text, "error", 8000);
      state.rec = "idle"; updateRecUI(); return;
    }
    state.recorder = rec;
    state.rec = "recording";
    el.recTime.textContent = "00:00";
    startFrameWatch(rec);
    clearInterval(state.timer);
    state.timer = setInterval(function () {
      el.recTime.textContent = U.formatClock(rec.elapsed());
      checkFrameWatch(rec);
    }, 250);
    if (state.settings.restartOnRecord) prompter.restart();
    if (state.settings.scrollOnRecord) prompter.play();
    updateRecUI();
  }

  /* ---------------------------------------------------- Vigia da imagem da câmera
   * Durante a gravação, confere se a câmera continua entregando quadros
   * (requestVideoFrameCallback no vídeo de pré-visualização), se a trilha de
   * vídeo foi silenciada pelo sistema ("mute") e se a imagem mudou de tamanho
   * (aparelho girado). Avisa na hora e registra para os detalhes técnicos. */

  var STALL_MS = 3000;

  function startFrameWatch(rec) {
    stopFrameWatch();
    var v = el.video, w = { rec: rec, last: performance.now(), frames: 0, stallAt: null, muteAt: null, resizes: [], rvfc: false };
    state.watch = w;
    if (typeof v.requestVideoFrameCallback === "function") {
      w.rvfc = true;
      var onFrame = function () {
        if (state.watch !== w) return;
        w.last = performance.now();
        w.frames++;
        v.requestVideoFrameCallback(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
    }
    w.track = state.stream && state.stream.getVideoTracks()[0];
    w.onMute = function () {
      if (state.watch !== w || w.muteAt != null) return;
      w.muteAt = rec.elapsed();
      warnImageStopped(w.muteAt);
    };
    if (w.track) w.track.addEventListener("mute", w.onMute);
    w.onResize = function () {
      if (state.watch !== w) return;
      w.resizes.push(U.formatClock(rec.elapsed()) + " \u2192 " + v.videoWidth + "\u00d7" + v.videoHeight);
      toast("A imagem mudou de tamanho (aparelho girado?). Evite girar o celular durante a gravação: o vídeo pode travar.", "warn", 8000);
    };
    v.addEventListener("resize", w.onResize);
  }

  function checkFrameWatch(rec) {
    var w = state.watch;
    if (!w || !w.rvfc || w.stallAt != null || state.rec !== "recording") return;
    if (document.visibilityState !== "visible") { w.last = performance.now(); return; }
    if (performance.now() - w.last > STALL_MS) {
      w.stallAt = Math.max(0, rec.elapsed() - STALL_MS);
      warnImageStopped(w.stallAt);
    }
  }

  function stopFrameWatch() {
    var w = state.watch;
    state.watch = null;
    if (!w) return null;
    if (w.track) w.track.removeEventListener("mute", w.onMute);
    el.video.removeEventListener("resize", w.onResize);
    return w;
  }

  function warnImageStopped(ms) {
    toast("A imagem da câmera parou aos " + U.formatClock(ms) + " (o som continua). Toque em parar e grave de novo; se repetir, escolha a qualidade Leve.", "error", 15000);
  }

  function watchSummary(w) {
    if (!w) return "não monitorada";
    var parts = [];
    if (w.stallAt != null) parts.push("imagem parou aos " + U.formatClock(w.stallAt));
    if (w.muteAt != null) parts.push("câmera silenciada pelo sistema aos " + U.formatClock(w.muteAt));
    if (w.resizes.length) parts.push("mudou de tamanho: " + w.resizes.join(", "));
    if (!parts.length) parts.push(w.rvfc ? "sem interrupções (" + w.frames + " quadros na tela)" : "sem interrupções detectadas");
    return parts.join("; ");
  }

  function toggleRecPause() {
    var rec = state.recorder;
    if (!rec) return;
    if (state.rec === "recording" && rec.pause()) {
      state.rec = "paused"; prompter.pause();
    } else if (state.rec === "paused" && rec.resume()) {
      state.rec = "recording"; if (state.settings.scrollOnRecord) prompter.play();
    }
    updateRecUI();
  }

  function stopRecording() {
    var rec = state.recorder;
    if (!rec || state.rec === "stopping") return Promise.resolve();
    state.rec = "stopping"; updateRecUI();
    prompter.pause();
    clearInterval(state.timer);
    var watch = stopFrameWatch();
    return rec.stop().then(function (result) {
      state.recorder = null;
      state.rec = "idle";
      if (!result) {
        console.warn("[teleprompter] gravação vazia:", rec.describe());
        toast("O navegador não entregou o vídeo. Ajustamos o formato de gravação: tente gravar de novo. (" + rec.describe() + ")", "error", 12000);
        updateRecUI(); return;
      }
      // Padroniza o MP4 (Fotos/WhatsApp recusam o formato fragmentado do gravador).
      var prepText = "Deixando o arquivo no formato aceito pelo Fotos e pelo WhatsApp.";
      showStatus("Preparando o vídeo\u2026", prepText, { loading: true });
      return TP.finalize.process(result, function (p) {
        el.statusText.textContent = prepText + " " + Math.round(p * 100) + "%";
      }).then(function (final) {
        hideStatus();
        final.tech = [
          "Aparelho: " + (platform.iOS ? "iPhone/iPad" : platform.android ? "Android" : "computador") + (platform.safari ? " (Safari)" : ""),
          "Gravação: " + rec.describe(),
          "Câmera: " + watchSummary(watch),
          "Arquivo original: " + (final.tracksText ? final.tracksText.raw : "não medido"),
          "Arquivo final: " + (final.tracksText ? final.tracksText.final : "não medido") +
            (final.formatLabel ? " \u00b7 " + final.formatLabel : "") + (final.transcoded ? " (recodificado)" : final.standardized ? " (copiado, sem perda)" : ""),
          "App: versão " + (cfg.version || "?")
        ].join("\n");
        if (final.videoGap) {
          toast("Atenção: a imagem do vídeo vai só até " + U.formatClock(final.videoEnd * 1000) + " e o som continua depois. " +
            "Grave de novo; se repetir, escolha a qualidade Leve e veja \u201cDetalhes técnicos\u201d.", "error", 15000);
        } else if (final.finalizeError) {
          toast("Não foi possível preparar o arquivo (" + final.finalizeError + "). O vídeo original foi mantido e pode não ser aceito pelo Fotos/WhatsApp.", "warn", 12000);
        } else if (final.finalizeWarning) {
          toast("Atenção: " + final.finalizeWarning + ".", "warn", 12000);
        }
        setRecording(final);
        updateRecUI();
        openReview();
      });
    });
  }

  function cancelRecording() {
    if (!state.recorder) return;
    var wasPaused = state.rec === "paused";
    if (!wasPaused) state.recorder.pause();
    prompter.pause();
    confirmDialog({ title: "Cancelar gravação?", text: "O que foi gravado até agora será descartado.", ok: "Descartar", danger: true })
      .then(function (yes) {
        if (!state.recorder) return;
        if (!yes) { if (!wasPaused) state.recorder.resume(); if (!wasPaused && state.settings.scrollOnRecord) prompter.play(); return; }
        clearInterval(state.timer);
        stopFrameWatch();
        var rec = state.recorder; state.recorder = null;
        state.rec = "stopping"; updateRecUI();
        rec.cancel().then(function () { state.rec = "idle"; updateRecUI(); toast("Gravação descartada."); });
      });
  }

  function setRecording(result) {
    discardRecording();
    var name = U.buildFileName(new Date(), result.ext);
    var file = null;
    try { file = new File([result.blob], name, { type: result.mimeType }); } catch (e) { /* File indisponível */ }
    state.recording = {
      blob: result.blob, file: file, name: name, mimeType: result.mimeType, ext: result.ext,
      durationMs: result.durationMs, size: result.size, url: URL.createObjectURL(result.blob), saved: false,
      standardized: !!result.standardized, transcoded: !!result.transcoded,
      formatLabel: result.formatLabel || "", finalizeError: result.finalizeError || "",
      finalizeWarning: result.finalizeWarning || "", compatible: !!result.compatible,
      videoGap: result.videoGap || 0, videoEnd: result.videoEnd || 0, tech: result.tech || "",
      rawTracks: result.rawTracks || null, finalTracks: result.finalTracks || null
    };
  }

  function discardRecording() {
    if (!state.recording) return;
    try { el.reviewVideo.pause(); el.reviewVideo.removeAttribute("src"); el.reviewVideo.load(); } catch (e) { /* ignora */ }
    try { URL.revokeObjectURL(state.recording.url); } catch (e) { /* ignora */ }
    state.recording = null;
    updateRecUI();
  }

  /* ------------------------------------------------------------ Revisão */

  function canShareFile(file) {
    try { return !!(file && navigator.canShare && navigator.share && navigator.canShare(U.sharePayload(file))); }
    catch (e) { return false; }
  }

  function openReview() {
    var r = state.recording;
    if (!r) return;
    var v = el.reviewVideo;
    v.src = r.url;
    v.load();
    // Vídeos WebM do Chrome saem sem duração: força o cálculo para a barra de progresso funcionar.
    v.onloadedmetadata = function () {
      if (v.duration === Infinity) {
        v.currentTime = 1e101;
        v.ontimeupdate = function () { v.ontimeupdate = null; v.currentTime = 0; };
      }
    };
    // Linha técnica: ajuda a diagnosticar (formato, codecs e resolução reais do arquivo).
    el.reviewInfo.textContent = "Duração " + U.formatClock(r.durationMs) + " \u00b7 " + U.formatBytes(r.size) + " \u00b7 " +
      r.ext.toUpperCase() + (r.formatLabel ? " " + r.formatLabel : "") +
      (r.compatible ? " \u00b7 pronto para Fotos/WhatsApp" :
        (r.standardized ? " \u00b7 formato pode não ser aceito pelo iPhone" : " \u00b7 original (não convertido)")) +
      (state.hasAudio ? "" : " \u00b7 sem áudio") +
      (r.videoGap ? " \u00b7 \u26a0 imagem só até " + U.formatClock(r.videoEnd * 1000) : "");
    $("review-tech-text").textContent = r.tech || "Sem detalhes.";
    var shareable = canShareFile(r.file);
    el.share.hidden = !shareable;
    // No iPhone, deixa claro para onde vai cada botão.
    setButtonLabel(el.share, platform.iOS ? "Salvar no Fotos / Compartilhar" : "Salvar / Compartilhar");
    setButtonLabel($("btn-download"), platform.iOS ? "Salvar em Arquivos" : "Baixar vídeo");
    el.reviewHint.textContent = platform.iOS
      ? (shareable ? "Toque em \u201cSalvar no Fotos / Compartilhar\u201d e escolha \u201cSalvar vídeo\u201d (vai para o Fotos) ou o WhatsApp na mesma lista. \u201cSalvar em Arquivos\u201d guarda no app Arquivos \u203a Downloads." :
        "Toque em \u201cSalvar em Arquivos\u201d: o vídeo vai para o app Arquivos \u203a Downloads; de lá use Compartilhar \u203a Salvar vídeo.")
      : (platform.android ? "O vídeo baixado fica na pasta Downloads; use \u201cSalvar / Compartilhar\u201d para enviar direto ao WhatsApp, Instagram etc." : "");
    el.review.hidden = false;
    $("btn-review-close").focus({ preventScroll: true });
  }

  function setButtonLabel(btn, text) {
    var span = btn && btn.querySelector("span");
    if (span) span.textContent = text;
  }

  function closeReview() {
    try { el.reviewVideo.pause(); } catch (e) { /* ignora */ }
    el.review.hidden = true;
    updateRecUI();
    el.record.focus({ preventScroll: true });
  }

  function downloadRecording() {
    var r = state.recording;
    if (!r) return;
    try {
      var a = document.createElement("a");
      a.href = r.url;
      a.download = r.name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); }, 1000);
      r.saved = true;
      toast("Download iniciado: " + r.name);
    } catch (err) {
      console.warn("[teleprompter] download:", err);
      var w = window.open(r.url, "_blank");
      if (!w) toast("Não foi possível baixar o vídeo. Tente “Salvar / Compartilhar”.", "error", 7000);
      else r.saved = true;
    }
  }

  function shareRecording() {
    var r = state.recording;
    if (!r || !canShareFile(r.file)) { downloadRecording(); return; }
    navigator.share(U.sharePayload(r.file)).then(function () {
      r.saved = true;
      toast("Vídeo compartilhado.");
    }).catch(function (err) {
      if (err && err.name === "AbortError") return; // usuário fechou a folha de compartilhamento
      console.warn("[teleprompter] share:", err);
      toast("Não foi possível compartilhar; iniciando o download.", "warn");
      downloadRecording();
    });
  }

  function bindRecording() {
    el.record.addEventListener("click", onRecordButton);
    el.recPause.addEventListener("click", toggleRecPause);
    el.recCancel.addEventListener("click", cancelRecording);
    el.lastVideo.addEventListener("click", openReview);
    $("btn-review-close").addEventListener("click", closeReview);
    el.share.addEventListener("click", shareRecording);
    $("btn-download").addEventListener("click", downloadRecording);
    $("btn-rerecord").addEventListener("click", function () {
      var go = function () { discardRecording(); closeReview(); beginRecordingFlow(); };
      if (state.recording && !state.recording.saved) {
        confirmDialog({ title: "Gravar novamente?", text: "Este vídeo ainda não foi salvo e será descartado.", ok: "Descartar e gravar", danger: true })
          .then(function (yes) { if (yes) go(); });
      } else go();
    });
    $("btn-discard").addEventListener("click", function () {
      confirmDialog({ title: "Descartar vídeo?", text: "Esta ação não pode ser desfeita.", ok: "Descartar", danger: true })
        .then(function (yes) { if (yes) { discardRecording(); closeReview(); toast("Vídeo descartado."); } });
    });

    window.addEventListener("beforeunload", function (e) {
      if (isBusy() || (state.recording && !state.recording.saved)) {
        e.preventDefault(); e.returnValue = ""; return "";
      }
    });
  }

  /* ------------------------------------------------------------ Estúdio: extras */

  function fullscreenApi() {
    var d = document.documentElement;
    var req = d.requestFullscreen || d.webkitRequestFullscreen;
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    var current = function () { return document.fullscreenElement || document.webkitFullscreenElement; };
    return req ? { req: req.bind(d), exit: exit && exit.bind(document), current: current } : null;
  }

  function toggleFullscreen() {
    var fs = fullscreenApi();
    if (!fs) {
      toast(platform.iOS
        ? "No iPhone, para usar em tela cheia toque em Compartilhar → “Adicionar à Tela de Início” e abra pelo ícone."
        : "Este navegador não permite tela cheia.", "info", 7000);
      return;
    }
    if (fs.current()) { exitFullscreen(); return; }
    Promise.resolve(fs.req()).then(function () {
      // Evita que a orientação mude no meio da gravação (Android).
      try {
        var type = screen.orientation && screen.orientation.type || "";
        screen.orientation.lock(type.indexOf("portrait") === 0 ? "portrait" : "landscape").catch(function () {});
      } catch (e) { /* sem suporte */ }
    }).catch(function () { toast("Não foi possível entrar em tela cheia.", "warn"); });
  }

  function exitFullscreen() {
    var fs = fullscreenApi();
    if (fs && fs.current() && fs.exit) { try { Promise.resolve(fs.exit()).catch(function () {}); } catch (e) { /* ignora */ } }
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) { /* ignora */ }
  }

  function requestWakeLock() {
    if (!("wakeLock" in navigator) || state.wakeLock) return;
    navigator.wakeLock.request("screen").then(function (lock) {
      state.wakeLock = lock;
      lock.addEventListener("release", function () { state.wakeLock = null; });
    }).catch(function () { /* sem suporte ou negado: segue normalmente */ });
  }

  function releaseWakeLock() {
    if (state.wakeLock) { try { state.wakeLock.release(); } catch (e) { /* ignora */ } }
    state.wakeLock = null;
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && state.studioOpen) {
      requestWakeLock();
      // O iOS desliga a câmera quando o app vai para segundo plano.
      var live = state.stream && state.stream.getVideoTracks().some(function (t) { return t.readyState === "live"; });
      if (!live && !isBusy() && el.status.hidden) startCamera(state.facing);
    } else if (document.visibilityState === "hidden") {
      prompter.pause();
    }
  });

  function openQuick() {
    el.quick.hidden = false;
    el.quickBtn.setAttribute("aria-expanded", "true");
  }
  function closeQuick() {
    el.quick.hidden = true;
    el.quickBtn.setAttribute("aria-expanded", "false");
  }

  function bindStudio() {
    $("btn-close-studio").addEventListener("click", function () { closeStudio(false); });
    $("btn-status-back").addEventListener("click", function () { closeStudio(false); });
    el.statusRetry.addEventListener("click", function () { startCamera(state.facing); });
    el.switchCam.addEventListener("click", function () {
      if (isBusy()) return;
      startCamera(state.facing === "user" ? "environment" : "user");
    });
    el.mirror.addEventListener("click", function () { setSetting("mirrorPreview", !state.settings.mirrorPreview); });
    el.frame.addEventListener("click", function () {
      var on = !el.studio.classList.contains("fit-contain");
      el.studio.classList.toggle("fit-contain", on);
      el.frame.setAttribute("aria-pressed", String(on));
      toast(on ? "Mostrando o quadro completo que será gravado." : "Imagem ajustada à tela.");
    });
    el.fullscreen.addEventListener("click", toggleFullscreen);
    el.quickBtn.addEventListener("click", function () { el.quick.hidden ? openQuick() : closeQuick(); });
    $("btn-quick-close").addEventListener("click", closeQuick);
    // Toque na imagem (fora do texto) garante que o vídeo toque em navegadores restritivos.
    el.video.addEventListener("click", function () { var p = el.video.play(); if (p && p.catch) p.catch(function () {}); });
  }

  /* ------------------------------------------------------------ Teclado (desktop) */

  function bindKeyboard() {
    document.addEventListener("keydown", function (e) {
      if (!el.confirmBox.hidden) {
        if (e.key === "Escape") { e.preventDefault(); resolveConfirm(false); }
        return;
      }
      if (!state.studioOpen) return;
      var tag = (e.target && e.target.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag) && e.key !== "Escape") return;
      if (!el.review.hidden) { if (e.key === "Escape") { e.preventDefault(); closeReview(); } return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case " ": case "Spacebar":
          if (tag === "BUTTON") return; // deixa o botão focado agir
          e.preventDefault(); prompter.toggle(); break;
        case "ArrowUp": e.preventDefault(); prompter.nudge(-1); break;
        case "ArrowDown": e.preventDefault(); prompter.nudge(1); break;
        case "ArrowLeft": e.preventDefault(); setSetting("wpm", state.settings.wpm - 5); break;
        case "ArrowRight": e.preventDefault(); setSetting("wpm", state.settings.wpm + 5); break;
        case "Home": e.preventDefault(); prompter.restart(); break;
        case "r": case "R": e.preventDefault(); onRecordButton(); break;
        case "p": case "P": if (isBusy()) { e.preventDefault(); toggleRecPause(); } break;
        case "f": case "F": e.preventDefault(); toggleFullscreen(); break;
        case "m": case "M": e.preventDefault(); setSetting("mirrorPreview", !state.settings.mirrorPreview); break;
        case "Escape":
          e.preventDefault();
          if (!el.quick.hidden) closeQuick(); else closeStudio(false);
          break;
      }
    });
  }

  /* ------------------------------------------------------------ Diálogo e avisos */

  el.confirmBox = $("confirm");
  var confirmResolve = null, confirmFocus = null;

  function confirmDialog(o) {
    if (confirmResolve) resolveConfirm(false);
    $("confirm-title").textContent = o.title || "Confirmar";
    $("confirm-text").textContent = o.text || "";
    var ok = $("confirm-ok");
    ok.textContent = o.ok || "Confirmar";
    ok.classList.toggle("btn-danger-solid", !!o.danger);
    $("confirm-cancel").textContent = o.cancel || "Cancelar";
    confirmFocus = document.activeElement;
    el.confirmBox.hidden = false;
    $("confirm-cancel").focus();
    return new Promise(function (resolve) { confirmResolve = resolve; });
  }

  function resolveConfirm(value) {
    var r = confirmResolve;
    confirmResolve = null;
    el.confirmBox.hidden = true;
    if (confirmFocus && confirmFocus.focus) { try { confirmFocus.focus({ preventScroll: true }); } catch (e) { /* ignora */ } }
    if (r) r(value);
  }

  $("confirm-ok").addEventListener("click", function () { resolveConfirm(true); });
  $("confirm-cancel").addEventListener("click", function () { resolveConfirm(false); });
  el.confirmBox.addEventListener("click", function (e) { if (e.target === el.confirmBox) resolveConfirm(false); });

  function toast(message, type, ms) {
    var t = document.createElement("div");
    t.className = "toast toast-" + (type || "info");
    t.setAttribute("role", type === "error" ? "alert" : "status");
    t.textContent = message;
    el.toasts.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("is-in"); });
    setTimeout(function () {
      t.classList.remove("is-in");
      setTimeout(function () { t.remove(); }, 300);
    }, ms || 3200);
    while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
  }

  /* ------------------------------------------------------------ Início */

  function init() {
    // Marcações antigas de "formato ruim" (v1.0.x) podiam trocar o iPhone para WebM,
    // que o Fotos/WhatsApp não aceitam: zera uma vez ao atualizar.
    if (S.get("recFlagsVersion", 0) < 2) {
      S.remove("badMimes"); S.remove("recNoBitrate"); S.set("recFlagsVersion", 2);
    }
    state.settings = loadSettings();
    var savedScript = S.get("script", null);
    // Restaura o texto antes de o Shiny ler o valor inicial do editor.
    // Se o editor foi deixado vazio, volta a mostrar o texto de exemplo.
    if (typeof savedScript === "string" && savedScript.trim()) el.script.value = savedScript;
    syncControls();
    bindSettings();
    bindEditor();
    bindPrompterControls();
    bindStudio();
    bindRecording();
    bindKeyboard();
    applySettings();

    if (!TP.camera.isSupported() || !window.isSecureContext) {
      var insecure = !window.isSecureContext;
      toast(insecure
        ? "Atenção: a câmera só funciona em endereços HTTPS (ou localhost)."
        : "Este navegador não oferece acesso à câmera.", "warn", 8000);
    }
    if (platform.inApp) {
      toast("Para gravar, abra este link no navegador do aparelho (Chrome ou Safari).", "warn", 9000);
    }
  }

  // Exposto para depuração e testes automatizados.
  TP.app = { state: state, prompter: prompter, openStudio: openStudio, closeStudio: closeStudio, stopRecording: stopRecording };

  init();
})(window.TP = window.TP || {});
