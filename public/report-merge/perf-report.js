/*
 * perf-report.js — menu "Performance Report" di Smart Mail Sumatera.
 *
 * Halaman ini = Blast Email Report yang sama persis (index.html), dibuka
 * dengan ?flow=performance. Tampilan, preview, lampiran Excel, jeda/batal,
 * kirim ulang yang gagal, preset dan arsip semuanya memakai kode Blast Email
 * Report. Skrip ini cuma menambah:
 *   1. Kategori penerima (Internal Sales / MDI / SDP), ditebak dari nama sheet.
 *   2. Kolom kunci (Nama Sales / Nama MDI / ID SDP) menggantikan kolom To/Cc
 *      di Excel: alamat To & Cc diambil dari "Daftar Penerima" yang disimpan
 *      di SandraHub (/api/report-merge/perf-recipients).
 *   3. Isian Periode (token {periode}).
 *   4. Penerima yang kuncinya belum ada di Daftar Penerima ditandai merah dan
 *      tidak ikut dikirim.
 * Di luar ?flow=performance skrip ini tidak melakukan apa-apa, jadi Blast
 * Email Report tidak berubah.
 */
(function () {
  if (new URLSearchParams(location.search).get('flow') !== 'performance') return;

  var KATEGORI = [
    { id: 'internal_sales', label: 'Internal Sales', kunciLabel: 'Nama Sales', sheetRe: /internal|sales/i, kolomRe: [/nama.*sales|sales.*name|^sales$/i, /nama/i, /name/i] },
    { id: 'mdi', label: 'MDI', kunciLabel: 'Nama MDI', sheetRe: /mdi|mpc|partner/i, kolomRe: [/nama.*(mdi|partner)|(mdi|partner).*name|^mdi$|^partner$/i, /mdi|partner/i, /nama|name/i] },
    { id: 'sdp', label: 'SDP', kunciLabel: 'ID SDP', sheetRe: /sdp|kiosk/i, kolomRe: [/id.*sdp|sdp.*id|id.*mitra|kode.*sdp/i, /^id$|\bid\b/i, /sdp/i] },
  ];
  var byId = function (id) { return KATEGORI.filter(function (k) { return k.id === id; })[0] || KATEGORI[0]; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var normKunci = function (s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase(); };
  var splitEmails = function (s) { return String(s == null ? '' : s).split(/[;,\s]+/).map(function (e) { return e.trim(); }).filter(Boolean); };

  var perf = {
    kategori: 'internal_sales',
    recipients: { internal_sales: [], mdi: [], sdp: [] },
    loaded: false,
    loadError: '',
    modalKategori: 'internal_sales',
    modalRows: [],
    modalDirty: false,
  };
  window.__perfReport = perf;

  /* ---------- Gaya tambahan (memakai variabel tema index.html) ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '.perf-kat{ display:flex; gap:6px; flex-wrap:wrap; }',
    '.perf-kat button{ font:inherit; font-size:13px; font-weight:600; padding:8px 14px; border-radius:10px; border:1px solid var(--line); background:var(--surf2); color:var(--ink2); cursor:pointer; }',
    '.perf-kat button.active{ border-color:var(--teal); color:var(--teal); background:var(--surf); box-shadow:0 0 0 2px color-mix(in srgb, var(--teal) 25%, transparent); }',
    '.perf-match{ margin-top:10px; font-size:12.5px; line-height:1.55; padding:9px 12px; border-radius:10px; border:1px solid var(--line); background:var(--surf2); color:var(--ink2); }',
    '.perf-match.ok{ color:var(--good-ink); background:var(--good-bg); border-color:var(--good-bd); }',
    '.perf-match.bad{ color:var(--bad-ink); background:var(--bad-bg); border-color:var(--bad-bd); }',
    '.perf-warn{ margin:0 0 12px; padding:10px 14px; border-radius:10px; font-size:13px; line-height:1.5; color:var(--bad-ink); background:var(--bad-bg); border:1px solid var(--bad-bd); }',
    '.recipient-item.perf-unmatched .rname{ color:var(--bad-ink); }',
    '.perf-dir-tools{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:12px 0; }',
    '.perf-dir-wrap{ max-height:46vh; overflow:auto; border:1px solid var(--line); border-radius:10px; }',
    '.perf-dir{ width:100%; border-collapse:collapse; font-size:12.5px; }',
    '.perf-dir th{ position:sticky; top:0; z-index:1; background:var(--surf2); text-align:left; padding:8px; font-family:var(--font-brand); font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink2); border-bottom:1px solid var(--line); }',
    '.perf-dir td{ padding:4px 6px; border-bottom:1px solid var(--line); vertical-align:top; }',
    '.perf-dir input{ width:100%; min-width:90px; font:inherit; font-size:12.5px; padding:6px 8px; border-radius:7px; border:1px solid var(--line); background:var(--surf); color:var(--ink); }',
    '.perf-dir td.del{ width:34px; text-align:center; }',
    '.perf-dir td.del button{ border:none; background:none; cursor:pointer; color:var(--muted); font-size:15px; padding:6px; }',
    '.perf-dir td.del button:hover{ color:var(--bad-ink); }',
    '.perf-dir .perf-empty{ padding:18px; text-align:center; color:var(--muted); }',
    '.perf-modal-box{ width:min(980px, 94vw); }',
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- API daftar penerima ---------- */
  async function loadRecipients() {
    try {
      var res = await fetch('/api/perf-recipients');
      var data = await res.json();
      if (!data.ok) throw new Error(data.error || 'gagal memuat');
      perf.recipients = data.recipients || perf.recipients;
      perf.loaded = true;
      perf.loadError = '';
    } catch (e) {
      perf.loadError = e.message;
    }
    renderMatchInfo();
  }
  async function saveRecipients(kategori, rows) {
    var res = await fetch('/api/perf-recipients', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kategori: kategori, rows: rows }),
    });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'gagal menyimpan');
    perf.recipients[kategori] = data.rows;
    return data.rows;
  }
  function lookup(kategori, kunci) {
    var k = normKunci(kunci);
    var list = perf.recipients[kategori] || [];
    for (var i = 0; i < list.length; i++) if (normKunci(list[i].kunci) === k) return list[i];
    return null;
  }

  /* ---------- Teks & tampilan halaman ---------- */
  function applyLabels() {
    document.title = 'Performance Report — Sales & Distribution Sumatera';
    var sub = document.getElementById('appSubtitle');
    if (sub) sub.textContent = 'Performance Report — laporan performa ke Internal Sales, MDI & SDP';
    var btn = document.getElementById('modeBtnEmail');
    if (btn) { var sp = btn.querySelector('span'); if (sp) sp.textContent = 'Performance Report'; }
  }

  function buildStep1Ui() {
    var hint = document.querySelector('#step1 > p.hint');
    if (hint) hint.innerHTML = 'Unggah file Excel performa. Formatnya 1 file dengan sheet <b>Internal Sales</b>, <b>MDI</b>, dan <b>SDP</b>. Tiap baris = performa 1 orang/partner, dengan 1 kolom kunci (Nama Sales / Nama MDI / ID SDP). Kategori penerima otomatis mengikuti nama sheet yang dipilih. Alamat To &amp; Cc tidak perlu ada di Excel, karena diambil dari Daftar Penerima.';
    var actions = document.createElement('div');
    actions.className = 'perf-dir-tools';
    actions.innerHTML = '<button class="btn btn-secondary" type="button" id="perfBtnContoh">⬇ Unduh contoh Excel</button>'
      + '<button class="btn btn-secondary" type="button" id="perfBtnDir1">📇 Daftar Penerima</button>';
    var dz = document.getElementById('dropzone');
    dz.parentNode.insertBefore(actions, dz);
    document.getElementById('perfBtnContoh').onclick = unduhContohData;
    document.getElementById('perfBtnDir1').onclick = function () { openDirModal(perf.kategori); };
  }

  function buildStep2Ui() {
    var fieldOf = function (id) { var el = document.getElementById(id); return el && el.closest('.field'); };
    // To & Cc tidak dari Excel lagi -> sembunyikan.
    [fieldOf('mapEmail'), fieldOf('mapCC')].forEach(function (f) { if (f) f.style.display = 'none'; });

    var groupField = fieldOf('mapGroup');
    var groupLabel = groupField.querySelector('.field-label');
    groupLabel.id = 'perfKunciLabel';
    var groupHint = groupField.querySelector('.token-hint');
    if (groupHint) groupHint.textContent = '1 nilai unik di kolom ini = 1 email. Nilainya dicocokkan dengan kolom Kunci di Daftar Penerima (huruf besar/kecil tidak berpengaruh).';

    var kat = document.createElement('div');
    kat.className = 'field';
    kat.innerHTML = '<label class="field-label">Kategori penerima</label>'
      + '<div class="perf-kat" id="perfKat">' + KATEGORI.map(function (k) {
        return '<button type="button" data-kat="' + k.id + '">' + esc(k.label) + '</button>';
      }).join('') + '</div>'
      + '<div class="token-hint">Ditebak otomatis dari nama sheet. Alamat To &amp; Cc diambil dari Daftar Penerima kategori ini.</div>';
    groupField.parentNode.insertBefore(kat, groupField);
    kat.querySelectorAll('[data-kat]').forEach(function (b) {
      b.onclick = function () { setKategori(b.dataset.kat, true); };
    });

    var match = document.createElement('div');
    match.className = 'field';
    match.innerHTML = '<label class="field-label">Penerima (To &amp; Cc)</label>'
      + '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-secondary" type="button" id="perfBtnDir2">📇 Buka Daftar Penerima</button></div>'
      + '<div class="perf-match" id="perfMatch">Memuat Daftar Penerima…</div>';
    groupField.parentNode.insertBefore(match, groupField.nextSibling);
    document.getElementById('perfBtnDir2').onclick = function () { openDirModal(perf.kategori); };
    document.getElementById('mapGroup').addEventListener('change', function () {
      // Kolom sapaan ikut kolom kunci, kecuali sudah dipilih lain secara sengaja.
      renderMatchInfo();
    });

    var nameField = fieldOf('mapName');
    if (nameField) {
      var nl = nameField.querySelector('.field-label');
      if (nl) nl.textContent = 'Kolom nama untuk sapaan {nama}';
      var nh = document.createElement('div');
      nh.className = 'token-hint';
      nh.textContent = 'Kalau kuncinya ID SDP, pilih kolom nama SDP di sini supaya sapaannya pakai nama, bukan ID.';
      nameField.appendChild(nh);
    }

    // Isian periode (token {periode}).
    var judul = document.getElementById('narJudul');
    var judulField = judul.closest('.field');
    var per = document.createElement('div');
    per.className = 'field';
    per.innerHTML = '<label class="field-label">Periode laporan</label>'
      + '<input type="text" id="perfPeriode" placeholder="mis. Oktober 2026">'
      + '<div class="token-hint">Mengisi token <code>{periode}</code> di subjek dan narasi. Kosongkan untuk deteksi otomatis dari kolom tanggal.</div>';
    judulField.parentNode.insertBefore(per, judulField);
    var bulan = new Date(); bulan.setMonth(bulan.getMonth() - 1);
    document.getElementById('perfPeriode').value = bulan.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    // Narasi bawaan khusus Performance Report.
    judul.value = 'Performance Report {periode}';
    document.getElementById('narIntro').value = 'Yth. Bapak/Ibu {nama},\n\nBerikut kami sampaikan Performance Report periode {periode}, dengan rincian sebagai berikut:';
    document.getElementById('narClosing').value = 'Mohon dapat dijadikan perhatian dan ditindaklanjuti. Apabila terdapat pertanyaan terkait data di atas, silakan menghubungi kami.\n\nTerima kasih atas kerja samanya.\n\nWarm regards,\nSales & Distribution — Indosat Circle Sumatera';
    var hint2 = document.querySelector('#step2 > p.hint');
    if (hint2) hint2.textContent = 'Pilih kategori penerima dan kolom kunci. Baris-baris dengan kunci yang sama digabung jadi 1 email berisi tabel performa miliknya sendiri (plus lampiran Excel berisi baris yang sama). Alamat To & Cc diambil dari Daftar Penerima.';
    setKategori(perf.kategori, false);
  }

  function setKategori(id, userAction) {
    perf.kategori = byId(id).id;
    document.querySelectorAll('#perfKat [data-kat]').forEach(function (b) { b.classList.toggle('active', b.dataset.kat === perf.kategori); });
    var lbl = document.getElementById('perfKunciLabel');
    if (lbl) lbl.textContent = 'Kolom kunci (' + byId(perf.kategori).kunciLabel + ')';
    if (userAction) guessKunciColumn();
    renderMatchInfo();
  }

  function guessKunciColumn() {
    var cols = (state.columns || []);
    if (!cols.length) return;
    var k = byId(perf.kategori);
    for (var i = 0; i < k.kolomRe.length; i++) {
      var hit = cols.filter(function (c) { return k.kolomRe[i].test(c); })[0];
      if (hit) {
        document.getElementById('mapGroup').value = hit;
        if (perf.kategori !== 'sdp') document.getElementById('mapName').value = hit;
        else {
          var nm = cols.filter(function (c) { return /nama|name/i.test(c); })[0];
          if (nm) document.getElementById('mapName').value = nm;
        }
        return;
      }
    }
  }

  function kunciUnik() {
    var col = document.getElementById('mapGroup').value;
    var seen = new Map();
    (state.rows || []).forEach(function (r) {
      var v = String(r[col] == null ? '' : r[col]).trim();
      if (v && !seen.has(normKunci(v))) seen.set(normKunci(v), v);
    });
    return Array.from(seen.values());
  }

  function renderMatchInfo() {
    var box = document.getElementById('perfMatch');
    if (!box) return;
    if (perf.loadError) { box.className = 'perf-match bad'; box.textContent = 'Daftar Penerima gagal dimuat: ' + perf.loadError; return; }
    if (!perf.loaded) { box.className = 'perf-match'; box.textContent = 'Memuat Daftar Penerima…'; return; }
    var total = (perf.recipients[perf.kategori] || []).length;
    var label = byId(perf.kategori).label;
    if (!state.rows || !state.rows.length) {
      box.className = 'perf-match';
      box.textContent = 'Daftar Penerima ' + label + ': ' + total + ' orang/partner tersimpan.';
      return;
    }
    var keys = kunciUnik();
    var miss = keys.filter(function (k) { return !lookup(perf.kategori, k); });
    if (!miss.length) {
      box.className = 'perf-match ok';
      box.textContent = 'Semua ' + keys.length + ' kunci cocok dengan Daftar Penerima ' + label + '.';
    } else {
      box.className = 'perf-match bad';
      box.innerHTML = '<b>' + (keys.length - miss.length) + ' dari ' + keys.length + '</b> kunci cocok. Belum ada di Daftar Penerima ' + esc(label) + ' (tidak akan dikirim): '
        + esc(miss.slice(0, 12).join(', ')) + (miss.length > 12 ? ', …dan ' + (miss.length - 12) + ' lainnya' : '')
        + '. <a href="#" id="perfAddMissing">Tambahkan ke Daftar Penerima</a>';
      document.getElementById('perfAddMissing').onclick = function (e) { e.preventDefault(); openDirModal(perf.kategori, miss); };
    }
  }

  /* ---------- Hook ke fungsi Blast Email Report ---------- */
  var origSwitch = window.switchAppMode;
  window.switchAppMode = function (mode) { origSwitch(mode); applyLabels(); };

  var origLoadSheet = window.loadSheet;
  window.loadSheet = function (sheetName) {
    origLoadSheet(sheetName);
    var k = KATEGORI.filter(function (x) { return x.sheetRe.test(sheetName || ''); })[0];
    if (k) perf.kategori = k.id;
    setKategori(perf.kategori, true);
  };

  function resolveGroup(g) {
    var hit = lookup(perf.kategori, g.key);
    g.emails = hit ? splitEmails(hit.to) : [];
    g.ccs = hit ? splitEmails(hit.cc) : [];
    g.unmatched = !hit || !g.emails.length;
    return g;
  }

  var origBuild = window.buildGroupsAndGoStep3;
  window.buildGroupsAndGoStep3 = function () {
    if (!perf.loaded) { toast(perf.loadError ? 'Daftar Penerima gagal dimuat: ' + perf.loadError : 'Daftar Penerima masih dimuat, coba lagi sebentar.'); return; }
    origBuild();
    if (!state.groups || !state.groups.length) return;
    var p = document.getElementById('perfPeriode').value.trim();
    if (p) state.narrative.periode = p;
    state.narrative.kategori = perf.kategori;
    state.groups.forEach(resolveGroup);
    // Yang belum punya penerima ditaruh paling atas supaya langsung terlihat.
    state.groups.sort(function (a, b) { return (b.unmatched ? 1 : 0) - (a.unmatched ? 1 : 0); });
    state.activeIndex = 0;
    renderRecipientList();
    renderMailCard();
  };

  var origRenderList = window.renderRecipientList;
  window.renderRecipientList = function () {
    origRenderList();
    // Tandai penerima yang belum ada di Daftar Penerima (urutan DOM = urutan hasil filter).
    var filter = (state.recipientFilter || '').trim().toLowerCase();
    var shown = state.groups.filter(function (g) { return !filter || g.name.toLowerCase().indexOf(filter) >= 0; });
    var items = document.querySelectorAll('#recipientItems .recipient-item');
    items.forEach(function (el, i) {
      var g = shown[i];
      if (!g || !g.unmatched || sendStatus.get(g.key)) return;
      el.classList.add('perf-unmatched');
      var top = el.querySelector('.rtop');
      if (top) top.insertAdjacentHTML('beforeend', '<span class="rstatus err">Belum ada penerima</span>');
    });
    var unmatched = state.groups.filter(function (g) { return g.unmatched; }).length;
    if (unmatched) {
      var head = document.getElementById('recipientCount');
      head.textContent += ' · ' + unmatched + ' belum ada penerima';
    }
  };

  var origRenderCard = window.renderMailCard;
  window.renderMailCard = function () {
    origRenderCard();
    var g = state.groups[state.activeIndex];
    if (g && g.unmatched) {
      document.getElementById('mailCard').insertAdjacentHTML('afterbegin',
        '<div class="perf-warn" style="margin:14px 20px 0;">Kunci <b>' + esc(g.key) + '</b> belum ada di Daftar Penerima ' + esc(byId(perf.kategori).label)
        + ' (atau To-nya kosong), jadi email ini tidak bisa dikirim. <a href="#" id="perfAddOne">Tambahkan sekarang</a></div>');
      document.getElementById('perfAddOne').onclick = function (e) { e.preventDefault(); openDirModal(perf.kategori, [g.key]); };
    }
  };

  var origSendGroup = window.sendGroupViaResend;
  window.sendGroupViaResend = async function (group) {
    resolveGroup(group); // ambil alamat terbaru dari Daftar Penerima
    if (group.unmatched) throw new Error('Kunci "' + group.key + '" belum ada di Daftar Penerima ' + byId(perf.kategori).label + '.');
    return origSendGroup(group);
  };

  window.confirmSendAll = function () {
    state.groups.forEach(resolveGroup);
    var siap = state.groups.filter(function (g) { return !g.unmatched; });
    var lewat = state.groups.length - siap.length;
    if (!siap.length) { toast('Belum ada penerima yang cocok dengan Daftar Penerima.'); return; }
    document.getElementById('confirmText').textContent =
      'Kamu akan MENGIRIM LANGSUNG ' + siap.length + ' Performance Report ' + byId(perf.kategori).label + ', masing-masing ke penerimanya sendiri (To & Cc dari Daftar Penerima).'
      + (lewat ? ' ' + lewat + ' penerima yang belum ada di Daftar Penerima DILEWATI.' : '')
      + ' Kalau di tengah jalan berubah pikiran, ada tombol "Jeda". Lanjutkan?';
    document.getElementById('confirmModal').style.display = 'flex';
    document.getElementById('confirmModalOk').onclick = function () {
      closeConfirmModal();
      startSendRun(siap, false);
    };
  };

  /* ---------- Modal Daftar Penerima ---------- */
  function buildDirModal() {
    var wrap = document.createElement('div');
    wrap.id = 'perfDirModal';
    wrap.className = 'modal-overlay';
    wrap.style.display = 'none';
    wrap.innerHTML = '<div class="modal-box perf-modal-box">'
      + '<h3 style="margin-top:0;">📇 Daftar Penerima Performance Report</h3>'
      + '<p class="modal-hint">Diisi sekali, dipakai setiap kirim. <b>Kunci</b> harus sama dengan isi kolom kunci di Excel performa (Nama Sales / Nama MDI / ID SDP). Lebih dari satu email dipisah dengan <code>;</code>. Tersimpan di server SandraHub.</p>'
      + '<div class="perf-kat" id="perfDirKat">' + KATEGORI.map(function (k) { return '<button type="button" data-kat="' + k.id + '">' + esc(k.label) + '</button>'; }).join('') + '</div>'
      + '<div class="perf-dir-tools">'
      + '<button class="btn btn-secondary" type="button" id="perfDirAdd">＋ Tambah baris</button>'
      + '<button class="btn btn-secondary" type="button" id="perfDirImport">⬆ Import Excel</button>'
      + '<button class="btn btn-secondary" type="button" id="perfDirTemplate">⬇ Unduh template</button>'
      + '<button class="btn btn-secondary" type="button" id="perfDirExport">⬇ Unduh daftar ini</button>'
      + '<input type="text" class="rl-search" id="perfDirSearch" placeholder="🔍 Cari…" style="flex:1; min-width:160px; margin:0;">'
      + '<input type="file" id="perfDirFile" accept=".xlsx,.xls,.csv" style="display:none;">'
      + '</div>'
      + '<div class="perf-dir-wrap"><table class="perf-dir"><thead><tr><th id="perfDirKunciTh">Kunci</th><th>Nama (opsional)</th><th>To</th><th>Cc</th><th></th></tr></thead><tbody id="perfDirBody"></tbody></table></div>'
      + '<div class="modal-error" id="perfDirError" style="white-space:pre-line;"></div>'
      + '<div class="actions" style="margin-top:16px;">'
      + '<span class="hint" id="perfDirCount" style="margin-right:auto;"></span>'
      + '<button class="btn btn-secondary" type="button" id="perfDirClose">Tutup</button>'
      + '<button class="btn btn-primary" type="button" id="perfDirSave">Simpan</button>'
      + '</div></div>';
    document.body.appendChild(wrap);

    wrap.querySelectorAll('#perfDirKat [data-kat]').forEach(function (b) {
      b.onclick = function () {
        if (perf.modalDirty && !confirm('Perubahan di kategori ini belum disimpan. Buang perubahan?')) return;
        loadModalKategori(b.dataset.kat);
      };
    });
    document.getElementById('perfDirAdd').onclick = function () {
      perf.modalRows.unshift({ kunci: '', nama: '', to: '', cc: '' });
      perf.modalDirty = true;
      document.getElementById('perfDirSearch').value = '';
      renderDirRows();
      var first = document.querySelector('#perfDirBody input');
      if (first) first.focus();
    };
    document.getElementById('perfDirImport').onclick = function () { document.getElementById('perfDirFile').click(); };
    document.getElementById('perfDirFile').onchange = function (e) { if (e.target.files[0]) importDirExcel(e.target.files[0]); e.target.value = ''; };
    document.getElementById('perfDirTemplate').onclick = unduhTemplatePenerima;
    document.getElementById('perfDirExport').onclick = unduhDaftarIni;
    document.getElementById('perfDirSearch').oninput = renderDirRows;
    document.getElementById('perfDirClose').onclick = closeDirModal;
    document.getElementById('perfDirSave').onclick = saveDirModal;
  }

  function loadModalKategori(id) {
    perf.modalKategori = byId(id).id;
    perf.modalRows = (perf.recipients[perf.modalKategori] || []).map(function (r) { return { kunci: r.kunci, nama: r.nama || '', to: r.to || '', cc: r.cc || '' }; });
    perf.modalDirty = false;
    document.querySelectorAll('#perfDirKat [data-kat]').forEach(function (b) { b.classList.toggle('active', b.dataset.kat === perf.modalKategori); });
    document.getElementById('perfDirKunciTh').textContent = 'Kunci (' + byId(perf.modalKategori).kunciLabel + ')';
    document.getElementById('perfDirError').textContent = '';
    document.getElementById('perfDirSearch').value = '';
    renderDirRows();
  }

  function openDirModal(kategori, tambahKunci) {
    if (!perf.loaded) { toast(perf.loadError ? 'Daftar Penerima gagal dimuat: ' + perf.loadError : 'Daftar Penerima masih dimuat…'); return; }
    loadModalKategori(kategori || perf.kategori);
    if (tambahKunci && tambahKunci.length) {
      var ada = new Set(perf.modalRows.map(function (r) { return normKunci(r.kunci); }));
      var baru = tambahKunci.filter(function (k) { return !ada.has(normKunci(k)); }).map(function (k) { return { kunci: String(k), nama: '', to: '', cc: '' }; });
      perf.modalRows = baru.concat(perf.modalRows);
      if (baru.length) perf.modalDirty = true;
      renderDirRows();
    }
    document.getElementById('perfDirModal').style.display = 'flex';
    if (tambahKunci && tambahKunci.length) {
      var firstTo = document.querySelector('#perfDirBody input[data-f="to"]');
      if (firstTo) firstTo.focus();
    }
  }

  function closeDirModal() {
    if (perf.modalDirty && !confirm('Perubahan belum disimpan. Tutup tanpa menyimpan?')) return;
    perf.modalDirty = false;
    document.getElementById('perfDirModal').style.display = 'none';
  }

  function renderDirRows() {
    var q = (document.getElementById('perfDirSearch').value || '').trim().toLowerCase();
    var body = document.getElementById('perfDirBody');
    var html = '';
    perf.modalRows.forEach(function (r, i) {
      if (q && [r.kunci, r.nama, r.to, r.cc].join(' ').toLowerCase().indexOf(q) < 0) return;
      html += '<tr data-i="' + i + '">'
        + '<td><input data-f="kunci" value="' + esc(r.kunci) + '" placeholder="' + esc(byId(perf.modalKategori).kunciLabel) + '"></td>'
        + '<td><input data-f="nama" value="' + esc(r.nama) + '"></td>'
        + '<td><input data-f="to" value="' + esc(r.to) + '" placeholder="nama@contoh.com"></td>'
        + '<td><input data-f="cc" value="' + esc(r.cc) + '" placeholder="opsional; pisahkan dengan ;"></td>'
        + '<td class="del"><button type="button" title="Hapus baris">✕</button></td></tr>';
    });
    body.innerHTML = html || '<tr><td colspan="5" class="perf-empty">' + (q ? 'Tidak ada yang cocok dengan pencarian.' : 'Belum ada penerima. Klik "Tambah baris" atau "Import Excel".') + '</td></tr>';
    body.querySelectorAll('input').forEach(function (inp) {
      inp.oninput = function () {
        var i = +inp.closest('tr').dataset.i;
        perf.modalRows[i][inp.dataset.f] = inp.value;
        perf.modalDirty = true;
      };
    });
    body.querySelectorAll('td.del button').forEach(function (b) {
      b.onclick = function () {
        perf.modalRows.splice(+b.closest('tr').dataset.i, 1);
        perf.modalDirty = true;
        renderDirRows();
      };
    });
    document.getElementById('perfDirCount').textContent = perf.modalRows.length + ' penerima ' + byId(perf.modalKategori).label;
  }

  async function saveDirModal() {
    var btn = document.getElementById('perfDirSave');
    var err = document.getElementById('perfDirError');
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Menyimpan…';
    try {
      var rows = perf.modalRows.filter(function (r) { return String(r.kunci).trim() || String(r.to).trim(); });
      var saved = await saveRecipients(perf.modalKategori, rows);
      perf.modalDirty = false;
      loadModalKategori(perf.modalKategori);
      toast('Daftar Penerima ' + byId(perf.modalKategori).label + ' tersimpan (' + saved.length + ' penerima).');
      renderMatchInfo();
      if (state.groups && state.groups.length && document.getElementById('step3') && !document.getElementById('step3').classList.contains('step-hidden')) {
        state.groups.forEach(resolveGroup);
        renderRecipientList();
        renderMailCard();
      }
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Simpan';
    }
  }

  function cariKolom(cols, res) {
    for (var i = 0; i < res.length; i++) { var c = cols.filter(function (x) { return res[i].test(String(x).trim()); })[0]; if (c) return c; }
    return null;
  }

  function importDirExcel(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var masuk = 0, sheetDipakai = [];
        wb.SheetNames.forEach(function (sn) {
          var rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' });
          if (!rows.length) return;
          var cols = Object.keys(rows[0]);
          var cKat = cariKolom(cols, [/^kategori$/i]);
          var cKunci = cariKolom(cols, [/^kunci$/i, /^key$/i]);
          var cNama = cariKolom(cols, [/^nama$/i, /^name$/i]);
          var cTo = cariKolom(cols, [/^to$/i, /^email$/i, /^e-?mail.*to/i]);
          var cCc = cariKolom(cols, [/^cc$/i]);
          if (!cKunci || !cTo) return;
          var katSheet = KATEGORI.filter(function (k) { return k.sheetRe.test(sn); })[0];
          rows.forEach(function (r) {
            var katId = perf.modalKategori;
            if (cKat) {
              var k = KATEGORI.filter(function (x) { return x.label.toLowerCase() === String(r[cKat]).trim().toLowerCase() || x.id === String(r[cKat]).trim().toLowerCase(); })[0];
              if (!k) return;
              katId = k.id;
            } else if (katSheet && wb.SheetNames.length > 1) {
              katId = katSheet.id;
            }
            if (katId !== perf.modalKategori) return; // kategori lain diimport saat tab-nya dibuka
            var kunci = String(r[cKunci]).trim();
            if (!kunci) return;
            var row = { kunci: kunci, nama: cNama ? String(r[cNama]).trim() : '', to: String(r[cTo]).trim(), cc: cCc ? String(r[cCc]).trim() : '' };
            var idx = perf.modalRows.findIndex(function (x) { return normKunci(x.kunci) === normKunci(kunci); });
            if (idx >= 0) perf.modalRows[idx] = row; else perf.modalRows.push(row);
            masuk++;
            if (sheetDipakai.indexOf(sn) < 0) sheetDipakai.push(sn);
          });
        });
        if (!masuk) { toast('Tidak ada baris ' + byId(perf.modalKategori).label + ' yang terbaca. Pastikan ada kolom Kunci dan To (pakai "Unduh template").'); return; }
        perf.modalDirty = true;
        renderDirRows();
        toast(masuk + ' penerima ' + byId(perf.modalKategori).label + ' dimasukkan dari Excel. Klik Simpan untuk menyimpan.');
      } catch (err) {
        toast('Gagal membaca file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function simpanXlsx(wb, nama) { XLSX.writeFile(wb, nama); }

  function unduhTemplatePenerima() {
    var wb = XLSX.utils.book_new();
    var contoh = {
      internal_sales: [['Budi Santoso', 'Budi Santoso', 'budi@contoh.com', 'atasan.budi@contoh.com']],
      mdi: [['PT Mitra Contoh', 'PT Mitra Contoh', 'admin@mitra.com', 'pic.area@contoh.com; spv@contoh.com']],
      sdp: [['SDP001', 'Kios Maju Jaya', 'kiosmaju@contoh.com', '']],
    };
    KATEGORI.forEach(function (k) {
      var ws = XLSX.utils.aoa_to_sheet([['Kunci', 'Nama', 'To', 'Cc']].concat(contoh[k.id]));
      ws['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 30 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, ws, k.label);
    });
    simpanXlsx(wb, 'Template Daftar Penerima Performance Report.xlsx');
  }

  function unduhDaftarIni() {
    var k = byId(perf.modalKategori);
    var ws = XLSX.utils.aoa_to_sheet([['Kunci', 'Nama', 'To', 'Cc']].concat(perf.modalRows.map(function (r) { return [r.kunci, r.nama, r.to, r.cc]; })));
    ws['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 30 }, { wch: 40 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, k.label);
    simpanXlsx(wb, 'Daftar Penerima ' + k.label + '.xlsx');
  }

  function unduhContohData() {
    var wb = XLSX.utils.book_new();
    var sheets = {
      internal_sales: [['Nama Sales', 'Cluster', 'Target', 'Actual', 'Achievement %'], ['Budi Santoso', 'Medan Kota', 1000, 920, '92%']],
      mdi: [['Nama MDI', 'Cluster', 'Target', 'Actual', 'Achievement %'], ['PT Mitra Contoh', 'Pekanbaru', 5000, 5200, '104%']],
      sdp: [['ID SDP', 'Nama SDP', 'Cluster', 'Target', 'Actual', 'Achievement %'], ['SDP001', 'Kios Maju Jaya', 'Padang', 300, 270, '90%']],
    };
    KATEGORI.forEach(function (k) {
      var ws = XLSX.utils.aoa_to_sheet(sheets[k.id]);
      ws['!cols'] = sheets[k.id][0].map(function () { return { wch: 18 }; });
      XLSX.utils.book_append_sheet(wb, ws, k.label);
    });
    simpanXlsx(wb, 'Contoh Excel Performance Report.xlsx');
  }

  /* ---------- Mulai ---------- */
  function init() {
    applyLabels();
    buildStep1Ui();
    buildStep2Ui();
    buildDirModal();
    loadRecipients();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
