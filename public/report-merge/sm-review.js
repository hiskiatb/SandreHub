/*
 * sm-review.js — tambahan SandraHub untuk Partner SDP (sdp.html) & Partner MDI (mdi.html).
 *  1) Tema: <html data-theme="dark|light"> mengikuti dashboard SandraHub
 *     (localStorage 'rm-theme' yang diisi ReportMerge_Module, cadangan 'hub-theme').
 *  2) Preview sebelum kirim: window.smReview(items, opsi) menampilkan SEMUA email
 *     yang akan dikirim (Kepada, CC, Subject, isi, lampiran PDF) dan mengembalikan
 *     Promise<boolean>: true = lanjut kirim, false = batal. Logika kirim aslinya
 *     tidak diubah; halaman hanya menunggu keputusan ini sebelum mengirim.
 *  3) Partner MDI: tombol "Kirim Email ke Semua Partner" dicegat sekali untuk
 *     preview, lalu diteruskan ke handler aslinya kalau disetujui.
 */
(function () {
  // ---------- Tema ----------
  function temaAwal() {
    try { return localStorage.getItem('rm-theme') || localStorage.getItem('hub-theme') || 'dark'; } catch (e) { return 'dark'; }
  }
  window.__smTerapkanTema = function (tema) {
    document.documentElement.setAttribute('data-theme', tema === 'light' ? 'light' : 'dark');
  };
  window.__smTerapkanTema(temaAwal());
  window.addEventListener('storage', function (e) {
    if ((e.key === 'rm-theme' || e.key === 'hub-theme') && e.newValue) window.__smTerapkanTema(e.newValue);
  });

  // ---------- Util ----------
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var POLA = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  // Sama dengan cara server membaca alamat (lib/smartMail/kirim.js & mdi.js).
  function alamat(nilai) {
    var valid = [], salah = [];
    String(nilai == null ? '' : nilai).replace(/[ ​-‍⁠﻿]/g, ' ').replace(/mailto:/gi, ' ')
      .split(/[;,\s]+/).map(function (x) { return x.replace(/^[<("'\[]+|[>)"'\].:]+$/g, '').trim(); }).filter(Boolean)
      .forEach(function (x) { if (POLA.test(x)) { if (valid.indexOf(x) < 0) valid.push(x); } else if (x.indexOf('@') >= 0) salah.push(x); });
    return { valid: valid, salah: salah };
  }
  // Isi email seperti yang dikirim server: SDP mengirim teks apa adanya sebagai HTML (\n -> <br>),
  // MDI meng-escape teksnya dulu. Tag <script> & atribut on* dibuang dari pratinjau.
  function isiHtml(teks, sebagaiHtml) {
    var t = String(teks == null ? '' : teks);
    if (!sebagaiHtml) return esc(t).replace(/\n/g, '<br>');
    return t.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/\n/g, '<br>');
  }
  function urlLampiran(l) {
    if (l.file) return URL.createObjectURL(l.file);
    if (l.dataUrl) {
      try {
        var b64 = String(l.dataUrl).split(',').pop();
        var bin = atob(b64), arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([arr], { type: 'application/pdf' }));
      } catch (e) { return ''; }
    }
    return l.url || '';
  }

  // ---------- Gaya modal ----------
  var css = document.createElement('style');
  css.textContent = [
    '.smr-overlay{position:fixed;inset:0;z-index:100000;background:rgba(10,10,12,.55);backdrop-filter:blur(4px);display:flex;align-items:stretch;justify-content:center;padding:18px;font-family:var(--sm-font,"DM Sans",system-ui,sans-serif);}',
    '.smr-box{background:var(--sm-surface,#fff);color:var(--sm-ink,#1A1A1D);border:1px solid var(--sm-line,#E2E2E6);border-radius:16px;box-shadow:var(--sm-shadow-lg,0 20px 48px rgba(0,0,0,.2));width:100%;max-width:1500px;display:flex;flex-direction:column;overflow:hidden;}',
    '.smr-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--sm-line,#E2E2E6);flex-wrap:wrap;}',
    '.smr-head h3{margin:0;font-size:17px;color:var(--sm-ink,#1A1A1D);} .smr-head p{margin:3px 0 0;font-size:12.5px;color:var(--sm-muted,#5A5A68);}',
    '.smr-stats{display:flex;gap:8px;flex-wrap:wrap;} .smr-stat{font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;border:1px solid var(--sm-line-2,#D4D4DA);color:var(--sm-ink-2,#3A3A42);background:var(--sm-surface-2,#F0F0F2);}',
    '.smr-stat.warn{background:rgba(255,203,5,.16);border-color:rgba(255,203,5,.45);color:#8A6A00;} html[data-theme="dark"] .smr-stat.warn{color:#FFE066;}',
    '.smr-body{flex:1;display:grid;grid-template-columns:minmax(260px,32%) 1fr;min-height:0;}',
    '.smr-list{border-right:1px solid var(--sm-line,#E2E2E6);display:flex;flex-direction:column;min-height:0;}',
    '.smr-search{margin:12px;padding:9px 12px;border-radius:8px;border:1px solid var(--sm-line-2,#D4D4DA);background:var(--sm-surface,#fff);color:var(--sm-ink,#1A1A1D);font:inherit;font-size:13px;}',
    '.smr-items{overflow:auto;flex:1;padding:0 8px 12px;}',
    '.smr-item{display:block;width:100%;text-align:left;border:1px solid transparent;background:none;border-radius:10px;padding:9px 10px;margin-bottom:4px;cursor:pointer;font:inherit;color:var(--sm-ink-2,#3A3A42);}',
    '.smr-item:hover{background:var(--sm-hover,#F7F7F9);} .smr-item.on{background:rgba(50,188,173,.12);border-color:rgba(50,188,173,.45);}',
    '.smr-item b{display:block;font-size:13px;color:var(--sm-ink,#1A1A1D);} .smr-item small{display:block;font-size:11.5px;color:var(--sm-muted,#5A5A68);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.smr-item .no{font-size:11px;color:var(--sm-muted,#5A5A68);margin-right:6px;} .smr-item .w{color:#B98900;font-size:11px;font-weight:700;}',
    '.smr-detail{display:flex;flex-direction:column;min-height:0;overflow:auto;padding:16px 20px;gap:12px;}',
    '.smr-meta{display:grid;grid-template-columns:90px 1fr;gap:6px 12px;font-size:13px;} .smr-meta dt{color:var(--sm-muted,#5A5A68);font-weight:600;} .smr-meta dd{margin:0;color:var(--sm-ink,#1A1A1D);word-break:break-word;}',
    '.smr-salah{color:#C0392B;font-size:12px;}',
    '.smr-mail{background:#fff;color:#1A1A1D;border:1px solid var(--sm-line,#E2E2E6);border-radius:12px;padding:16px 18px;font-size:14px;line-height:1.6;font-family:"Segoe UI",Arial,sans-serif;}',
    '.smr-mail,.smr-mail *{color:#1A1A1D !important;} .smr-mail a{color:#1A9E90 !important;}',
    '.smr-mail .subj{font-weight:700;font-size:15px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #eee;}',
    '.smr-att{display:flex;gap:6px;flex-wrap:wrap;} .smr-att button{font:inherit;font-size:12.5px;border-radius:8px;padding:6px 10px;cursor:pointer;border:1px solid var(--sm-line-2,#D4D4DA);background:var(--sm-surface-2,#F0F0F2);color:var(--sm-ink-2,#3A3A42);}',
    '.smr-att button.on{background:var(--sm-teal,#32BCAD);border-color:var(--sm-teal,#32BCAD);color:#fff;}',
    '.smr-pdf{width:100%;flex:1;min-height:420px;border:1px solid var(--sm-line,#E2E2E6);border-radius:12px;background:var(--sm-surface-2,#F0F0F2);}',
    '.smr-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-top:1px solid var(--sm-line,#E2E2E6);flex-wrap:wrap;}',
    '.smr-foot span{font-size:12.5px;color:var(--sm-muted,#5A5A68);}',
    '.smr-btn{font:inherit;font-weight:700;font-size:14px;border-radius:10px;padding:11px 18px;cursor:pointer;border:1px solid var(--sm-line-2,#D4D4DA);background:var(--sm-surface-2,#F0F0F2);color:var(--sm-ink,#1A1A1D);}',
    '.smr-btn.go{border:0;color:#fff;background:linear-gradient(135deg,#32BCAD,#1A9E90);box-shadow:0 8px 20px rgba(50,188,173,.25);}',
    '@media (max-width:820px){.smr-body{grid-template-columns:1fr;}.smr-list{max-height:38vh;border-right:0;border-bottom:1px solid var(--sm-line,#E2E2E6);}}'
  ].join('\n');
  document.head.appendChild(css);

  /**
   * items: [{ nama, info, to, cc, subject, body, lampiran: [{ filename, url | dataUrl | file }] }]
   * to/cc boleh string (isi sel Excel) atau array.
   */
  window.smReview = function (items, opsi) {
    opsi = opsi || {};
    return new Promise(function (selesai) {
      var data = items.map(function (it, i) {
        var to = alamat(Array.isArray(it.to) ? it.to.join(';') : it.to);
        var cc = alamat(Array.isArray(it.cc) ? it.cc.join(';') : it.cc);
        return { i: i, it: it, to: to, cc: cc, masalah: !to.valid.length || to.salah.length || cc.salah.length || !(it.lampiran || []).length };
      });
      var nMasalah = data.filter(function (d) { return d.masalah; }).length;
      var nLampiran = data.reduce(function (n, d) { return n + (d.it.lampiran || []).length; }, 0);
      var aktif = 0, urlDibuat = [];

      var ov = document.createElement('div');
      ov.className = 'smr-overlay';
      ov.innerHTML =
        '<div class="smr-box" role="dialog" aria-modal="true">'
        + '<div class="smr-head"><div><h3>' + esc(opsi.judul || 'Preview email sebelum dikirim') + '</h3><p>Periksa penerima, isi email, dan lampiran. Belum ada email yang dikirim.</p></div>'
        + '<div class="smr-stats"><span class="smr-stat">' + data.length + ' email</span><span class="smr-stat">' + nLampiran + ' lampiran</span>'
        + (nMasalah ? '<span class="smr-stat warn">⚠️ ' + nMasalah + ' perlu dicek</span>' : '') + '</div></div>'
        + '<div class="smr-body"><div class="smr-list"><input class="smr-search" type="search" placeholder="Cari nama, email, atau file…"><div class="smr-items"></div></div><div class="smr-detail"></div></div>'
        + '<div class="smr-foot"><span>Tombol kirim menjalankan pengiriman yang sama seperti sebelumnya.</span><div style="display:flex;gap:8px;flex-wrap:wrap">'
        + '<button type="button" class="smr-btn" data-x="batal">Batal</button>'
        + '<button type="button" class="smr-btn go" data-x="kirim">🚀 Kirim ' + data.length + ' email sekarang</button></div></div></div>';
      document.body.appendChild(ov);
      var elItems = ov.querySelector('.smr-items'), elDetail = ov.querySelector('.smr-detail'), elCari = ov.querySelector('.smr-search');

      function tutup(hasil) {
        urlDibuat.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* abaikan */ } });
        ov.remove();
        document.removeEventListener('keydown', onKey);
        selesai(hasil);
      }
      function onKey(e) { if (e.key === 'Escape') tutup(false); }
      document.addEventListener('keydown', onKey);

      function daftar() {
        var q = elCari.value.toLowerCase();
        elItems.innerHTML = data.filter(function (d) {
          var t = (d.it.nama + ' ' + d.to.valid.join(' ') + ' ' + (d.it.lampiran || []).map(function (l) { return l.filename; }).join(' ')).toLowerCase();
          return !q || t.indexOf(q) >= 0;
        }).map(function (d) {
          return '<button type="button" class="smr-item' + (d.i === aktif ? ' on' : '') + '" data-i="' + d.i + '"><b><span class="no">' + (d.i + 1) + '.</span>' + esc(d.it.nama)
            + (d.masalah ? ' <span class="w">⚠️</span>' : '') + '</b><small>' + esc(d.to.valid.join(', ') || 'Email To kosong') + '</small><small>📎 '
            + esc((d.it.lampiran || []).map(function (l) { return l.filename; }).join(', ') || 'tanpa lampiran') + '</small></button>';
        }).join('') || '<p style="padding:12px;color:var(--sm-muted,#5A5A68);font-size:13px">Tidak ada yang cocok.</p>';
        elItems.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { aktif = +b.dataset.i; daftar(); detail(); }; });
      }
      function detail() {
        var d = data[aktif]; if (!d) { elDetail.innerHTML = ''; return; }
        var lamp = d.it.lampiran || [];
        elDetail.innerHTML =
          '<dl class="smr-meta"><dt>Kepada</dt><dd>' + (esc(d.to.valid.join(', ')) || '<span class="smr-salah">Kosong: email ini akan gagal</span>') + '</dd>'
          + '<dt>CC</dt><dd>' + (esc(d.cc.valid.join(', ')) || '-') + '</dd>'
          + (d.to.salah.length || d.cc.salah.length ? '<dt></dt><dd class="smr-salah">Alamat tidak valid (dilewati): ' + esc(d.to.salah.concat(d.cc.salah).join(', ')) + '</dd>' : '')
          + (d.it.info ? '<dt>Info</dt><dd>' + esc(d.it.info) + '</dd>' : '') + '</dl>'
          + '<div class="smr-mail"><div class="subj">' + esc(d.it.subject) + '</div><div>' + isiHtml(d.it.body, opsi.bodyHtml) + '</div></div>'
          + '<div class="smr-att">' + (lamp.length ? lamp.map(function (l, j) { return '<button type="button" data-j="' + j + '">📎 ' + esc(l.filename) + '</button>'; }).join('') : '<span class="smr-salah">Tidak ada lampiran</span>') + '</div>'
          + (lamp.length ? '<iframe class="smr-pdf" title="Pratinjau lampiran"></iframe>' : '');
        var frame = elDetail.querySelector('iframe');
        function lihat(j) {
          elDetail.querySelectorAll('[data-j]').forEach(function (b) { b.classList.toggle('on', +b.dataset.j === j); });
          var l = lamp[j]; if (!l) return;
          if (!l.__url) { l.__url = urlLampiran(l); if (/^blob:/.test(l.__url)) urlDibuat.push(l.__url); }
          if (frame) frame.src = l.__url;
        }
        elDetail.querySelectorAll('[data-j]').forEach(function (b) { b.onclick = function () { lihat(+b.dataset.j); }; });
        if (lamp.length) lihat(0);
      }
      elCari.oninput = daftar;
      ov.querySelector('[data-x="batal"]').onclick = function () { tutup(false); };
      ov.querySelector('[data-x="kirim"]').onclick = function () { tutup(true); };
      daftar(); detail();
    });
  };

  // ---------- Partner SDP: konfirmasi "Yakin ingin memulai pengiriman" digantikan layar preview ----------
  (function () {
    var asli = window.confirm.bind(window);
    window.confirm = function (pesan) {
      if (typeof window.smReview === 'function' && /Yakin ingin memulai pengiriman sekarang/.test(String(pesan))) return true;
      return asli(pesan);
    };
  })();

  // ---------- Partner MDI: cegat tombol kirim untuk preview ----------
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('btnSendEmail');
    if (!btn || typeof window.smReview !== 'function') return;
    var lolos = false;
    btn.addEventListener('click', function (e) {
      if (lolos) { lolos = false; return; }
      /* global hasilGenerate, isiPlaceholder, namaLampiran */
      var target;
      try { target = (typeof hasilGenerate !== 'undefined' ? hasilGenerate : []).filter(function (h) { return !h.is_blasted; }); } catch (err) { return; }
      if (!target.length) return; // biarkan handler asli menampilkan pesannya
      e.stopImmediatePropagation();
      e.preventDefault();
      var subj = (document.getElementById('emailSubject') || {}).value || '';
      var isi = (document.getElementById('emailBody') || {}).value || '';
      var items = target.map(function (h) {
        var lampiran = h.files
          ? h.files.map(function (f) { return { filename: f.name, file: f }; })
          : namaLampiran(h).map(function (fn) {
            var url = (h.letter && h.letter.filename === fn && h.letter.url) || (h.bast && h.bast.filename === fn && h.bast.url) || ('/api/smart-mail/downloads/' + encodeURIComponent(fn));
            return { filename: fn, url: url };
          });
        return {
          nama: h.partner_name + (h.type ? ' · ' + h.type : ''),
          to: h.email_to, cc: h.email_cc,
          subject: isiPlaceholder(subj, h), body: isiPlaceholder(isi, h),
          lampiran: lampiran,
        };
      });
      window.smReview(items, { judul: 'Preview email Partner MDI' }).then(function (ok) {
        if (!ok) return;
        // Handler asli meminta konfirmasi lagi; preview ini sudah menjadi konfirmasinya.
        var asliConfirm = window.confirm;
        window.confirm = function () { window.confirm = asliConfirm; return true; };
        lolos = true;
        btn.click();
        setTimeout(function () { if (window.confirm !== asliConfirm) window.confirm = asliConfirm; }, 0);
      });
    }, true);
  });
})();
