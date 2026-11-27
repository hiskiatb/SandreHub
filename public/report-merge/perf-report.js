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
 * Status (ubah di THRESHOLD): ON TRACK >= 90%, PUSH 80-89%, WARNING 70-79%, CRITICAL < 70%.
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
  var THRESHOLD = { onTrack: 0.90, push: 0.80, warning: 0.70 };
  var tp = function (v) { return Math.round(v * 100) + '%'; };
  var LBL = { g: '≥' + tp(THRESHOLD.onTrack), y: tp(THRESHOLD.push) + '–' + (Math.round(THRESHOLD.onTrack * 100) - 1) + '%', o: tp(THRESHOLD.warning) + '–' + (Math.round(THRESHOLD.push * 100) - 1) + '%', r: '<' + tp(THRESHOLD.warning) };
  // g = ON TRACK, y = PUSH, o = WARNING, r = CRITICAL
  var band = function (v) { return v == null ? 'na' : v >= THRESHOLD.onTrack ? 'g' : v >= THRESHOLD.push ? 'y' : v >= THRESHOLD.warning ? 'o' : 'r'; };
  var BKEYS = ['g', 'y', 'o', 'r'];
  var BAND_TXT = { g: 'On Track (' + LBL.g + ')', y: 'Push (' + LBL.y + ')', o: 'Warning (' + LBL.o + ')', r: 'Critical (' + LBL.r + ')', na: 'data tidak tersedia' };
  var countBands = function (list) { var n = { g: 0, y: 0, o: 0, r: 0 }; list.forEach(function (x) { var b = band(x.score); if (n[b] != null) n[b]++; }); return n; };
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
    jenis: 'hor',        // 'hor' | 'hoa' | 'mdi' | 'sdp'
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
    ['BRAND', 'TYPE', 'ID', 'PARTNER_NAME', 'BRANCH', 'REGION', 'EMAIL_TO', 'EMAIL_CC', 'ROLE', 'STATUS'].forEach(function (k) { mc[k] = colIdx(h, new RegExp('^' + k + '$')); });
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
    // Pimpinan dari Master_Mapping (TYPE INTERNAL SALES): HOR per region, HOA per area (BRANCH).
    d.hor = {};
    d.hoaMap = {};
    d.map.forEach(function (m) {
      if (!/INTERNAL/.test(norm(m.TYPE))) return;
      if (/VACANT/.test(norm(m.STATUS))) return;
      if (norm(m.ROLE) === 'HOR' && !d.hor[norm(m.REGION)]) d.hor[norm(m.REGION)] = m;
      if (norm(m.ROLE) === 'HOA' && !d.hoaMap[norm(m.BRANCH)]) d.hoaMap[norm(m.BRANCH)] = m;
    });
    // Sales per orang (DSO/DSP) dicocokkan lewat nama (kolom NAME di sheet Internal Sales = PARTNER_NAME di Master_Mapping).
    d.mapIs = {};
    d.map.forEach(function (m) {
      if (!/INTERNAL/.test(norm(m.TYPE)) || /^HO[AR]$/.test(norm(m.ROLE)) || /VACANT/.test(norm(m.STATUS))) return;
      var k = normKey(m.PARTNER_NAME);
      if (k && !d.mapIs[k]) d.mapIs[k] = m;
    });
    (d.people || []).forEach(function (r) { r.map = d.mapIs[normKey(r.nama)] || null; });
    // MDI per partner (semua area dalam 1 email).
    var pm = new Map();
    d.mdi.forEach(function (r) { var k = normKey(r.partner); if (!pm.has(k)) pm.set(k, []); pm.get(k).push(r); });
    d.mdiPartners = Array.from(pm.entries()).map(function (e) { return { key: e[0], partner: e[1][0].partner, rows: e[1].slice().sort(byScoreDesc) }; });

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

  // Cc HOR = alamat Cc yang muncul di SEMUA baris Master_Mapping region itu.
  function regionCc(region) {
    var rows = P.data.map.filter(function (m) { return norm(m.REGION) === norm(region) && !/INTERNAL/.test(norm(m.TYPE)); });
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

  // Insight memakai penanda: [[0.709]] = angka persen berwarna (pill), **teks** = tebal.
  var Q = function (v) { return '[[' + (v == null ? 'null' : v) + ']]'; };
  var kpiLine = function (o) { return KPIS.map(function (k) { return k.short + ' ' + Q(o[k.id] && o[k.id].ach); }).join(' · '); };
  // Jumlah berstatus Warning/Critical (di bawah batas Push).
  var countRed = function (list) { return list.filter(function (x) { var b = band(x.score); return b === 'o' || b === 'r'; }).length; };
  function sdpPairTxt(row) { return [row.idMim3, row.id3k].filter(Boolean).join(' / '); }

  function insightSdp(e) {
    var r = e.row, d = P.data, out = [];
    out.push('Pencapaian::**Score ' + Q(r.score) + '**.');
    out.push('KPI::' + kpiLine(r) + '.');
    var w = weakest(r);
    if (w && band(w.v) !== 'g') out.push('Prioritas::Perbaikan pada **' + w.k.label + '** ' + Q(w.v) + '.');
    var peers = d.sdpRows.filter(function (x) { return norm(x.area) === norm(r.area); });
    if (peers.length > 1) { var rk = rankIn(peers, r); out.push('Peringkat::**' + rk.r + ' dari ' + rk.n + '** SDP di Area ' + title(r.area) + ' (rata-rata area ' + Q(avg(peers.map(function (x) { return x.score; }))) + ').'); }
    return out;
  }
  function insightMdi(r) {
    var d = P.data, out = [];
    out.push('Pencapaian::**Score ' + Q(r.score) + '**.');
    out.push('KPI::' + kpiLine(r) + '.');
    var w = weakest(r);
    if (w && band(w.v) !== 'g') out.push('Prioritas::Perbaikan pada **' + w.k.label + '** ' + Q(w.v) + '.');
    var peers = d.mdi.filter(function (x) { return norm(x.region) === norm(r.region); });
    if (peers.length > 1) { var rk = rankIn(peers, r); out.push('Peringkat::**' + rk.r + ' dari ' + rk.n + '** MDI di ' + title(r.region) + '.'); }
    var sdps = d.sdpRows.filter(function (x) { return norm(x.area) === norm(r.area); });
    if (sdps.length) out.push('SDP Area::**' + countRed(sdps) + ' dari ' + sdps.length + '** SDP di Area ' + title(r.area) + ' berstatus Warning/Critical.');
    return out;
  }
  function insightMdiPartner(pt, agg) {
    var rows = pt.rows, out = [];
    if (rows.length > 1) {
      out.push('Pencapaian::Rata-rata **Score ' + Q(agg.score) + '** dari **' + rows.length + ' area**.');
      out.push('Area::Tertinggi ' + title(rows[0].area) + ' ' + Q(rows[0].score) + '; terendah **' + title(rows[rows.length - 1].area) + '** ' + Q(rows[rows.length - 1].score) + '.' + (countRed(rows) ? ' **' + countRed(rows) + ' area** berstatus Warning/Critical.' : ''));
    } else {
      out.push('Pencapaian::**Score ' + Q(rows[0].score) + '**.');
    }
    out.push('KPI::' + kpiLine(agg) + '.');
    var w = weakest(agg);
    if (w && band(w.v) !== 'g') out.push('Prioritas::Perbaikan pada **' + w.k.label + '** ' + Q(w.v) + '.');
    return out;
  }
  function insightPerson(r) {
    var d = P.data, out = [];
    out.push('Pencapaian::**Score ' + Q(r.score) + '**.');
    out.push('KPI::' + kpiLine(r) + '.');
    var w = weakest(r);
    if (w && band(w.v) !== 'g') out.push('Prioritas::Perbaikan pada **' + w.k.label + '** ' + Q(w.v) + '.');
    var peers = (d.people || []).filter(function (x) { return norm(x.AREA) === norm(r.AREA); });
    if (peers.length > 1) { var rk = rankIn(peers, r); out.push('Peringkat::**' + rk.r + ' dari ' + rk.n + '** sales di Area ' + title(r.AREA) + '.'); }
    var regPeers = (d.people || []).filter(function (x) { return norm(x.REGION) === norm(r.REGION); });
    if (regPeers.length > 1) { var rr = rankIn(regPeers, r); out.push('Region::Peringkat **' + rr.r + ' dari ' + rr.n + '** sales di ' + title(r.REGION) + '.'); }
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
      };
    }).filter(function (x) { return x.n; }).map(function (x) {
      return Object.assign(x, countBands(sdpRows.filter(function (r) { return norm(r.area) === norm(x.area); })));
    }).sort(function (a, b) { return ((b.o + b.r) / b.n) - ((a.o + a.r) / a.n); });
    return { region: region, reg: reg, areas: areas, clusters: clusters, mdi: mdi, sdpRows: sdpRows, sdpEnt: sdpEnt, sdpByArea: sdpByArea };
  }
  function insightRegion(p) {
    var d = P.data, out = [], reg = p.reg;
    if (reg) {
      out.push('Pencapaian::**Score ' + title(p.region) + ' ' + Q(reg.score) + '**' + (d.circle && d.circle.score != null ? ' dibanding Sumatera ' + Q(d.circle.score) : '') + '.');
      var w = weakest(reg);
      out.push('KPI::' + kpiLine(reg) + (w ? '. KPI terendah: **' + w.k.label + '**.' : '.'));
    }
    if (p.areas.length) {
      var top = p.areas.slice(0, 2).map(function (a) { return title(a.nama) + ' ' + Q(a.score); });
      var bot = p.areas.slice(-3).reverse().map(function (a) { return title(a.nama) + ' ' + Q(a.score); });
      out.push('Area::**' + countRed(p.areas) + ' dari ' + p.areas.length + '** area berstatus Warning/Critical. Capaian tertinggi: ' + top.join(', ') + '. Memerlukan perhatian: **' + bot.join(', ') + '**.');
    }
    if (p.mdi.length) {
      var lo = p.mdi[p.mdi.length - 1];
      out.push('MDI::**' + countRed(p.mdi) + ' dari ' + p.mdi.length + '** partner berstatus Warning/Critical. Capaian terendah: ' + title(lo.partner) + ' (' + title(lo.area) + ') ' + Q(lo.score) + '.');
    }
    if (p.sdpRows.length) out.push('SDP::**' + countRed(p.sdpRows) + ' dari ' + p.sdpRows.length + '** SDP berstatus Warning/Critical, rata-rata ' + Q(avg(p.sdpRows.map(function (x) { return x.score; }))) + '.');
    var unmapped = p.sdpRows.filter(function (r) { return !P.data.mapById[normKey(r.idMim3)] && !P.data.mapById[normKey(r.id3k)]; });
    if (unmapped.length) out.push('Data::**' + unmapped.length + ' SDP** belum terdaftar di Master_Mapping: ' + unmapped.slice(0, 4).map(sdpPairTxt).join(', ') + (unmapped.length > 4 ? ', dan lainnya' : '') + '.');
    return out;
  }
  /* ======================= HTML email (tema SandraHub) ======================= */
  // Semua gaya inline + tabel (klien email seperti Outlook membuang <style>, flex, dan gradient).
  var F = 'font-family:Arial,Helvetica,sans-serif;';
  var C = { ink: '#1F1F24', body: '#4D4D4F', muted: '#6B6B78', line: '#E6E6EC', bg: '#F4F4F7', card: '#FFFFFF', dark: '#16161B', teal: '#32BCAD', tealDk: '#1E8C80', magenta: '#C6168D', yellow: '#FFCB05', red: '#ED1C24' };
  // Warna status standar laporan performa (RAG): isi solid hijau / kuning-amber / merah.
  var BAR = { g: '#12A150', y: '#E0A100', o: '#EE6A1F', r: '#E03A2F', na: '#D5D5DD' };
  // Gaya status mengikuti contoh Saila: latar lembut + teks/titik berwarna tegas.
  var PILL = { g: ['#E2F3E8', '#0E7A3E'], y: ['#FBF0CC', '#A67600'], o: ['#FCE3D3', '#C2560F'], r: ['#F9DEDA', '#C42318'], na: ['#EEEEF2', '#6B6B78'] };
  var INK = { g: '#0E7A3E', y: '#A67600', o: '#C2560F', r: '#C42318', na: '#6B6B78' };
  var DOT = { g: '#12A150', y: '#E0A100', o: '#EE6A1F', r: '#E03A2F', na: '#B5B5C0' };
  var STATUS = {
    g: { label: 'ON TRACK', aksi: 'Jaga momentum, dorong capaian hingga 100%.' },
    y: { label: 'PUSH', aksi: 'Dorong KPI yang tertinggal agar naik ke On Track.' },
    o: { label: 'WARNING', aksi: 'Fokus mengejar KPI terendah untuk keluar dari zona Warning.' },
    r: { label: 'CRITICAL', aksi: 'Perlu intervensi dan review harian.' },
  };
  // Kartu ringkasan status: jumlah item per status (mis. area, sales, SDP).
  function mStatus(list, unit) {
    var n = countBands(list);
    var cell = function (k) {
      return '<td width="' + TILE_W + '" valign="top" bgcolor="' + PILL[k][0] + '" style="' + F + 'width:' + TILE_W + 'px;background:' + PILL[k][0] + ';border-radius:14px;padding:12px 14px;">'
        + '<table role="presentation" width="' + (TILE_W - 28) + '" cellpadding="0" cellspacing="0" style="width:' + (TILE_W - 28) + 'px;border-collapse:collapse;table-layout:fixed;"><tr>'
        + '<td width="' + (TILE_W - 28 - 62) + '" valign="top" style="' + F + 'font-size:12px;line-height:1.35;"><span style="color:' + DOT[k] + ';font-size:14px;">&#9679;</span>&nbsp;<b style="color:' + INK[k] + ';letter-spacing:.3px;">' + STATUS[k].label + '</b><br><span style="color:' + C.muted + ';">' + esc(LBL[k]) + '</span></td>'
        + '<td width="62" align="right" valign="top" style="' + F + 'width:62px;white-space:nowrap;"><b style="font-size:26px;line-height:28px;color:' + INK[k] + ';">' + n[k] + '</b><br><span style="font-size:11px;color:' + C.muted + ';">' + esc(unit) + '</span></td>'
        + '</tr></table>'
        + '<div style="' + F + 'font-size:12px;color:' + C.body + ';margin-top:6px;line-height:1.45;">' + STATUS[k].aksi + '</div></td>';
    };
    return '<table role="presentation" width="' + EW + '" cellpadding="0" cellspacing="0" style="width:' + EW + 'px;border-collapse:collapse;table-layout:fixed;margin:4px 0 8px 0;"><tr>'
      + BKEYS.map(cell).join(gapTd()) + '</tr></table>';
  }
  function mP(txt) { return '<p style="' + F + 'font-size:14px;color:' + C.body + ';line-height:1.65;margin:0 0 14px 0;">' + txt + '</p>'; }
  function mText(raw) { return String(raw || '').split(/\n\s*\n/).filter(function (b) { return b.trim(); }).map(function (b) { return mP(esc(b).replace(/\n/g, '<br>')); }).join(''); }
  function mH(txt) { return '<p style="' + F + 'font-size:13px;font-weight:bold;color:' + C.ink + ';text-transform:uppercase;letter-spacing:.6px;margin:22px 0 10px 0;">' + txt + '</p>'; }
  // Lebar konten email tetap (px) supaya tidak bergeser di Outlook Windows: 820 - 2x28 padding.
  var EW = 764;
  var TD0 = 'font-size:1px;line-height:1px;';
  function mSec(no, txt, sub) {
    return '<table role="presentation" width="' + EW + '" cellpadding="0" cellspacing="0" style="width:' + EW + 'px;border-collapse:collapse;margin:30px 0 6px 0;"><tr>'
      + '<td width="34" height="34" align="center" valign="middle" style="' + F + 'width:34px;height:34px;background:' + C.magenta + ';color:#fff;font-size:15px;font-weight:bold;text-align:center;border-radius:9px;">' + esc(no) + '</td>'
      + '<td width="' + (EW - 34) + '" valign="middle" style="' + F + 'padding-left:12px;"><div style="font-size:18px;font-weight:bold;color:' + C.ink + ';">' + esc(txt) + '</div>'
      + (sub ? '<div style="font-size:12.5px;color:' + C.muted + ';margin-top:2px;">' + esc(sub) + '</div>' : '') + '</td></tr></table>'
      + '<table role="presentation" width="' + EW + '" cellpadding="0" cellspacing="0" style="width:' + EW + 'px;border-collapse:collapse;margin:10px 0 4px 0;"><tr><td height="2" bgcolor="' + C.line + '" style="height:2px;' + TD0 + 'background:' + C.line + ';">&nbsp;</td></tr></table>';
  }
  // Pill di dalam kalimat (span). Outlook Windows mengabaikan padding pada span, jadi diberi border warna sama sebagai "padding".
  function pill(v) { var b = band(v), p = PILL[b]; return '<span style="' + F + 'display:inline-block;background-color:' + p[0] + ';border:2px solid ' + p[0] + ';color:' + p[1] + ';font-weight:bold;font-size:12px;padding:1px 7px;border-radius:999px;white-space:nowrap;"><span style="color:' + DOT[b] + ';">&#9679;</span>&nbsp;' + pct(v) + '</span>'; }
  // Pill sebagai tabel kecil: tampil rapi juga di Outlook Windows (mesin Word).
  function pillBox(v, size, align) {
    var p = PILL[band(v)], big = size > 14;
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"' + (align ? ' align="' + align + '"' : '') + ' style="border-collapse:separate;"><tr><td bgcolor="' + p[0] + '" style="' + F + 'background:' + p[0] + ';color:' + p[1] + ';font-weight:bold;font-size:' + (size || 12) + 'px;line-height:1.2;padding:' + (big ? '5px 12px' : '2px 7px') + ';border-radius:999px;white-space:nowrap;mso-line-height-rule:exactly;"><span style="color:' + DOT[band(v)] + ';">&#9679;</span>&nbsp;' + pct(v) + '</td></tr></table>';
  }
  // Bar progres berukuran tetap (px). Lebar penuh = 130%.
  function mBar(v, h, width) {
    h = h || 8; width = width || 150;
    var w = v == null ? 0 : Math.max(1, Math.round(Math.min(v, 1.3) / 1.3 * width));
    return '<table role="presentation" width="' + width + '" cellpadding="0" cellspacing="0" style="width:' + width + 'px;border-collapse:collapse;table-layout:fixed;"><tr>'
      + (w ? '<td width="' + w + '" height="' + h + '" style="width:' + w + 'px;height:' + h + 'px;' + TD0 + 'background:' + C.teal + ';border-radius:' + h + 'px 0 0 ' + h + 'px;">&nbsp;</td>' : '')
      + (w < width ? '<td width="' + (width - w) + '" height="' + h + '" style="width:' + (width - w) + 'px;height:' + h + 'px;' + TD0 + 'background:#EDEDF2;border-radius:0 ' + h + 'px ' + h + 'px 0;">&nbsp;</td>' : '')
      + '</tr></table>';
  }
  // 4 kolom kartu: 4 x 185 + 3 x 8 = 764.
  var TILE_W = 185, GAP = 8;
  function gapTd() { return '<td width="' + GAP + '" style="width:' + GAP + 'px;' + TD0 + '">&nbsp;</td>'; }
  function mTiles(o, compare, cmpLbl) {
    var cells = [{ lbl: 'Score', v: o.score, cmp: compare && compare.score, big: true }].concat(KPIS.map(function (k) { return { lbl: k.label, v: o[k.id] && o[k.id].ach, cmp: compare && compare[k.id] && compare[k.id].ach }; }));
    return '<table role="presentation" width="' + EW + '" cellpadding="0" cellspacing="0" style="width:' + EW + 'px;border-collapse:collapse;table-layout:fixed;margin:0 0 6px 0;"><tr>' + cells.map(function (c, ci) {
      return (ci ? gapTd() : '') + '<td width="' + TILE_W + '" bgcolor="#FFFFFF" valign="top" style="' + F + 'width:' + TILE_W + 'px;background:#fff;border:1px solid ' + C.line + ';border-top:3px solid ' + C.teal + ';border-radius:12px;padding:12px 14px;vertical-align:top;">'
        + '<div style="font-size:10.5px;color:' + C.muted + ';text-transform:uppercase;letter-spacing:.5px;font-weight:bold;height:28px;line-height:14px;overflow:hidden;">' + esc(c.lbl) + '</div>'
        + '<div style="margin:6px 0 8px 0;">' + pillBox(c.v, c.big ? 20 : 18) + '</div>'
        + mBar(c.v, 6, TILE_W - 30)
        + (c.cmp != null ? '<div style="font-size:11px;color:' + C.muted + ';margin-top:7px;white-space:nowrap;">' + esc(cmpLbl || 'Sumatera') + ' <b style="color:' + C.body + ';">' + pct(c.cmp) + '</b></div>' : '')
        + '</td>';
    }).join('') + '</tr></table>';
  }
  function insHtml(t) {
    return esc(String(t).replace(/^[^:]{1,24}::/, '')).replace(/\[\[(null|-?[\d.e-]+)\]\]/g, function (_, v) { return pill(v === 'null' ? null : Number(v)); }).replace(/\*\*(.+?)\*\*/g, '<b style="color:' + C.ink + ';">$1</b>');
  }
  function insPlain(list) { return list.map(function (t) { return t.replace(/^([^:]{1,24})::/, '$1: ').replace(/\[\[(null|-?[\d.e-]+)\]\]/g, function (_, v) { return pct(v === 'null' ? null : Number(v)); }).replace(/\*\*/g, ''); }).join('\n'); }
  function mInsight(list, judul) {
    var inner = EW - 4 - 36;
    return '<table role="presentation" width="' + EW + '" cellpadding="0" cellspacing="0" style="width:' + EW + 'px;border-collapse:collapse;table-layout:fixed;margin:14px 0 6px 0;"><tr>'
      + '<td width="4" style="width:4px;' + TD0 + 'background:' + C.teal + ';">&nbsp;</td>'
      + '<td width="' + (EW - 4) + '" style="' + F + 'background:#EEF9F7;padding:14px 18px;border-radius:0 12px 12px 0;">'
      + '<div style="font-size:12px;font-weight:bold;color:' + C.tealDk + ';text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">' + esc(judul || 'Insight') + '</div>'
      + '<table role="presentation" width="' + inner + '" cellpadding="0" cellspacing="0" style="width:' + inner + 'px;border-collapse:collapse;table-layout:fixed;">'
      + list.map(function (t, i) {
        var m = String(t).match(/^([^:]{1,24})::/);
        var bt = i ? 'border-top:1px solid #D7EEEA;' : '';
        return '<tr><td width="100" valign="top" style="' + F + 'width:100px;font-size:11px;font-weight:bold;color:' + C.tealDk + ';text-transform:uppercase;letter-spacing:.5px;padding:7px 10px 7px 0;' + bt + '">' + esc(m ? m[1] : '') + '</td>'
          + '<td width="' + (inner - 100) + '" valign="top" style="' + F + 'font-size:13.5px;color:' + C.body + ';line-height:1.8;padding:4px 0;word-wrap:break-word;' + bt + '">' + insHtml(t) + '</td></tr>';
      }).join('') + '</table>'
      + '</td></tr></table>';
  }
  // Grafik batang horizontal (lebar tetap): nama 170 | batang 504 | nilai 90.
  function mBars(items) {
    var NW = 170, VW = 90, BW = EW - NW - VW;
    return '<table role="presentation" width="' + EW + '" cellpadding="0" cellspacing="0" style="width:' + EW + 'px;border-collapse:collapse;table-layout:fixed;">' + items.map(function (it) {
      return '<tr><td width="' + NW + '" valign="middle" style="' + F + 'width:' + NW + 'px;font-size:12.5px;color:' + C.ink + ';padding:5px 10px 5px 0;overflow:hidden;">' + esc(it.nama) + (it.sub ? '<div style="font-size:10.5px;color:' + C.muted + ';">' + esc(it.sub) + '</div>' : '') + '</td>'
        + '<td width="' + BW + '" valign="middle" style="width:' + BW + 'px;padding:5px 0;">' + mBar(it.v, 10, BW) + '</td>'
        + '<td width="' + VW + '" align="right" valign="middle" style="' + F + 'width:' + VW + 'px;text-align:right;padding:5px 0;">' + pillBox(it.v, 12, 'right') + '</td></tr>';
    }).join('') + '</table>';
  }
  // Batang bertumpuk sebaran status (lebar tetap): nama 170 | batang 464 | jumlah 130.
  function mStack(items) {
    var NW = 170, CW = 130, BW = EW - NW - CW;
    return '<table role="presentation" width="' + EW + '" cellpadding="0" cellspacing="0" style="width:' + EW + 'px;border-collapse:collapse;table-layout:fixed;">' + items.map(function (it) {
      var sisa = BW, segs = BKEYS.filter(function (k) { return it[k]; });
      var html = segs.map(function (k, idx) {
        var w = idx === segs.length - 1 ? sisa : Math.max(1, Math.round(it[k] / it.n * BW));
        sisa -= w;
        return '<td width="' + w + '" height="12" style="width:' + w + 'px;height:12px;' + TD0 + 'background:' + BAR[k] + ';">&nbsp;</td>';
      }).join('');
      return '<tr><td width="' + NW + '" style="' + F + 'width:' + NW + 'px;font-size:12.5px;color:' + C.ink + ';padding:5px 10px 5px 0;">' + esc(it.nama) + '</td>'
        + '<td width="' + BW + '" style="width:' + BW + 'px;padding:5px 0;"><table role="presentation" width="' + BW + '" cellpadding="0" cellspacing="0" style="width:' + BW + 'px;border-collapse:collapse;table-layout:fixed;"><tr>' + html + '</tr></table></td>'
        + '<td width="' + CW + '" align="right" style="' + F + 'width:' + CW + 'px;font-size:11.5px;color:' + C.muted + ';text-align:right;padding:5px 0 5px 10px;white-space:nowrap;">' + BKEYS.map(function (k) { return '<b style="color:' + INK[k] + ';">' + (it[k] || 0) + '</b>'; }).join(' · ') + '</td></tr>';
    }).join('') + '</table>'
      + '<p style="' + F + 'font-size:11px;color:' + C.muted + ';margin:6px 0 0 0;">Urutan angka: ' + BKEYS.map(function (k) { return STATUS[k].label; }).join(' · ') + '</p>';
  }
  // Tabel lebar tetap (764px, table-layout fixed): kolom persen 88px, angka 76px, sisa dibagi rata ke kolom teks.
  var COLW = { pct: 88, num: 76 };
  function mTable(cols, rows) {
    var fixed = 0, nText = 0;
    cols.forEach(function (c) { if (c.kind === 'pct' || c.kind === 'num') fixed += COLW[c.kind]; else nText++; });
    var tw = nText ? Math.floor((EW - 2 - fixed) / nText) : 0;
    var widths = cols.map(function (c) { return c.kind === 'pct' || c.kind === 'num' ? COLW[c.kind] : tw; });
    var th = F + 'background:' + C.bg + ';color:' + C.muted + ';font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.3px;padding:9px 6px;border-bottom:1px solid ' + C.line + ';word-wrap:break-word;';
    var html = '<table role="presentation" width="' + EW + '" cellpadding="0" cellspacing="0" style="width:' + EW + 'px;border-collapse:separate;border-spacing:0;table-layout:fixed;border:1px solid ' + C.line + ';border-radius:12px;margin:0 0 6px 0;"><tr>'
      + cols.map(function (c, ci) { var right = c.kind === 'pct' || c.kind === 'num'; return '<th width="' + widths[ci] + '" align="' + (right ? 'right' : 'left') + '" style="' + th + 'width:' + widths[ci] + 'px;text-align:' + (right ? 'right' : 'left') + ';' + (ci === 0 ? 'padding-left:12px;' : '') + '">' + esc(c.label) + '</th>'; }).join('') + '</tr>';
    rows.forEach(function (r, i) {
      var last = i === rows.length - 1;
      html += '<tr>' + cols.map(function (c, ci) {
        var v = c.get(r), st = F + 'width:' + widths[ci] + 'px;font-size:12.5px;padding:7px 6px;color:' + C.body + ';vertical-align:middle;' + (ci === 0 ? 'padding-left:12px;' : '') + (last ? '' : 'border-bottom:1px solid #F0F0F4;') + (i % 2 ? 'background:#FAFAFC;' : 'background:#FFFFFF;');
        if (c.kind === 'pct') return '<td width="' + widths[ci] + '" align="right" style="' + st + 'text-align:right;padding-right:6px;">' + pillBox(v, 11, 'right') + '</td>';
        if (c.kind === 'num') return '<td width="' + widths[ci] + '" align="right" style="' + st + 'text-align:right;white-space:nowrap;">' + fmt(v) + '</td>';
        return '<td width="' + widths[ci] + '" style="' + st + 'word-wrap:break-word;' + (c.bold ? 'font-weight:bold;color:' + C.ink + ';' : '') + '">' + esc(v) + '</td>';
      }).join('') + '</tr>';
    });
    return html + '</table>';
  }
  var achCols = function () { return KPIS.map(function (k) { return { label: k.short, kind: 'pct', get: function (r) { return r[k.id] && r[k.id].ach; } }; }).concat([{ label: 'Score', kind: 'pct', get: function (r) { return r.score; } }]); };
  function mLegend() {
    var chip = function (k, t) { return '<span style="display:inline-block;background-color:' + PILL[k][0] + ';border:2px solid ' + PILL[k][0] + ';color:' + PILL[k][1] + ';font-weight:bold;font-size:11px;padding:1px 8px;border-radius:999px;margin-left:6px;"><span style="color:' + DOT[k] + ';">&#9679;</span>&nbsp;' + esc(t) + '</span>'; };
    return '<p style="' + F + 'font-size:11.5px;color:' + C.muted + ';margin:10px 0 0 0;">Status:' + BKEYS.map(function (k) { return chip(k, STATUS[k].label + ' ' + LBL[k]); }).join('') + '</p>';
  }
  // Kerangka email: header gelap ala SandraHub + kartu putih + footer.
  function wrap(inner, head) { return outlookify(wrapRaw(inner, head)); }
  function wrapRaw(inner, head) {
    head = head || {};
    var stripe = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>'
      + '<td width="34%" style="height:4px;font-size:1px;line-height:4px;background:' + C.teal + ';">&nbsp;</td>'
      + '<td width="33%" style="height:4px;font-size:1px;line-height:4px;background:' + C.yellow + ';">&nbsp;</td>'
      + '<td width="33%" style="height:4px;font-size:1px;line-height:4px;background:' + C.magenta + ';">&nbsp;</td></tr></table>';
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:' + C.bg + ';"><tr><td align="center" style="padding:24px 12px;">'
      + '<!--[if mso]><table role="presentation" width="820" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;max-width:820px;background:#FFFFFF;border:1px solid ' + C.line + ';border-radius:16px;">'
      + '<tr><td style="padding:0;">' + stripe + '</td></tr>'
      + '<tr><td style="' + F + 'background:' + C.dark + ';padding:22px 28px;">'
      + '<div style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:' + C.teal + ';">SandraHub · Smart Mail Sumatera</div>'
      + '<div style="font-size:24px;font-weight:bold;color:#fff;margin-top:6px;">' + esc(head.title || 'Performance Report') + '</div>'
      + (head.sub ? '<div style="font-size:13px;color:#B9B9C6;margin-top:4px;">' + esc(head.sub) + '</div>' : '')
      + '</td></tr>'
      + '<tr><td width="820" style="' + F + 'padding:26px 28px 10px 28px;">' + inner + '</td></tr>'
      + '<tr><td style="' + F + 'padding:16px 28px 22px 28px;border-top:1px solid ' + C.line + ';font-size:11.5px;color:' + C.muted + ';line-height:1.6;">'
      + 'Email ini dikirim otomatis dari SandraHub (Smart Mail Sumatera) — Sales &amp; Distribution, Indosat Circle Sumatera.</td></tr>'
      + '</table>'
      + '<!--[if mso]></td></tr></table><![endif]-->'
      + '</td></tr></table>';
  }
  // Outlook Windows memakai mesin Word: warna latar CSS sering diabaikan. Tambahkan atribut bgcolor
  // ke setiap td/th/table yang punya background warna hex.
  function outlookify(html) {
    return html.replace(/<(td|th|table)\b((?:(?!bgcolor)[^>])*?)style="([^"]*?)background:(#[0-9A-Fa-f]{6})/g, function (m, tag, pre, st, col) {
      return '<' + tag + pre + 'bgcolor="' + col + '" style="' + st + 'background:' + col;
    });
  }

  /* ======================= Bentuk penerima ======================= */
  var tanggalTxt = function () { return P.data.tanggal ? P.data.tanggal.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'; };
  function introFor(group, defaultTxt) {
    var ta = document.getElementById('perfIntro');
    var txt = ta && ta.value.trim() ? ta.value : defaultTxt;
    if (!P.data.tanggal) txt = txt.replace(/\s*\(data per \{tanggal\}\)/g, '');
    return txt.replace(/\{nama\}/g, group.name).replace(/\{periode\}/g, P.periode).replace(/\{tanggal\}/g, tanggalTxt());
  }
  function closingTxt() { var ta = document.getElementById('perfClosing'); return ta ? ta.value : ''; }
  var INTRO_DEF = 'Yth. Bapak/Ibu {nama},\n\nBerikut kami sampaikan Performance Report periode {periode} (data per {tanggal}).';

  function buildGroups() {
    var d = P.data, groups = [];
    P.periode = (document.getElementById('perfPeriode').value || '').trim() || tanggalTxt();
    var subHead = function (x) { return x + ' · Periode ' + P.periode + (d.tanggal ? ' · Data per ' + tanggalTxt() : ''); };
    if (P.jenis === 'hoa') {
      buildAreaGroups(groups, subHead);
    } else if (P.jenis === 'hor') {
      d.regionNames.forEach(function (region) {
        var p = regionPack(region);
        var L = leaderRow('hor', region);
        var h = L.nama ? { nama: L.nama } : null;
        var to = splitEmails(L.to);
        var ccSet = new Set(splitEmails(L.cc).map(function (e) { return e.toLowerCase(); }));
        to.forEach(function (e) { ccSet.delete(e.toLowerCase()); });
        var name = (h && h.nama ? h.nama + ' — ' : '') + title(region);
        var ins = insightRegion(p);
        var people = (d.people || []).filter(function (x) { return norm(x.REGION) === norm(region); });
        var html = wrap(
          mText(introFor({ name: h && h.nama ? h.nama : 'Head of Region' }, 'Yth. Bapak/Ibu {nama},\n\nBerikut kami sampaikan Performance Report ' + title(region) + ' periode {periode} (data per {tanggal}).'))
          + mH('Ringkasan Kinerja ' + esc(title(region))) + (p.reg ? mTiles(p.reg, d.circle) : '')
          + (p.areas.length ? mH('Status Area (' + p.areas.length + ' area)') + mStatus(p.areas, 'area') : '')
          + mInsight(ins, 'Insight Utama')
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
          + (p.sdpByArea.length ? mH('Sebaran Status SDP per Area (On Track · Push · Warning · Critical)') + mStack(p.sdpByArea.map(function (x) { return { nama: title(x.area), n: x.n, g: x.g, y: x.y, o: x.o, r: x.r }; }))
            + mH('Rekap per Area') + mTable([
              { label: 'Area', bold: true, get: function (r) { return title(r.area); } },
              { label: 'SDP', kind: 'num', get: function (r) { return r.n; } },
              { label: 'Rata-rata', kind: 'pct', get: function (r) { return r.avg; } },
              { label: 'On Track', kind: 'num', get: function (r) { return r.g; } },
              { label: 'Push', kind: 'num', get: function (r) { return r.y; } },
              { label: 'Warning', kind: 'num', get: function (r) { return r.o; } },
              { label: 'Critical', kind: 'num', get: function (r) { return r.r; } },
            ], p.sdpByArea) : '')
          + (p.sdpRows.length ? mH('10 SDP dengan Score Terendah') + mTable([
            { label: 'Nama', bold: true, get: function (r) { return r.namaMim3; } },
            { label: 'Area', get: function (r) { return title(r.area); } },
          ].concat(achCols()), p.sdpRows.slice().sort(byScoreDesc).reverse().slice(0, 10)) : '')
          + '<div style="height:18px;"></div>' + mP('Rincian lengkap Internal Sales (area, cluster' + (people.length ? ', per sales' : '') + '), MDI, dan seluruh SDP ' + esc(title(region)) + ' ada di lampiran Excel (3 sheet).')
          + mText(closingTxt()),
          { title: 'Performance Report ' + title(region), sub: subHead('Head of Region') }
        );
        var isRows = p.areas.map(function (r) { return Object.assign({ Level: 'Area' }, flatIsRow(r)); })
          .concat(p.clusters.map(function (r) { return Object.assign({ Level: 'Cluster' }, flatIsRow(r)); }))
          .concat(people.map(function (r) { return Object.assign({ Level: 'Sales', Cluster: r.CLUSTER || '' }, flatIsRow(r)); }));
        groups.push({
          key: 'hor|' + norm(region), name: name, emails: to, ccs: Array.from(ccSet),
          rows: p.areas.map(flatRow), unmatched: !to.length,
          unmatchedWhy: 'Alamat To HOR untuk ' + title(region) + ' kosong. Isi di Tahap 2 (daftar Head of Region) atau di kolom To di atas.',
          perf: {
            subject: 'Performance Report ' + title(region) + ' — ' + P.periode,
            html: html, insight: insPlain(ins),
            attName: 'Performance Report ' + title(region) + ' ' + P.periode,
            sheets: [['Internal Sales', isRows], ['MDI', p.mdi.map(flatRow)], ['SDP', p.sdpRows.map(flatSdpRow)]],
          },
        });
      });
    } else if (P.jenis === 'mdi') {
      d.mdiPartners.forEach(function (pt) {
        var rows = pt.rows, to = [], cc = [], miss = [];
        rows.forEach(function (r) {
          if (!r.map || !splitEmails(r.map.EMAIL_TO).length) { miss.push(title(r.area)); return; }
          to = to.concat(splitEmails(r.map.EMAIL_TO)); cc = cc.concat(splitEmails(r.map.EMAIL_CC));
        });
        var uniq = function (a) { var seen = {}; return a.filter(function (e) { var k = e.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; }); };
        to = uniq(to); cc = uniq(cc).filter(function (e) { return to.map(function (x) { return x.toLowerCase(); }).indexOf(e.toLowerCase()) < 0; });
        var agg = { score: avg(rows.map(function (r) { return r.score; })) };
        KPIS.forEach(function (k) { agg[k.id] = { ach: avg(rows.map(function (r) { return r[k.id].ach; })) }; });
        var ins = insightMdiPartner(pt, agg);
        groups.push({
          key: 'mdi|' + pt.key, name: title(pt.partner) + ' (' + rows.length + ' area)',
          emails: to, ccs: cc, rows: rows.map(flatRow),
          unmatched: !to.length,
          unmatchedWhy: 'Partner "' + pt.partner + '" belum ada di Master_Mapping (TYPE MDI).',
          perf: {
            subject: 'Performance Report MDI ' + title(pt.partner) + ' — ' + P.periode,
            html: wrap(mText(introFor({ name: 'Pimpinan ' + title(pt.partner).replace(/^(.*),\s*PT$/, 'PT $1') }, INTRO_DEF))
              + mH(rows.length > 1 ? 'Ringkasan Kinerja (rata-rata ' + rows.length + ' area)' : 'Ringkasan Kinerja ' + esc(title(rows[0].area))) + mTiles(agg, null)
              + (rows.length > 1 ? mH('Status Area (' + rows.length + ' area)') + mStatus(rows, 'area') : '')
              + mInsight(ins, 'Insight Utama')
              + (rows.length > 1 ? mH('Score per Area') + mBars(rows.map(function (r) { return { nama: title(r.area), sub: title(r.region), v: r.score }; })) : '')
              + mH('Detail per Area') + mTable([{ label: 'Area', bold: true, get: function (x) { return title(x.area); } }, { label: 'Region', get: function (x) { return title(x.region); } }].concat(achCols()), rows)
              + (miss.length ? mP('<i>Catatan: area ' + esc(miss.join(', ')) + ' belum terdaftar di Master_Mapping.</i>') : '')
              + '<div style="height:14px;"></div>' + mText(closingTxt()),
              { title: title(pt.partner), sub: subHead('MDI · ' + rows.length + ' area') }),
            insight: insPlain(ins),
            attName: 'Performance Report ' + title(pt.partner),
            sheets: [['MDI', rows.map(flatRow)]],
          },
        });
      });
    } else if (P.jenis === 'is') {
      (d.people || []).filter(function (r) { return !/VACANT/.test(norm(r.nama)); }).forEach(function (r) {
        var m = r.map, ins = insightPerson(r);
        var area = d.areas.filter(function (a) { return norm(a.nama) === norm(r.AREA); })[0] || null;
        groups.push({
          key: 'is|' + normKey(r.nama), name: title(r.nama) + ' — ' + (r.CLUSTER || title(r.AREA)),
          emails: m ? splitEmails(m.EMAIL_TO) : [],
          // Cc = Cc di Master_Mapping (kalau ada) + HOA area sales tersebut (ikut alamat HOA yang tersimpan, kalau diubah).
          ccs: (function () {
            var to = m ? splitEmails(m.EMAIL_TO).map(function (e) { return e.toLowerCase(); }) : [];
            var list = (m ? splitEmails(m.EMAIL_CC) : []).concat(splitEmails(leaderRow('hoa', r.AREA).to));
            var seen = {};
            return list.filter(function (e) { var k = e.toLowerCase(); if (seen[k] || to.indexOf(k) >= 0) return false; seen[k] = 1; return true; });
          })(),
          rows: [flatIsRow(r)],
          unmatched: !m || !splitEmails(m.EMAIL_TO).length,
          unmatchedWhy: 'Sales "' + r.nama + '" belum ada di Master_Mapping (TYPE INTERNAL SALES, PARTNER_NAME = nama sales) atau EMAIL_TO kosong.',
          perf: {
            subject: 'Performance Report ' + title(r.nama) + ' — ' + P.periode,
            html: wrap(mText(introFor({ name: title(r.nama) }, INTRO_DEF))
              + mH('Ringkasan Kinerja') + mTiles(r, area, area ? 'Area ' + title(area.nama) : '')
              + mInsight(ins, 'Insight Utama')
              + mH('Detail') + mTable([
                { label: 'Cluster', bold: true, get: function (x) { return x.CLUSTER; } },
                { label: 'Trad Target', kind: 'num', get: function (x) { return x.trad.t; } },
                { label: 'Trad Actual', kind: 'num', get: function (x) { return x.trad.a; } },
                { label: 'FWA Target', kind: 'num', get: function (x) { return x.fwa.t; } },
                { label: 'FWA Actual', kind: 'num', get: function (x) { return x.fwa.a; } },
              ].concat(achCols()), [r])
              + '<div style="height:14px;"></div>' + mText(closingTxt()),
              { title: title(r.nama), sub: subHead('Internal Sales' + (m && m.ROLE ? ' ' + m.ROLE : '') + ' · ' + (r.CLUSTER || '') + ' · ' + title(r.AREA)) }),
            insight: insPlain(ins),
            attName: 'Performance Report ' + title(r.nama),
            sheets: [['Internal Sales', [Object.assign({ Cluster: r.CLUSTER || '' }, flatIsRow(r))]]],
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
              + mH('Detail') + mTable([{ label: 'ID MIM3 / ID 3KIOSK', bold: true, get: function (x) { return sdpPairTxt(x); } }, { label: 'Area', get: function (x) { return title(x.area); } }, { label: 'Microcluster', get: function (x) { return x.mc; } }].concat(achCols()), [r])
              + '<div style="height:14px;"></div>' + mText(closingTxt()),
              { title: e.nama, sub: subHead('SDP ' + sdpPairTxt(r) + ' · ' + title(r.area)) }),
            insight: insPlain(ins),
            attName: 'Performance Report ' + e.id,
            sheets: [['SDP', [flatSdpRow(r)]]],
          },
        });
      });
    }
    return groups;
  }
  // Email Head of Area: 1 per area, isinya khusus area itu.
  function buildAreaGroups(groups, subHead) {
    var d = P.data;
    d.areas.slice().sort(function (a, b) { return norm(a.REGION).localeCompare(norm(b.REGION)) || a.nama.localeCompare(b.nama); }).forEach(function (area) {
      var A = norm(area.nama);
      var reg = d.regions.filter(function (x) { return norm(x.nama) === norm(area.REGION); })[0] || null;
      var people = (d.people || []).filter(function (x) { return norm(x.AREA) === A; }).sort(byScoreDesc);
      var clusters = d.clusters.filter(function (x) { return norm(x.AREA) === A; }).sort(byScoreDesc);
      var mdi = d.mdi.filter(function (x) { return norm(x.area) === A; }).sort(byScoreDesc);
      var sdp = d.sdpRows.filter(function (x) { return norm(x.area) === A; }).sort(byScoreDesc);
      var L = leaderRow('hoa', area.nama);
      var to = splitEmails(L.to);
      var cc = splitEmails(L.cc).filter(function (e) { return to.map(function (x) { return x.toLowerCase(); }).indexOf(e.toLowerCase()) < 0; });
      var nmHoa = L.nama || 'Head of Area';
      var ins = insightArea(area, reg, people, mdi, sdp);
      var mcAvg = {};
      sdp.forEach(function (x) { (mcAvg[x.mc] = mcAvg[x.mc] || []).push(x); });
      var html = wrap(
        mText(introFor({ name: nmHoa }, 'Yth. Bapak/Ibu {nama},\n\nBerikut kami sampaikan Performance Report area ' + title(area.nama) + ' periode {periode} (data per {tanggal}).'))
        + mH('Ringkasan Kinerja Area ' + esc(title(area.nama))) + mTiles(area, reg, reg ? title(reg.nama) : '')
        + (people.length ? mH('Status Sales (' + people.length + ' sales)') + mStatus(people, 'sales') : '')
        + mInsight(ins, 'Insight Utama')
        + mSec('1', 'Internal Sales', (people.length || clusters.length) + (people.length ? ' sales' : ' cluster'))
        + (people.length ? mH('Score per Sales') + mBars(people.map(function (x) { return { nama: title(x.nama), sub: x.CLUSTER, v: x.score }; }))
          + mH('Detail per Sales') + mTable([
            { label: 'Nama', bold: true, get: function (r) { return title(r.nama); } },
            { label: 'Cluster', get: function (r) { return r.CLUSTER; } },
            { label: 'Trad Target', kind: 'num', get: function (r) { return r.trad.t; } },
            { label: 'Trad Actual', kind: 'num', get: function (r) { return r.trad.a; } },
          ].concat(achCols()), people)
          : (clusters.length ? mH('Score per Cluster') + mBars(clusters.map(function (x) { return { nama: x.nama, v: x.score }; })) + mH('Detail per Cluster') + mTable([{ label: 'Cluster', bold: true, get: function (r) { return r.nama; } }].concat(achCols()), clusters) : ''))
        + mSec('2', 'MDI', mdi.length + ' partner')
        + (mdi.length ? mTable([{ label: 'Partner', bold: true, get: function (r) { return r.partner; } }].concat(achCols()), mdi) : mP('Tidak ada data MDI untuk area ini.'))
        + mSec('3', 'SDP', sdp.length + ' SDP · rata-rata score ' + pct(avg(sdp.map(function (x) { return x.score; }))))
        + (sdp.length ? mH('Sebaran Status SDP (On Track · Push · Warning · Critical)') + mStack([Object.assign({ nama: title(area.nama), n: sdp.length }, countBands(sdp))])
          + mH('Detail SDP (score terendah di atas)') + mTable([
            { label: 'Nama', bold: true, get: function (r) { return r.namaMim3; } },
            { label: 'Microcluster', get: function (r) { return r.mc; } },
          ].concat(achCols()), sdp.slice().reverse()) : mP('Tidak ada data SDP untuk area ini.'))
        + '<div style="height:18px;"></div>' + mP('Rincian lengkap ada di lampiran Excel (3 sheet: Internal Sales, MDI, SDP).')
        + mText(closingTxt()),
        { title: 'Performance Report Area ' + title(area.nama), sub: subHead('Head of Area · ' + title(area.REGION)) }
      );
      var isRows = [Object.assign({ Level: 'Area' }, flatIsRow(area))]
        .concat(clusters.map(function (r) { return Object.assign({ Level: 'Cluster' }, flatIsRow(r)); }))
        .concat(people.map(function (r) { return Object.assign({ Level: 'Sales', Cluster: r.CLUSTER || '' }, flatIsRow(r)); }));
      groups.push({
        key: 'hoa|' + A, name: nmHoa + ' — ' + title(area.nama), emails: to, ccs: cc,
        rows: [flatRow(area)], unmatched: !to.length,
        unmatchedWhy: 'Alamat To HOA area ' + title(area.nama) + ' kosong. Isi di Tahap 2 (daftar Head of Area) atau di kolom To di atas.',
        perf: {
          subject: 'Performance Report Area ' + title(area.nama) + ' — ' + P.periode,
          html: html, insight: insPlain(ins),
          attName: 'Performance Report Area ' + title(area.nama) + ' ' + P.periode,
          sheets: [['Internal Sales', isRows], ['MDI', mdi.map(flatRow)], ['SDP', sdp.map(flatSdpRow)]],
        },
      });
    });
  }
  function insightArea(area, reg, people, mdi, sdp) {
    var out = [];
    var peers = P.data.areas.filter(function (x) { return norm(x.REGION) === norm(area.REGION); });
    var rk = peers.length > 1 ? rankIn(peers, area) : null;
    out.push('Pencapaian::**Score ' + title(area.nama) + ' ' + Q(area.score) + '**' + (reg ? ' dibanding ' + title(reg.nama) + ' ' + Q(reg.score) : '') + (rk ? '. Peringkat **' + rk.r + ' dari ' + rk.n + '** area.' : '.'));
    var w = weakest(area);
    out.push('KPI::' + kpiLine(area) + (w ? '. KPI terendah: **' + w.k.label + '**.' : '.'));
    if (people.length) {
      var red = people.filter(function (x) { var b = band(x.score); return b === 'o' || b === 'r'; });
      out.push('Sales::**' + red.length + ' dari ' + people.length + '** sales berstatus Warning/Critical' + (red.length ? '. Capaian terendah: ' + red.slice(-2).reverse().map(function (x) { return title(x.nama) + ' ' + Q(x.score); }).join(', ') : '') + '.');
    }
    if (mdi.length) out.push('MDI::' + mdi.map(function (x) { return title(x.partner) + ' ' + Q(x.score); }).join(', ') + '.');
    if (sdp.length) out.push('SDP::**' + countRed(sdp) + ' dari ' + sdp.length + '** SDP berstatus Warning/Critical, rata-rata ' + Q(avg(sdp.map(function (x) { return x.score; }))) + '. Capaian terendah: ' + sdp[sdp.length - 1].namaMim3 + ' ' + Q(sdp[sdp.length - 1].score) + '.');
    return out;
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
    '.pf-bg-o{ background:#FCE3D3 !important; color:#C2560F !important; } .pf-pill.pf-bg-o::before{ color:#EE6A1F; } .pf-st.o{ background:#FCE3D3; color:#C2560F; } .pf-st.o .k::before{ color:#EE6A1F; } .pf-s-o{ background:#EE6A1F; } .pf-o{ color:#EE6A1F; } .pf-legend .o{ background:#FCE3D3; color:#C2560F; }',
    '.pf-bg-g{ background:#E2F3E8 !important; color:#0E7A3E !important; } .pf-bg-y{ background:#FBF0CC !important; color:#A67600 !important; } .pf-bg-r{ background:#F9DEDA !important; color:#C42318 !important; } .pf-bg-na{ color:var(--muted); }',
    '.pf-pill::before{ content:"\\25CF"; margin-right:5px; } .pf-pill.pf-bg-g::before{ color:#12A150; } .pf-pill.pf-bg-y::before{ color:#E0A100; } .pf-pill.pf-bg-r::before{ color:#E03A2F; }',
    '.pf-status{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }',
    '.pf-st{ border-radius:14px; padding:14px 16px; }',
    '.pf-st .h{ display:flex; align-items:baseline; justify-content:space-between; gap:8px; }',
    '.pf-st .k{ font-weight:800; letter-spacing:.03em; font-size:13px; } .pf-st .k::before{ content:"\\25CF"; margin-right:7px; font-size:15px; }',
    '.pf-st .h{ align-items:flex-start; } .pf-st .k{ white-space:nowrap; } .pf-st .rg{ display:block; font-weight:500; opacity:.75; margin:3px 0 0 22px; } .pf-st .n{ font-size:28px; font-weight:800; } .pf-st .u{ font-size:12px; opacity:.75; margin-left:3px; }',
    '.pf-st .a{ font-size:12px; margin-top:6px; opacity:.9; }',
    '.pf-st.g{ background:#E2F3E8; color:#0E7A3E; } .pf-st.y{ background:#FBF0CC; color:#A67600; } .pf-st.r{ background:#F9DEDA; color:#C42318; }',
    '.pf-st.g .k::before{ color:#12A150; } .pf-st.y .k::before{ color:#E0A100; } .pf-st.r .k::before{ color:#E03A2F; }',
    '.pf-card.pf-bg-g .l, .pf-card.pf-bg-r .l, .pf-card.pf-bg-g .s, .pf-card.pf-bg-r .s{ color:rgba(255,255,255,.88); } .pf-card.pf-bg-y .l, .pf-card.pf-bg-y .s{ color:rgba(59,44,0,.85); } .pf-card[class*=pf-bg-]{ border:0; }',
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
    '.pf-i-g, .pf-i-y, .pf-i-o, .pf-i-r{ background:var(--ioh-teal); } .pf-i-na{ background:var(--line); }',
    '.pf-s-g{ background:#12A150; } .pf-s-y{ background:#E0A100; } .pf-s-r{ background:#E03A2F; }',
    '.pf-card .v .pf-pill{ font-size:24px; padding:4px 12px; border-radius:10px; }',
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
    '.pf-legend .g{ background:#E2F3E8; color:#0E7A3E; } .pf-legend .y{ background:#FBF0CC; color:#A67600; } .pf-legend .r{ background:#F9DEDA; color:#C42318; }',
    '.pf-toolbar{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; }',
    '.pf-toolbar select{ width:auto; min-width:200px; }',
    '.pf-jenis{ display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }',
    '.pf-jenis label{ border:1px solid var(--line); border-radius:12px; padding:12px 14px; cursor:pointer; background:var(--surf2); display:block; }',
    '.pf-jenis label.on{ border-color:var(--teal); box-shadow:0 0 0 2px var(--good-bd); background:var(--surf); }',
    '.pf-jenis input{ margin-right:8px; }',
    '.pf-jenis small{ display:block; color:var(--muted); margin-top:4px; line-height:1.45; }',
    '.pf-match{ margin-top:10px; font-size:12.5px; padding:9px 12px; border-radius:10px; border:1px solid var(--line); }',
    '.pf-hoa input{ width:100%; font:inherit; font-size:12.5px; padding:6px 8px; border-radius:7px; border:1px solid var(--line); background:var(--surf); color:var(--ink); }',
    '.pf-warn{ margin:14px 20px 0; padding:10px 14px; border-radius:10px; font-size:13px; line-height:1.5; color:var(--bad-ink); background:var(--bad-bg); border:1px solid var(--bad-bd); }',
    '.recipient-item.perf-unmatched .rname{ color:var(--bad-ink); }',
    '.pf-edit{ border:1px solid var(--line); border-radius:12px; padding:12px 14px; margin-bottom:12px; background:var(--surf2); display:flex; flex-direction:column; gap:8px; }',
    '.pf-edit-row{ display:grid; grid-template-columns:120px 1fr; gap:10px; align-items:center; }',
    '.pf-edit-row .token-hint{ grid-column:2; }',
    '.pf-edit-row label{ font-size:12px; font-weight:700; color:var(--ink2); }',
    '.pf-edit-row input{ width:100%; font:inherit; font-size:13px; padding:7px 10px; border-radius:8px; border:1px solid var(--line); background:var(--surf); color:var(--ink); }',
    '@media (max-width:900px){ .pf-cards{ grid-template-columns:1fr 1fr; } .pf-grid2, .pf-reg, .pf-jenis, .pf-status{ grid-template-columns:1fr; } }',
  ].join('\n');
  document.head.appendChild(css);

  /* ======================= Visualisasi (Tahap 2) ======================= */
  function cellPct(v) { return '<td class="c"><span class="pf-pill pf-bg-' + band(v) + '">' + pct(v) + '</span></td>'; }
  function card(lbl, v, sub) {
    return '<div class="pf-card"><div class="l">' + esc(lbl) + '</div><div class="v"><span class="pf-pill pf-bg-' + band(v) + '">' + pct(v) + '</span></div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
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
    html += '<div class="pf-toolbar"><div class="hint" style="margin:0;">' + (d.tanggal ? 'Data per <b>' + esc(tanggalTxt()) + '</b> · ' : '') + (d.people ? d.people.length + ' sales · ' : '') + d.areas.length + ' area · ' + d.mdi.length + ' MDI · ' + d.sdpRows.length + ' SDP</div>'
      + '<div class="pf-legend">' + BKEYS.map(function (k) { return '<span class="' + k + '">' + STATUS[k].label + ' ' + esc(LBL[k]) + '</span>'; }).join('') + '</div></div>';

    // Kartu KPI Sumatera
    if (c) {
      html += '<div class="pf-sec pf-cards">' + card('Score Sumatera', c.score, '') + KPIS.map(function (k) {
        var sub = k.id === 'dse' ? 'Skor ' + fmt(c.dse.t) + ' · DSE ' + fmt(c.dse.a) : 'Target ' + fmt(c[k.id].t) + ' · Actual ' + fmt(c[k.id].a);
        return card(k.label, c[k.id].ach, sub);
      }).join('') + '</div>';
    }

    // Status area (gaya kartu status)
    if (d.areas.length) {
      var cnt = countBands(d.areas);
      html += '<div class="pf-sec"><div class="field-group-label">Status Area (' + d.areas.length + ' area)</div><div class="pf-status">' + BKEYS.map(function (k) {
        return '<div class="pf-st ' + k + '"><div class="h"><span class="k">' + STATUS[k].label + '<span class="rg">' + esc(LBL[k]) + '</span></span><span><span class="n">' + cnt[k] + '</span><span class="u">area</span></span></div><div class="a">' + STATUS[k].aksi + '</div></div>';
      }).join('') + '</div></div>';
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
        return '<tr><td title="' + esc(title(a.REGION)) + '">' + esc(title(a.nama)) + '</td>' + KPIS.map(function (k) { return cellPct(a[k.id].ach); }).join('') + cellPct(a.score) + '</tr>';
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
      return Object.assign({ a: a, n: l.length, avg: avg(l.map(function (r) { return r.score; })) }, countBands(l));
    }).sort(function (x, y) { return ((y.o + y.r) / y.n) - ((x.o + x.r) / x.n); });
    var tot = countBands(sdp);
    html += '<div class="pf-sec pf-grid2">';
    html += '<div class="pf-box"><h4>Sebaran Score SDP per Area <span class="hint" style="float:right;margin:0;">' + sdp.length + ' SDP · ' + BKEYS.map(function (k) { return '<span class="pf-' + k + '">' + tot[k] + '</span>'; }).join(' / ') + '</span></h4><div class="pf-scroll"><table class="pf-tbl"><thead><tr><th>Area</th><th>SDP</th><th style="width:45%">Sebaran</th><th>Rata-rata</th></tr></thead><tbody>'
      + dist.map(function (x) {
        var seg = function (k, n) { return n ? '<i class="pf-s-' + k + '" style="width:' + (n / x.n * 100) + '%" title="' + n + ' SDP"></i>' : ''; };
        return '<tr><td>' + esc(title(x.a)) + '</td><td>' + x.n + '</td><td><div class="pf-stack">' + BKEYS.map(function (k) { return seg(k, x[k]); }).join('') + '</div></td><td class="c pf-bg-' + band(x.avg) + '">' + pct(x.avg) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    var low = sdp.slice().sort(byScoreDesc).reverse().slice(0, 10);
    html += '<div class="pf-box"><h4>10 SDP Score Terendah</h4><div class="pf-scroll"><table class="pf-tbl"><thead><tr><th>SDP</th><th>Area</th>' + KPIS.map(function (k) { return '<th>' + esc(k.short) + '</th>'; }).join('') + '<th>Score</th></tr></thead><tbody>'
      + low.map(function (r) {
        return '<tr><td title="' + esc(r.idMim3) + '">' + esc(r.namaMim3) + '</td><td>' + esc(title(r.area)) + '</td>' + KPIS.map(function (k) { return cellPct(r[k.id].ach); }).join('') + cellPct(r.score) + '</tr>';
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
    if (P.jenis === 'is') {
      var vac = (d.people || []).filter(function (r) { return /VACANT/.test(norm(r.nama)); }).length;
      var ppl = (d.people || []).filter(function (r) { return !/VACANT/.test(norm(r.nama)); });
      var noIs = ppl.filter(function (r) { return !r.map || !splitEmails(r.map.EMAIL_TO).length; });
      bad = ppl.length ? noIs.length : 1;
      txt = ppl.length ? (ppl.length - noIs.length) + ' dari ' + ppl.length + ' sales punya email di Master_Mapping (TYPE INTERNAL SALES, dicocokkan lewat nama). 1 email per sales, Cc ke HOA area masing-masing.' + (vac ? ' ' + vac + ' posisi VACANT dilewati.' : '') + (noIs.length ? ' Belum ada: ' + noIs.slice(0, 8).map(function (r) { return title(r.nama); }).join(', ') + (noIs.length > 8 ? ', dan lainnya' : '') + '.' : '') : 'Sheet Internal Sales di file ini bukan format per orang (kolom NAME), jadi tidak bisa dikirim per sales.';
    } else if (P.jenis === 'mdi') {
      var ptMiss = d.mdiPartners.filter(function (pt) { return !pt.rows.some(function (r) { return r.map && splitEmails(r.map.EMAIL_TO).length; }); });
      bad = d.mdi.filter(function (r) { return !r.map; }).length;
      txt = d.mdiPartners.length + ' email (1 per partner, semua area partner dalam 1 email) untuk ' + d.mdi.length + ' baris partner-area. ' + (d.mdi.length - bad) + ' dari ' + d.mdi.length + ' baris cocok dengan Master_Mapping.' + (ptMiss.length ? ' Partner tanpa alamat: ' + ptMiss.map(function (pt) { return title(pt.partner); }).join(', ') + '.' : '');
      box.className = 'pf-match ' + (bad ? 'pf-bg-r' : 'pf-bg-g'); box.textContent = txt; return;
      txt = (d.mdi.length - bad) + ' dari ' + d.mdi.length + ' MDI cocok dengan Master_Mapping (PARTNER_NAME + BRANCH).';
    } else if (P.jenis === 'sdp') {
      var miss = d.sdp.filter(function (e) { return !e.map; });
      bad = miss.length;
      var missPair = d.sdpRows.filter(function (r) { return !d.mapById[normKey(r.idMim3)] || !d.mapById[normKey(r.id3k)]; });
      txt = (d.sdpRows.length - missPair.length) + ' dari ' + d.sdpRows.length + ' SDP (pasangan ID MIM3 / ID 3KIOSK) cocok dengan Master_Mapping → ' + (d.sdp.length - bad) + ' email (1 per ID).' + (missPair.length ? ' Belum ada: ' + missPair.slice(0, 6).map(sdpPairTxt).join(', ') + (missPair.length > 6 ? ', dan lainnya' : '') + '. Tidak akan dikirim.' : '');
    } else {
      var rows = leaderRows(P.jenis);
      var kosong = rows.filter(function (r) { return !splitEmails(r.to).length; });
      bad = kosong.length;
      var tersimpan = rows.filter(function (r) { return r.sumber === 'tersimpan'; }).length;
      txt = rows.length + ' email ' + (P.jenis === 'hor' ? 'Head of Region (1 per region)' : 'Head of Area (1 per area, isi khusus area tersebut)') + '. Penerima diambil dari Master_Mapping' + (tersimpan ? ', ' + tersimpan + ' di antaranya memakai alamat yang sudah kamu simpan' : '') + '. Ubah To/Cc di daftar bawah lalu klik Simpan.' + (bad ? ' To masih kosong untuk: ' + kosong.map(function (r) { return title(r.kunci); }).join(', ') + '.' : '');
    }
    box.className = 'pf-match ' + (bad ? 'pf-bg-r' : 'pf-bg-g');
    box.textContent = txt;
  }

  // Daftar penerima Head of Region / Head of Area: bawaan dari Master_Mapping, bisa diedit
  // dan disimpan di SandraHub (rm_app_settings key perf_recipients_hor / perf_recipients_hoa).
  // Alamat yang tersimpan dipakai terus sampai diubah lagi atau dikembalikan ke Master_Mapping.
  P.saved = { hor: [], hoa: [] };
  P.edit = { hor: null, hoa: null };
  function leaderDefault(kind, key) {
    var d = P.data;
    if (kind === 'hor') {
      var m = d.hor[norm(key)];
      var to = m ? splitEmails(m.EMAIL_TO) : [];
      var cc = regionCc(key).concat(m ? splitEmails(m.EMAIL_CC) : []).filter(function (e) { return to.map(function (x) { return x.toLowerCase(); }).indexOf(e.toLowerCase()) < 0; });
      return { kunci: key, nama: m ? title(m.PARTNER_NAME) : '', to: to.join('; '), cc: Array.from(new Set(cc)).join('; '), sumber: 'mapping' };
    }
    var area = d.areas.filter(function (a) { return norm(a.nama) === norm(key); })[0];
    var hm = d.hoaMap[norm(key)], hor = area ? leaderRowRaw('hor', area.REGION) : null;
    var cc2 = (hm ? splitEmails(hm.EMAIL_CC) : []).concat(hor ? splitEmails(hor.to) : []);
    return { kunci: key, nama: hm ? title(hm.PARTNER_NAME) : '', to: hm ? splitEmails(hm.EMAIL_TO).join('; ') : '', cc: Array.from(new Set(cc2)).join('; '), sumber: 'mapping' };
  }
  function leaderRowRaw(kind, key) {
    var sv = (P.saved[kind] || []).filter(function (r) { return norm(r.kunci) === norm(key); })[0];
    return sv ? { kunci: key, nama: sv.nama || '', to: sv.to || '', cc: sv.cc || '', sumber: 'tersimpan' } : leaderDefault(kind, key);
  }
  function leaderKeys(kind) { return kind === 'hor' ? P.data.regionNames.slice() : P.data.areas.slice().sort(function (a, b) { return norm(a.REGION).localeCompare(norm(b.REGION)) || a.nama.localeCompare(b.nama); }).map(function (a) { return a.nama; }); }
  function leaderRows(kind) {
    if (!P.edit[kind]) P.edit[kind] = leaderKeys(kind).map(function (k) { return leaderRowRaw(kind, k); });
    return P.edit[kind];
  }
  function leaderRow(kind, key) { return leaderRows(kind).filter(function (r) { return norm(r.kunci) === norm(key); })[0] || leaderDefault(kind, key); }

  function renderHoaEditor() {
    var host = document.getElementById('pfHoa');
    if (!host) return;
    var kind = P.jenis;
    if (!P.data || (kind !== 'hor' && kind !== 'hoa')) { host.style.display = 'none'; return; }
    host.style.display = '';
    var rows = leaderRows(kind);
    var area = kind === 'hoa';
    host.innerHTML = '<div class="field-group-label">' + (area ? 'Penerima Head of Area (per area)' : 'Penerima Head of Region (per region)') + '</div><div class="group-box pf-hoa"><div class="pf-scroll" style="max-height:360px;"><table class="pf-tbl"><thead><tr><th>' + (area ? 'Area' : 'Region') + '</th><th>Nama</th><th>To</th><th>Cc</th><th>Sumber</th></tr></thead><tbody>'
      + rows.map(function (h, i) {
        return '<tr data-i="' + i + '"><td>' + esc(title(h.kunci)) + '</td><td><input data-f="nama" value="' + esc(h.nama) + '"></td><td><input data-f="to" value="' + esc(h.to) + '"></td><td><input data-f="cc" value="' + esc(h.cc) + '" placeholder="pisahkan dengan ;"></td><td class="hint" style="margin:0;">' + (h.sumber === 'tersimpan' ? 'Tersimpan' : h.sumber === 'diubah' ? '<b style="color:var(--warn-ink);">Diubah (belum disimpan)</b>' : 'Master_Mapping') + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      + '<div class="actions" style="justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px;"><span class="token-hint" style="margin:0;">Alamat yang disimpan tersimpan di SandraHub dan dipakai lagi di kiriman berikutnya, menggantikan Master_Mapping untuk ' + (area ? 'area' : 'region') + ' tersebut.</span>'
      + '<span style="display:flex;gap:8px;"><button class="btn btn-secondary" type="button" id="pfLeadReset">↺ Kembalikan ke Master_Mapping</button><button class="btn btn-primary" type="button" id="pfLeadSave">💾 Simpan</button></span></div></div>';
    host.querySelectorAll('input').forEach(function (inp) {
      inp.oninput = function () {
        var r = rows[+inp.closest('tr').dataset.i];
        r[inp.dataset.f] = inp.value;
        r.sumber = 'diubah';
        var cell = inp.closest('tr').lastElementChild;
        cell.innerHTML = '<b style="color:var(--warn-ink);">Diubah (belum disimpan)</b>';
        renderMatchInfo();
      };
    });
    document.getElementById('pfLeadSave').onclick = function () { saveLeaders(kind); };
    document.getElementById('pfLeadReset').onclick = function () { resetLeaders(kind); };
  }

  async function loadSavedLeaders() {
    try {
      var res = await fetch('/api/perf-recipients');
      var data = await res.json();
      if (data.ok && data.recipients) {
        P.saved.hor = data.recipients.hor || [];
        P.saved.hoa = data.recipients.hoa || [];
        P.edit = { hor: null, hoa: null };
      }
    } catch (e) { /* tetap pakai Master_Mapping */ }
    renderHoaEditor();
    renderMatchInfo();
  }
  async function putLeaders(kind, rows) {
    var res = await fetch('/api/perf-recipients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kategori: kind, rows: rows }) });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'gagal menyimpan');
    return data.rows;
  }
  async function saveLeaders(kind) {
    var btn = document.getElementById('pfLeadSave');
    btn.disabled = true;
    try {
      // Simpan hanya baris yang berbeda dari Master_Mapping (atau yang memang sudah tersimpan).
      var rows = leaderRows(kind).filter(function (r) {
        var def = leaderDefault(kind, r.kunci);
        return r.sumber === 'tersimpan' || def.to !== r.to || def.cc !== r.cc || def.nama !== r.nama;
      }).map(function (r) { return { kunci: r.kunci, nama: r.nama, to: r.to, cc: r.cc }; });
      P.saved[kind] = await putLeaders(kind, rows);
      P.edit[kind] = null;
      toast('Penerima ' + (kind === 'hor' ? 'Head of Region' : 'Head of Area') + ' tersimpan (' + rows.length + ' diubah dari Master_Mapping).');
    } catch (e) {
      toast('Gagal menyimpan: ' + e.message);
    } finally { btn.disabled = false; }
    renderHoaEditor();
    renderMatchInfo();
  }
  async function resetLeaders(kind) {
    if (!confirm('Kembalikan semua alamat ' + (kind === 'hor' ? 'Head of Region' : 'Head of Area') + ' ke Master_Mapping? Alamat yang tersimpan akan dihapus.')) return;
    try {
      P.saved[kind] = await putLeaders(kind, []);
      P.edit[kind] = null;
      toast('Alamat dikembalikan ke Master_Mapping.');
    } catch (e) { toast('Gagal: ' + e.message); }
    renderHoaEditor();
    renderMatchInfo();
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
      + '<label data-j="hor"><input type="radio" name="pfJenis" value="hor"><b>Head of Region</b><small>1 email per region ke HOR (Master_Mapping): ringkasan &amp; insight, Internal Sales, MDI, SDP + lampiran 3 sheet.</small></label>'
      + '<label data-j="hoa"><input type="radio" name="pfJenis" value="hoa"><b>Head of Area</b><small>1 email per area ke HOA (Master_Mapping): ringkasan area, sales, MDI, SDP area itu + lampiran 3 sheet.</small></label>'
      + '<label data-j="is"><input type="radio" name="pfJenis" value="is"><b>Per Internal Sales</b><small>1 email per sales (DSO/DSP) berisi capaiannya sendiri. To/Cc dari Master_Mapping (TYPE INTERNAL SALES).</small></label>'
      + '<label data-j="mdi"><input type="radio" name="pfJenis" value="mdi"><b>Per MDI</b><small>1 email per partner, berisi semua area partner tersebut. To/Cc dari Master_Mapping (TYPE MDI).</small></label>'
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
    document.getElementById('perfClosing').value = 'Mohon dapat dijadikan perhatian dan ditindaklanjuti, khususnya untuk KPI yang belum mencapai target. Apabila ada pertanyaan terkait data di atas, silakan menghubungi kami.\n\nTerima kasih atas kerja samanya.\n\nWarm regards,\nSales & Distribution — Indosat Circle Sumatera';
    document.querySelectorAll('#pfJenis input').forEach(function (r) { r.onchange = function () { setJenis(r.value); }; });
    document.querySelector('#pfJenis input[value="hor"]').checked = true;
    setJenis('hor');
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
        document.getElementById('fileInfo').innerHTML = '<div class="filebar-group"><div class="filebar"><div><b>' + esc(file.name) + '</b>' + (d.tanggal ? ' · data per <b>' + esc(tanggalTxt()) + '</b>' : '') + '</div>'
          + '<div class="stat">' + (d.people ? d.people.length + ' sales · ' : '') + d.regions.length + ' region · ' + d.areas.length + ' area · ' + d.clusters.length + ' cluster · ' + d.mdi.length + ' MDI · ' + d.sdpRows.length + ' SDP · ' + d.map.length + ' baris Master_Mapping</div></div></div>';
        var dz = document.getElementById('dropzone');
        dz.classList.add('has-file');
        var cta = dz.querySelector('.cta');
        if (cta) cta.textContent = 'Klik untuk ganti file';
        document.getElementById('rawPreviewWrap').innerHTML = '';
        document.getElementById('step1Actions').style.display = 'flex';
        var t = d.tanggal || new Date();
        document.getElementById('perfPeriode').value = t.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        renderDashboard();
        P.edit = { hor: null, hoa: null };
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
    var label = { hor: 'Head of Region', hoa: 'Head of Area', is: 'Internal Sales', mdi: 'MDI', sdp: 'SDP' }[P.jenis];
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

  var origArchivePayload = window.buildRecipientArchivePayload;
  window.buildRecipientArchivePayload = function (group, status, err) {
    var o = origArchivePayload(group, status, err);
    var uji = splitEmails(P.sampleTo || '');
    if (uji.length) { o.emails = uji.join('; '); o.ccs = ''; o.subject = '[UJI] ' + o.subject; }
    return o;
  };
  var origSendGroup = window.sendGroupViaResend;
  window.sendGroupViaResend = async function (group) {
    var uji = splitEmails(P.sampleTo || '');
    if (uji.length) {
      // Mode sampling: kirim ke alamat uji saja, tanpa Cc, subjek diberi tanda [UJI].
      var salin = Object.assign({}, group, { emails: uji, ccs: [], perf: Object.assign({}, group.perf, { subject: '[UJI] ' + group.perf.subject }) });
      return origSendGroup(salin);
    }
    if (group.unmatched) throw new Error(group.unmatchedWhy || 'Penerima belum ada.');
    return origSendGroup(group);
  };

  window.confirmSendAll = function () {
    var siap = splitEmails(P.sampleTo || '').length ? state.groups.slice() : state.groups.filter(function (g) { return !g.unmatched; });
    var lewat = state.groups.length - siap.length;
    if (!siap.length) { toast('Belum ada penerima yang punya alamat To.'); return; }
    if (splitEmails(P.sampleTo || '').length) {
      document.getElementById('confirmText').textContent = 'MODE SAMPLING: ' + siap.length + ' email ' + state.narrative.judul + ' akan dikirim HANYA ke ' + P.sampleTo + ' (tanpa Cc, subjek [UJI]). Penerima asli tidak menerima apa pun. Lanjutkan?';
      document.getElementById('confirmModal').style.display = 'flex';
      document.getElementById('confirmModalOk').onclick = function () { closeConfirmModal(); startSendRun(siap, false); };
      return;
    }
    document.getElementById('confirmText').textContent = 'Kamu akan MENGIRIM LANGSUNG ' + siap.length + ' email ' + state.narrative.judul + ', masing-masing ke penerimanya sendiri.'
      + (lewat ? ' ' + lewat + ' penerima tanpa alamat (belum ada di Master_Mapping) DILEWATI.' : '')
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
    if (g && g.unmatched && !splitEmails(P.sampleTo || '').length) document.getElementById('mailCard').insertAdjacentHTML('afterbegin', '<div class="pf-warn">' + esc(g.unmatchedWhy) + ' Isi alamat To di bawah, atau email ini tidak akan dikirim.</div>');
    if (g) renderRecipientEditor(g);
    var xs = document.querySelector('#mailCard .xlsx-sub');
    if (xs && g && g.perf) xs.textContent = 'Excel · ' + g.perf.sheets.map(function (s) { return s[0] + ' (' + s[1].length + ')'; }).join(' · ');
  };

  // Edit To/Cc per email sebelum kirim + mode sampling (kirim semua ke alamat uji).
  function renderRecipientEditor(g) {
    var host = document.getElementById('pfRcptEdit');
    if (!host) {
      host = document.createElement('div');
      host.id = 'pfRcptEdit';
      host.className = 'pf-edit';
      var card = document.getElementById('mailCard');
      card.parentNode.insertBefore(host, card);
    }
    var uji = P.sampleTo || '';
    host.innerHTML = '<div class="pf-edit-row"><label>🧪 Mode sampling</label><input id="pfSample" type="text" value="' + esc(uji) + '" placeholder="isi email uji, mis. emailmu sendiri">'
      + '<span class="token-hint" style="margin:0;">' + (splitEmails(uji).length ? '<b style="color:var(--bad-ink);">AKTIF:</b> semua email (satu atau semua penerima) dikirim HANYA ke alamat ini, tanpa Cc, subjek diawali [UJI].' : 'Kosongkan untuk kirim ke penerima asli.') + '</span></div>'
      + '<div class="pf-edit-row"><label>To</label><input id="pfEditTo" type="text" value="' + esc(g.emails.join('; ')) + '"></div>'
      + '<div class="pf-edit-row"><label>Cc</label><input id="pfEditCc" type="text" value="' + esc(g.ccs.join('; ')) + '"></div>'
      + '<div class="token-hint" style="margin:2px 0 0 0;">To/Cc di atas bisa diedit untuk email yang sedang ditampilkan (hanya untuk kiriman ini, Master_Mapping tidak berubah). Pisahkan beberapa alamat dengan <code>;</code>.</div>';
    var apply = function () {
      g.emails = splitEmails(document.getElementById('pfEditTo').value);
      g.ccs = splitEmails(document.getElementById('pfEditCc').value);
      g.unmatched = !g.emails.length;
      if (!g.unmatched) g.unmatchedWhy = '';
      else if (!g.unmatchedWhy) g.unmatchedWhy = 'Alamat To kosong.';
      renderRecipientList();
      renderMailCard();
    };
    document.getElementById('pfEditTo').onchange = apply;
    document.getElementById('pfEditCc').onchange = apply;
    document.getElementById('pfSample').onchange = function (e) { P.sampleTo = e.target.value.trim(); renderMailCard(); };
  }

  /* ======================= Mulai ======================= */
  function init() {
    applyLabels();
    buildStep1();
    buildStep2();
    renderStepsNav();
    loadSavedLeaders();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
