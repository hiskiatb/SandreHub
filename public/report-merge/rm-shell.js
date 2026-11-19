/*
 * rm-shell.js — kerangka bersama halaman Report Merge tambahan
 * (home.html, sdp.html, mdi.html): topbar + tombol menu, tema gelap/terang,
 * step rail, drag & drop file/folder, dan unduh contoh Excel.
 * Tampilan mengikuti index.html (CSS di rm-pages.css).
 *
 * Perpindahan menu: di dashboard SandraHub halaman-halaman ini dibuka di
 * iframe oleh ReportMerge_Module.jsx, jadi pindah menu dikirim lewat
 * postMessage({ rmOpen: 'home' | 'report' | 'sdp' | 'mdi', mode }). Kalau
 * halaman dibuka langsung (tanpa dashboard), cukup pindah URL.
 */
(function () {
  var URLS = { home: '/report-merge/home.html', email: '/report-merge/index.html', sdp: '/report-merge/sdp.html', mdi: '/report-merge/mdi.html' };
  var MENUS = [
    { id: 'email', label: 'Blast Email Report', title: 'Ubah satu file Excel jadi banyak email terpisah per penerima.' },
    { id: 'sdp', label: 'Partner SDP', title: 'Kirim surat PDF Partner SDP yang sudah jadi, 1 email per ID mitra.' },
    { id: 'mdi', label: 'Partner MDI', title: 'Kirim Surat + BAST Partner MDI yang sudah jadi, 1 email per partner + type.' },
  ];


  // Ikon khusus tiap menu (garis putih di atas ubin gradasi warna brand Indosat).
  var ICON_PATH = {
    // Amplop + grafik batang: laporan yang dikirim per email
    email: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3.8 7.2 12 13l8.2-5.8"/><path d="M8 19v-2.5M12 19v-4M16 19v-3"/>',
    // Kios/toko dengan kanopi: SDP & 3KIOSK
    sdp: '<path d="M4 10v9.5h16V10"/><path d="M3 10l1.6-5.5h14.8L21 10"/><path d="M3 10c0 1.4 1.1 2.5 2.5 2.5S8 11.4 8 10c0 1.4 1.1 2.5 2.5 2.5S13 11.4 13 10c0 1.4 1.1 2.5 2.5 2.5S18 11.4 18 10c0 1.4 1.1 2.5 2.5 2.5"/><path d="M10 19.5v-4.5h4v4.5"/>',
    // Gedung kantor + 2 dokumen (Surat & BAST): Mitra Pengelola Cluster
    mdi: '<path d="M4 20V5.5L11 3v17"/><path d="M11 9h5.5V20"/><path d="M6.5 7.5h2M6.5 11h2M6.5 14.5h2M13.5 12.5h1M13.5 15.5h1"/><path d="M3 20h18"/><path d="M17 14.5h3.5V20H17z"/>',
  };
  var ICON_BG = { email: ['#32BCAD', '#1E8C80'], sdp: ['#ED1C24', '#B3121A'], mdi: ['#EC008C', '#9E127A'] };
  /** Ikon menu sebagai ubin SVG. size dalam px. */
  function icon(id, size) {
    var c = ICON_BG[id], g = 'rmIco' + id + size;
    return '<svg class="rm-ico" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>'
      + '<rect width="24" height="24" rx="6.5" fill="url(#' + g + ')"/>'
      + '<g transform="translate(3 3) scale(.75)" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + ICON_PATH[id] + '</g></svg>';
  }

  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

  function buka(tujuan) {
    if (window.parent !== window) {
      window.parent.postMessage(tujuan === 'email' ? { rmOpen: 'report', mode: 'email' } : { rmOpen: tujuan }, location.origin);
    } else {
      location.href = URLS[tujuan];
    }
  }

  var LOGO = '<svg viewBox="0 0 36 36" width="36" height="36" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sales &amp; Distribution Sumatera">'
    + '<defs><linearGradient id="rmLogoGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#32BCAD"/><stop offset="100%" stop-color="#27A093"/></linearGradient></defs>'
    + '<rect width="36" height="36" rx="10" fill="url(#rmLogoGrad)"/><g stroke="#fff" stroke-width="3" stroke-linecap="round">'
    + '<line x1="10" y1="26" x2="10" y2="20"/><line x1="18" y1="26" x2="18" y2="15"/><line x1="26" y1="26" x2="26" y2="10"/></g></svg>';

  /** Pasang topbar (+ step rail kalau withSteps) di elemen #rmTopbar. active: 'home' | 'sdp' | 'mdi'. */
  function topbar(active, subtitle, withSteps) {
    var host = document.getElementById('rmTopbar');
    var html = '<div class="brand-bg" aria-hidden="true"></div>'
      + '<div class="topbar"><div class="brand"><div class="mark">' + LOGO + '</div><div>'
      + '<div class="title">Sales &amp; Distribution Sumatera</div><div class="subtitle">' + esc(subtitle) + '</div></div></div>'
      + '<div class="topbar-right">'
      + (active === 'home' ? '' : '<div class="mode-switch">' + MENUS.map(function (m) {
        return '<button class="mode-btn' + (m.id === active ? ' active' : '') + '" type="button" data-goto="' + m.id + '" title="' + esc(m.title) + '">' + icon(m.id, 18) + '<span>' + m.label + '</span></button>';
      }).join('') + '</div><span class="topbar-sep" aria-hidden="true"></span>')
      + '<div class="topbar-tools">'
      + (active === 'home' ? '' : '<button class="theme-toggle labeled" type="button" data-goto="home" title="Kembali ke halaman pilih menu Report Merge.">☰ Pilih menu</button>')
      + '<button class="theme-toggle" id="themeToggle" type="button" title="Ganti tampilan gelap/terang">🌙</button>'
      + '</div></div></div>'
      + (withSteps ? '<div class="steprail"><div class="steprail-inner" id="stepsNav"></div></div>' : '');
    host.outerHTML = html;
    document.querySelectorAll('[data-goto]').forEach(function (b) {
      if (b.classList.contains('active')) return;
      b.addEventListener('click', function () { buka(b.dataset.goto); });
    });
    // Tema disimpan bersama dengan index.html di localStorage 'rm-theme'.
    var ikon = function () {
      document.getElementById('themeToggle').textContent = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? '🌙' : '☀️';
    };
    document.getElementById('themeToggle').addEventListener('click', function () {
      var next = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('rm-theme', next); } catch (e) {}
      ikon();
    });
    window.addEventListener('storage', function (e) {
      if (e.key === 'rm-theme' && e.newValue) { document.documentElement.setAttribute('data-theme', e.newValue); ikon(); }
    });
    ikon();
  }

  /** steps: [[n, label, keterangan]], aktif: nomor tahap aktif. Klik tahap = gulir ke #panel<n>. */
  function renderSteps(steps, aktif) {
    var nav = document.getElementById('stepsNav');
    if (!nav) return;
    nav.innerHTML = '';
    steps.forEach(function (s, i) {
      var n = s[0];
      if (i > 0) {
        var line = document.createElement('div');
        line.className = 'stepline' + (n <= aktif ? ' done' : '');
        nav.appendChild(line);
      }
      var isDone = n < aktif;
      var el = document.createElement('div');
      el.className = 'stepnode' + (n === aktif ? ' active' : '') + (isDone ? ' done' : '');
      el.title = s[2];
      el.style.cursor = 'pointer';
      el.innerHTML = '<span class="stepnode-dot">' + (isDone ? '✓' : n) + '</span><span class="stepnode-label">' + esc(s[1]) + '</span>';
      el.onclick = function () {
        var p = document.getElementById('panel' + n);
        if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      nav.appendChild(el);
    });
  }

  /** Ambil daftar File dari drop (file biasa atau folder, termasuk sub-folder). */
  function ambilDrop(dt, cb) {
    var entries = dt.items ? Array.from(dt.items).map(function (it) { return it.webkitGetAsEntry && it.webkitGetAsEntry(); }).filter(Boolean) : [];
    if (!entries.length || !entries.some(function (en) { return en.isDirectory; })) return cb(Array.from(dt.files || []));
    var hasil = [], tunggu = 0;
    var selesai = function () { if (--tunggu === 0) cb(hasil); };
    var baca = function (en) {
      tunggu++;
      if (en.isFile) { en.file(function (f) { hasil.push(f); selesai(); }, selesai); return; }
      var r = en.createReader(), semua = [];
      var lanjut = function () {
        r.readEntries(function (b) {
          if (b.length) { semua = semua.concat(b); lanjut(); }
          else { semua.forEach(baca); selesai(); }
        }, selesai);
      };
      lanjut();
    };
    entries.forEach(baca);
  }

  /** Jadikan elemen dropzone: drag & drop memanggil onFiles(daftarFile); klik kotak = onClick(). */
  function dropzone(el, onFiles, onClick) {
    el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', function () { el.classList.remove('drag'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('drag');
      ambilDrop(e.dataTransfer, onFiles);
    });
    if (onClick) {
      el.addEventListener('click', function (e) {
        // Tombol & input di dalam kotak punya aksinya sendiri.
        if (e.target.closest('button, input, select, a')) return;
        onClick();
      });
    }
  }

  /** Buka pemilih file tersembunyi lalu kirim hasilnya ke cb. Input direset supaya file yang sama bisa dipilih lagi. */
  function pilihFile(opts, cb) {
    var input = document.createElement('input');
    input.type = 'file';
    if (opts.accept) input.accept = opts.accept;
    if (opts.multiple) input.multiple = true;
    if (opts.folder) input.webkitdirectory = true;
    input.style.display = 'none';
    input.addEventListener('change', function () {
      cb(Array.from(input.files || []));
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }

  /** Unduh workbook contoh: sheets = { namaSheet: [ {kolom: nilai} ] }. */
  function unduhContoh(namaFile, sheets) {
    var wb = XLSX.utils.book_new();
    Object.keys(sheets).forEach(function (n) { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheets[n]), n); });
    XLSX.writeFile(wb, namaFile);
  }

  /** Baca file Excel jadi { namaSheet: rows[] } (urutan sheet ikut file). */
  function bacaExcel(file, cb) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        var sheets = {};
        wb.SheetNames.forEach(function (n) { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }); });
        cb(null, sheets, wb.SheetNames);
      } catch (err) { cb(err); }
    };
    reader.onerror = function () { cb(new Error('file tidak bisa dibaca')); };
    reader.readAsArrayBuffer(file);
  }

  window.RmShell = { icon: icon, esc: esc, buka: buka, topbar: topbar, renderSteps: renderSteps, dropzone: dropzone, pilihFile: pilihFile, unduhContoh: unduhContoh, bacaExcel: bacaExcel };
})();
