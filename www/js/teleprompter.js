/* Motor de rolagem do teleprompter (requestAnimationFrame + transform).
 * A área do texto é apenas uma camada visual sobre o vídeo. */
(function (TP) {
  "use strict";
  var U = TP.utils;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /**
   * @param {HTMLElement} root   elemento .prompter
   * @param {HTMLElement} textEl elemento .prompter-text
   * @param {{onState?:Function, onEnd?:Function}} hooks
   */
  function Prompter(root, textEl, hooks) {
    this.root = root;
    this.viewport = root.querySelector(".prompter-viewport");
    this.textEl = textEl;
    this.hooks = hooks || {};
    this.offset = 0;       // px rolados (0 = primeira linha na linha de leitura)
    this.maxOffset = 0;
    this.eyeLine = 0;      // distância da linha de leitura ao topo da caixa
    this.lineHeightPx = 40;
    this.words = 0;
    this.wpm = 140;
    this.speed = 0;        // px/s
    this.playing = false;
    this._raf = 0;
    this._last = 0;
    this._text = "";
    this._tick = this._tick.bind(this);
    this._bindGestures();
  }

  Prompter.prototype.setText = function (text) {
    text = U.normalizeText(text);
    if (text === this._text && this.textEl.childNodes.length) return;
    var ratio = this.progress();
    this._text = text;
    this.words = U.countWords(text);
    if (!text) {
      this.textEl.innerHTML = '<p class="prompter-empty">Nenhum texto. Volte e escreva o seu roteiro.</p>';
    } else {
      this.textEl.innerHTML = text.split(/\n\s*\n/).map(function (par) {
        return "<p>" + escapeHtml(par).replace(/\n/g, "<br>") + "</p>";
      }).join("");
    }
    this.measure(ratio);
  };

  /** Aplica tamanho, espaçamento, largura, posição etc. (via variáveis CSS). */
  Prompter.prototype.applySettings = function (s) {
    var st = this.root.style;
    st.setProperty("--tp-font", s.fontSize + "px");
    st.setProperty("--tp-lh", String(s.lineHeight));
    st.setProperty("--tp-width", s.width + "%");
    st.setProperty("--tp-top", s.position + "%");
    st.setProperty("--tp-lines", String(s.lines));
    st.setProperty("--tp-bg", String(s.opacity / 100));
    this.root.classList.toggle("is-mirrored", !!s.mirrorText);
    this.root.classList.toggle("has-guide", !!s.focusGuide);
    this.wpm = Number(s.wpm) || 140;
    this.measure(this.progress());
  };

  Prompter.prototype.setWpm = function (wpm) {
    this.wpm = Number(wpm) || this.wpm;
    this._updateSpeed();
  };

  /** Recalcula medidas mantendo a posição relativa de leitura. */
  Prompter.prototype.measure = function (ratio) {
    if (!this.root.offsetParent && this.root.getClientRects().length === 0) return; // invisível
    var cs = getComputedStyle(this.textEl);
    var fs = parseFloat(cs.fontSize) || 34;
    var lh = parseFloat(cs.lineHeight);
    this.lineHeightPx = isFinite(lh) ? lh : fs * 1.4;
    var boxH = this.viewport.clientHeight;
    // Linha de leitura perto do topo da caixa (mais perto da câmera frontal)
    this.eyeLine = Math.min(boxH * 0.3, this.lineHeightPx * 1.2) + 4;
    this.root.style.setProperty("--tp-eye", this.eyeLine + "px");
    this.textEl.style.paddingTop = this.eyeLine + "px";
    this.textEl.style.paddingBottom = Math.max(0, boxH - this.eyeLine) + "px";
    var contentH = this.textEl.scrollHeight - this.eyeLine - Math.max(0, boxH - this.eyeLine);
    this._contentH = Math.max(0, contentH);
    this.maxOffset = Math.max(0, this._contentH - this.lineHeightPx);
    this._updateSpeed();
    if (typeof ratio === "number" && isFinite(ratio)) this.offset = ratio * this.maxOffset;
    this._render();
  };

  Prompter.prototype._updateSpeed = function () {
    this.speed = U.pxPerSecond(this.wpm, this._contentH || 0, this.words, this.lineHeightPx);
  };

  Prompter.prototype.progress = function () {
    return this.maxOffset > 0 ? this.offset / this.maxOffset : 0;
  };

  Prompter.prototype._render = function () {
    this.offset = U.clamp(this.offset, 0, this.maxOffset);
    this.textEl.style.transform = "translate3d(0," + (-this.offset).toFixed(2) + "px,0)";
  };

  Prompter.prototype._tick = function (now) {
    if (!this.playing) return;
    var dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 0; // evita saltos após aba oculta
    this._last = now;
    this.offset += this.speed * dt;
    if (this.offset >= this.maxOffset) {
      this.offset = this.maxOffset;
      this._render();
      this.pause();
      if (this.hooks.onEnd) this.hooks.onEnd();
      return;
    }
    this._render();
    this._raf = requestAnimationFrame(this._tick);
  };

  Prompter.prototype.play = function () {
    if (this.playing) return;
    if (this.offset >= this.maxOffset - 1) this.offset = 0; // chegou ao fim: recomeça
    this.playing = true;
    this._last = 0;
    this.root.classList.add("is-playing");
    this._raf = requestAnimationFrame(this._tick);
    this._emit();
  };

  Prompter.prototype.pause = function () {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this._raf);
    this.root.classList.remove("is-playing");
    this._emit();
  };

  Prompter.prototype.toggle = function () { this.playing ? this.pause() : this.play(); };

  Prompter.prototype.restart = function () {
    this.offset = 0;
    this._last = 0;
    this._render();
  };

  /** Avança (+) ou retrocede (−) um número de linhas. */
  Prompter.prototype.nudge = function (lines) {
    this.offset += lines * this.lineHeightPx;
    this._last = 0;
    this._render();
  };

  Prompter.prototype._emit = function () {
    if (this.hooks.onState) this.hooks.onState(this.playing);
  };

  /* Gestos: toque rápido = pausar/continuar; arrastar = mover o texto;
   * roda do mouse = rolar manualmente. */
  Prompter.prototype._bindGestures = function () {
    var self = this, startY = 0, startOffset = 0, moved = false, active = false, id = null;
    var vp = this.root;

    vp.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      active = true; moved = false; id = e.pointerId;
      startY = e.clientY; startOffset = self.offset;
      try { vp.setPointerCapture(id); } catch (err) { /* ignora */ }
    });
    vp.addEventListener("pointermove", function (e) {
      if (!active || e.pointerId !== id) return;
      var dy = e.clientY - startY;
      if (!moved && Math.abs(dy) > 8) moved = true;
      if (moved) {
        self.offset = startOffset - dy;
        self._last = 0;
        self._render();
      }
    });
    function end(e) {
      if (!active || e.pointerId !== id) return;
      active = false;
      try { vp.releasePointerCapture(id); } catch (err) { /* ignora */ }
      if (!moved && e.type === "pointerup") self.toggle();
    }
    vp.addEventListener("pointerup", end);
    vp.addEventListener("pointercancel", end);
    vp.addEventListener("wheel", function (e) {
      e.preventDefault();
      self.offset += e.deltaY * 0.5;
      self._last = 0;
      self._render();
    }, { passive: false });
  };

  TP.Prompter = Prompter;
})(window.TP = window.TP || {});
