/* Leitor mínimo da estrutura de arquivos MP4 (ISO BMFF), só para diagnóstico.
 *
 * Mede, de forma independente da biblioteca de conversão, quantos quadros e
 * quantos segundos tem a trilha de vídeo e a de áudio — em MP4 comum (stts) e
 * fragmentado (moof/traf/trun). Assim o app detecta "imagem parou e o áudio
 * continuou", seja na gravação, seja na conversão.
 *
 * Lê só os cabeçalhos (moov/moof); os dados de mídia (mdat) são pulados.
 * Funciona no navegador (window.TP.mp4info) e no Node (testes). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.TP = root.TP || {}; root.TP.mp4info = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function fourcc(u8, o) { return String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]); }
  function u64(dv, o) { return dv.getUint32(o) * 4294967296 + dv.getUint32(o + 4); }

  /** Percorre as caixas filhas em [start, end). */
  function children(u8, dv, start, end, cb) {
    var o = start;
    while (o + 8 <= end) {
      var size = dv.getUint32(o), type = fourcc(u8, o + 4), header = 8;
      if (size === 1) { if (o + 16 > end) break; size = u64(dv, o + 8); header = 16; }
      else if (size === 0) size = end - o;
      if (size < header || o + size > end) break;
      cb(type, o + header, o + size);
      o += size;
    }
  }

  function parseTrak(u8, dv, s, e) {
    var tr = { id: 0, type: "", timescale: 0, samples: 0, units: 0 };
    children(u8, dv, s, e, function (type, cs, ce) {
      if (type === "tkhd") {
        tr.id = dv.getUint32(cs + (u8[cs] === 1 ? 20 : 12));
      } else if (type === "mdia") {
        children(u8, dv, cs, ce, function (t2, s2, e2) {
          if (t2 === "mdhd") tr.timescale = dv.getUint32(s2 + (u8[s2] === 1 ? 20 : 12));
          else if (t2 === "hdlr") {
            var h = fourcc(u8, s2 + 8);
            tr.type = h === "vide" ? "video" : (h === "soun" ? "audio" : h);
          } else if (t2 === "minf") {
            children(u8, dv, s2, e2, function (t3, s3, e3) {
              if (t3 !== "stbl") return;
              children(u8, dv, s3, e3, function (t4, s4) {
                if (t4 !== "stts") return;
                var n = dv.getUint32(s4 + 4);
                for (var i = 0; i < n; i++) {
                  var count = dv.getUint32(s4 + 8 + i * 8), delta = dv.getUint32(s4 + 12 + i * 8);
                  tr.samples += count;
                  tr.units += count * delta;
                }
              });
            });
          }
        });
      }
    });
    return tr;
  }

  function parseMoov(u8, dv, s, e, info) {
    children(u8, dv, s, e, function (type, cs, ce) {
      if (type === "trak") info.tracks.push(parseTrak(u8, dv, cs, ce));
      else if (type === "mvex") {
        children(u8, dv, cs, ce, function (t2, s2) {
          if (t2 === "trex") info.trex[dv.getUint32(s2 + 4)] = dv.getUint32(s2 + 12);
        });
      }
    });
  }

  function parseMoof(u8, dv, s, e, info) {
    children(u8, dv, s, e, function (type, cs, ce) {
      if (type !== "traf") return;
      var id = 0, defDur = null, base = null, units = 0, samples = 0;
      children(u8, dv, cs, ce, function (t2, s2) {
        var flags = dv.getUint32(s2) & 0xffffff;
        if (t2 === "tfhd") {
          id = dv.getUint32(s2 + 4);
          var o = s2 + 8;
          if (flags & 0x01) o += 8;   // base_data_offset
          if (flags & 0x02) o += 4;   // sample_description_index
          if (flags & 0x08) defDur = dv.getUint32(o);
        } else if (t2 === "tfdt") {
          base = u8[s2] === 1 ? u64(dv, s2 + 4) : dv.getUint32(s2 + 4);
        }
      });
      var dd = defDur != null ? defDur : (info.trex[id] || 0);
      children(u8, dv, cs, ce, function (t2, s2) {
        if (t2 !== "trun") return;
        var flags = dv.getUint32(s2) & 0xffffff, n = dv.getUint32(s2 + 4), o = s2 + 8;
        if (flags & 0x01) o += 4;     // data_offset
        if (flags & 0x04) o += 4;     // first_sample_flags
        var per = (flags & 0x100 ? 4 : 0) + (flags & 0x200 ? 4 : 0) + (flags & 0x400 ? 4 : 0) + (flags & 0x800 ? 4 : 0);
        for (var i = 0; i < n; i++) units += (flags & 0x100) ? dv.getUint32(o + i * per) : dd;
        samples += n;
      });
      var f = info.frag[id] || (info.frag[id] = { samples: 0, start: null, end: 0, cursor: 0 });
      f.samples += samples;
      if (base != null) {
        f.start = f.start == null ? base : Math.min(f.start, base);
        f.cursor = base + units;
      } else {
        if (f.start == null) f.start = f.cursor;
        f.cursor += units;
      }
      f.end = Math.max(f.end, f.cursor);
    });
  }

  function summarize(info) {
    var out = { fragmented: info.fragments > 0, fragments: info.fragments, video: null, audio: null };
    info.tracks.forEach(function (tr) {
      if ((tr.type !== "video" && tr.type !== "audio") || out[tr.type]) return;
      var ts = tr.timescale || 1, f = info.frag[tr.id];
      var samples = tr.samples + (f ? f.samples : 0);
      var units = tr.units + (f ? f.end - (f.start || 0) : 0);
      out[tr.type] = { samples: samples, duration: units / ts };
    });
    return out;
  }

  function readRange(blob, start, end) {
    return blob.slice(start, end).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  /** Analisa um Blob MP4. Resolve com { fragmented, fragments, video, audio }. */
  function inspect(blob) {
    var info = { tracks: [], trex: {}, frag: {}, fragments: 0 };
    var size = blob.size, off = 0, guard = 0;
    function next() {
      if (off + 8 > size || guard++ > 200000) return Promise.resolve();
      var start = off;
      return readRange(blob, start, Math.min(size, start + 16)).then(function (h) {
        var dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
        var bsize = dv.getUint32(0), type = fourcc(h, 4), header = 8;
        if (bsize === 1) { bsize = u64(dv, 8); header = 16; }
        else if (bsize === 0) bsize = size - start;
        if (bsize < header) return undefined; // estrutura corrompida: para aqui
        off = start + bsize;
        if (type !== "moov" && type !== "moof") return next();
        if (type === "moof") info.fragments++;
        return readRange(blob, start, Math.min(size, start + bsize)).then(function (u8) {
          var dv2 = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
          if (type === "moov") parseMoov(u8, dv2, header, u8.length, info);
          else parseMoof(u8, dv2, header, u8.length, info);
        }).then(next);
      });
    }
    return next().then(function () { return summarize(info); });
  }

  /** Imagem terminou antes do áudio (mais que `tolerance` segundos)? */
  function videoGap(s, tolerance) {
    if (!s || !s.video || !s.audio) return 0;
    var gap = s.audio.duration - s.video.duration;
    return gap > (tolerance == null ? 1.5 : tolerance) ? gap : 0;
  }

  return { inspect: inspect, videoGap: videoGap };
});
