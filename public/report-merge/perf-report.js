/*
 * perf-report.js — menu "Performance Report" di Smart Mail Sumatera.
 *
 * Halaman ini = Blast Email Report (index.html) yang dibuka dengan
 * ?flow=performance. Kerangka halaman, step rail, preview email, kirim satu /
 * kirim semua, jeda/batal, kirim ulang yang gagal, dan arsip memakai kode
 * Blast Email Report. Skrip ini mengganti isinya:
 *
 *   Tahap 1  Upload 1 file Excel performa: sheet "Internal Sales" (blok
 *            Circle / Region / Area / Cluster), "MDI", "SDP", "Master_Mapping".
 *   Tahap 2  Visualisasi pencapaian (kartu KPI, perbandingan region, heatmap
 *            Area x KPI, ranking MDI, sebaran SDP) + pilih jenis kiriman.
 *   Tahap 3  Preview & kirim. Dua jenis email:
 *            - Per entitas: tiap MDI (partner + area) dan tiap ID SDP (MIM3 dan
 *              3KIOSK terpisah). To/Cc dari Master_Mapping.
 *            - Head of Area: 1 email bulk per region berisi ringkasan, insight,
 *              tabel area/MDI/SDP + lampiran Excel. To dari daftar Head of Area
 *              (disimpan di SandraHub), Cc = alamat Cc yang ada di SEMUA baris
 *              Master_Mapping region itu.
 *
 * Warna (ubah di THRESHOLD): hijau >= 83%, kuning 78% s/d < 83%, merah < 78%.
 * Di luar ?flow=performance skrip ini tidak melakukan apa-apa.
 */
