// Teste ponta a ponta com Chrome headless e câmera/microfone FALSOS.
//
// Pré-requisitos: app rodando (padrão http://127.0.0.1:7788) e Chrome/Edge instalado.
//   Rscript -e "shiny::runApp('.', port = 7788)"
//   node tests/e2e/run-e2e.mjs [url]
//
// Usa apenas o protocolo DevTools (WebSocket nativo do Node >= 22), sem dependências.
// As flags --use-fake-device-for-media-stream fazem o Chrome gerar um vídeo
// sintético e um tom de áudio: validam o pipeline de gravação, não uma câmera real.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const URL_APP = process.argv[2] || "http://127.0.0.1:7788/";
// E2E_IPHONE=1 simula o Safari do iPhone (user-agent), ativando o caminho de gravação do Safari.
const IPHONE = process.env.E2E_IPHONE === "1";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "screenshots");
const PORT = 9300 + Math.floor(Math.random() * 600); // porta aleatória evita colisões
const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
].filter(Boolean);

const chromePath = CANDIDATES.find((p) => existsSync(p));
if (!chromePath) { console.error("Chrome/Edge não encontrado (defina CHROME_PATH)."); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const profile = join(tmpdir(), "tp-e2e-" + Date.now());
const chrome = spawn(chromePath, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check",
  "--disable-gpu", "about:blank"
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
const consoleErrors = [];
const results = [];

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error("JS: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

async function waitFor(expr, timeout = 10000, label = expr) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await evaluate(expr)) return true; } catch { /* página carregando */ }
    await sleep(150);
  }
  throw new Error("Tempo esgotado esperando: " + label);
}

async function screenshot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
}

async function step(name, fn) {
  try { const info = await fn(); results.push({ name, ok: true, info }); console.log("  \u2714 " + name + (info ? " \u2014 " + info : "")); }
  catch (e) { results.push({ name, ok: false, info: e.message }); console.log("  \u2716 " + name + " \u2014 " + e.message); }
}

async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
}

