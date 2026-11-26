// Testes do leitor de estrutura MP4 com arquivos sintéticos montados byte a byte.
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../../www/js/mp4info.js");

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const box = (type, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, "latin1"), body]);
};
const full = (type, version, flags, ...parts) => box(type, Buffer.from([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);

function trak(id, handler, timescale, sttsEntries) {
  const tkhd = full("tkhd", 0, 3, u32(0), u32(0), u32(id), u32(0), u32(0));
  const mdhd = full("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(0));
  const hdlr = full("hdlr", 0, 0, u32(0), Buffer.from(handler, "latin1"), Buffer.alloc(13));
  const stts = full("stts", 0, 0, u32(sttsEntries.length), ...sttsEntries.flatMap(([c, d]) => [u32(c), u32(d)]));
  return box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", box("stbl", stts))));
}

// traf com durações padrão (tfhd) ou por amostra (trun 0x100)
function traf(id, base, count, { defDur, perSample, tfdtV1 } = {}) {
  const tfhd = defDur != null ? full("tfhd", 0, 0x08, u32(id), u32(defDur)) : full("tfhd", 0, 0x020000, u32(id));
  const tfdt = tfdtV1 ? full("tfdt", 1, 0, u64(base)) : full("tfdt", 0, 0, u32(base));
  const trun = perSample
    ? full("trun", 0, 0x001 | 0x100 | 0x200, u32(count), u32(0), ...Array.from({ length: count }, () => [u32(perSample), u32(100)]).flat())
    : full("trun", 0, 0x001, u32(count), u32(0));
  return box("traf", tfhd, tfdt, trun);
}

const blobOf = (...parts) => new Blob([Buffer.concat(parts)]);

test("MP4 comum: durações pela tabela stts", async () => {
  const moov = box("moov", trak(1, "vide", 90000, [[300, 3000]]), trak(2, "soun", 48000, [[469, 1024]]));
  const info = await M.inspect(blobOf(box("ftyp", Buffer.from("isom")), moov, box("mdat", Buffer.alloc(64))));
  assert.equal(info.fragmented, false);
  assert.equal(info.video.samples, 300);
  assert.ok(Math.abs(info.video.duration - 10) < 1e-9);
  assert.ok(Math.abs(info.audio.duration - 469 * 1024 / 48000) < 1e-9);
  assert.equal(M.videoGap(info), 0);
});

test("MP4 fragmentado: soma fragmentos (trex, tfhd e durações por amostra)", async () => {
  const mvex = box("mvex", full("trex", 0, 0, u32(1), u32(1), u32(3000), u32(0), u32(0)),
                          full("trex", 0, 0, u32(2), u32(1), u32(1024), u32(0), u32(0)));
  const moov = box("moov", trak(1, "vide", 90000, []), trak(2, "soun", 48000, []), mvex);
  const frag = (i) => box("moof", traf(1, i * 30 * 3000, 30, { tfdtV1: true }), traf(2, i * 47 * 1024, 47, { perSample: 1024 }));
  const parts = [box("ftyp", Buffer.from("iso5")), moov];
  for (let i = 0; i < 4; i++) parts.push(frag(i), box("mdat", Buffer.alloc(32)));
  const info = await M.inspect(blobOf(...parts));
  assert.equal(info.fragmented, true);
  assert.equal(info.fragments, 4);
  assert.equal(info.video.samples, 120);
  assert.ok(Math.abs(info.video.duration - 4) < 1e-9);          // 120 quadros de 1/30 s
  assert.ok(Math.abs(info.audio.duration - 4 * 47 * 1024 / 48000) < 1e-9);
});

test("detecta imagem que para antes do áudio (vídeo 20 s, áudio 45 s)", async () => {
  const mvex = box("mvex", full("trex", 0, 0, u32(1), u32(1), u32(3000), u32(0), u32(0)));
  const moov = box("moov", trak(1, "vide", 90000, []), trak(2, "soun", 48000, []), mvex);
  const parts = [moov];
  for (let s = 0; s < 45; s++) {
    const trafs = [];
    if (s < 20) trafs.push(traf(1, s * 30 * 3000, 30));                 // vídeo só nos primeiros 20 s
    trafs.push(traf(2, s * 48000, 1, { defDur: 48000 }));               // áudio o tempo todo
    parts.push(box("moof", ...trafs), box("mdat", Buffer.alloc(8)));
  }
  const info = await M.inspect(blobOf(...parts));
  assert.ok(Math.abs(info.video.duration - 20) < 1e-9);
  assert.ok(Math.abs(info.audio.duration - 45) < 1e-9);
  assert.ok(Math.abs(M.videoGap(info) - 25) < 1e-9);
});

test("tamanho 64 bits, arquivo truncado e WebM não quebram", async () => {
  const big = Buffer.concat([u32(1), Buffer.from("mdat"), u64(16 + 8), Buffer.alloc(8)]);
  const moov = box("moov", trak(1, "vide", 1000, [[10, 100]]));
  let info = await M.inspect(blobOf(big, moov));
  assert.equal(info.video.samples, 10);
  info = await M.inspect(blobOf(moov.subarray(0, moov.length - 5)));   // truncado
  assert.equal(info.video, null);
  info = await M.inspect(new Blob([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])])); // cabeçalho WebM
  assert.equal(info.video, null);
});
