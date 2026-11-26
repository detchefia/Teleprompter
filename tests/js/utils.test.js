// Testes das funções puras do cliente. Executar: node --test tests/js/
const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("../../www/js/utils.js");

test("formatClock", () => {
  assert.equal(U.formatClock(0), "00:00");
  assert.equal(U.formatClock(999), "00:00");
  assert.equal(U.formatClock(65000), "01:05");
  assert.equal(U.formatClock(3725000), "1:02:05");
  assert.equal(U.formatClock(-5), "00:00");
});

test("pickMimeType escolhe o primeiro formato suportado", () => {
  const safari = (t) => t.startsWith("video/mp4");
  assert.equal(U.pickMimeType(safari), "video/mp4;codecs=avc1,mp4a.40.2");
  const oldChrome = (t) => t.startsWith("video/webm");
  assert.equal(U.pickMimeType(oldChrome), "video/webm;codecs=vp9,opus");
  const firefox = (t) => t === "video/webm;codecs=vp8,opus" || t === "video/webm";
  assert.equal(U.pickMimeType(firefox), "video/webm;codecs=vp8,opus");
  assert.equal(U.pickMimeType(() => false), "");
  assert.equal(U.pickMimeType(() => { throw new Error("x"); }), "");
  assert.equal(U.pickMimeType(undefined), "");
});

test("extensionForMime e buildFileName", () => {
  assert.equal(U.extensionForMime("video/mp4;codecs=avc1"), "mp4");
  assert.equal(U.extensionForMime("video/webm"), "webm");
  assert.equal(U.extensionForMime(""), "webm");
  assert.equal(U.buildFileName(new Date(2026, 8, 5, 7, 3, 9), "mp4"), "teleprompter-20260905-070309.mp4");
});

test("normalizeText e countWords equivalem ao R", () => {
  assert.equal(U.normalizeText("  a  \r\nb\t\t c  "), "a\nb c");
  assert.equal(U.normalizeText("a\n\n\n\nb"), "a\n\nb");
  assert.equal(U.normalizeText(null), "");
  assert.equal(U.countWords("Ação pública é guarda-chuva d'água"), 5);
  assert.equal(U.countWords("2026 é o ano"), 4);
  assert.equal(U.countWords(""), 0);
});

test("pxPerSecond: rolagem dura exatamente palavras/wpm", () => {
  // 140 palavras em 1400 px a 140 pal/min -> 1400 px em 60 s
  const v = U.pxPerSecond(140, 1400, 140);
  assert.ok(Math.abs(1400 / v - 60) < 1e-9);
  assert.ok(U.pxPerSecond(140, 0, 0, 48) > 0);
  assert.ok(U.pxPerSecond(1e9, 1000, 100) === U.pxPerSecond(600, 1000, 100)); // limitado
});

test("friendlyMediaError traduz erros comuns", () => {
  assert.equal(U.friendlyMediaError({ name: "NotAllowedError" }).title, "Permissão negada");
  assert.equal(U.friendlyMediaError({ name: "NotFoundError" }).title, "Câmera não encontrada");
  assert.equal(U.friendlyMediaError({ name: "NotReadableError" }).title, "Câmera ocupada");
  assert.equal(U.friendlyMediaError({ name: "InsecureContext" }).retry, false);
  assert.equal(U.friendlyMediaError(null).retry, true);
  assert.match(U.friendlyMediaError({ name: "NotAllowedError" }, { inApp: true }).text, /navegador do aparelho/);
});

test("detectPlatform", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  const insta = iphone + " Instagram 300.0";
  let p = U.detectPlatform(iphone, 5);
  assert.ok(p.iOS && p.safari && p.mobile && !p.android);
  p = U.detectPlatform(android, 5);
  assert.ok(p.android && !p.safari && !p.iOS);
  assert.ok(U.detectPlatform(ipad, 5).iOS);
  assert.ok(!U.detectPlatform(ipad, 0).iOS);
  assert.ok(U.detectPlatform(insta, 5).inApp);
});

test("mimeCandidates: Safari pede H.264 + AAC em MP4, com alternativas", () => {
  const iphone = { iOS: true, safari: true };
  const everything = () => true;
  assert.equal(U.pickMimeType(everything, U.mimeCandidates(iphone)), "video/mp4;codecs=avc1.64002A,mp4a.40.2");
  // se o Safari não aceitar perfis explícitos, cai para "video/mp4"
  assert.equal(U.pickMimeType((t) => t === "video/mp4", U.mimeCandidates(iphone)), "video/mp4");
  // formato que gerou arquivo vazio é pulado
  assert.equal(U.pickMimeType(everything, U.mimeCandidates(iphone, ["video/mp4;codecs=avc1.64002A,mp4a.40.2"])),
    "video/mp4;codecs=avc1.4D402A,mp4a.40.2");
  // iPhone nunca grava WebM (Fotos/WhatsApp não aceitam); formato ruim => navegador decide
  assert.ok(U.mimeCandidates(iphone).every((m) => m.startsWith("video/mp4")));
  assert.equal(U.pickMimeType(everything, U.mimeCandidates(iphone, U.SAFARI_CANDIDATES)), "");
  // outros navegadores: nunca Baseline 3.0 (não comporta 720p)
  assert.ok(U.mimeCandidates({}).every((m) => !m.includes("42E01E")));
});

test("sharePayload envia só o arquivo (WhatsApp no iOS recusa arquivo + texto)", () => {
  const file = { name: "v.mp4" };
  assert.deepEqual(U.sharePayload(file), { files: [file] });
});

test("qualityPreset: resolução e taxa de bits por opção", () => {
  assert.equal(U.qualityPreset("leve").height, 720);
  assert.equal(U.qualityPreset("padrao").height, 1080);
  assert.ok(U.qualityPreset("alta").videoBitsPerSecond > U.qualityPreset("padrao").videoBitsPerSecond);
  assert.deepEqual(U.qualityPreset("2000"), U.qualityPreset("padrao")); // valor antigo => padrão
  const mbPerMin = (k) => (U.qualityPreset(k).videoBitsPerSecond + 128000) * 60 / 8 / 1e6;
  assert.ok(Math.abs(mbPerMin("leve") - 12) < 1);
  assert.ok(Math.abs(mbPerMin("padrao") - 27) < 1);
  assert.ok(Math.abs(mbPerMin("alta") - 45) < 2);
});