async function main() {
  // Conecta ao DevTools
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch { /* ainda subindo */ }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error("Não foi possível conectar ao Chrome.");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      consoleErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      consoleErrors.push(msg.params.entry.text + " " + (msg.params.entry.url || ""));
    }
  };
  await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable");
  await send("Browser.grantPermissions", { permissions: ["videoCapture", "audioCapture"] }).catch(() => {});

  console.log("Teleprompter E2E em " + URL_APP + (IPHONE ? " (simulando iPhone/Safari)" : "") + "\n");
  if (IPHONE) await send("Emulation.setUserAgentOverride", { userAgent: IPHONE_UA, platform: "iPhone" });
  await setViewport(390, 844, true); // iPhone 12-15 (retrato)
  await send("Page.navigate", { url: URL_APP });

  await step("página carrega e Shiny conecta", async () => {
    await waitFor("window.Shiny && Shiny.shinyapp && Shiny.shinyapp.isConnected()", 15000, "Shiny conectado");
    return await evaluate("document.title");
  });

  await step("estatísticas do texto calculadas pelo R", async () => {
    await waitFor("document.querySelector('#stats strong') !== null", 8000, "stats");
    return (await evaluate("document.getElementById('script-stats').innerText")).replace(/\s+/g, " ");
  });

  await step("texto: exemplo volta se o editor ficar vazio; digitação sobrevive a fechar", async () => {
    const reload = async () => {
      await send("Page.reload", { ignoreCache: false });
      await sleep(300);
      await waitFor("window.Shiny && Shiny.shinyapp && Shiny.shinyapp.isConnected()", 15000, "Shiny após recarregar");
    };
    await evaluate(`(() => { const t = document.getElementById('script'); t.value = ''; t.dispatchEvent(new Event('input', {bubbles: true})); })()`);
    await reload();
    const a = await evaluate("document.getElementById('script').value");
    if (!/Este é o seu teleprompter/.test(a)) throw new Error("exemplo não voltou: " + JSON.stringify(a.slice(0, 40)));
    // digita e recarrega imediatamente (como fechar o app logo após digitar)
    await evaluate(`(() => { const t = document.getElementById('script'); t.value = 'Meu roteiro salvo na hora.'; t.dispatchEvent(new Event('input', {bubbles: true})); })()`);
    await reload();
    const b = await evaluate("document.getElementById('script').value");
    if (b !== "Meu roteiro salvo na hora.") throw new Error("texto perdido: " + JSON.stringify(b));
    return "exemplo restaurado; texto digitado mantido";
  });

  await step("editar texto atualiza estatísticas (R \u2194 JS)", async () => {
    await evaluate(`(() => { const t = document.getElementById('script');
      t.value = Array.from({length: 60}, (_, i) => 'Palavra número ' + i + ' do roteiro de teste.').join(' ') + '\\n\\nSegundo parágrafo.';
      t.dispatchEvent(new Event('input', {bubbles: true})); })()`);
    await waitFor("/422/.test(document.getElementById('script-stats').innerText)", 8000, "422 palavras (60 frases de 7 palavras + 2)");
    return (await evaluate("document.getElementById('script-stats').innerText")).replace(/\s+/g, " ");
  });

  await step("texto salvo no aparelho (localStorage)", async () => {
    await sleep(600);
    const v = await evaluate("localStorage.getItem('tp:script') || ''");
    if (!v.includes("Segundo parágrafo")) throw new Error("texto não persistido");
    return v.length + " caracteres";
  });

  await step("ajuste de velocidade chega ao R", async () => {
    await evaluate(`(() => { const r = document.getElementById('set-wpm'); r.value = 180; r.dispatchEvent(new Event('input', {bubbles:true})); })()`);
    await waitFor("/180 pal\\/min/.test(document.getElementById('script-stats').innerText)", 8000, "180 pal/min");
    return "180 pal/min refletido nas estatísticas";
  });

  await screenshot("01-editor-mobile");

  await step("abrir estúdio ativa câmera e microfone", async () => {
    await evaluate("document.getElementById('btn-open-studio').click()");
    await waitFor("TP.app.state.stream && document.getElementById('studio-status').hidden", 10000, "câmera ativa");
    await waitFor("document.getElementById('camera-preview').videoWidth > 0", 8000, "vídeo tocando");
    return await evaluate("(() => { const v = document.getElementById('camera-preview'); return v.videoWidth + 'x' + v.videoHeight + ', áudio=' + TP.app.state.hasAudio + ', espelhado=' + v.classList.contains('is-mirrored'); })()");
  });

  await step("teleprompter recebe o texto", async () => {
    const n = await evaluate("document.querySelectorAll('#prompter-text p').length");
    if (n !== 2) throw new Error("esperados 2 parágrafos, obtidos " + n);
    return n + " parágrafos";
  });

  await step("rolagem manual: play/pause/avançar/voltar/início", async () => {
    await evaluate("document.getElementById('btn-play').click()");
    await sleep(1200);
    const o1 = await evaluate("TP.app.prompter.offset");
    if (!(o1 > 0)) throw new Error("texto não rolou");
    await evaluate("document.getElementById('btn-play').click()");
    const o2 = await evaluate("TP.app.prompter.offset"); await sleep(400);
    const o3 = await evaluate("TP.app.prompter.offset");
    if (o3 !== o2) throw new Error("pausa não parou a rolagem");
    await evaluate("document.getElementById('btn-forward').click()");
    const o4 = await evaluate("TP.app.prompter.offset");
    await evaluate("document.getElementById('btn-back').click()");
    const o5 = await evaluate("TP.app.prompter.offset");
    await evaluate("document.getElementById('btn-restart').click()");
    const o6 = await evaluate("TP.app.prompter.offset");
    if (!(o4 > o3 && Math.abs(o5 - o3) < 1 && o6 === 0)) throw new Error(`offsets ${o3} ${o4} ${o5} ${o6}`);
    return `rolou ${o1.toFixed(0)}px em 1,2s; avançar/voltar/início ok`;
  });

  await step("velocidade muda durante a leitura", async () => {
    const s1 = await evaluate("TP.app.prompter.speed");
    await evaluate("document.getElementById('btn-faster').click()");
    const s2 = await evaluate("TP.app.prompter.speed");
    if (!(s2 > s1)) throw new Error("velocidade não aumentou");
    return `${s1.toFixed(1)} \u2192 ${s2.toFixed(1)} px/s`;
  });

  await screenshot("02-studio-mobile");

  await step("contagem regressiva 3-2-1 antes de gravar", async () => {
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("!document.getElementById('countdown').hidden", 2000, "contagem visível");
    const first = await evaluate("document.getElementById('countdown-value').textContent");
    await sleep(700);
    await screenshot("03-countdown");
    await waitFor("TP.app.state.rec === 'recording'", 6000, "gravação iniciada");
    return "primeiro número: " + first;
  });

  await step("gravando: indicador, cronômetro e rolagem automática", async () => {
    await sleep(2300);
    const r = await evaluate("({ vis: getComputedStyle(document.getElementById('rec-indicator')).display, t: document.getElementById('rec-time').textContent, playing: TP.app.prompter.playing, mime: TP.app.state.recorder.mimeType, req: TP.app.state.recorder.requestedMime })");
    if (IPHONE && !/^video\/mp4;codecs=avc1/.test(r.req)) throw new Error("no iPhone deveria pedir MP4 H.264/AAC, pediu " + r.req);
    const vbr = await evaluate("TP.app.state.recorder.rec.videoBitsPerSecond");
    if (vbr && Math.abs(vbr - 3500000) > 1) throw new Error("taxa de bits inesperada: " + vbr);
    if (r.vis === "none") throw new Error("indicador oculto");
    if (r.t === "00:00") throw new Error("cronômetro parado");
    if (!r.playing) throw new Error("texto não rola durante a gravação");
    await screenshot("04-recording");
    return `tempo ${r.t}, pedido ${r.req || "automático"} \u2192 ${r.mime}`;
  });

  await step("pausar e continuar gravação", async () => {
    const can = await evaluate("!document.getElementById('btn-rec-pause').hidden");
    if (!can) return "pausa não suportada neste navegador (botão oculto)";
    await evaluate("document.getElementById('btn-rec-pause').click()");
    const st = await evaluate("TP.app.state.rec + '/' + TP.app.state.recorder.state()");
    const t1 = await evaluate("document.getElementById('rec-time').textContent");
    await sleep(1500);
    const t2 = await evaluate("document.getElementById('rec-time').textContent");
    await evaluate("document.getElementById('btn-rec-pause').click()");
    await sleep(1200);
    const st2 = await evaluate("TP.app.state.rec");
    if (st !== "paused/paused" || t1 !== t2 || st2 !== "recording") throw new Error(`${st} ${t1} ${t2} ${st2}`);
    return `pausado em ${t1}, retomado`;
  });

  await step("finalizar gera vídeo e abre a pré-visualização", async () => {
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("!document.getElementById('review').hidden", 8000, "revisão aberta");
    const r = await evaluate("({ size: TP.app.state.recording.size, type: TP.app.state.recording.mimeType, name: TP.app.state.recording.name, dur: TP.app.state.recording.durationMs, info: document.getElementById('review-info').textContent })");
    if (!(r.size > 10000)) throw new Error("arquivo vazio ou pequeno demais: " + r.size);
    return `${r.name} \u00b7 ${r.info}`;
  });

  await step("MP4 final padronizado (moov antes de mdat, sem fragmentos)", async () => {
    const r = await evaluate(`(async () => {
      const rec = TP.app.state.recording;
      const buf = new Uint8Array(await rec.blob.arrayBuffer());
      const dv = new DataView(buf.buffer); const boxes = []; let off = 0;
      while (off + 8 <= buf.length && boxes.length < 50) {
        let size = dv.getUint32(off); const type = String.fromCharCode(...buf.slice(off + 4, off + 8));
        if (size === 1) size = Number(dv.getBigUint64(off + 8)); if (size === 0) size = buf.length - off;
        boxes.push(type); if (size < 8) break; off += size;
      }
      return { std: rec.standardized, boxes: boxes.join(","), size: rec.size };
    })()`);
    if (!r.std) throw new Error("não padronizado; caixas: " + r.boxes);
    const list = r.boxes.split(",");
    if (list.includes("moof")) throw new Error("ainda fragmentado: " + r.boxes);
    if (!(list.indexOf("moov") > -1 && list.indexOf("moov") < list.indexOf("mdat"))) throw new Error("ordem: " + r.boxes);
    const info = await evaluate("document.getElementById('review-info').textContent");
    if (!/H\.264 \+ AAC/.test(info) || !/pronto para Fotos\/WhatsApp/.test(info)) {
      throw new Error("info: " + info + " | aviso: " + await evaluate("TP.app.state.recording.finalizeWarning + ' ' + TP.app.state.recording.finalizeError"));
    }
    return "caixas: " + r.boxes + " | " + info;
  });

  await step("vídeo gravado é reproduzível e tem imagem e áudio", async () => {
    await waitFor("document.getElementById('review-video').readyState >= 1", 8000, "metadados do vídeo");
    const r = await evaluate(`new Promise((res) => {
      const v = document.getElementById('review-video');
      v.muted = true;
      v.play().then(() => setTimeout(() => res({ w: v.videoWidth, h: v.videoHeight, t: v.currentTime, audio: (v.webkitAudioDecodedByteCount ?? -1) }), 1200))
       .catch((e) => res({ err: String(e) }));
    })`);
    if (r.err) throw new Error(r.err);
    if (!(r.w > 0 && r.t > 0)) throw new Error(JSON.stringify(r));
    await evaluate("document.getElementById('review-video').pause()");
    return `${r.w}x${r.h}, tocou ${r.t.toFixed(1)}s, bytes de áudio decodificados=${r.audio}`;
  });

  await step("vídeo final sem o texto e sem espelhamento (gravação usa o stream bruto)", async () => {
    // O gravador recebe o MediaStream da câmera; o texto e o espelhamento são só CSS/DOM.
    // Aqui comparamos um quadro do vídeo gravado com um quadro do stream original:
    // se o texto tivesse sido gravado, haveria grande área branca de letras.
    const r = await evaluate(`(() => {
      const v = document.getElementById('review-video');
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      const g = c.getContext('2d'); g.drawImage(v, 0, 0, 160, 90);
      const d = g.getImageData(0, 0, 160, 90).data; let white = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i+1] > 240 && d[i+2] > 240) white++;
      const tracks = TP.app.state.stream.getTracks().map(t => t.kind).join('+');
      return { whiteRatio: white / (160*90), tracks };
    })()`);
    if (r.whiteRatio > 0.15) throw new Error("muitos pixels brancos: " + r.whiteRatio);
    return `trilhas gravadas: ${r.tracks}; pixels brancos ${(r.whiteRatio * 100).toFixed(1)}%`;
  });

  await screenshot("05-review");

  await step("download gera link com nome de arquivo", async () => {
    await send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
    await evaluate("document.getElementById('btn-download').click()");
    await sleep(300);
    const saved = await evaluate("TP.app.state.recording.saved");
    if (!saved) throw new Error("não marcou como salvo");
    return "ok";
  });

  await step("gravar novamente (após salvar) volta ao estúdio", async () => {
    await evaluate("document.getElementById('btn-rerecord').click()");
    await waitFor("document.getElementById('review').hidden && TP.app.state.rec === 'countdown'", 3000, "nova contagem");
    await evaluate("document.getElementById('btn-record').click()"); // cancela contagem
    await waitFor("TP.app.state.rec === 'idle'", 2000, "contagem cancelada");
    return "contagem cancelada com sucesso";
  });

  await step("cancelar gravação descarta o vídeo", async () => {
    await evaluate("TP.app.state.settings.countdown = '0'");
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("TP.app.state.rec === 'recording'", 3000, "gravando");
    await sleep(800);
    await evaluate("document.getElementById('btn-rec-cancel').click()");
    await waitFor("!document.getElementById('confirm').hidden", 2000, "confirmação");
    await evaluate("document.getElementById('confirm-ok').click()");
    await waitFor("TP.app.state.rec === 'idle'", 5000, "ocioso");
    const rev = await evaluate("document.getElementById('review').hidden");
    if (!rev) throw new Error("revisão aberta após cancelar");
    return "descartado";
  });

  await step("formato alternativo WebM (navegador sem MP4)", async () => {
    await evaluate(`(() => { window.__origITS = MediaRecorder.isTypeSupported;
      MediaRecorder.isTypeSupported = (t) => !/mp4/.test(t) && window.__origITS.call(MediaRecorder, t); })()`);
    await evaluate("TP.app.state.settings.countdown = '0'");
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("TP.app.state.rec === 'recording'", 3000, "gravando");
    await sleep(2000);
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("!document.getElementById('review').hidden", 8000, "revisão");
    const r = await evaluate("({ ext: TP.app.state.recording.ext, name: TP.app.state.recording.name, size: TP.app.state.recording.size, tr: TP.app.state.recording.transcoded, fmt: TP.app.state.recording.formatLabel, err: TP.app.state.recording.finalizeError })");
    await waitFor("isFinite(document.getElementById('review-video').duration) && document.getElementById('review-video').duration > 0", 8000, "duração finita no WebM");
    const d = await evaluate("document.getElementById('review-video').duration");
    await evaluate("MediaRecorder.isTypeSupported = window.__origITS; TP.app.state.recording.saved = true;");
    await evaluate("document.getElementById('btn-review-close').click()");
    if (r.ext === "mp4" && !(r.tr && /H\.264 \+ AAC/.test(r.fmt))) throw new Error("MP4 sem recodificação: " + JSON.stringify(r));
    if (r.ext !== "mp4" && r.ext !== "webm") throw new Error("extensão " + r.ext);
    return (r.ext === "mp4" ? `gravado em WebM e convertido para MP4 ${r.fmt}` : `mantido em WebM (${r.err})`) +
      `, ${r.size} bytes, duração ${d.toFixed(1)}s`;
  });

  await step("navegador lento para entregar o vídeo (6 s após parar)", async () => {
    await evaluate(`(() => { const P = MediaRecorder.prototype; window.__origStop = P.stop;
      P.stop = function () { const self = this; setTimeout(() => window.__origStop.call(self), 6000); }; })()`);
    await evaluate("TP.app.state.settings.countdown = '0'");
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("TP.app.state.rec === 'recording'", 3000, "gravando");
    await sleep(1500);
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("!document.getElementById('review').hidden", 20000, "revisão após entrega lenta");
    const size = await evaluate("TP.app.state.recording.size");
    await evaluate("MediaRecorder.prototype.stop = window.__origStop; TP.app.state.recording.saved = true;");
    await evaluate("document.getElementById('btn-review-close').click()");
    if (!(size > 5000)) throw new Error("vídeo vazio: " + size);
    return size + " bytes recebidos após a espera";
  });

  await step("gravação longa (35 s): imagem continua até o fim", async () => {
    await evaluate("TP.app.state.settings.countdown = '0'");
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("TP.app.state.rec === 'recording'", 3000, "gravando");
    await sleep(35000);
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("!document.getElementById('review').hidden", 60000, "revisão da gravação longa");
    const r = await evaluate(`(async () => {
      const rec = TP.app.state.recording;
      const fin = await TP.mp4info.inspect(rec.blob);
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = rec.url;
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("erro ao abrir o vídeo")); });
      const c = document.createElement("canvas"); c.width = 96; c.height = 54;
      const g = c.getContext("2d", { willReadFrequently: true });
      const grab = (t) => new Promise((res) => { v.onseeked = () => { g.drawImage(v, 0, 0, 96, 54); res(g.getImageData(0, 0, 96, 54).data); }; v.currentTime = t; });
      const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return d / (a.length / 4); };
      const f5 = await grab(5), f25 = await grab(25), f32 = await grab(32);
      return { fin, raw: rec.rawTracks, d1: diff(f5, f25), d2: diff(f25, f32), gap: rec.videoGap,
        info: document.getElementById("review-info").textContent, tech: rec.tech };
    })()`);
    await evaluate("TP.app.state.recording.saved = true; document.getElementById('btn-review-close').click()");
    const fv = r.fin.video, fa = r.fin.audio;
    if (!fv || fv.duration < 33) throw new Error("vídeo curto: " + JSON.stringify(r.fin));
    if (!fa || Math.abs(fv.duration - fa.duration) > 1.5) throw new Error("vídeo e áudio com durações diferentes: " + JSON.stringify(r.fin));
    if (r.raw && r.raw.video && Math.abs(r.raw.video.duration - fv.duration) > 1) throw new Error("final difere do original: " + JSON.stringify(r));
    if (!(r.d1 > 0.3 && r.d2 > 0.3)) throw new Error(`imagem parada entre 5/25/32 s (diferenças ${r.d1.toFixed(2)}, ${r.d2.toFixed(2)})`);
    if (r.gap || /imagem só até/.test(r.info)) throw new Error("alerta indevido: " + r.info);
    if (!/Arquivo final: vídeo/.test(r.tech) || !/fatias 1 s/.test(r.tech)) throw new Error("detalhes técnicos incompletos: " + r.tech);
    return `vídeo ${fv.duration.toFixed(1)} s (${fv.samples} quadros), áudio ${fa.duration.toFixed(1)} s; ` +
      `original ${r.raw && r.raw.fragmented ? "fragmentado em " + r.raw.fragments : "?"}; imagem muda (Δ ${r.d1.toFixed(1)}, ${r.d2.toFixed(1)})`;
  });

  await step("vigia avisa quando a imagem da câmera para", async () => {
    // Simula a câmera parando de entregar quadros após ~1 s.
    await evaluate(`(() => { const v = document.getElementById("camera-preview"); let n = 0;
      const orig = HTMLVideoElement.prototype.requestVideoFrameCallback;
      v.requestVideoFrameCallback = function (cb) { return n++ < 30 ? orig.call(v, cb) : 0; }; })()`);
    await evaluate("TP.app.state.settings.countdown = '0'");
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("TP.app.state.rec === 'recording'", 3000, "gravando");
    await waitFor("/A imagem da câmera parou aos/.test(document.getElementById('toasts').textContent)", 9000, "aviso de imagem parada");
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("!document.getElementById('review').hidden", 20000, "revisão");
    const tech = await evaluate("TP.app.state.recording.tech");
    await evaluate(`(() => { delete document.getElementById("camera-preview").requestVideoFrameCallback;
      TP.app.state.recording.saved = true; document.getElementById("btn-review-close").click(); })()`);
    if (!/imagem parou aos/.test(tech)) throw new Error("detalhes sem o registro: " + tech);
    return tech.split("\n").find((l) => l.startsWith("Câmera"));
  });

  await step("alternar espelhamento só afeta a tela", async () => {
    const a = await evaluate("document.getElementById('camera-preview').classList.contains('is-mirrored')");
    await evaluate("document.getElementById('btn-mirror').click()");
    const b = await evaluate("document.getElementById('camera-preview').classList.contains('is-mirrored')");
    await evaluate("document.getElementById('btn-mirror').click()");
    if (a === b) throw new Error("não alternou");
    return `${a} \u2192 ${b}`;
  });

  await step("orientação horizontal: layout se ajusta", async () => {
    await setViewport(844, 390, true);
    await sleep(500);
    const r = await evaluate(`(() => { const p = document.getElementById('prompter').getBoundingClientRect();
      const b = document.querySelector('.studio-bottom').getBoundingClientRect();
      return { pTop: p.top, pBottom: p.bottom, barTop: b.top, maxOffset: TP.app.prompter.maxOffset, scrollW: document.documentElement.scrollWidth }; })()`);
    await screenshot("06-studio-landscape");
    if (r.scrollW > 844) throw new Error("rolagem horizontal na página");
    if (r.pBottom > r.barTop + 40) throw new Error("texto sobreposto aos controles: " + JSON.stringify(r));
    return JSON.stringify(r);
  });

  await step("fechar estúdio libera a câmera", async () => {
    await setViewport(390, 844, true);
    await evaluate("document.getElementById('btn-close-studio').click()");
    await waitFor("document.getElementById('studio').hidden", 3000, "estúdio fechado");
    const live = await evaluate("TP.app.state.stream === null");
    if (!live) throw new Error("stream ainda ativo");
    return "câmera desligada";
  });

  await step("editor sem rolagem horizontal (390px)", async () => {
    const w = await evaluate("document.documentElement.scrollWidth");
    if (w > 390) throw new Error("scrollWidth=" + w);
    return "scrollWidth=" + w;
  });

  await step("desktop 1366x768", async () => {
    await setViewport(1366, 768, false);
    await sleep(300);
    await screenshot("07-editor-desktop");
    await evaluate("document.getElementById('btn-open-studio').click()");
    await waitFor("TP.app.state.stream && document.getElementById('studio-status').hidden", 10000, "câmera ativa");
    await sleep(400);
    await screenshot("08-studio-desktop");
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))");
    await sleep(500);
    const playing = await evaluate("TP.app.prompter.playing");
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))");
    await waitFor("document.getElementById('studio').hidden", 3000, "Esc fecha");
    if (!playing) throw new Error("barra de espaço não iniciou a rolagem");
    return "atalhos de teclado ok";
  });

  await step("painel rápido de ajustes no estúdio (com “reduzir movimento”)", async () => {
    await setViewport(390, 844, true);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await evaluate("document.getElementById('btn-open-studio').click()");
    await waitFor("TP.app.state.stream && document.getElementById('studio-status').hidden", 10000, "câmera ativa");
    await evaluate("document.getElementById('btn-quick-settings').click()");
    const f1 = await evaluate("TP.app.prompter.lineHeightPx");
    await evaluate(`(() => { const r = document.getElementById('quick-fontSize'); r.value = 48; r.dispatchEvent(new Event('input', {bubbles:true})); })()`);
    const f2 = await evaluate("TP.app.prompter.lineHeightPx");
    const synced = await evaluate("document.getElementById('set-fontSize').value");
    await sleep(300);
    await screenshot("09-quick-settings");
    await evaluate("document.getElementById('btn-quick-close').click()");
    if (!(f2 > f1) || synced !== "48") throw new Error(`${f1} ${f2} ${synced}`);
    return `linha ${f1.toFixed(0)}px → ${f2.toFixed(0)}px; controles sincronizados`;
  });

  await step("queda da conexão com o servidor não afeta o estúdio", async () => {
    await evaluate("Shiny.shinyapp.$socket.close()");
    await waitFor("document.body.classList.contains('is-offline')", 5000, "offline detectado");
    const overlay = await evaluate("(() => { const o = document.getElementById('shiny-disconnected-overlay'); return o ? getComputedStyle(o).display : 'ausente'; })()");
    if (overlay !== "none" && overlay !== "ausente") throw new Error("overlay visível: " + overlay);
    await evaluate("TP.app.state.settings.countdown = '0'");
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("TP.app.state.rec === 'recording'", 3000, "gravando offline");
    await sleep(1200);
    await evaluate("document.getElementById('btn-record').click()");
    await waitFor("!document.getElementById('review').hidden", 8000, "revisão");
    const size = await evaluate("TP.app.state.recording.size");
    if (!(size > 5000)) throw new Error("vídeo vazio");
    return `gravou ${size} bytes sem servidor (overlay: ${overlay})`;
  });

  await step("sem erros JavaScript no console", async () => {
    const errs = consoleErrors.filter((e) => !/favicon|WebSocket|websocket/i.test(e)); // queda de conexão é provocada de propósito
    if (errs.length) throw new Error(errs.join(" | "));
    return "0 erros";
  });
}

main().catch((e) => { console.error(e); results.push({ name: "execução", ok: false, info: e.message }); })
  .finally(async () => {
    // Browser.close encerra todos os processos filhos (o Edge não sai só com kill()).
    try { await Promise.race([send("Browser.close"), sleep(2000)]); } catch { /* ignora */ }
    try { ws && ws.close(); } catch { /* ignora */ }
    try { chrome.kill(); } catch { /* ignora */ }
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignora */ }
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} etapas passaram. Capturas em ${OUT}`);
    process.exit(failed ? 1 : 0);
  });
