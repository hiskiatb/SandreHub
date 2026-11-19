/*
 * sm-format.js — toolbar format teks (Bold, Italic, Underline, warna teks, highlight)
 * di atas "Isi Email" Partner SDP & Partner MDI, seperti di Blast Email Report.
 * Blok teks lalu klik tombol (tanpa blok: disisipkan contoh teks).
 *
 *  - Partner SDP (sdp.html): isi email dikirim server APA ADANYA sebagai HTML, jadi
 *    toolbar menyisipkan tag HTML (<b>, <i>, <u>, <span style>), sama seperti yang
 *    selama ini diketik manual. Server tidak berubah.
 *  - Partner MDI (mdi.html): server meng-escape isi email (teks biasa), jadi toolbar
 *    memakai penanda seperti Blast Email Report: **tebal**, *miring*, ++garis bawah++,
 *    {color:#hex}…{/color}, {bg:#hex}…{/bg}. Penanda diubah jadi HTML oleh
 *    window.smMarkerKeHtml (pratinjau) dan bodyKeHtml di lib/smartMail/mdi.js (email).
 *  Judul email (Subject) tetap teks biasa: subject email memang tidak bisa diformat.
 */
(function () {
  // Penanda -> HTML (input SUDAH di-escape). Dipakai pratinjau MDI; logikanya sama dengan server.
  window.smMarkerKeHtml = function (escaped) {
    return String(escaped)
      .replace(/\{color:(#[0-9a-fA-F]{3,8})\}([\s\S]*?)\{\/color\}/g, '<span style="color:$1">$2</span>')
      .replace(/\{bg:(#[0-9a-fA-F]{3,8})\}([\s\S]*?)\{\/bg\}/g, '<span style="background:$1">$2</span>')
      .replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
      .replace(/\+\+([^+\n]+?)\+\+/g, '<u>$1</u>')
      .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<i>$2</i>');
  };

  function pasang() {
    var ta = document.getElementById('emailBody');
    if (!ta || ta.dataset.smFormat) return;
    ta.dataset.smFormat = '1';
    var modeHtml = /sdp\.html/.test(location.pathname) || !!document.getElementById('btnConfirmSendEmail');

    var css = document.createElement('style');
    css.textContent = [
      '.smf-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 8px;}',
      '.smf-btn{font:inherit;font-size:12.5px;padding:5px 12px;border-radius:8px;cursor:pointer;line-height:1.4;',
      'background:var(--sm-surface-2,#F0F0F2);border:1px solid var(--sm-line-2,#D4D4DA);color:var(--sm-ink,#1A1A1D) !important;transition:all .12s;}',
      '.smf-btn *{color:inherit !important;} .smf-btn:hover{border-color:#32BCAD;background:rgba(50,188,173,.12);} .smf-btn:active{transform:scale(.95);}',
      '.smf-color{display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 7px;border-radius:8px;border:1px solid var(--sm-line-2,#D4D4DA);background:var(--sm-surface-2,#F0F0F2);font-size:12.5px;}',
      '.smf-color input{width:22px;height:20px;padding:0;border:1px solid var(--sm-line-2,#D4D4DA);border-radius:5px;background:none;cursor:pointer;}',
      '.smf-hint{font-size:11.5px;color:var(--sm-muted,#5A5A68) !important;margin:6px 0 0;}'
    ].join('');
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.className = 'smf-bar';
    bar.innerHTML =
      '<button type="button" class="smf-btn" data-f="b" title="Tebalkan teks yang diblok"><b>B</b> Bold</button>'
      + '<button type="button" class="smf-btn" data-f="i" title="Miringkan teks yang diblok"><i>I</i> Italic</button>'
      + '<button type="button" class="smf-btn" data-f="u" title="Garis bawahi teks yang diblok"><u>U</u> Underline</button>'
      + '<span class="smf-color" title="Warna teks untuk bagian yang diblok"><b style="color:#E53935 !important">A</b><input type="color" data-f="color" value="#E53935"></span>'
      + '<span class="smf-color" title="Highlight untuk bagian yang diblok">🖍️<input type="color" data-f="bg" value="#FFF176"></span>';
    ta.parentNode.insertBefore(bar, ta);
    var hint = document.createElement('p');
    hint.className = 'smf-hint';
    hint.textContent = 'Blok teks lalu klik Bold / Italic / Underline / warna. Variabel {{...}} tetap berfungsi. Judul email (Subject) tidak bisa diformat.';
    ta.parentNode.insertBefore(hint, ta.nextSibling);

    var simpan = { start: 0, end: 0 };
    var ingat = function () { simpan = { start: ta.selectionStart, end: ta.selectionEnd }; };
    ta.addEventListener('select', ingat); ta.addEventListener('keyup', ingat); ta.addEventListener('mouseup', ingat); ta.addEventListener('blur', ingat);

    function bungkus(buka, tutup, contoh) {
      var s = Math.min(simpan.start, ta.value.length), e = Math.min(simpan.end, ta.value.length);
      var pilih = e > s ? ta.value.slice(s, e) : contoh;
      ta.value = ta.value.slice(0, s) + buka + pilih + tutup + ta.value.slice(e);
      ta.focus();
      ta.setSelectionRange(s + buka.length, s + buka.length + pilih.length);
      ingat();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    var TAG = modeHtml
      ? { b: ['<b>', '</b>'], i: ['<i>', '</i>'], u: ['<u>', '</u>'],
          color: function (h) { return ['<span style="color:' + h + '">', '</span>']; },
          bg: function (h) { return ['<span style="background:' + h + '">', '</span>']; } }
      : { b: ['**', '**'], i: ['*', '*'], u: ['++', '++'],
          color: function (h) { return ['{color:' + h + '}', '{/color}']; },
          bg: function (h) { return ['{bg:' + h + '}', '{/bg}']; } };
    bar.querySelectorAll('button[data-f]').forEach(function (b) {
      b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ingat(); });
      b.addEventListener('click', function () {
        var t = TAG[b.dataset.f];
        bungkus(t[0], t[1], { b: 'teks tebal', i: 'teks miring', u: 'teks bergaris bawah' }[b.dataset.f]);
      });
    });
    bar.querySelectorAll('input[type=color]').forEach(function (inp) {
      inp.addEventListener('mousedown', ingat);
      inp.addEventListener('change', function () {
        var t = TAG[inp.dataset.f](inp.value);
        bungkus(t[0], t[1], inp.dataset.f === 'color' ? 'teks warna' : 'teks highlight');
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasang);
  else pasang();
})();