(function () {
  if (new URLSearchParams(location.search).get('flow') !== 'performance') return;

  /* =========================== Util =========================== */
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var norm = function (s) { return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim().replace(/\s+/g, ' ').toUpperCase(); };
  var normKey = function (s) { return norm(s).replace(/[.,]/g, '').replace(/\s+/g, ' '); };
  var splitEmails = function (s) { return String(s == null ? '' : s).split(/[;,\s]+/).map(function (e) { return e.trim(); }).filter(function (e) { return /@/.test(e); }); };
  var num = function (v) {
    if (v === '' || v == null) return null;
    var n = typeof v === 'number' ? v : Number(String(v).replace(/%$/, '').replace(/,/g, '.'));
    if (!isFinite(n)) return null;
    if (typeof v === 'string' && /%$/.test(v.trim())) n = n / 100;
    return n;
  };
  var pct = function (v) { return v == null ? '–' : (v * 100).toFixed(1).replace('.', ',') + '%'; };
  var fmt = function (v) { return v == null ? '–' : Math.round(v).toLocaleString('id-ID'); };
  // Ambang warna — cukup ubah dua angka ini (dalam pecahan, 0.83 = 83%).
  var THRESHOLD = { hijau: 0.83, kuning: 0.78 };
  var tp = function (v) { return Math.round(v * 100) + '%'; };
  var LBL = { g: '≥' + tp(THRESHOLD.hijau), y: tp(THRESHOLD.kuning) + '–<' + tp(THRESHOLD.hijau), r: '<' + tp(THRESHOLD.kuning) };
  var band = function (v) { return v == null ? 'na' : v >= THRESHOLD.hijau ? 'g' : v >= THRESHOLD.kuning ? 'y' : 'r'; };
  var BAND_TXT = { g: 'hijau (' + LBL.g + ')', y: 'kuning (' + LBL.y + ')', r: 'merah (' + LBL.r + ')', na: 'tidak ada data' };
  var MAIL = { g: ['#E3F5F2', '#1D8078'], y: ['#FFF4CC', '#8A6A00'], r: ['#FDE4E4', '#B3121A'], na: ['#F2F2F6', '#6B6B78'] };
  var title = function (s) { return String(s || '').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/\b(Pt|Cv|Sdp|Mdi|Mc)\b/g, function (w) { return w.toUpperCase(); }); };
  var avg = function (arr) { var a = arr.filter(function (x) { return x != null; }); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; };
  var byScoreDesc = function (a, b) { return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score); };

  var KPIS = [
    { id: 'trad', label: 'RGUGA Trad w/ Usage', short: 'RGUGA Trad', re: /TRAD/ },
    { id: 'dse', label: 'DSE Prod Compliance', short: 'DSE Prod', re: /DSE/ },
    { id: 'fwa', label: 'RGUGA FWA / Sell-in FWA', short: 'FWA', re: /FWA/ },
  ];
  var DEFAULT_HOA = [
    { kunci: 'CENTRAL SUMATERA', nama: 'Agung Purwanto', to: 'agung.purwanto@ioh.co.id', cc: '' },
    { kunci: 'NORTH SUMATERA', nama: 'Ahmad Mujaini', to: 'ahmad.mujaini@ioh.co.id', cc: '' },
    { kunci: 'SOUTH SUMATERA', nama: 'Pompi Saefudin', to: 'pompi.saefudin@ioh.co.id', cc: '' },
  ];

  var P = {
    data: null,          // hasil parse Excel
    jenis: 'hoa',        // 'hoa' | 'mdi' | 'sdp'
    region: '',          // filter visual
    hoa: DEFAULT_HOA.slice(),
    hoaLoaded: false,
  };
  window.__perfReport = P;

  /* ======================= Baca Excel ======================= */
  function aoaOf(wb, re) {
    var name = wb.SheetNames.filter(function (n) { return re.test(n); })[0];
    return name ? { name: name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true }) } : null;
  }
  function dateOf(rows) {
    for (var i = 0; i < Math.min(rows.length, 4); i++) {
      for (var j = 0; j < rows[i].length; j++) {
        var m = String(rows[i][j]).trim().match(/^(20\d\d)(\d\d)(\d\d)$/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
      }
    }
    return null;
  }
  var kpiOf = function (txt) { var t = norm(txt); if (/SCORE/.test(t)) return 'score'; for (var i = 0; i < KPIS.length; i++) if (KPIS[i].re.test(t)) return KPIS[i].id; return null; };

  // Header blok = baris berisi judul KPI "RGUGA ... TRAD" yang diikuti baris sub-header berisi ACH.
  // (Jangan cuma cari kata TRAD: nama orang seperti "ESTRADA" juga mengandungnya.)
  function isHeaderAt(rows, i) {
    var h = rows[i], s = rows[i + 1];
    if (!h || !s) return false;
    return h.some(function (c) { return /RGUGA.*TRAD|TRAD.*USAGE/.test(norm(c)); }) && s.some(function (c) { return norm(c) === 'ACH'; });
  }
  // Sheet Internal Sales: beberapa blok, tiap blok = baris header KPI + baris sub-header (TARGET/ACTUAL/ACH).
  function parseIS(rows) {
    var blocks = {};
    for (var i = 0; i < rows.length - 1; i++) {
      var h = rows[i], s = rows[i + 1];
      if (!isHeaderAt(rows, i)) continue;
      var h0 = norm(h[0]) || norm(h[1]);
      var level = /^NAME$|^NAMA$|SALES/.test(h0) ? 'NAME' : /CLUSTER|^MC\b/.test(h0) ? 'CLUSTER' : /AREA|BRANCH/.test(h0) ? 'AREA' : /REGION/.test(h0) ? 'REGION' : /CIRCLE/.test(h0) ? 'CIRCLE' : h0;
      var dims = [], cols = { score: null };
      KPIS.forEach(function (k) { cols[k.id] = {}; });
      var cur = null;
      for (var c = 0; c < h.length; c++) {
        var ht = norm(h[c]);
        if (ht) {
          var k = kpiOf(ht);
          if (k === 'score') { cols.score = c; cur = null; continue; }
          if (k) { cur = k; } else if (!cur && c < 6) { dims.push({ c: c, name: ht }); }
        }
        if (cur) {
          var st = norm(s[c]);
          if (st === 'TARGET' || st === '#SKOR') cols[cur].t = c;
          else if (st === 'ACTUAL' || st === '#DSE') cols[cur].a = c;
          else if (st === 'ACH') cols[cur].ach = c;
        }
      }
      var list = [];
      var kosong = 0;
      for (var r = i + 2; r < rows.length; r++) {
        var row = rows[r];
        if (!String(row[0]).trim()) {
          // Baris kosong: lewati 1 baris kosong di awal/tengah, berhenti kalau sudah 2 berturut-turut
          // atau ketemu header blok berikutnya.
          if (isHeaderAt(rows, r)) break;
          if (++kosong >= 2 && list.length) break;
          if (kosong >= 3) break;
          continue;
        }
        if (isHeaderAt(rows, r)) break;
        kosong = 0;
        var o = { nama: String(row[0]).trim(), level: level };
        dims.forEach(function (d) { o[d.name] = String(row[d.c]).trim(); });
        KPIS.forEach(function (k) {
          var cc = cols[k.id];
          o[k.id] = { t: cc.t != null ? num(row[cc.t]) : null, a: cc.a != null ? num(row[cc.a]) : null, ach: cc.ach != null ? num(row[cc.ach]) : null };
        });
        o.score = cols.score != null ? num(row[cols.score]) : null;
        list.push(o);
      }
      if (!blocks[level] || !blocks[level].length) blocks[level] = list;
      i += 1;
    }
    return blocks;
  }

  // Rumus sama dengan file Performance Report: Ach RGUGA Trad = actual/target,
  // Ach DSE = #skor/#DSE, Ach FWA = actual/target maksimal 130%,
  // Score = 50% Trad + 35% DSE + 15% FWA.
  var SCORE_W = { trad: 0.5, dse: 0.35, fwa: 0.15 }, FWA_CAP = 1.3;
  function aggregateBy(rows, key, keepDims) {
    var map = new Map();
    rows.forEach(function (r) {
      var k = String(r[key] || '').trim();
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return Array.from(map.entries()).map(function (e) {
      var list = e[1], o = { nama: e[0], level: key, jumlah: list.length };
      keepDims.forEach(function (dk) { o[dk] = list[0][dk] || ''; });
      KPIS.forEach(function (k) {
        var t = 0, a = 0, ada = false;
        list.forEach(function (r) { if (r[k.id].t != null) { t += r[k.id].t; ada = true; } if (r[k.id].a != null) a += r[k.id].a; });
        var ach = null;
        if (ada) {
          if (k.id === 'dse') ach = a ? t / a : null;
          else ach = t ? a / t : null;
          if (k.id === 'fwa' && ach != null) ach = Math.min(ach, FWA_CAP);
        }
        o[k.id] = { t: ada ? t : null, a: ada ? a : null, ach: ach };
      });
      o.score = (o.trad.ach != null && o.dse.ach != null && o.fwa.ach != null)
        ? SCORE_W.trad * o.trad.ach + SCORE_W.dse * o.dse.ach + SCORE_W.fwa * o.fwa.ach
        : avg(list.map(function (r) { return r.score; }));
      return o;
    });
  }

  function headerIdx(rows, re) { for (var i = 0; i < Math.min(rows.length, 15); i++) if (rows[i].some(function (c) { return re.test(norm(c)); })) return i; return -1; }
  function colIdx(h, re) { for (var c = 0; c < h.length; c++) if (re.test(norm(h[c]))) return c; return -1; }

  function parseFlat(rows, headerRe, dimDefs) {
    var hi = headerIdx(rows, headerRe);
    if (hi < 0) return [];
    var h = rows[hi];
    var kc = {};
    h.forEach(function (c, i) { var k = kpiOf(c); if (k && kc[k] == null) kc[k] = i; });
    var dc = {};
    Object.keys(dimDefs).forEach(function (k) { dc[k] = colIdx(h, dimDefs[k]); });
    var out = [];
    for (var r = hi + 1; r < rows.length; r++) {
      var row = rows[r];
      if (kc.score == null || num(row[kc.score]) == null) continue;
      var o = {};
      Object.keys(dc).forEach(function (k) { o[k] = dc[k] >= 0 ? String(row[dc[k]]).trim() : ''; });
      KPIS.forEach(function (k) { o[k.id] = { ach: kc[k.id] != null ? num(row[kc[k.id]]) : null }; });
      o.score = num(row[kc.score]);
      out.push(o);
    }
    return out;
  }

  function parseWorkbook(wb) {
    var is = aoaOf(wb, /internal|sales/i), mdi = aoaOf(wb, /^\s*mdi/i), sdp = aoaOf(wb, /^\s*sdp/i), map = aoaOf(wb, /master|mapping/i);
    var missing = [];
    if (!is) missing.push('Internal Sales');
    if (!mdi) missing.push('MDI');
    if (!sdp) missing.push('SDP');
    if (!map) missing.push('Master_Mapping');
    if (missing.length) throw new Error('Sheet tidak ditemukan: ' + missing.join(', ') + '. Pastikan file berisi sheet Internal Sales, MDI, SDP, dan Master_Mapping.');

    var d = { tanggal: dateOf(is.rows) || dateOf(mdi.rows) || dateOf(sdp.rows) };
    d.is = parseIS(is.rows);
    // Format baru: Internal Sales = 1 tabel per orang (NAME, CLUSTER, AREA, REGION, CIRCLE).
    // Angka Cluster / Area / Region / Sumatera dihitung dari baris per orang.
    var people = d.is.NAME || [];
    if (people.length && !(d.is.AREA && d.is.AREA.length)) {
      d.people = people;
      d.is.CLUSTER = aggregateBy(people, 'CLUSTER', ['AREA', 'REGION', 'CIRCLE']);
      d.is.AREA = aggregateBy(people, 'AREA', ['REGION', 'CIRCLE']);
      d.is.REGION = aggregateBy(people, 'REGION', ['CIRCLE']);
      d.is.CIRCLE = aggregateBy(people, 'CIRCLE', []);
    }
    d.circle = (d.is.CIRCLE || [])[0] || null;
    d.regions = d.is.REGION || [];
    d.areas = d.is.AREA || [];
    d.clusters = d.is.CLUSTER || [];
    d.mdi = parseFlat(mdi.rows, /PARTNER_NAME/, { circle: /^CIRCLE$/, region: /^REGION$/, area: /^AREA$/, partner: /PARTNER_NAME_IM3|^PARTNER_NAME$/, partner3: /PARTNER_NAME_3ID/ });
    d.sdpRows = parseFlat(sdp.rows, /ID_MIM3/, { idMim3: /^ID_MIM3$/, namaMim3: /^NAME_MIM3$/, territory: /TERRITORY/, mc: /MICROCLUSTER/, area: /^AREA$/, region: /^REGION$/, circle: /^CIRCLE$/, id3k: /^ID_3KIOSK$/, nama3k: /^NAME_3KIOSK$/ });

    // Master_Mapping
    var mh = headerIdx(map.rows, /EMAIL_TO/);
    if (mh < 0) throw new Error('Sheet Master_Mapping tidak punya kolom EMAIL_TO.');
    var h = map.rows[mh], mc = {};
    ['BRAND', 'TYPE', 'ID', 'PARTNER_NAME', 'BRANCH', 'REGION', 'EMAIL_TO', 'EMAIL_CC'].forEach(function (k) { mc[k] = colIdx(h, new RegExp('^' + k + '$')); });
    d.map = map.rows.slice(mh + 1).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); }).map(function (r) {
      var o = {};
      Object.keys(mc).forEach(function (k) { o[k] = mc[k] >= 0 ? String(r[mc[k]]).trim() : ''; });
      return o;
    });
    d.mapById = {};
    d.mapMdi = {};
    d.map.forEach(function (m) {
      if (m.ID) d.mapById[normKey(m.ID)] = m;
      if (norm(m.TYPE) === 'MDI') d.mapMdi[normKey(m.PARTNER_NAME) + '|' + normKey(m.BRANCH)] = m;
    });

    // Entitas SDP: 1 per ID (MIM3 dan 3KIOSK masing-masing).
    d.sdp = [];
    d.sdpRows.forEach(function (r) {
      [['MIM3', r.idMim3, r.namaMim3], ['3KIOSK', r.id3k, r.nama3k]].forEach(function (x) {
        if (!x[1]) return;
        d.sdp.push({ brand: x[0], id: x[1], nama: x[2] || x[1], row: r, map: d.mapById[normKey(x[1])] || null });
      });
    });
    d.mdi.forEach(function (r) {
      r.map = d.mapMdi[normKey(r.partner) + '|' + normKey(r.area)] || (r.partner3 ? d.mapMdi[normKey(r.partner3) + '|' + normKey(r.area)] : null) || null;
    });
    d.regionNames = d.regions.map(function (r) { return r.nama; });
    if (!d.regionNames.length) d.regionNames = Array.from(new Set(d.mdi.map(function (r) { return r.region; }).filter(Boolean)));
    return d;
  }

  // Cc Head of Area = alamat Cc yang muncul di SEMUA baris Master_Mapping region itu.
  function regionCc(region) {
    var rows = P.data.map.filter(function (m) { return norm(m.REGION) === norm(region); });
    if (!rows.length) return [];
    var common = null;
    rows.forEach(function (m) {
      var set = new Set(splitEmails(m.EMAIL_CC).map(function (e) { return e.toLowerCase(); }));
      common = common ? new Set(Array.from(common).filter(function (e) { return set.has(e); })) : set;
    });
    return Array.from(common || []);
  }

  /* ======================= Insight ======================= */
  function weakest(o) {
    var ks = KPIS.filter(function (k) { return o[k.id] && o[k.id].ach != null; });
    if (!ks.length) return null;
    ks.sort(function (a, b) { return o[a.id].ach - o[b.id].ach; });
    return { k: ks[0], v: o[ks[0].id].ach };
  }
  function strongest(o) {
    var ks = KPIS.filter(function (k) { return o[k.id] && o[k.id].ach != null; });
    if (!ks.length) return null;
    ks.sort(function (a, b) { return o[b.id].ach - o[a.id].ach; });
    return { k: ks[0], v: o[ks[0].id].ach };
  }
  function rankIn(list, item) {
    var sorted = list.slice().sort(byScoreDesc);
    return { r: sorted.indexOf(item) + 1, n: sorted.length };
  }

  function insightSdp(e) {
    var r = e.row, d = P.data, out = [];
    out.push('Score ' + pct(r.score) + ', ' + BAND_TXT[band(r.score)] + '.');
    var w = weakest(r), s = strongest(r);
    if (w && band(w.v) !== 'g') out.push('KPI yang paling perlu dikejar: ' + w.k.label + ' (' + pct(w.v) + ').');
    if (s && band(s.v) === 'g') out.push('KPI terbaik: ' + s.k.label + ' (' + pct(s.v) + ').');
    var peers = d.sdpRows.filter(function (x) { return norm(x.area) === norm(r.area); });
    if (peers.length > 1) {
      var rk = rankIn(peers, r);
      out.push('Peringkat ' + rk.r + ' dari ' + rk.n + ' SDP di area ' + title(r.area) + ' (rata-rata score area ' + pct(avg(peers.map(function (x) { return x.score; }))) + ').');
    }
    return out;
  }
  function insightMdi(r) {
    var d = P.data, out = [];
    out.push('Score ' + pct(r.score) + ', ' + BAND_TXT[band(r.score)] + '.');
    var w = weakest(r), s = strongest(r);
    if (w && band(w.v) !== 'g') out.push('KPI yang paling perlu dikejar: ' + w.k.label + ' (' + pct(w.v) + ').');
    if (s && band(s.v) === 'g') out.push('KPI terbaik: ' + s.k.label + ' (' + pct(s.v) + ').');
    var peers = d.mdi.filter(function (x) { return norm(x.region) === norm(r.region); });
    if (peers.length > 1) { var rk = rankIn(peers, r); out.push('Peringkat ' + rk.r + ' dari ' + rk.n + ' MDI di ' + title(r.region) + '.'); }
    var sdps = d.sdpRows.filter(function (x) { return norm(x.area) === norm(r.area); });
    if (sdps.length) {
      var low = sdps.filter(function (x) { return band(x.score) === 'r'; }).length;
      out.push(sdps.length + ' SDP di area ' + title(r.area) + ', ' + low + ' di antaranya merah (' + LBL.r + ').');
    }
    return out;
  }
  function regionPack(region) {
    var d = P.data, R = norm(region);
    var reg = d.regions.filter(function (x) { return norm(x.nama) === R; })[0] || null;
    var areas = d.areas.filter(function (x) { return norm(x.REGION) === R; }).sort(byScoreDesc);
    var clusters = d.clusters.filter(function (x) { return norm(x.REGION) === R; });
    var mdi = d.mdi.filter(function (x) { return norm(x.region) === R; }).sort(byScoreDesc);
    var sdpRows = d.sdpRows.filter(function (x) { return norm(x.region) === R; });
    var sdpEnt = d.sdp.filter(function (x) { return norm(x.row.region) === R; });
    var areaNames = Array.from(new Set(areas.map(function (a) { return a.nama; }).concat(sdpRows.map(function (x) { return x.area; }))));
    var sdpByArea = areaNames.map(function (a) {
      var list = sdpRows.filter(function (x) { return norm(x.area) === norm(a); });
      return {
        area: a, n: list.length, avg: avg(list.map(function (x) { return x.score; })),
        g: list.filter(function (x) { return band(x.score) === 'g'; }).length,
        y: list.filter(function (x) { return band(x.score) === 'y'; }).length,
        r: list.filter(function (x) { return band(x.score) === 'r'; }).length,
      };
    }).filter(function (x) { return x.n; }).sort(function (a, b) { return (b.r / b.n) - (a.r / a.n); });
    return { region: region, reg: reg, areas: areas, clusters: clusters, mdi: mdi, sdpRows: sdpRows, sdpEnt: sdpEnt, sdpByArea: sdpByArea };
  }
  function insightRegion(p) {
    var d = P.data, out = [], reg = p.reg;
    if (reg) {
      var vs = d.circle && d.circle.score != null && reg.score != null ? (reg.score >= d.circle.score ? ' (di atas' : ' (di bawah') + ' Sumatera ' + pct(d.circle.score) + ')' : '';
      out.push('Score ' + title(p.region) + ' ' + pct(reg.score) + vs + ', ' + BAND_TXT[band(reg.score)] + '.');
      var w = weakest(reg);
      if (w) out.push('KPI terlemah di region: ' + w.k.label + ' ' + pct(w.v) + '.');
    }
    if (p.areas.length) {
      var top = p.areas.slice(0, 3).map(function (a) { return title(a.nama) + ' ' + pct(a.score); });
      var bot = p.areas.slice(-3).reverse().map(function (a) { return title(a.nama) + ' ' + pct(a.score); });
      out.push('Area terbaik: ' + top.join(', ') + '.');
      out.push('Area yang perlu perhatian: ' + bot.join(', ') + '.');
      var under = p.areas.filter(function (a) { return band(a.score) === 'r'; });
      out.push(under.length + ' dari ' + p.areas.length + ' area merah (' + LBL.r + ').');
      KPIS.forEach(function (k) {
        var low = p.areas.filter(function (a) { return a[k.id] && band(a[k.id].ach) === 'r'; });
        if (low.length) out.push(k.label + ' merah (' + LBL.r + ') di ' + low.length + ' area: ' + low.slice(0, 6).map(function (a) { return title(a.nama); }).join(', ') + (low.length > 6 ? ', dll' : '') + '.');
      });
    }
    if (p.mdi.length) {
      var mr = p.mdi.filter(function (x) { return band(x.score) === 'r'; }).length;
      out.push('MDI: ' + p.mdi.length + ' partner-area, ' + mr + ' merah (' + LBL.r + '). Terendah: ' + p.mdi.slice(-1).map(function (x) { return title(x.partner) + ' (' + title(x.area) + ') ' + pct(x.score); })[0] + '.');
    }
    if (p.sdpRows.length) {
      var sr = p.sdpRows.filter(function (x) { return band(x.score) === 'r'; }).length;
      var sg = p.sdpRows.filter(function (x) { return band(x.score) === 'g'; }).length;
      out.push('SDP: ' + p.sdpRows.length + ' SDP, rata-rata score ' + pct(avg(p.sdpRows.map(function (x) { return x.score; }))) + '; ' + sg + ' hijau, ' + sr + ' (' + Math.round(sr / p.sdpRows.length * 100) + '%) merah (' + LBL.r + ').');
    }
    var unmapped = p.sdpEnt.filter(function (e) { return !e.map; });
    if (unmapped.length) out.push(unmapped.length + ' ID SDP belum ada di Master_Mapping (tidak menerima email): ' + unmapped.slice(0, 5).map(function (e) { return e.id; }).join(', ') + (unmapped.length > 5 ? ', dll' : '') + '.');
    return out;
  }

  /* ======================= HTML email (tema SandraHub) ======================= */
  // Semua gaya inline + tabel (klien email seperti Outlook membuang <style>, flex, dan gradient).
  var F = 'font-family:Arial,Helvetica,sans-serif;';
  var C = { ink: '#1F1F24', body: '#4D4D4F', muted: '#6B6B78', line: '#E6E6EC', bg: '#F4F4F7', card: '#FFFFFF', dark: '#16161B', teal: '#32BCAD', tealDk: '#1E8C80', magenta: '#C6168D', yellow: '#FFCB05', red: '#ED1C24' };
  // Warna status standar laporan performa (RAG): isi solid hijau / kuning-amber / merah.
  var BAR = { g: '#00A651', y: '#FFC000', r: '#E3000F', na: '#D5D5DD' };
  var PILL = { g: ['#00A651', '#FFFFFF'], y: ['#FFC000', '#3B2C00'], r: ['#E3000F', '#FFFFFF'], na: ['#E6E6EC', '#6B6B78'] };
  var INK = { g: '#00843D', y: '#A87400', r: '#C8000D', na: '#6B6B78' };
  function mP(txt) { return '<p style="' + F + 'font-size:14px;color:' + C.body + ';line-height:1.65;margin:0 0 14px 0;">' + txt + '</p>'; }
  function mText(raw) { return String(raw || '').split(/\n\s*\n/).filter(function (b) { return b.trim(); }).map(function (b) { return mP(esc(b).replace(/\n/g, '<br>')); }).join(''); }
  function mH(txt) { return '<p style="' + F + 'font-size:13px;font-weight:bold;color:' + C.ink + ';text-transform:uppercase;letter-spacing:.6px;margin:22px 0 10px 0;">' + txt + '</p>'; }
  function mSec(no, txt, sub) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:30px 0 6px 0;"><tr>'
      + '<td width="34" style="' + F + 'width:34px;height:34px;background:' + C.magenta + ';color:#fff;font-size:15px;font-weight:bold;text-align:center;border-radius:9px;">' + esc(no) + '</td>'
      + '<td style="' + F + 'padding-left:12px;"><div style="font-size:18px;font-weight:bold;color:' + C.ink + ';">' + esc(txt) + '</div>'
      + (sub ? '<div style="font-size:12.5px;color:' + C.muted + ';margin-top:2px;">' + esc(sub) + '</div>' : '') + '</td></tr></table>'
      + '<div style="height:2px;line-height:2px;background:' + C.line + ';margin:10px 0 4px 0;">&nbsp;</div>';
  }
  function pill(v) { var p = PILL[band(v)]; return '<span style="' + F + 'display:inline-block;background:' + p[0] + ';color:' + p[1] + ';font-weight:bold;font-size:12px;padding:3px 9px;border-radius:999px;white-space:nowrap;">' + pct(v) + '</span>'; }
  // Bar progres: lebar penuh = 130%, garis target di 83%.
  function mBar(v, h) {
    h = h || 8;
    var w = v == null ? 0 : Math.max(1, Math.round(Math.min(v, 1.3) / 1.3 * 100));
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>'
      + (w ? '<td width="' + w + '%" style="height:' + h + 'px;line-height:' + h + 'px;font-size:1px;background:' + BAR[band(v)] + ';border-radius:' + h + 'px 0 0 ' + h + 'px;">&nbsp;</td>' : '')
      + (w < 100 ? '<td style="height:' + h + 'px;line-height:' + h + 'px;font-size:1px;background:#EDEDF2;border-radius:0 ' + h + 'px ' + h + 'px 0;">&nbsp;</td>' : '')
      + '</tr></table>';
  }
  function mTiles(o, compare) {
    var cells = [{ lbl: 'Score', v: o.score, cmp: compare && compare.score, big: true }].concat(KPIS.map(function (k) { return { lbl: k.label, v: o[k.id] && o[k.id].ach, cmp: compare && compare[k.id] && compare[k.id].ach }; }));
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 0;margin:0 -8px 6px -8px;"><tr>' + cells.map(function (c) {
      var pc = PILL[band(c.v)], STAT = { g: 'TERCAPAI', y: 'WASPADA', r: 'DI BAWAH TARGET', na: '' }[band(c.v)];
      return '<td width="25%" style="' + F + 'background:' + pc[0] + ';border-radius:12px;padding:12px 14px;vertical-align:top;">'
        + '<div style="font-size:10.5px;color:' + pc[1] + ';text-transform:uppercase;letter-spacing:.5px;font-weight:bold;min-height:26px;">' + esc(c.lbl) + '</div>'
        + '<div style="font-size:' + (c.big ? 28 : 24) + 'px;font-weight:bold;color:' + pc[1] + ';margin:4px 0 4px 0;">' + pct(c.v) + '</div>'
        + '<div style="font-size:10.5px;font-weight:bold;letter-spacing:.6px;color:' + pc[1] + ';">' + STAT + '</div>'
        + (c.cmp != null ? '<div style="font-size:11px;color:' + pc[1] + ';margin-top:6px;">Sumatera <b>' + pct(c.cmp) + '</b></div>' : '')
        + '</td>';
    }).join('') + '</tr></table>';
  }
  function mInsight(list, judul) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0 6px 0;"><tr>'
      + '<td width="4" style="width:4px;background:' + C.teal + ';border-radius:4px;">&nbsp;</td>'
      + '<td style="' + F + 'background:#EEF9F7;padding:14px 18px;border-radius:0 12px 12px 0;">'
      + '<div style="font-size:12px;font-weight:bold;color:' + C.tealDk + ';text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">' + esc(judul || 'Insight') + '</div>'
      + list.map(function (t) { return '<div style="font-size:13.5px;color:' + C.body + ';line-height:1.55;margin:0 0 6px 0;">•&nbsp; ' + esc(t) + '</div>'; }).join('')
      + '</td></tr></table>';
  }
  // Grafik batang horizontal: [{nama, v, sub}]
  function mBars(items) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + items.map(function (it) {
      return '<tr><td style="' + F + 'font-size:12.5px;color:' + C.ink + ';padding:5px 10px 5px 0;white-space:nowrap;width:150px;">' + esc(it.nama) + (it.sub ? '<div style="font-size:10.5px;color:' + C.muted + ';">' + esc(it.sub) + '</div>' : '') + '</td>'
        + '<td style="padding:5px 0;">' + mBar(it.v, 10) + '</td>'
        + '<td style="' + F + 'text-align:right;padding:5px 0 5px 10px;width:64px;white-space:nowrap;">' + pill(it.v) + '</td></tr>';
    }).join('') + '</table>';
  }
  // Batang bertumpuk sebaran hijau/kuning/merah: [{nama, g, y, r, n}]
  function mStack(items) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + items.map(function (it) {
      var seg = function (k, n) { return n ? '<td width="' + Math.max(1, Math.round(n / it.n * 100)) + '%" style="height:12px;font-size:1px;line-height:12px;background:' + BAR[k] + ';">&nbsp;</td>' : ''; };
      return '<tr><td style="' + F + 'font-size:12.5px;color:' + C.ink + ';padding:5px 10px 5px 0;white-space:nowrap;width:150px;">' + esc(it.nama) + '</td>'
        + '<td style="padding:5px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>' + seg('g', it.g) + seg('y', it.y) + seg('r', it.r) + '</tr></table></td>'
        + '<td style="' + F + 'font-size:11.5px;color:' + C.muted + ';text-align:right;padding:5px 0 5px 10px;width:92px;white-space:nowrap;"><b style="color:' + INK.g + ';">' + it.g + '</b> · <b style="color:' + INK.y + ';">' + it.y + '</b> · <b style="color:' + INK.r + ';">' + it.r + '</b></td></tr>';
    }).join('') + '</table>';
  }
  // cols: [{label, get(row) -> value, kind: 'pct'|'num'|'text'}]
  function mTable(cols, rows) {
    var th = F + 'background:' + C.bg + ';color:' + C.muted + ';font-size:10.5px;font-weight:bold;text-transform:uppercase;letter-spacing:.4px;padding:9px 10px;text-align:left;border-bottom:1px solid ' + C.line + ';white-space:nowrap;';
    var html = '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;border:1px solid ' + C.line + ';border-radius:12px;overflow:hidden;margin:0 0 6px 0;min-width:60%;"><tr>'
      + cols.map(function (c) { return '<th style="' + th + (c.kind && c.kind !== 'text' ? 'text-align:right;' : '') + '">' + esc(c.label) + '</th>'; }).join('') + '</tr>';
    rows.forEach(function (r, i) {
      var last = i === rows.length - 1;
      html += '<tr>' + cols.map(function (c) {
        var v = c.get(r), st = F + 'font-size:12.5px;padding:7px 10px;white-space:nowrap;color:' + C.body + ';' + (last ? '' : 'border-bottom:1px solid #F0F0F4;') + (i % 2 ? 'background:#FAFAFC;' : 'background:#fff;');
        if (c.kind === 'pct') return '<td style="' + st + 'text-align:right;">' + pill(v) + '</td>';
        if (c.kind === 'num') return '<td style="' + st + 'text-align:right;">' + fmt(v) + '</td>';
        return '<td style="' + st + (c.bold ? 'font-weight:bold;color:' + C.ink + ';' : '') + '">' + esc(v) + '</td>';
      }).join('') + '</tr>';
    });
    return html + '</table>';
  }
  var achCols = function () { return KPIS.map(function (k) { return { label: k.short, kind: 'pct', get: function (r) { return r[k.id] && r[k.id].ach; } }; }).concat([{ label: 'Score', kind: 'pct', get: function (r) { return r.score; } }]); };
  function mLegend() {
    var chip = function (k, t) { return '<span style="display:inline-block;background:' + PILL[k][0] + ';color:' + PILL[k][1] + ';font-weight:bold;font-size:11px;padding:3px 10px;border-radius:999px;margin-left:6px;">' + esc(t) + '</span>'; };
    return '<p style="' + F + 'font-size:11.5px;color:' + C.muted + ';margin:10px 0 0 0;">Status:' + chip('g', 'Hijau ' + LBL.g) + chip('y', 'Kuning ' + LBL.y) + chip('r', 'Merah ' + LBL.r) + '</p>';
  }
  // Kerangka email: header gelap ala SandraHub + kartu putih + footer.
  function wrap(inner, head) {
    head = head || {};
    var stripe = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>'
      + '<td width="34%" style="height:4px;font-size:1px;line-height:4px;background:' + C.teal + ';">&nbsp;</td>'
      + '<td width="33%" style="height:4px;font-size:1px;line-height:4px;background:' + C.yellow + ';">&nbsp;</td>'
      + '<td width="33%" style="height:4px;font-size:1px;line-height:4px;background:' + C.magenta + ';">&nbsp;</td></tr></table>';
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:' + C.bg + ';"><tr><td align="center" style="padding:24px 12px;">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;max-width:820px;background:#fff;border:1px solid ' + C.line + ';border-radius:16px;overflow:hidden;">'
      + '<tr><td style="padding:0;">' + stripe + '</td></tr>'
      + '<tr><td style="' + F + 'background:' + C.dark + ';padding:22px 28px;">'
      + '<div style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:' + C.teal + ';">SandraHub · Smart Mail Sumatera</div>'
      + '<div style="font-size:24px;font-weight:bold;color:#fff;margin-top:6px;">' + esc(head.title || 'Performance Report') + '</div>'
      + (head.sub ? '<div style="font-size:13px;color:#B9B9C6;margin-top:4px;">' + esc(head.sub) + '</div>' : '')
      + '</td></tr>'
      + '<tr><td style="' + F + 'padding:26px 28px 10px 28px;">' + inner + '</td></tr>'
      + '<tr><td style="' + F + 'padding:16px 28px 22px 28px;border-top:1px solid ' + C.line + ';font-size:11.5px;color:' + C.muted + ';line-height:1.6;">'
      + 'Email ini dikirim otomatis dari SandraHub (Smart Mail Sumatera) — Sales &amp; Distribution, Indosat Circle Sumatera.</td></tr>'
      + '</table></td></tr></table>';
  }

  /* ======================= Bentuk penerima ======================= */
  var tanggalTxt = function () { return P.data.tanggal ? P.data.tanggal.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'; };
  function introFor(group, defaultTxt) {
    var ta = document.getElementById('perfIntro');
    return (ta && ta.value.trim() ? ta.value : defaultTxt).replace(/\{nama\}/g, group.name).replace(/\{periode\}/g, P.periode).replace(/\{tanggal\}/g, tanggalTxt());
  }
  function closingTxt() { var ta = document.getElementById('perfClosing'); return ta ? ta.value : ''; }
  var INTRO_DEF = 'Yth. Bapak/Ibu {nama},\n\nBerikut kami sampaikan Performance Report periode {periode} (data per {tanggal}).';

  function buildGroups() {
    var d = P.data, groups = [];
    P.periode = (document.getElementById('perfPeriode').value || '').trim() || tanggalTxt();
    var subHead = function (x) { return x + ' · Periode ' + P.periode + ' · Data per ' + tanggalTxt(); };
    if (P.jenis === 'hoa') {
      d.regionNames.forEach(function (region) {
        var p = regionPack(region);
        var h = P.hoa.filter(function (x) { return norm(x.kunci) === norm(region); })[0];
        var to = h ? splitEmails(h.to) : [];
        var ccSet = new Set(regionCc(region).concat(h ? splitEmails(h.cc) : []).map(function (e) { return e.toLowerCase(); }));
        to.forEach(function (e) { ccSet.delete(e.toLowerCase()); });
        var name = (h && h.nama ? h.nama + ' — ' : '') + title(region);
        var ins = insightRegion(p);
        var people = (d.people || []).filter(function (x) { return norm(x.REGION) === norm(region); });
        var html = wrap(
          mText(introFor({ name: h && h.nama ? h.nama : 'Head of Area' }, 'Yth. Bapak/Ibu {nama},\n\nBerikut kami sampaikan Performance Report ' + title(region) + ' periode {periode} (data per {tanggal}).'))
          + mH('Ringkasan ' + esc(title(region))) + (p.reg ? mTiles(p.reg, d.circle) : '') + mLegend()
          + mInsight(ins, 'Insight ' + title(region))
          + mSec('1', 'Internal Sales', p.areas.length + ' area' + (people.length ? ' · ' + people.length + ' sales' : ''))
          + (p.areas.length ? mH('Score per Area') + mBars(p.areas.map(function (a) { return { nama: title(a.nama), v: a.score }; })) : '')
          + (p.areas.length ? mH('Detail per Area') + mTable([
            { label: 'Area', bold: true, get: function (r) { return title(r.nama); } },
            { label: 'Trad Target', kind: 'num', get: function (r) { return r.trad.t; } },
            { label: 'Trad Actual', kind: 'num', get: function (r) { return r.trad.a; } },
          ].concat(achCols()), p.areas) : '')
          + (people.length ? mH('10 Sales dengan Score Terendah') + mTable([
            { label: 'Nama', bold: true, get: function (r) { return title(r.nama); } },
            { label: 'Cluster', get: function (r) { return r.CLUSTER; } },
            { label: 'Area', get: function (r) { return title(r.AREA); } },
          ].concat(achCols()), people.slice().sort(byScoreDesc).reverse().slice(0, 10)) : '')
          + mSec('2', 'MDI', p.mdi.length + ' partner-area')
          + (p.mdi.length ? mH('Score per Partner') + mBars(p.mdi.map(function (r) { return { nama: title(r.area), sub: title(r.partner), v: r.score }; }))
            + mH('Detail Partner') + mTable([
              { label: 'Area', bold: true, get: function (r) { return title(r.area); } },
              { label: 'Partner', get: function (r) { return r.partner; } },
            ].concat(achCols()), p.mdi) : '')
          + mSec('3', 'SDP', p.sdpRows.length + ' SDP · rata-rata score ' + pct(avg(p.sdpRows.map(function (x) { return x.score; }))))
          + (p.sdpByArea.length ? mH('Sebaran Score SDP per Area (hijau · kuning · merah)') + mStack(p.sdpByArea.map(function (x) { return { nama: title(x.area), g: x.g, y: x.y, r: x.r, n: x.n }; }))
            + mH('Rekap per Area') + mTable([
              { label: 'Area', bold: true, get: function (r) { return title(r.area); } },
              { label: 'SDP', kind: 'num', get: function (r) { return r.n; } },
              { label: 'Rata-rata', kind: 'pct', get: function (r) { return r.avg; } },
              { label: 'Hijau', kind: 'num', get: function (r) { return r.g; } },
              { label: 'Kuning', kind: 'num', get: function (r) { return r.y; } },
              { label: 'Merah', kind: 'num', get: function (r) { return r.r; } },
            ], p.sdpByArea) : '')
          + (p.sdpRows.length ? mH('10 SDP dengan Score Terendah') + mTable([
            { label: 'Nama', bold: true, get: function (r) { return r.namaMim3; } },
            { label: 'Area', get: function (r) { return title(r.area); } },
          ].concat(achCols()), p.sdpRows.slice().sort(byScoreDesc).reverse().slice(0, 10)) : '')
          + '<div style="height:18px;"></div>' + mP('Rincian lengkap Internal Sales (area, cluster' + (people.length ? ', per sales' : '') + '), MDI, dan seluruh SDP ' + esc(title(region)) + ' ada di lampiran Excel (3 sheet).')
          + mText(closingTxt()),
          { title: 'Performance Report ' + title(region), sub: subHead('Head of Area') }
        );
        var isRows = p.areas.map(function (r) { return Object.assign({ Level: 'Area' }, flatIsRow(r)); })
          .concat(p.clusters.map(function (r) { return Object.assign({ Level: 'Cluster' }, flatIsRow(r)); }))
          .concat(people.map(function (r) { return Object.assign({ Level: 'Sales', Cluster: r.CLUSTER || '' }, flatIsRow(r)); }));
        groups.push({
          key: 'hoa|' + norm(region), name: name, emails: to, ccs: Array.from(ccSet),
          rows: p.areas.map(flatRow), unmatched: !to.length,
          unmatchedWhy: 'Alamat To Head of Area untuk ' + title(region) + ' belum diisi.',
          perf: {
            subject: 'Performance Report ' + title(region) + ' — ' + P.periode,
            html: html, insight: ins.join('\n'),
            attName: 'Performance Report ' + title(region) + ' ' + P.periode,
            sheets: [['Internal Sales', isRows], ['MDI', p.mdi.map(flatRow)], ['SDP', p.sdpRows.map(flatSdpRow)]],
          },
        });
      });
    } else if (P.jenis === 'mdi') {
      d.mdi.forEach(function (r) {
        var m = r.map, ins = insightMdi(r);
        var nm = title(r.partner) + ' — ' + title(r.area);
        groups.push({
          key: 'mdi|' + normKey(r.partner) + '|' + normKey(r.area), name: nm,
          emails: m ? splitEmails(m.EMAIL_TO) : [], ccs: m ? splitEmails(m.EMAIL_CC) : [], rows: [flatRow(r)],
          unmatched: !m || !splitEmails(m.EMAIL_TO).length,
          unmatchedWhy: 'Partner "' + r.partner + '" area ' + r.area + ' belum ada di Master_Mapping (TYPE MDI).',
          perf: {
            subject: 'Performance Report MDI ' + title(r.partner) + ' ' + title(r.area) + ' — ' + P.periode,
            html: wrap(mText(introFor({ name: r.partner }, INTRO_DEF))
              + mH('Pencapaian ' + esc(title(r.area))) + mTiles(r, null) + mLegend()
              + mInsight(ins)
              + mH('Detail') + mTable([{ label: 'Area', bold: true, get: function (x) { return title(x.area); } }, { label: 'Partner', get: function (x) { return x.partner; } }].concat(achCols()), [r])
              + '<div style="height:14px;"></div>' + mText(closingTxt()),
              { title: title(r.partner), sub: subHead('MDI ' + title(r.area)) }),
            insight: ins.join('\n'),
            attName: 'Performance Report ' + title(r.partner) + ' ' + title(r.area),
            sheets: [['MDI', [flatRow(r)]]],
          },
        });
      });
    } else {
      d.sdp.forEach(function (e) {
        var r = e.row, m = e.map, ins = insightSdp(e);
        groups.push({
          key: 'sdp|' + normKey(e.id), name: e.nama + ' (' + e.id + ')',
          emails: m ? splitEmails(m.EMAIL_TO) : [], ccs: m ? splitEmails(m.EMAIL_CC) : [], rows: [flatSdpRow(r)],
          unmatched: !m || !splitEmails(m.EMAIL_TO).length,
          unmatchedWhy: 'ID ' + e.id + ' belum ada di Master_Mapping.',
          perf: {
            subject: 'Performance Report ' + e.nama + ' — ' + P.periode,
            html: wrap(mText(introFor({ name: e.nama }, INTRO_DEF))
              + mH('Pencapaian') + mTiles(r, null) + mLegend()
              + mInsight(ins)
              + mH('Detail') + mTable([{ label: 'ID', bold: true, get: function () { return e.id; } }, { label: 'Area', get: function (x) { return title(x.area); } }, { label: 'Microcluster', get: function (x) { return x.mc; } }].concat(achCols()), [r])
              + '<div style="height:14px;"></div>' + mText(closingTxt()),
              { title: e.nama, sub: subHead('SDP ' + e.id + ' · ' + title(r.area)) }),
            insight: ins.join('\n'),
            attName: 'Performance Report ' + e.id,
            sheets: [['SDP', [flatSdpRow(r)]]],
          },
        });
      });
    }
    return groups;
  }
  var r4 = function (v) { return v == null ? '' : Math.round(v * 10000) / 10000; };
  function flatIsRow(r) {
    var o = { Nama: r.nama, Area: r.AREA || '', Region: r.REGION || '' };
    KPIS.forEach(function (k) { o[k.short + ' Target'] = r[k.id].t == null ? '' : r[k.id].t; o[k.short + ' Actual'] = r[k.id].a == null ? '' : r[k.id].a; o[k.short + ' Ach'] = r4(r[k.id].ach); });
    o.Score = r4(r.score);
    return o;
  }
  function flatRow(r) {
    var o = { Nama: r.partner || r.nama, Area: r.area || r.AREA || '', Region: r.region || r.REGION || '' };
    KPIS.forEach(function (k) { o[k.short + ' Ach'] = r4(r[k.id] && r[k.id].ach); });
    o.Score = r4(r.score);
    return o;
  }
  function flatSdpRow(r) {
    var o = { 'ID MIM3': r.idMim3, 'Nama MIM3': r.namaMim3, 'ID 3KIOSK': r.id3k, 'Nama 3KIOSK': r.nama3k, Microcluster: r.mc, Area: r.area, Region: r.region };
    KPIS.forEach(function (k) { o[k.short + ' Ach'] = r4(r[k.id].ach); });
    o.Score = r4(r.score);
    return o;
  }

  /* ======================= Gaya ======================= */
  var css = document.createElement('style');
  css.textContent = [
    '.pf-sec{ margin-top:18px; }',
    '.pf-cards{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }',
    '.pf-card{ border:1px solid var(--line); border-radius:14px; padding:14px 16px; background:var(--surf2); }',
    '.pf-card .l{ font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); }',
    '.pf-card .v{ font-size:26px; font-weight:800; margin-top:4px; font-family:var(--font-brand); }',
    '.pf-card .s{ font-size:12px; color:var(--muted); margin-top:2px; }',
    '.pf-g{ color:#00A651; } .pf-y{ color:#E0A800; } .pf-r{ color:#FF3B3B; } .pf-na{ color:var(--muted); }',
    '.pf-bg-g{ background:#00A651 !important; color:#fff !important; } .pf-bg-y{ background:#FFC000 !important; color:#3B2C00 !important; } .pf-bg-r{ background:#E3000F !important; color:#fff !important; } .pf-bg-na{ color:var(--muted); }',
    '.pf-card.pf-bg-g .l, .pf-card.pf-bg-r .l, .pf-card.pf-bg-g .s, .pf-card.pf-bg-r .s{ color:rgba(255,255,255,.88); } .pf-card.pf-bg-y .l, .pf-card.pf-bg-y .s{ color:rgba(59,44,0,.85); } .pf-card[class*=pf-bg-]{ border:0; }',
    '.pf-tbl td.c{ border:2px solid var(--surf) !important; }',
    '.pf-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }',
    '.pf-box{ border:1px solid var(--line); border-radius:14px; padding:14px 16px; background:var(--surf); min-width:0; }',
    '.pf-box h4{ margin:0 0 10px; font-size:13.5px; }',
    '.pf-bars{ display:flex; flex-direction:column; gap:7px; }',
    '.pf-bar{ display:grid; grid-template-columns:minmax(90px,170px) 1fr 68px; gap:8px; align-items:center; font-size:12.5px; }',
    '.pf-bar .n{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--ink2); }',
    '.pf-bar .t{ height:12px; border-radius:6px; background:var(--surf2); position:relative; overflow:hidden; }',
    '.pf-bar .t i{ position:absolute; left:0; top:0; bottom:0; border-radius:6px; }',
    '.pf-bar .t b{ position:absolute; top:-2px; bottom:-2px; width:2px; background:var(--ink2); opacity:.45; }',
    '.pf-bar .p{ text-align:right; font-weight:700; font-variant-numeric:tabular-nums; }',
    '.pf-i-g{ background:#00A651; } .pf-i-y{ background:#FFC000; } .pf-i-r{ background:#E3000F; } .pf-i-na{ background:var(--line); }',
    '.pf-reg{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }',
    '.pf-reg .pf-bar{ grid-template-columns:78px 1fr 64px; }',
    '.pf-pill{ display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; font-weight:700; }',
    '.pf-tbl{ width:100%; border-collapse:collapse; font-size:12.5px; }',
    '.pf-tbl th{ text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); padding:6px 8px; border-bottom:1px solid var(--line); cursor:pointer; white-space:nowrap; }',
    '.pf-tbl td{ padding:5px 8px; border-bottom:1px solid var(--line); white-space:nowrap; }',
    '.pf-tbl td.c{ text-align:center; font-weight:700; font-variant-numeric:tabular-nums; border-radius:6px; }',
    '.pf-scroll{ max-height:420px; overflow:auto; }',
    '.pf-stack{ display:flex; height:12px; border-radius:6px; overflow:hidden; background:var(--surf2); }',
    '.pf-legend{ display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--muted); }',
    '.pf-legend span::before{ content:""; display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; vertical-align:-1px; }',
    '.pf-legend span{ padding:3px 10px; border-radius:999px; font-weight:700; } .pf-legend span::before{ display:none; }',
    '.pf-legend .g{ background:#00A651; color:#fff; } .pf-legend .y{ background:#FFC000; color:#3B2C00; } .pf-legend .r{ background:#E3000F; color:#fff; }',
    '.pf-toolbar{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; }',
    '.pf-toolbar select{ width:auto; min-width:200px; }',
    '.pf-jenis{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }',
    '.pf-jenis label{ border:1px solid var(--line); border-radius:12px; padding:12px 14px; cursor:pointer; background:var(--surf2); display:block; }',
    '.pf-jenis label.on{ border-color:var(--teal); box-shadow:0 0 0 2px var(--good-bd); background:var(--surf); }',
    '.pf-jenis input{ margin-right:8px; }',
    '.pf-jenis small{ display:block; color:var(--muted); margin-top:4px; line-height:1.45; }',
    '.pf-match{ margin-top:10px; font-size:12.5px; padding:9px 12px; border-radius:10px; border:1px solid var(--line); }',
    '.pf-hoa input{ width:100%; font:inherit; font-size:12.5px; padding:6px 8px; border-radius:7px; border:1px solid var(--line); background:var(--surf); color:var(--ink); }',
    '.pf-warn{ margin:14px 20px 0; padding:10px 14px; border-radius:10px; font-size:13px; line-height:1.5; color:var(--bad-ink); background:var(--bad-bg); border:1px solid var(--bad-bd); }',
    '.recipient-item.perf-unmatched .rname{ color:var(--bad-ink); }',
    '@media (max-width:900px){ .pf-cards{ grid-template-columns:1fr 1fr; } .pf-grid2, .pf-reg, .pf-jenis{ grid-template-columns:1fr; } }',
  ].join('\n');
  document.head.appendChild(css);

  /* ======================= Visualisasi (Tahap 2) ======================= */
  function card(lbl, v, sub) {
    return '<div class="pf-card pf-bg-' + band(v) + '"><div class="l">' + esc(lbl) + '</div><div class="v">' + pct(v) + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
  }
  function bar(name, v, title2) {
    var w = v == null ? 0 : Math.min(v, 1.3) / 1.3 * 100;
    return '<div class="pf-bar" title="' + esc(title2 || name) + '"><div class="n">' + esc(name) + '</div><div class="t"><i class="pf-i-' + band(v) + '" style="width:' + w.toFixed(1) + '%"></i><b style="left:' + (100 / 1.3).toFixed(1) + '%"></b></div><div class="p"><span class="pf-pill pf-bg-' + band(v) + '">' + pct(v) + '</span></div></div>';
  }
  var inRegion = function (r) { return !P.region || norm(r) === norm(P.region); };

  function renderDashboard() {
    var d = P.data, host = document.getElementById('pfDash');
    if (!host || !d) return;
    var c = d.circle;
    var html = '';
    html += '<div class="pf-toolbar"><div class="hint" style="margin:0;">Data per <b>' + esc(tanggalTxt()) + '</b> · ' + d.areas.length + ' area · ' + d.mdi.length + ' MDI · ' + d.sdpRows.length + ' SDP</div>'
      + '<div class="pf-legend"><span class="g">' + esc(LBL.g) + '</span><span class="y">' + esc(LBL.y) + '</span><span class="r">' + esc(LBL.r) + '</span></div></div>';

    // Kartu KPI Sumatera
    if (c) {
      html += '<div class="pf-sec pf-cards">' + card('Score Sumatera', c.score, '') + KPIS.map(function (k) {
        var sub = k.id === 'dse' ? 'Skor ' + fmt(c.dse.t) + ' · DSE ' + fmt(c.dse.a) : 'Target ' + fmt(c[k.id].t) + ' · Actual ' + fmt(c[k.id].a);
        return card(k.label, c[k.id].ach, sub);
      }).join('') + '</div>';
    }

    // Perbandingan region
    if (d.regions.length) {
      html += '<div class="pf-sec"><div class="field-group-label">Perbandingan Region</div><div class="pf-reg">' + d.regions.map(function (r) {
        return '<div class="pf-box"><h4>' + esc(title(r.nama)) + ' <span class="pf-pill pf-bg-' + band(r.score) + '" style="float:right;">' + pct(r.score) + '</span></h4><div class="pf-bars">'
          + KPIS.map(function (k) { return bar(k.short, r[k.id].ach, k.label); }).join('') + bar('Score', r.score) + '</div></div>';
      }).join('') + '</div></div>';
    }

    // Filter region
    html += '<div class="pf-sec pf-toolbar"><div class="field-group-label" style="margin:0;">Detail</div><select id="pfRegion"><option value="">Semua region</option>'
      + d.regionNames.map(function (r) { return '<option value="' + esc(r) + '"' + (norm(r) === norm(P.region) ? ' selected' : '') + '>' + esc(title(r)) + '</option>'; }).join('') + '</select></div>';

    // Heatmap Area x KPI + ranking area
    var areas = d.areas.filter(function (a) { return inRegion(a.REGION); }).sort(byScoreDesc);
    html += '<div class="pf-sec pf-grid2">';
    var hmKosong = !areas.length ? '<tr><td colspan="5" class="hint" style="white-space:normal;padding:14px 8px;">' + (d.areas.length ? 'Tidak ada area untuk region ini.' : 'Blok AREA tidak ditemukan di sheet Internal Sales (blok yang terbaca: ' + esc(Object.keys(d.is).join(', ') || '-') + '). Pastikan ada tabel dengan header kolom pertama "AREA" dan baris sub-header TARGET / ACTUAL / ACH.') + '</td></tr>' : '';
    html += '<div class="pf-box"><h4>Heatmap Area × KPI</h4><div class="pf-scroll"><table class="pf-tbl"><thead><tr><th>Area</th>' + KPIS.map(function (k) { return '<th>' + esc(k.short) + '</th>'; }).join('') + '<th>Score</th></tr></thead><tbody>'
      + areas.map(function (a) {
        return '<tr><td title="' + esc(title(a.REGION)) + '">' + esc(title(a.nama)) + '</td>' + KPIS.map(function (k) { return '<td class="c pf-bg-' + band(a[k.id].ach) + '">' + pct(a[k.id].ach) + '</td>'; }).join('') + '<td class="c pf-bg-' + band(a.score) + '">' + pct(a.score) + '</td></tr>';
      }).join('') + hmKosong + '</tbody></table></div></div>';
    var mdi = d.mdi.filter(function (r) { return inRegion(r.region); }).sort(byScoreDesc);
    html += '<div class="pf-box"><h4>Ranking MDI (Score)</h4><div class="pf-scroll"><div class="pf-bars">' + mdi.map(function (r) {
      return bar(title(r.area) + ' · ' + title(r.partner).replace(/,? PT$/, ''), r.score, r.partner + ' — ' + r.area + (r.map ? '' : ' (belum ada di Master_Mapping)'));
    }).join('') + '</div></div></div>';
    html += '</div>';

    // Sebaran SDP per area + 10 terendah
    var sdp = d.sdpRows.filter(function (r) { return inRegion(r.region); });
    var areaNames = Array.from(new Set(sdp.map(function (r) { return r.area; })));
    var dist = areaNames.map(function (a) {
      var l = sdp.filter(function (r) { return r.area === a; });
      return { a: a, n: l.length, g: l.filter(function (r) { return band(r.score) === 'g'; }).length, y: l.filter(function (r) { return band(r.score) === 'y'; }).length, r: l.filter(function (r) { return band(r.score) === 'r'; }).length, avg: avg(l.map(function (r) { return r.score; })) };
    }).sort(function (x, y) { return (y.r / y.n) - (x.r / x.n); });
    var tot = { g: 0, y: 0, r: 0 };
    sdp.forEach(function (r) { var b = band(r.score); if (tot[b] != null) tot[b]++; });
    html += '<div class="pf-sec pf-grid2">';
    html += '<div class="pf-box"><h4>Sebaran Score SDP per Area <span class="hint" style="float:right;margin:0;">' + sdp.length + ' SDP · <span class="pf-g">' + tot.g + '</span> / <span class="pf-y">' + tot.y + '</span> / <span class="pf-r">' + tot.r + '</span></span></h4><div class="pf-scroll"><table class="pf-tbl"><thead><tr><th>Area</th><th>SDP</th><th style="width:45%">Sebaran</th><th>Rata-rata</th></tr></thead><tbody>'
      + dist.map(function (x) {
        var seg = function (k, n) { return n ? '<i class="pf-i-' + k + '" style="width:' + (n / x.n * 100) + '%" title="' + n + ' SDP"></i>' : ''; };
        return '<tr><td>' + esc(title(x.a)) + '</td><td>' + x.n + '</td><td><div class="pf-stack">' + seg('g', x.g) + seg('y', x.y) + seg('r', x.r) + '</div></td><td class="c pf-bg-' + band(x.avg) + '">' + pct(x.avg) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    var low = sdp.slice().sort(byScoreDesc).reverse().slice(0, 10);
    html += '<div class="pf-box"><h4>10 SDP Score Terendah</h4><div class="pf-scroll"><table class="pf-tbl"><thead><tr><th>SDP</th><th>Area</th>' + KPIS.map(function (k) { return '<th>' + esc(k.short) + '</th>'; }).join('') + '<th>Score</th></tr></thead><tbody>'
      + low.map(function (r) {
        return '<tr><td title="' + esc(r.idMim3) + '">' + esc(r.namaMim3) + '</td><td>' + esc(title(r.area)) + '</td>' + KPIS.map(function (k) { return '<td class="c pf-bg-' + band(r[k.id].ach) + '">' + pct(r[k.id].ach) + '</td>'; }).join('') + '<td class="c pf-bg-' + band(r.score) + '">' + pct(r.score) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    html += '</div>';

    host.innerHTML = html;
    document.getElementById('pfRegion').onchange = function (e) { P.region = e.target.value; renderDashboard(); };
  }

  /* ======================= Pengaturan kirim (Tahap 2) ======================= */
  function renderMatchInfo() {
    var box = document.getElementById('pfMatch');
    if (!box || !P.data) return;
    var d = P.data, txt, bad = 0;
    if (P.jenis === 'mdi') {
      bad = d.mdi.filter(function (r) { return !r.map; }).length;
      txt = (d.mdi.length - bad) + ' dari ' + d.mdi.length + ' MDI cocok dengan Master_Mapping (PARTNER_NAME + BRANCH).';
    } else if (P.jenis === 'sdp') {
      var miss = d.sdp.filter(function (e) { return !e.map; });
      bad = miss.length;
      txt = (d.sdp.length - bad) + ' dari ' + d.sdp.length + ' ID SDP (MIM3 & 3KIOSK) cocok dengan Master_Mapping.' + (bad ? ' Belum ada: ' + miss.slice(0, 8).map(function (e) { return e.id; }).join(', ') + (bad > 8 ? ', dll' : '') + '. Tidak akan dikirim.' : '');
    } else {
      var noTo = d.regionNames.filter(function (r) { var h = P.hoa.filter(function (x) { return norm(x.kunci) === norm(r); })[0]; return !h || !splitEmails(h.to).length; });
      bad = noTo.length;
      txt = d.regionNames.length + ' email Head of Area (1 per region). Cc otomatis = alamat Cc yang ada di semua baris Master_Mapping region tersebut.' + (bad ? ' To belum diisi untuk: ' + noTo.map(title).join(', ') + '.' : '');
    }
    box.className = 'pf-match ' + (bad ? 'pf-bg-r' : 'pf-bg-g');
    box.textContent = txt;
  }

  function renderHoaEditor() {
    var host = document.getElementById('pfHoa');
    if (!host) return;
    host.style.display = P.jenis === 'hoa' ? '' : 'none';
    var regions = P.data ? P.data.regionNames : DEFAULT_HOA.map(function (x) { return x.kunci; });
    regions.forEach(function (r) { if (!P.hoa.some(function (x) { return norm(x.kunci) === norm(r); })) P.hoa.push({ kunci: r, nama: '', to: '', cc: '' }); });
    var rows = P.hoa.filter(function (x) { return regions.some(function (r) { return norm(r) === norm(x.kunci); }); });
    host.innerHTML = '<div class="field-group-label">Head of Area</div><div class="group-box pf-hoa"><table class="pf-tbl"><thead><tr><th>Region</th><th>Nama</th><th>To</th><th>Cc tambahan (opsional)</th></tr></thead><tbody>'
      + rows.map(function (h) {
        var i = P.hoa.indexOf(h);
        return '<tr data-i="' + i + '"><td>' + esc(title(h.kunci)) + '</td><td><input data-f="nama" value="' + esc(h.nama) + '"></td><td><input data-f="to" value="' + esc(h.to) + '"></td><td><input data-f="cc" value="' + esc(h.cc) + '" placeholder="pisahkan dengan ;"></td></tr>';
      }).join('') + '</tbody></table>'
      + '<div class="actions" style="justify-content:space-between;margin-top:10px;"><span class="token-hint" id="pfHoaNote" style="margin:0;">Tersimpan di SandraHub, dipakai lagi bulan berikutnya. Cc dari Master_Mapping tetap ikut otomatis.</span><button class="btn btn-secondary" type="button" id="pfHoaSave">💾 Simpan Head of Area</button></div></div>';
    host.querySelectorAll('input').forEach(function (inp) {
      inp.oninput = function () { P.hoa[+inp.closest('tr').dataset.i][inp.dataset.f] = inp.value; renderMatchInfo(); };
    });
    document.getElementById('pfHoaSave').onclick = saveHoa;
  }

  async function loadHoa() {
    try {
      var res = await fetch('/api/perf-recipients');
      var data = await res.json();
      if (data.ok && data.recipients && Array.isArray(data.recipients.hoa) && data.recipients.hoa.length) P.hoa = data.recipients.hoa;
      P.hoaLoaded = true;
    } catch (e) { /* tetap pakai default */ }
    renderHoaEditor();
    renderMatchInfo();
  }
  async function saveHoa() {
    var btn = document.getElementById('pfHoaSave');
    btn.disabled = true;
    try {
      var res = await fetch('/api/perf-recipients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kategori: 'hoa', rows: P.hoa }) });
      var data = await res.json();
      if (!data.ok) throw new Error(data.error || 'gagal menyimpan');
      P.hoa = data.rows;
      toast('Daftar Head of Area tersimpan.');
    } catch (e) {
      toast('Gagal menyimpan Head of Area: ' + e.message);
    } finally { btn.disabled = false; }
  }

  function setJenis(j) {
    P.jenis = j;
    document.querySelectorAll('#pfJenis label').forEach(function (l) { l.classList.toggle('on', l.dataset.j === j); });
    renderHoaEditor();
    renderMatchInfo();
  }

  function buildStep2() {
    var step2 = document.getElementById('step2');
    // Sembunyikan isi Blast (pemetaan, narasi, kolom tabel), tapi biarkan elemennya ada (dibaca kode Blast).
    Array.prototype.slice.call(step2.children).forEach(function (ch) { if (!ch.classList.contains('panel-head')) ch.style.display = 'none'; });
    var util = step2.querySelector('.panel-head-utility');
    if (util) util.style.display = 'none';
    step2.querySelector('.panel-head h2').textContent = '2. Visualisasi & pengaturan kirim';
    var bulan = new Date(); bulan.setMonth(bulan.getMonth());
    var box = document.createElement('div');
    box.id = 'pfStep2';
    box.innerHTML = '<p class="hint">Ringkasan pencapaian dari file yang diupload. Di bawahnya pilih jenis email yang mau dikirim.</p>'
      + '<div id="pfDash"></div>'
      + '<div class="pf-sec"><div class="field-group-label">Jenis kiriman</div><div class="pf-jenis" id="pfJenis">'
      + '<label data-j="hoa"><input type="radio" name="pfJenis" value="hoa"><b>Head of Area</b><small>1 email per region: ringkasan &amp; insight, lalu bagian Internal Sales, MDI, SDP + lampiran Excel 3 sheet.</small></label>'
      + '<label data-j="mdi"><input type="radio" name="pfJenis" value="mdi"><b>Per MDI</b><small>1 email per partner + area. To/Cc dari Master_Mapping (TYPE MDI).</small></label>'
      + '<label data-j="sdp"><input type="radio" name="pfJenis" value="sdp"><b>Per SDP</b><small>1 email per ID (MIM3 & 3KIOSK terpisah). To/Cc dari Master_Mapping.</small></label>'
      + '</div><div id="pfMatch" class="pf-match"></div></div>'
      + '<div class="pf-sec" id="pfHoa"></div>'
      + '<div class="pf-sec grid2"><div><div class="field-group-label">Narasi</div><div class="group-box">'
      + '<div class="field"><label class="field-label">Periode laporan</label><input type="text" id="pfPeriodeInput" placeholder="mis. November 2026"><div class="token-hint">Dipakai di subjek dan token <code>{periode}</code>.</div></div>'
      + '<div class="field"><label class="field-label">Paragraf pembuka</label><textarea id="perfIntro" rows="4"></textarea><div class="token-hint">Token: <code>{nama}</code> <code>{periode}</code> <code>{tanggal}</code>. Kosongkan untuk teks bawaan.</div></div>'
      + '</div></div><div><div class="field-group-label">&nbsp;</div><div class="group-box">'
      + '<div class="field"><label class="field-label">Paragraf penutup</label><textarea id="perfClosing" rows="7"></textarea></div>'
      + '</div></div></div>';
    step2.appendChild(box);
    document.getElementById('pfPeriodeInput').id = 'perfPeriode';
    document.getElementById('perfIntro').value = 'Yth. Bapak/Ibu {nama},\n\nBerikut kami sampaikan Performance Report periode {periode} (data per {tanggal}).';
    document.getElementById('perfClosing').value = 'Mohon dapat dijadikan perhatian dan ditindaklanjuti, terutama untuk KPI yang masih merah. Apabila ada pertanyaan terkait data di atas, silakan menghubungi kami.\n\nTerima kasih atas kerja samanya.\n\nWarm regards,\nSales & Distribution — Indosat Circle Sumatera';
    document.querySelectorAll('#pfJenis input').forEach(function (r) { r.onchange = function () { setJenis(r.value); }; });
    document.querySelector('#pfJenis input[value="hoa"]').checked = true;
    setJenis('hoa');
  }

  /* ======================= Tahap 1 ======================= */
  function buildStep1() {
    var hint = document.querySelector('#step1 > p.hint');
    if (hint) hint.innerHTML = 'Unggah file Excel performa berisi sheet <b>Internal Sales</b>, <b>MDI</b>, <b>SDP</b>, dan <b>Master_Mapping</b> (sumber alamat To &amp; Cc). Formatnya mengikuti file Performance Report yang biasa (judul, tanggal, header KPI).';
    var dzHint = document.querySelector('#dropzone .hint');
    if (dzHint) dzHint.textContent = 'Format .xlsx — 1 file berisi 4 sheet di atas.';
    var nextBtn = document.querySelector('#step1Actions .btn-primary');
    if (nextBtn) nextBtn.textContent = 'Lanjut: Visualisasi →';
  }

  window.handleFile = function (file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        P.data = parseWorkbook(wb);
        state.workbook = wb;
        state.fileName = file.name;
        state.rows = P.data.sdpRows.map(flatSdpRow);
        state.columns = state.rows.length ? Object.keys(state.rows[0]) : [];
        sendStatus.clear();
        refreshRetryButton();
        var d = P.data;
        document.getElementById('fileInfo').innerHTML = '<div class="filebar-group"><div class="filebar"><div><b>' + esc(file.name) + '</b> · data per <b>' + esc(tanggalTxt()) + '</b></div>'
          + '<div class="stat">' + d.regions.length + ' region · ' + d.areas.length + ' area · ' + d.clusters.length + ' cluster · ' + d.mdi.length + ' MDI · ' + d.sdpRows.length + ' SDP · ' + d.map.length + ' baris Master_Mapping</div></div></div>';
        var dz = document.getElementById('dropzone');
        dz.classList.add('has-file');
        var cta = dz.querySelector('.cta');
        if (cta) cta.textContent = 'Klik untuk ganti file';
        document.getElementById('rawPreviewWrap').innerHTML = '';
        document.getElementById('step1Actions').style.display = 'flex';
        var t = d.tanggal || new Date();
        document.getElementById('perfPeriode').value = t.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        renderDashboard();
        renderHoaEditor();
        renderMatchInfo();
        goStep(2);
      } catch (err) {
        toast('Gagal membaca file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  /* ======================= Hook ke Blast Email Report ======================= */
  var origSwitch = window.switchAppMode;
  window.switchAppMode = function (mode) { origSwitch(mode); applyLabels(); };
  function applyLabels() {
    document.title = 'Performance Report — Sales & Distribution Sumatera';
    var sub = document.getElementById('appSubtitle');
    if (sub) sub.textContent = 'Performance Report — pencapaian Internal Sales, MDI & SDP';
    var btn = document.getElementById('modeBtnEmail');
    if (btn) { var sp = btn.querySelector('span'); if (sp) sp.textContent = 'Performance Report'; }
  }
  if (typeof stepsMeta !== 'undefined') {
    stepsMeta[0][2] = 'Upload file Excel performa (Internal Sales, MDI, SDP, Master_Mapping).';
    stepsMeta[1][1] = 'Visual & Atur';
    stepsMeta[1][2] = 'Lihat visualisasi pencapaian, lalu pilih jenis email: Head of Area, per MDI, atau per SDP.';
  }

  window.buildGroupsAndGoStep3 = function () {
    if (!P.data) { toast('Upload file Excel performa dulu.'); return; }
    state.sender = { name: document.getElementById('senderName').value.trim(), email: document.getElementById('senderEmail').value.trim() };
    if (!state.sender.email) { toast('Pengirim belum termuat dari server. Tunggu sebentar lalu coba lagi.'); return; }
    var groups = buildGroups();
    if (!groups.length) { toast('Tidak ada penerima untuk jenis kiriman ini.'); return; }
    var label = P.jenis === 'hoa' ? 'Head of Area' : P.jenis === 'mdi' ? 'MDI' : 'SDP';
    state.narrative = { judul: 'Performance Report ' + label, periode: P.periode, subjectTpl: '§subject', intro: '§insight', closing: '§closing' };
    var cols = Object.keys(groups[0].rows[0] || { Nama: '' });
    state.tableCols = cols.map(function (k) { return { key: k, label: k, included: true }; });
    groups.sort(function (a, b) { return (b.unmatched ? 1 : 0) - (a.unmatched ? 1 : 0) || a.name.localeCompare(b.name, 'id', { numeric: true }); });
    state.groups = groups;
    state.activeIndex = 0;
    renderRecipientList();
    renderMailCard();
    goStep(3);
  };

  var origFill = window.fillTemplate;
  window.fillTemplate = function (tpl, group) {
    if (group && group.perf && typeof tpl === 'string' && tpl.charAt(0) === '§') {
      var k = tpl.slice(1);
      return k === 'closing' ? closingTxt() : (group.perf[k] || '');
    }
    return origFill(tpl, group);
  };
  window.buildEmailBodyHtml = function (group) { return group.perf ? group.perf.html : ''; };
  window.groupExcelFilename = function (group) {
    var n = String((group.perf && group.perf.attName) || group.name || 'Performance Report').replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 90);
    return n + '.xlsx';
  };
  window.buildGroupExcelAttachment = function (group) {
    var wb = XLSX.utils.book_new();
    (group.perf.sheets || []).forEach(function (s) {
      var rows = s[1];
      var ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['Tidak ada data']]);
      if (rows.length) {
        var keys = Object.keys(rows[0]);
        ws['!cols'] = keys.map(function (k) { return { wch: Math.min(40, Math.max(k.length, ...rows.map(function (r) { return String(r[k]).length; })) + 2) }; });
        // Kolom Ach & Score sebagai persen.
        var range = XLSX.utils.decode_range(ws['!ref']);
        keys.forEach(function (k, ci) {
          if (!/Ach$|^Score$/.test(k)) return;
          for (var ri = 1; ri <= range.e.r; ri++) { var cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })]; if (cell && typeof cell.v === 'number') cell.z = '0.0%'; }
        });
      }
      XLSX.utils.book_append_sheet(wb, ws, s[0]);
    });
    return { filename: window.groupExcelFilename(group), content: XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) };
  };
  window.autoSaveTemplateFromCurrentNarrative = async function () { /* Performance Report tidak menyimpan preset Blast */ };

  var origSendGroup = window.sendGroupViaResend;
  window.sendGroupViaResend = async function (group) {
    if (group.unmatched) throw new Error(group.unmatchedWhy || 'Penerima belum ada.');
    return origSendGroup(group);
  };

  window.confirmSendAll = function () {
    var siap = state.groups.filter(function (g) { return !g.unmatched; });
    var lewat = state.groups.length - siap.length;
    if (!siap.length) { toast('Belum ada penerima yang punya alamat To.'); return; }
    document.getElementById('confirmText').textContent = 'Kamu akan MENGIRIM LANGSUNG ' + siap.length + ' email ' + state.narrative.judul + ', masing-masing ke penerimanya sendiri.'
      + (lewat ? ' ' + lewat + ' penerima tanpa alamat (belum ada di Master_Mapping / Head of Area) DILEWATI.' : '')
      + ' Kalau di tengah jalan berubah pikiran, ada tombol "Jeda". Lanjutkan?';
    document.getElementById('confirmModal').style.display = 'flex';
    document.getElementById('confirmModalOk').onclick = function () { closeConfirmModal(); startSendRun(siap, false); };
  };

  var origRenderList = window.renderRecipientList;
  window.renderRecipientList = function () {
    origRenderList();
    var filter = (state.recipientFilter || '').trim().toLowerCase();
    var shown = state.groups.filter(function (g) { return !filter || g.name.toLowerCase().indexOf(filter) >= 0; });
    document.querySelectorAll('#recipientItems .recipient-item').forEach(function (el, i) {
      var g = shown[i];
      if (!g || !g.unmatched || sendStatus.get(g.key)) return;
      el.classList.add('perf-unmatched');
      var top = el.querySelector('.rtop');
      if (top) top.insertAdjacentHTML('beforeend', '<span class="rstatus err">Tanpa alamat</span>');
    });
    var un = state.groups.filter(function (g) { return g.unmatched; }).length;
    if (un) document.getElementById('recipientCount').textContent += ' · ' + un + ' tanpa alamat';
  };

  var origRenderCard = window.renderMailCard;
  window.renderMailCard = function () {
    origRenderCard();
    var g = state.groups[state.activeIndex];
    if (g && g.unmatched) document.getElementById('mailCard').insertAdjacentHTML('afterbegin', '<div class="pf-warn">' + esc(g.unmatchedWhy) + ' Email ini tidak akan dikirim.</div>');
    var xs = document.querySelector('#mailCard .xlsx-sub');
    if (xs && g && g.perf) xs.textContent = 'Excel · ' + g.perf.sheets.map(function (s) { return s[0] + ' (' + s[1].length + ')'; }).join(' · ');
  };

  /* ======================= Mulai ======================= */
  function init() {
    applyLabels();
    buildStep1();
    buildStep2();
    renderStepsNav();
    loadHoa();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
