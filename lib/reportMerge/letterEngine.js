/**
 * services/letterEngine.js
 *
 * Mesin generate "surat" (letter) PDF dari 1 baris konfigurasi
 * TEMPLATE_SURAT + 1 baris data mitra.
 *
 * Versi ini mencocokkan tampilan (font, tata letak, tabel, warna) PERSIS
 * dengan contoh PDF asli per template_code yang dikirim user — bukan
 * cuma satu desain generik untuk semua. STYLE_PRESETS di bawah mencatat
 * perbedaan visual antar template (posisi logo, varian footer, gaya
 * tabel, dst) yang diambil dari membandingkan tiap PDF referensi.
 *
 * PENTING (instruksi user): PDF referensi berisi data mitra ASLI (nama,
 * PT, ID, nilai). Hanya STRUKTUR & gaya visualnya yang dipakai di sini —
 * tidak ada nama/PT/ID/nilai asli dari PDF manapun yang di-hardcode di
 * file ini. Semua isi surat datang dari `row`/`templateConfig` yang
 * dioper saat generate.
 *
 * BAST_MPC & MPC_TACTICAL BELUM di-cover di sini — keduanya punya
 * struktur jauh berbeda (BAST: tanpa letterhead, 2 blok TTD berdampingan,
 * tanpa No Ref; MPC_TACTICAL: 2 halaman, tabel judul gabungan + tabel
 * deskripsi/nilai, lampiran "Ketentuan Klaim Pembayaran" tetap di
 * halaman 2) dan butuh fungsi generate terpisah (rencana tahap
 * berikutnya, sekalian saat sheet data MPC-nya sudah siap).
 *
 * GANTI/TAMBAH bagian yang ditandai "<-- GANTI DI SINI" sesuai
 * kebutuhanmu.
 */

const path = require('path');
const PDFDocument = require('pdfkit');

/* ============================================================
   ASET LETTERHEAD RESMI (logo + aksen bulat Indosat Ooredoo
   Hutchison) + font Poppins (dipakai buat mendekati font "rounded"
   yang kepakai di narasi surat asli — bukan font default PDF).
   File-nya ada di services/assets/. <-- GANTI DI SINI kalau aset
   di-update jadi versi baru.
   ============================================================ */
const ASSETS_DIR = path.join(__dirname, 'assets');
const LOGO_PATH = path.join(ASSETS_DIR, 'indosat-logo.png');
const ACCENT_PATH = path.join(ASSETS_DIR, 'indosat-accent.png');
const FONT_DIR = path.join(ASSETS_DIR, 'fonts');
// Font resmi Indosat (IndosatMedium.ttf / IndosatBold.ttf) dipakai untuk isi
// surat — sebelumnya pakai Poppins (cuma mendekati). Baru ada 2 ketebalan
// (Medium & Bold) — belum ada file "Regular" atau "Italic" resmi dari
// Indosat, jadi teks isi (non-bold) memakai berat Medium, dan teks miring
// disintesis lewat transform (lihat drawFormattedText) bukan file font
// terpisah. Kalau nanti ada file Indosat-Regular.ttf / Indosat-Italic.ttf
// resmi, tinggal ganti path di bawah ini.
const FONT_REGULAR = path.join(FONT_DIR, 'IndosatMedium.ttf');
const FONT_MEDIUM = path.join(FONT_DIR, 'IndosatMedium.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'IndosatBold.ttf');

// Footer korporat generik (Head Office Jakarta) — dipakai template yang
// di PDF referensinya memang pakai alamat pusat, bukan alamat regional.
const GENERIC_FOOTER_LINES = ['Head Office', 'Jalan Medan Merdeka Barat No. 21', 'Jakarta 10110, Indonesia', 'P: (62-21) 3000 3001'];

// Ukuran & posisi aksen bulat di pojok kanan-bawah — sama di semua
// template, dihitung dari template resmi (anchor di sudut halaman A4).
const ACCENT_SIZE = { width: 113.14, height: 121.9 };

/* ============================================================
   STYLE PRESET PER TEMPLATE_CODE — dicocokkan dari membandingkan
   PDF referensi asli tiap template:
   - RATE_OTF        <- referensi "Nilai Rate Benefit OTF"
   - KPI_TARGET       <- referensi "Pemberitahuan Target KPI"
   - SP_DISCOUNT_FEE  <- referensi "Nilai SP 3GB Discount Fee"
   - DISTRIBUTION_FEE <- referensi "Distribution Fee 3KIOSK & SDP Hybrid"
   logoPosition: posisi logo di kop ('left' | 'right')
   footerVariant: 'generic' (Head Office Jakarta) | 'regional' (alamat
     dari field KOP_SURAT template, mis. "...Sumatera")
   tableStyle: 'horizontal' (header gelap, kolom banyak, 1 baris data —
     gaya RATE_OTF/KPI_TARGET) | 'vertical' (2 kolom label:nilai
     bertumpuk, baris Total di-shading abu-abu — gaya SP_DISCOUNT_FEE/
     DISTRIBUTION_FEE)
   <-- GANTI/TAMBAH DI SINI kalau nambah template_code baru, atau kalau
   ternyata gaya visual salah satu template beda dari yang tercatat di sini.
   ============================================================ */
const STYLE_PRESETS = {
  RATE_OTF: {
    logoPosition: 'left',
    footerVariant: 'generic',
    tableStyle: 'horizontal',
    showCatatan: false,
    showCc: false,
    closingWord: 'Hormat kami,',
    showCompanyAfterClosing: true,
    sectionHeading: null,
  },
  KPI_TARGET: {
    logoPosition: 'right',
    footerVariant: 'regional',
    tableStyle: 'horizontal',
    showCatatan: false,
    showCc: true,
    closingWord: 'Salam hormat,',
    showCompanyAfterClosing: false,
    sectionHeading: 'A.    KPI Utama',
  },
  SP_DISCOUNT_FEE: {
    logoPosition: 'right',
    footerVariant: 'regional',
    tableStyle: 'vertical',
    showCatatan: true,
    showCc: false,
    closingWord: 'Hormat kami,',
    showCompanyAfterClosing: true,
    sectionHeading: null,
  },
  DISTRIBUTION_FEE: {
    logoPosition: 'right',
    footerVariant: 'regional',
    tableStyle: 'vertical',
    showCatatan: true,
    showCc: false,
    closingWord: 'Hormat kami,',
    showCompanyAfterClosing: true,
    sectionHeading: null,
  },
  /* Surat Pemberitahuan ke mitra — 2 halaman: halaman 1 berisi 2 tabel
     (ringkasan program ber-header gabungan + rincian deskripsi/nilai),
     halaman 2 berisi lampiran "Ketentuan Klaim Pembayaran" lalu penutup &
     tanda tangan. Punya generator sendiri (generatePemberitahuanPdf). */
  PEMBERITAHUAN: {
    layout: 'pemberitahuan',
    logoPosition: 'left',
    footerVariant: 'generic',
    closingWord: 'Salam hormat,',
  },
  /* Berita Acara Serah Terima — dokumen dua pihak: TANPA kop/logo, tanpa
     nomor surat, judul di tengah, dan dua blok tanda tangan berdampingan.
     Punya generator sendiri (generateBastPdf). */
  BAST: {
    layout: 'bast',
    logoPosition: null,
    footerVariant: null,
  },
  /* Tiga jenis IOM di bawah ini SEMUANYA memakai mesin memo yang sama
     (generateMemoPdf). Perbedaan bentuknya ada di daftar blok MEMO_BLOCKS
     pada definisi jenis suratnya, bukan di kode. */
  IOM_PAYOUT_MPX: { layout: 'memo', aggregate: true },
  IOM_PAYOUT_SDP: { layout: 'memo', aggregate: true },
  IOM_PERMOHONAN_REVA: { layout: 'memo', aggregate: true },

  /* Alur surat FLEKSIBEL — satu jenis surat generik yang menggantikan
     kebutuhan bikin jenis surat baru tiap kali format berubah. Kop/footer
     Indosat & mesin render (generateMemoPdf) tetap SAMA PERSIS dengan IOM
     di atas — bedanya cuma MEMO_BLOCKS-nya TIDAK datang dari definisi
     tetap di LETTER_DEFAULTS (lihat di bawah, sengaja dikosongkan),
     melainkan dibangun di klien dari narasi bebas yang diketik user
     (lihat buildFlexMemoBlocks() di public/index.html), persis seperti
     cara kerja narasi di Blast Email Report. */
  FLEX: { layout: 'memo', aggregate: true },
};

/* Nama jenis surat yang dilihat pengguna. Kode di sebelah kiri cuma kunci
   internal; yang tampil di aplikasi adalah nama di kanan, memakai istilah
   yang dipakai tim sehari-hari. */
const LETTER_TYPE_NAMES = {
  IOM_PAYOUT_MPX: 'IOM Payout MPx',
  IOM_PAYOUT_SDP: 'IOM Payout SDP',
  IOM_PERMOHONAN_REVA: 'IOM Permohonan Reva',
  PEMBERITAHUAN: 'Surat Pemberitahuan',
  BAST: 'Surat BAST',
  RATE_OTF: 'Surat Nilai Rate Benefit OTF',
  KPI_TARGET: 'Surat Pemberitahuan Target KPI',
  SP_DISCOUNT_FEE: 'Surat Nilai SP 3GB Discount Fee',
  DISTRIBUTION_FEE: 'Surat Distribution Fee',
  FLEX: 'Surat / Memo (Fleksibel)',
};
const DEFAULT_STYLE = STYLE_PRESETS.SP_DISCOUNT_FEE;

/* ============================================================
   FORMATTER ALA INDONESIA
   ============================================================ */
function formatRupiah(n) {
  const num = Number(n) || 0;
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}
function formatDecimalID(n, digits = 2) {
  const num = Number(n) || 0;
  return num.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function formatTanggalID(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

/* ============================================================
   RENDER {{TOKEN}} PLACEHOLDER
   ============================================================ */
function renderPlaceholders(str, tokens) {
  if (!str) return '';
  // Nama token boleh mengandung spasi/simbol (mis. {{Nama Mitra}}) — dicari
  // apa adanya dulu, lalu versi "_" (non-huruf/angka jadi underscore).
  return String(str).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, key) => {
    const has = (k) => Object.prototype.hasOwnProperty.call(tokens, k) && tokens[k] != null;
    if (has(key)) return String(tokens[key]);
    const norm = key.replace(/\W+/g, '_');
    if (has(norm)) return String(tokens[norm]);
    return '';
  });
}

/* ============================================================
   PEMBERSIH BARIS BARU DARI EXCEL. Excel (lewat SheetJS di browser)
   nyimpen "Alt+Enter" di dalam 1 sel sebagai "\r\n" (gaya Windows),
   bukan "\n" polos. Kalau ini dibiarkan, sisa karakter "\r" di akhir
   tiap baris kebaca sebagai karakter aneh (kotak/"Ð") pas dirender di
   PDF -- soalnya font PDF-nya nggak punya glyph buat karakter kontrol
   itu. Semua field teks dari TEMPLATE_SURAT/baris data dirapikan di
   sini SEKALI di awal (bukan di tiap tempat pemakaian) supaya
   masalah yang sama nggak muncul lagi di field lain.
   ============================================================ */
function normalizeLineEndings(value) {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : value;
}
function sanitizeMultilineFields(obj) {
  const out = {};
  for (const key of Object.keys(obj || {})) {
    out[key] = normalizeLineEndings(obj[key]);
  }
  return out;
}

/* ============================================================
   PEMETAAN "DETAIL_TABLE_COLUMNS" (label di surat) -> FIELD DI
   BARIS DATA EXCEL — GENERIK, BUKAN HARDCODE PER TEMPLATE_CODE.

   Kenapa diubah jadi generik (sebelumnya tiap TEMPLATE_CODE punya
   mapping manual di sini, dengan nama kolom Excel di-hardcode):
   begitu user upload Excel baru dengan nama sheet/kolom yang beda
   sedikit saja, surat jadi salah nilai/kosong dan butuh kode ini
   diubah lagi. Sekarang setiap label di DETAIL_TABLE_COLUMNS (yang
   user isi sendiri di sheet TEMPLATE_SURAT) dicocokkan OTOMATIS ke
   nama kolom di baris data (SOURCE_SHEET) — jadi Excel apa pun,
   selama nama kolom di SOURCE_SHEET-nya sama/mirip dengan label di
   DETAIL_TABLE_COLUMNS, langsung kepakai tanpa ubah kode ini.

   Urutan pencocokan 1 label -> 1 kolom Excel:
   1. Buang dulu placeholder {{TOKEN}} dari label (itu cuma buat
      judul kolom yang ditampilkan, bukan bagian nama kolom Excel) —
      mis. "SP 3GB Discount Fee {{PERIODE}}" -> "SP 3GB Discount Fee".
   2. Match persis ke nama kolom (case & spasi apa adanya).
   3. Match "dirapikan" (huruf kecil, spasi berlebih dirapatkan) —
      supaya "SP 3GB Discount Fee" tetap cocok ke "sp 3gb  discount fee".
   4. CORE_FIELD_ALIASES di bawah — cuma untuk field INTI yang memang
      konsisten dipakai di semua sheet data (ID/PARTNER_NAME/dst) tapi
      biasa ditampilkan dengan label lebih enak dibaca di surat (mis.
      label "SDP ID" -> kolom "ID"). <-- TAMBAH DI SINI kalau ada alias
      umum baru yang sering dipakai lintas template (BUKAN tempat buat
      hardcode 1 template tertentu).
   5. Label "Total" (case-insensitive) yang TIDAK ketemu kolom Excel
      bernama "Total": dihitung otomatis = jumlah semua kolom LAIN di
      DETAIL_TABLE_COLUMNS yang nilainya angka.

   Format angka (Rp vs angka biasa) ditebak dari kata kunci di label —
   MONEY_KEYWORDS di bawah. <-- TAMBAH kata kunci di sini kalau ada
   istilah baru yang harusnya diformat Rupiah tapi belum ketebak.
   ============================================================ */
const CORE_FIELD_ALIASES = {
  'sdp id': 'ID',
  'pt name': 'PARTNER_NAME',
  'partner name': 'PARTNER_NAME',
};
const MONEY_KEYWORDS = ['fee', 'discount', 'margin', 'budget', 'biaya', 'nilai', 'harga', 'ppn', 'pph', 'transfer', 'total', 'rp', 'price', 'cost', 'tarif', 'komisi', 'insentif', 'incentive', 'commission'];

function normalizeKey(s) {
  // '_' disamakan dengan spasi supaya "RATE_OTF" (nama kolom Excel gaya
  // SNAKE_CASE) tetap cocok ke label "Rate OTF" (gaya judul biasa).
  return String(s || '').toLowerCase().replace(/[_\s]+/g, ' ').trim();
}
function stripPlaceholders(label) {
  return String(label || '').replace(/\{\{\w+\}\}/g, '').replace(/\s+/g, ' ').trim();
}
function looksLikeMoney(label) {
  const l = normalizeKey(label);
  return MONEY_KEYWORDS.some((kw) => l.includes(kw));
}
function findRowValue(row, label) {
  const cleanLabel = stripPlaceholders(label);
  if (Object.prototype.hasOwnProperty.call(row, cleanLabel)) return row[cleanLabel];
  const target = normalizeKey(cleanLabel);
  const foundKey = Object.keys(row).find((k) => normalizeKey(k) === target);
  if (foundKey) return row[foundKey];
  const aliasCol = CORE_FIELD_ALIASES[target];
  if (aliasCol && Object.prototype.hasOwnProperty.call(row, aliasCol)) return row[aliasCol];
  return undefined;
}
function formatDetailValue(label, rawValue) {
  if (rawValue === '' || rawValue == null) {
    return looksLikeMoney(label) ? 'Rp' : '';
  }
  const num = Number(rawValue);
  const isNumeric = rawValue !== '' && !isNaN(num);
  if (!isNumeric) return String(rawValue);
  return looksLikeMoney(label) ? formatRupiah(num) : formatDecimalID(num, Number.isInteger(num) ? 0 : 2);
}
/* ============================================================
   HITUNG NILAI "Total" 1 BARIS SURAT (angka mentah, bukan string
   ter-format) — dipakai server.js buat narasi email approval (mis.
   "42 surat, total nominal Rp X") tanpa perlu generate PDF-nya dulu.
   Logikanya SAMA PERSIS dengan resolusi kolom "Total" di tabel PDF
   (buildGenericFieldMap di atas) supaya angkanya konsisten dengan
   yang tercetak di tiap surat. Return null kalau TEMPLATE_CODE ini
   memang tidak punya kolom "Total" di DETAIL_TABLE_COLUMNS-nya (mis.
   RATE_OTF/KPI_TARGET — bukan surat nominal uang).
   ============================================================ */
function computeDetailTotal(templateConfig, row) {
  const colLabels = String(templateConfig.DETAIL_TABLE_COLUMNS || '').split('|').map((s) => s.trim()).filter(Boolean);
  const totalLabel = colLabels.find((l) => normalizeKey(stripPlaceholders(l)) === 'total');
  if (!totalLabel) return null;
  const cleanRow = sanitizeMultilineFields(row);
  const raw = findRowValue(cleanRow, totalLabel);
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = Number(raw);
    if (!isNaN(n)) return n;
  }
  const sum = colLabels
    .filter((l) => normalizeKey(stripPlaceholders(l)) !== 'total')
    .reduce((acc, l) => {
      const v = findRowValue(cleanRow, l);
      const n = Number(v);
      return acc + (v !== '' && v != null && !isNaN(n) ? n : 0);
    }, 0);
  return sum;
}

function buildGenericFieldMap(colLabels) {
  const map = {};
  colLabels.forEach((label) => {
    map[label] = (row) => {
      const cleanLabel = stripPlaceholders(label);
      const isTotal = normalizeKey(cleanLabel) === 'total';
      const raw = findRowValue(row, label);
      if (isTotal && (raw === undefined || raw === null || raw === '')) {
        const sum = colLabels
          .filter((l) => normalizeKey(stripPlaceholders(l)) !== 'total')
          .reduce((acc, l) => {
            const v = findRowValue(row, l);
            const n = Number(v);
            return acc + (v !== '' && v != null && !isNaN(n) ? n : 0);
          }, 0);
        return formatRupiah(sum);
      }
      return formatDetailValue(cleanLabel, raw);
    };
  });
  return map;
}

/* ============================================================
   TOKEN TAMBAHAN yang bukan langsung 1:1 dari kolom Excel.
   PERIODE / PERIODE_PERFORMANCE / SEQ / tanggal surat itu sifatnya
   per-BATCH (bukan per-baris) — sama seperti "Judul laporan" di
   fitur blast email yang sudah ada, bukan sesuatu yang otomatis
   ada di tiap baris data.
   ============================================================ */
function buildTokens(row, templateConfig, batchMeta, seq) {
  const letterDate = batchMeta.letterDate instanceof Date ? batchMeta.letterDate : new Date();
  // Setiap kolom yang ada di sheet data OTOMATIS jadi placeholder
  // {{NAMA_KOLOM}} — supaya boilerplate surat (SUMMARY_TABLE_ROWS dkk.)
  // bisa memakai kolom apa pun tanpa mesin perlu tahu nama kolomnya lebih
  // dulu. Angka dirapikan pakai pemisah ribuan ala Indonesia; sisanya apa
  // adanya. Daftar token "kurasi" di bawah tetap menimpa ini kalau ada.
  const rowTokens = {};
  Object.keys(row || {}).forEach((k) => {
    const v = row[k];
    rowTokens[k] = typeof v === 'number' ? v.toLocaleString('id-ID', { maximumFractionDigits: 4 }) : (v == null ? '' : String(v));
    // Alias: kolom bernama "Rate Benefit" bisa dipakai sebagai {{Rate_Benefit}}
    // (karakter non-huruf/angka jadi "_") — placeholder cuma mengenali \w.
    const alias = String(k).trim().replace(/\W+/g, '_');
    if (alias && !Object.prototype.hasOwnProperty.call(rowTokens, alias)) rowTokens[alias] = rowTokens[k];
  });
  const tokensSoFar = {
    ...rowTokens,
    ID: row.ID || '',
    PARTNER_NAME: row.PARTNER_NAME || '',
    // PT_NAME belum ada kolom terpisah di data sheet — sementara
    // dipakaikan nilai PARTNER_NAME juga. <-- GANTI DI SINI kalau
    // nanti ada kolom PT_NAME sendiri di Excel.
    PT_NAME: row.PT_NAME || row.PARTNER_NAME || '',
    TYPE: row.TYPE || '',
    BRANCH: row.BRANCH || '',
    REGION: row.REGION || '',
    REGION_NAMING: row.REGION_NAMING || '',
    EMAIL_TO: row.EMAIL_TO || '',
    EMAIL_CC: row.EMAIL_CC || '',
    PERIODE: batchMeta.periode || '',
    PERIODE_PERFORMANCE: batchMeta.periodePerformance || '',
    SEQ: seq,
    YYYY: String(letterDate.getFullYear()),
    MM: String(letterDate.getMonth() + 1).padStart(2, '0'),
    DD: String(letterDate.getDate()).padStart(2, '0'),
    // Token khusus memo IOM — diisi dari pengaturan jenis surat / batch.
    MEMO_TO: templateConfig.MEMO_TO || batchMeta.memoTo || '............',
    MEMO_FROM: templateConfig.MEMO_FROM || batchMeta.memoFrom || '............',
    NO_SURAT: templateConfig.NO_SURAT || batchMeta.noSurat || '............',
    LINK_DOKUMEN: templateConfig.LINK_DOKUMEN || batchMeta.linkDokumen || '',
    // Referensi: daftar dokumen/nomor acuan (pasal "Refers to") — diisi
    // per surat lewat panel Detail Memo, satu baris = satu poin.
    REFERENSI: templateConfig.REFERENSI || batchMeta.referensi || '',
    // Referensi anggaran (opsional) — dipakai tabel "Referensi Anggaran"
    // kalau jenis suratnya butuh (mis. IOM Payout MPx).
    BUDGET_TYPE: templateConfig.BUDGET_TYPE || '',
    BUDGET_MTA_CC: templateConfig.BUDGET_MTA_CC || '',
    KOTA: templateConfig.KOTA || batchMeta.kota || 'Jakarta',
    SIGNER_1_NAME: templateConfig.SIGNER_1_NAME || '',
    SIGNER_1_TITLE: templateConfig.SIGNER_1_TITLE || '',
    SIGNER_1_COMPANY: templateConfig.SIGNER_1_COMPANY || '',
  };
  // PERIHAL: versi "Hal"/"Subject" yang sudah dirender (placeholder di
  // dalamnya, mis. {{PERIODE}}, sudah diisi) — dipakai blok body (mis.
  // judul pasal 2 di IOM Payout MPx) yang mau menampilkan ulang teks Hal
  // tanpa mengetik ulang templatenya.
  tokensSoFar.PERIHAL = templateConfig.HEADER_VALUE_3
    ? renderPlaceholders(templateConfig.HEADER_VALUE_3, tokensSoFar)
    : (templateConfig.PERIHAL_TEMPLATE ? renderPlaceholders(templateConfig.PERIHAL_TEMPLATE, tokensSoFar) : '');
  // NOTE_ITEMS: catatan baku (mis. definisi & tarif pajak) yang dipetakan
  // MEMO_BLOCKS lewat {{NOTE_ITEMS}} — sama seperti PERIHAL, field ini
  // hidup di templateConfig, jadi harus dirender & dimasukkan token di sini
  // supaya benar-benar tercetak (bukan cuma didefinisikan tanpa dipakai).
  tokensSoFar.NOTE_ITEMS = templateConfig.NOTE_ITEMS ? renderPlaceholders(templateConfig.NOTE_ITEMS, tokensSoFar) : '';
  return tokensSoFar;
}

/* ============================================================
   FONT BRAND: daftarkan Poppins (mendekati font "rounded" di surat
   asli) dengan 3 alias — 'Rounded' / 'Rounded-Medium' / 'Rounded-Bold'.
   Blok identitas penerima (Kepada Yth/No Ref/Perihal) TETAP pakai
   Helvetica/Helvetica-Bold bawaan pdfkit — di semua PDF referensi,
   blok itu konsisten pakai font sans standar (bukan rounded).
   ============================================================ */
function registerBrandFonts(doc) {
  doc.registerFont('Rounded', FONT_REGULAR);
  doc.registerFont('Rounded-Medium', FONT_MEDIUM);
  doc.registerFont('Rounded-Bold', FONT_BOLD);
}

/* ============================================================
   LOGO — posisi kiri atau kanan tergantung template (lihat
   STYLE_PRESETS). Tidak ada garis di bawah logo — di semua PDF
   referensi surat asli, logo berdiri sendiri tanpa garis pembatas
   (beda dari letterhead kosong/master .docx yang sempat dikirim
   sebelumnya, yang memang ada garisnya).
   ============================================================ */
function drawLogo(doc, position) {
  const logoWidth = 130;
  const logoHeight = (logoWidth * 140) / 402; // rasio asli file logo (402x140)
  const x = position === 'right'
    ? doc.page.width - doc.page.margins.right - logoWidth
    : doc.page.margins.left;
  doc.image(LOGO_PATH, x, doc.page.margins.top, { width: logoWidth });
  return logoHeight;
}

/* ============================================================
   FOOTER: alamat (generik Head Office Jakarta ATAU regional dari
   field KOP_SURAT template) + website + aksen bulat pojok kanan-
   bawah. Digambar di posisi TETAP relatif ke pojok halaman (bukan
   ikut doc.y) supaya selalu nempel di bawah.
   <-- CATATAN: kalau nanti suratnya bisa lebih dari 1 halaman,
   footer ini baru digambar 1x di halaman terakhir.
   ============================================================ */
function drawFooter(doc, variant, kopSuratRaw) {
  doc.page.margins.bottom = 0; // supaya nulis di zona bawah tidak memicu page-break otomatis

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const leftX = doc.page.margins.left;
  // Lebar kolom alamat regional sengaja dibatasi (bukan lebar penuh)
  // supaya teksnya bungkus jadi ~3 baris seperti aslinya dan tidak
  // tabrakan dengan "www.ioh.co.id" yang di-tengah-kan di bawahnya.
  const addrWidth = 175;

  doc.font('Rounded').fontSize(7.5).fillColor('#1F2933');

  if (variant === 'regional' && kopSuratRaw) {
    const parts = String(kopSuratRaw).split('|').map((s) => s.trim());
    const regionName = parts[0] || '';
    const regionAddress = parts[1] || '';
    let y = pageH - 62;
    doc.text(regionName, leftX, y, { width: addrWidth });
    doc.text(regionAddress, leftX, doc.y, { width: addrWidth });
  } else {
    let y = pageH - 60;
    GENERIC_FOOTER_LINES.forEach((line) => {
      doc.text(line, leftX, y, { lineBreak: false });
      y += 10;
    });
  }

  doc.font('Rounded-Bold').fontSize(9).fillColor('#1F2933')
    .text('www.ioh.co.id', 0, pageH - 40, { width: pageW, align: 'center', lineBreak: false });

  // Aksen bulat: pojok kanan-bawahnya nempel persis di pojok halaman,
  // sengaja kepotong di tepi kanan & bawah (sama seperti aslinya).
  const accentX = pageW - ACCENT_SIZE.width;
  const accentY = pageH - ACCENT_SIZE.height;
  doc.image(ACCENT_PATH, accentX, accentY, { width: ACCENT_SIZE.width, height: ACCENT_SIZE.height });
}

/* ============================================================
   BLOK IDENTITAS PENERIMA: Kepada Yth / Di Tempat / Region / No
   Ref / Perihal — semua bold, font sans standar (Helvetica-Bold),
   sesuai semua PDF referensi.
   ============================================================ */
function drawRecipientBlock(doc, templateConfig, tokens, pageWidth) {
  const leftX = doc.page.margins.left;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#0F172A');

  const recipientLines = renderPlaceholders(templateConfig.RECIPIENT_BLOCK, tokens).split('\n');
  recipientLines.forEach((line) => doc.text(line, leftX, doc.y, { width: pageWidth }));

  const noRef = renderPlaceholders(templateConfig.NO_REF_FORMAT, tokens);
  if (noRef && !/tanpa no ref/i.test(noRef)) {
    doc.text('No Ref  : ' + noRef, leftX, doc.y, { width: pageWidth });
  }
  doc.text('Perihal : ' + renderPlaceholders(templateConfig.PERIHAL_TEMPLATE, tokens), leftX, doc.y, { width: pageWidth });
  doc.moveDown(1);
}

/* ============================================================
   TABEL GAYA "HORIZONTAL" (RATE_OTF / KPI_TARGET): header gelap
   (#404040) teks putih bold center, 1 baris data, border tipis.
   Font: Helvetica/Helvetica-Bold (sesuai PDF referensi — bukan
   rounded, beda dari tabel gaya "vertical" di bawah).
   ============================================================ */
function drawHorizontalTable(doc, colLabels, fieldMap, row, tokens, pageWidth) {
  const leftX = doc.page.margins.left;
  const colWidth = pageWidth / colLabels.length;
  const tableTop = doc.y;
  const cellPadding = 8;
  const borderColor = '#9AA5B1';

  const values = colLabels.map((label) => {
    const getter = fieldMap[label];
    return getter ? getter(row) : (row[label] != null ? String(row[label]) : '');
  });
  const displayLabels = colLabels.map((label) => renderPlaceholders(label, tokens));

  // Tinggi baris dihitung dari teks TERPANJANG di kolom itu (label atau
  // nilai) supaya kolom yang bungkus 2 baris (mis. nama region panjang)
  // tidak keluar dari kotak border. <-- baris header & data bisa beda
  // tinggi kalau salah satunya lebih panjang.
  const headerRowHeight = Math.max(
    24,
    ...displayLabels.map((t) => doc.heightOfString(t, { width: colWidth - cellPadding, font: 'Helvetica-Bold', fontSize: 9 }) + 16)
  );
  const dataRowHeight = Math.max(
    24,
    ...values.map((t) => doc.heightOfString(t, { width: colWidth - cellPadding, font: 'Helvetica', fontSize: 9.5 }) + 16)
  );

  // header
  doc.rect(leftX, tableTop, pageWidth, headerRowHeight).fill('#404040');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
  displayLabels.forEach((displayLabel, i) => {
    doc.text(displayLabel, leftX + i * colWidth + cellPadding / 2, tableTop + 8, { width: colWidth - cellPadding, align: 'center' });
  });

  // data row
  const dataRowY = tableTop + headerRowHeight;
  doc.rect(leftX, dataRowY, pageWidth, dataRowHeight).stroke(borderColor);
  doc.fillColor('#1E293B').font('Helvetica').fontSize(9.5);
  values.forEach((val, i) => {
    doc.text(val, leftX + i * colWidth + cellPadding / 2, dataRowY + 8, { width: colWidth - cellPadding, align: 'center' });
  });

  // garis vertikal antar kolom (header + data)
  for (let i = 1; i < colLabels.length; i++) {
    doc.moveTo(leftX + i * colWidth, tableTop).lineTo(leftX + i * colWidth, dataRowY + dataRowHeight)
      .strokeColor(borderColor).lineWidth(0.5).stroke();
  }

  doc.y = dataRowY + dataRowHeight + 16;
  doc.x = leftX;
}

/* ============================================================
   TABEL GAYA "VERTICAL" (SP_DISCOUNT_FEE / DISTRIBUTION_FEE): 2
   kolom label:nilai bertumpuk, baris "Total" di-shading abu-abu
   (#D9D9D9) + bold. Font: Rounded (Poppins), sesuai PDF referensi.
   ============================================================ */
function drawVerticalTable(doc, colLabels, fieldMap, row, tokens, pageWidth) {
  const leftX = doc.page.margins.left;
  const labelColWidth = pageWidth * 0.55;
  const valueColWidth = pageWidth - labelColWidth;
  const rowHeight = 22;
  const borderColor = '#333333';
  let y = doc.y;

  colLabels.forEach((label) => {
    const isTotal = label.trim().toLowerCase() === 'total';
    const displayLabel = renderPlaceholders(label, tokens);
    const getter = fieldMap[label];
    const val = getter ? getter(row) : (row[label] != null ? String(row[label]) : '');

    if (isTotal) {
      doc.rect(leftX, y, pageWidth, rowHeight).fill('#D9D9D9');
    }
    doc.rect(leftX, y, pageWidth, rowHeight).stroke(borderColor);
    doc.moveTo(leftX + labelColWidth, y).lineTo(leftX + labelColWidth, y + rowHeight)
      .strokeColor(borderColor).lineWidth(0.75).stroke();

    const font = isTotal ? 'Rounded-Bold' : 'Rounded';
    doc.font(font).fontSize(9.5).fillColor('#1E293B')
      .text(displayLabel, leftX + 6, y + 6, { width: labelColWidth - 12 });
    doc.font(font).fontSize(9.5).fillColor('#1E293B')
      .text(val, leftX + labelColWidth + 6, y + 6, { width: valueColWidth - 12 });

    y += rowHeight;
  });

  doc.y = y + 16;
  doc.x = leftX;
}

/* ============================================================
   "Catatan:" + daftar bullet dash ("-") — dipakai SP_DISCOUNT_FEE /
   DISTRIBUTION_FEE. Font Rounded, hanging-indent sederhana.
   ============================================================ */
function drawCatatanBullets(doc, catatanText, pageWidth) {
  if (!catatanText) return;
  const leftX = doc.page.margins.left;
  const indent = 18;

  doc.font('Rounded-Bold').fontSize(10).fillColor('#1E293B').text('Catatan:', leftX, doc.y);
  doc.moveDown(0.3);

  const items = String(catatanText).split('\n').map((s) => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  items.forEach((item) => {
    const startY = doc.y;
    doc.font('Rounded').fontSize(9.5).fillColor('#1E293B').text('-', leftX + 2, startY, { lineBreak: false, width: 12 });
    doc.y = startY;
    doc.font('Rounded').fontSize(9.5).fillColor('#1E293B').text(item, leftX + indent, startY, { width: pageWidth - indent });
    doc.moveDown(0.25);
  });
  doc.moveDown(0.5);
  doc.x = leftX;
}

/* ============================================================
   PENUTUP + BLOK TANDA TANGAN — rata KIRI (bukan kanan) sesuai
   semua PDF referensi. Font Rounded/Rounded-Bold. CC opsional
   (dipakai KPI_TARGET).
   ============================================================ */
function drawClosingAndSignature(doc, templateConfig, tokens, style, pageWidth) {
  const leftX = doc.page.margins.left;

  doc.font('Rounded').fontSize(10).fillColor('#1E293B')
    .text(renderPlaceholders(templateConfig.CLOSING, tokens), leftX, doc.y, { width: pageWidth });
  doc.moveDown(1.2);

  doc.font('Rounded').fontSize(10).fillColor('#1E293B').text(style.closingWord, leftX, doc.y);
  if (style.showCompanyAfterClosing) {
    doc.font('Rounded').fontSize(10).text(templateConfig.SIGNER_1_COMPANY || '', leftX, doc.y);
  }

  const signatureAreaY = doc.y + 6;
  doc.moveDown(4); // <-- ruang kosong buat tempel gambar TTD + stempel (tahap berikutnya)

  doc.font('Rounded-Bold').fontSize(10).fillColor('#1E293B')
    .text(templateConfig.SIGNER_1_NAME || '', leftX, doc.y, { underline: true });
  doc.font('Rounded-Bold').fontSize(9.5).fillColor('#1E293B')
    .text(templateConfig.SIGNER_1_TITLE || '', leftX, doc.y);

  if (style.showCc && templateConfig.CC_LIST) {
    doc.moveDown(0.8);
    const ccText = renderPlaceholders(templateConfig.CC_LIST, tokens);
    doc.font('Rounded').fontSize(8).fillColor('#475569').text('Cc: ' + ccText, leftX, doc.y, { width: pageWidth });
  }

  return { x: leftX, y: signatureAreaY, width: 220 };
}


/* ============================================================
   TABEL 2 KOLOM DENGAN HEADER GELAP — "DESKRIPSI | KETERANGAN /
   NILAI". Baris terakhir bisa ditebalkan (baris total). Tinggi tiap
   baris mengikuti isi, karena kolom keterangan bisa memuat paragraf
   panjang yang membungkus beberapa baris.
   ============================================================ */
function drawLabelValueTable(doc, headerLeft, headerRight, rows, pageWidth, opts) {
  const options = opts || {};
  const leftX = doc.page.margins.left;
  const labelW = pageWidth * (options.labelRatio || 0.34);
  const valueW = pageWidth - labelW;
  const border = '#333333';
  const padX = 6, padY = 5;
  let y = doc.y;

  if (headerLeft || headerRight) {
    const h = 18;
    doc.rect(leftX, y, pageWidth, h).fill('#7F7F7F');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF')
      .text(headerLeft || '', leftX + padX, y + 5, { width: labelW - padX * 2, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF')
      .text(headerRight || '', leftX + labelW + padX, y + 5, { width: valueW - padX * 2, lineBreak: false });
    doc.rect(leftX, y, pageWidth, h).strokeColor(border).lineWidth(0.75).stroke();
    y += h;
  }

  rows.forEach((r, i) => {
    const bold = Boolean(r.bold);
    const font = bold ? 'Rounded-Bold' : 'Rounded';
    const label = String(r.label == null ? '' : r.label);
    const value = String(r.value == null ? '' : r.value);
    // Tinggi baris dihitung dari isi terpanjang antara dua kolom.
    doc.font(font).fontSize(9);
    const hL = doc.heightOfString(label, { width: labelW - padX * 2 });
    const hR = doc.heightOfString(value, { width: valueW - padX * 2, align: r.valueAlign || 'left' });
    const h = Math.max(hL, hR) + padY * 2;

    if (bold) doc.rect(leftX, y, pageWidth, h).fill('#D9D9D9');
    doc.rect(leftX, y, pageWidth, h).strokeColor(border).lineWidth(0.75).stroke();
    doc.moveTo(leftX + labelW, y).lineTo(leftX + labelW, y + h).strokeColor(border).lineWidth(0.75).stroke();

    doc.font(font).fontSize(9).fillColor('#1E293B')
      .text(label, leftX + padX, y + padY, { width: labelW - padX * 2 });
    doc.font(font).fontSize(9).fillColor('#1E293B')
      .text(value, leftX + labelW + padX, y + padY, { width: valueW - padX * 2, align: r.valueAlign || 'left' });
    y += h;
  });

  doc.y = y;
  doc.x = leftX;
}

/* ============================================================
   TABEL DENGAN HEADER GABUNGAN BERTUMPUK — header gelap setinggi
   beberapa baris (nama program / nama PT / periode) lalu baris
   label:nilai di bawahnya. Dipakai tabel pertama Surat Pemberitahuan.
   ============================================================ */
function drawMergedHeaderTable(doc, titleLines, rows, pageWidth) {
  const leftX = doc.page.margins.left;
  const labelW = pageWidth * 0.52;
  const valueW = pageWidth - labelW;
  const border = '#333333';
  const lines = (titleLines || []).filter(Boolean);
  let y = doc.y;

  const headerH = 14 * lines.length + 10;
  doc.rect(leftX, y, pageWidth, headerH).fill('#7F7F7F');
  let ty = y + 5;
  lines.forEach((line) => {
    doc.font('Rounded-Bold').fontSize(9.5).fillColor('#FFFFFF')
      .text(line, leftX, ty, { width: pageWidth, align: 'center', lineBreak: false });
    ty += 14;
  });
  doc.rect(leftX, y, pageWidth, headerH).strokeColor(border).lineWidth(0.75).stroke();
  y += headerH;

  rows.forEach((r) => {
    const bold = Boolean(r.bold);
    const font = bold ? 'Rounded-Bold' : 'Rounded';
    const h = 18;
    doc.rect(leftX, y, pageWidth, h).strokeColor(border).lineWidth(0.75).stroke();
    doc.moveTo(leftX + labelW, y).lineTo(leftX + labelW, y + h).strokeColor(border).lineWidth(0.75).stroke();
    doc.font(font).fontSize(9).fillColor('#1E293B')
      .text(String(r.label || ''), leftX + 6, y + 5, { width: labelW - 12, lineBreak: false });
    doc.font(font).fontSize(9).fillColor('#1E293B')
      .text(String(r.value || ''), leftX + labelW + 6, y + 5, { width: valueW - 12, align: 'right', lineBreak: false });
    y += h;
  });

  doc.y = y;
  doc.x = leftX;
}

/* Ambil daftar berpisah "|" dari konfigurasi template, sudah dirender
   token-nya. Dipakai buat daftar pernyataan/ketentuan yang jumlahnya
   bisa berbeda-beda per template. */
function splitConfigList(raw, tokens) {
  if (!raw) return [];
  return String(raw).split('|').map((s) => renderPlaceholders(s.trim(), tokens)).filter(Boolean);
}

/* Daftar bernomor dengan hanging indent, plus sub-bullet opsional yang
   ditulis memakai awalan "-" di dalam item. */
function drawNumberedList(doc, items, pageWidth, startNo) {
  const leftX = doc.page.margins.left;
  const indent = 20;
  let no = startNo || 1;
  items.forEach((item) => {
    const parts = String(item).split('\n').map((x) => x.trim()).filter(Boolean);
    const head = parts.shift() || '';
    const y0 = doc.y;
    doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
      .text(no + '.', leftX + 2, y0, { width: 16, lineBreak: false });
    doc.y = y0;
    doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
      .text(head, leftX + indent, y0, { width: pageWidth - indent, align: 'justify' });
    parts.forEach((sub) => {
      const clean = sub.replace(/^[-•]\s*/, '');
      const ys = doc.y;
      doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
        .text('•', leftX + indent + 6, ys, { width: 10, lineBreak: false });
      doc.y = ys;
      doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
        .text(clean, leftX + indent + 20, ys, { width: pageWidth - indent - 20 });
    });
    doc.moveDown(0.4);
    no += 1;
  });
  doc.x = leftX;
}

/* ============================================================
   SURAT PEMBERITAHUAN (2 halaman) -> Buffer PDF
   Halaman 1: kop, kota/tanggal, blok "Kepada Yth", No & Perihal,
   paragraf pembuka, tabel ringkasan program (header gabungan), lalu
   tabel rincian deskripsi/nilai.
   Halaman 2: lampiran "Ketentuan Klaim Pembayaran", penutup, tanda
   tangan, dan Cc.
   Semua isi datang dari templateConfig/row — tidak ada nama, PT, atau
   nilai yang ditanam di kode ini.
   ============================================================ */
function generatePemberitahuanPdf(templateConfig, row, batchMeta, seq) {
  return new Promise((resolve, reject) => {
    const tokens = buildTokens(row, templateConfig, batchMeta, seq);
    const style = STYLE_PRESETS.PEMBERITAHUAN;
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    registerBrandFonts(doc);

    let currentPageIndex = 0;
    doc.on('pageAdded', () => { currentPageIndex += 1; });
    let signatureAnchor = null;
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), signatureAnchor }));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const letterDate = batchMeta.letterDate instanceof Date ? batchMeta.letterDate : new Date();

    // ---------- Halaman 1 ----------
    const logoHeight = drawLogo(doc, style.logoPosition);
    doc.y = doc.page.margins.top + logoHeight + 16;

    doc.font('Rounded').fontSize(10).fillColor('#1E293B')
      .text(`${templateConfig.KOTA_SURAT || templateConfig.KOTA || 'Jakarta'}, ${formatTanggalID(letterDate)}`, leftX, doc.y);
    doc.moveDown(1);

    // "Kepada Yth <sebutan>" — sebutan (mis. jenis mitra) ikut konfigurasi.
    const sebutan = renderPlaceholders(templateConfig.RECIPIENT_TITLE || '', tokens);
    const y0 = doc.y;
    doc.font('Rounded').fontSize(10).fillColor('#1E293B')
      .text('Kepada Yth ', leftX, y0, { continued: Boolean(sebutan) });
    if (sebutan) doc.font('Rounded-Bold').fontSize(10).text(sebutan);
    doc.font('Rounded-Bold').fontSize(10).fillColor('#1E293B')
      .text(renderPlaceholders(templateConfig.RECIPIENT_BLOCK || '{{PT_NAME}}', tokens), leftX, doc.y, { width: pageWidth });
    doc.font('Rounded').fontSize(10).text('Di Tempat', leftX, doc.y);
    doc.moveDown(1.4);

    const noRef = renderPlaceholders(templateConfig.NO_REF_FORMAT, tokens);
    const labelW = 60;
    if (noRef) {
      const yn = doc.y;
      doc.font('Rounded').fontSize(10).text('No', leftX, yn, { width: labelW, lineBreak: false });
      doc.text(':', leftX + labelW, yn, { width: 10, lineBreak: false });
      doc.text(noRef, leftX + labelW + 16, yn, { width: pageWidth - labelW - 16 });
    }
    const yp = doc.y;
    doc.font('Rounded').fontSize(10).text('Perihal', leftX, yp, { width: labelW, lineBreak: false });
    doc.text(':', leftX + labelW, yp, { width: 10, lineBreak: false });
    doc.text(renderPlaceholders(templateConfig.PERIHAL_TEMPLATE, tokens), leftX + labelW + 16, yp, { width: pageWidth - labelW - 16 });
    doc.moveDown(1.2);

    doc.font('Rounded').fontSize(10).fillColor('#1E293B')
      .text(renderPlaceholders(templateConfig.BODY_OPENING, tokens), leftX, doc.y, {
        width: pageWidth, align: 'justify', indent: 24,
      });
    doc.moveDown(1);

    // Tabel 1 — ringkasan program (header gabungan 3 baris).
    const t1Rows = splitConfigList(templateConfig.SUMMARY_TABLE_ROWS, tokens).map((entry, idx, arr) => {
      const bits = entry.split('=');
      return { label: (bits[0] || '').trim(), value: (bits[1] || '').trim(), bold: idx === arr.length - 1 };
    });
    if (t1Rows.length) {
      drawMergedHeaderTable(doc, [
        renderPlaceholders(templateConfig.SUMMARY_TABLE_TITLE || '', tokens),
        renderPlaceholders(templateConfig.RECIPIENT_BLOCK || '{{PT_NAME}}', tokens),
        batchMeta.periode ? 'Periode ' + batchMeta.periode : '',
      ], t1Rows, pageWidth);
      doc.moveDown(1.2);
    }

    // Tabel 2 — rincian deskripsi/nilai.
    const t2Rows = splitConfigList(templateConfig.DETAIL_ROWS, tokens).map((entry, idx, arr) => {
      const bits = entry.split('=');
      return { label: (bits[0] || '').trim(), value: (bits[1] || '').trim(), bold: idx === arr.length - 1 };
    });
    if (t2Rows.length) {
      drawLabelValueTable(doc,
        templateConfig.DETAIL_HEADER_LEFT || 'DESKRIPSI',
        templateConfig.DETAIL_HEADER_RIGHT || 'KETERANGAN / NILAI',
        t2Rows, pageWidth, { labelRatio: 0.34 });
    }

    drawFooter(doc, style.footerVariant, templateConfig.KOP_SURAT);

    // ---------- Halaman 2: lampiran ketentuan + tanda tangan ----------
    doc.addPage();
    doc.page.margins.bottom = 56;
    const logoH2 = drawLogo(doc, style.logoPosition);
    doc.y = doc.page.margins.top + logoH2 + 16;

    const lampiranJudul = renderPlaceholders(templateConfig.ATTACHMENT_TITLE || '', tokens);
    if (lampiranJudul) {
      doc.font('Rounded-Bold').fontSize(10).fillColor('#1E293B').text(lampiranJudul, leftX, doc.y);
      doc.moveDown(0.6);
    }
    const lampiranIntro = renderPlaceholders(templateConfig.ATTACHMENT_INTRO || '', tokens);
    if (lampiranIntro) {
      doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
        .text(lampiranIntro, leftX, doc.y, { width: pageWidth, align: 'justify', indent: 24 });
      doc.moveDown(0.8);
    }
    const ketentuan = splitConfigList(templateConfig.ATTACHMENT_ITEMS, tokens);
    if (ketentuan.length) drawNumberedList(doc, ketentuan, pageWidth, 1);

    doc.moveDown(0.8);
    doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
      .text(renderPlaceholders(templateConfig.CLOSING, tokens), leftX, doc.y, { width: pageWidth });
    doc.moveDown(1.4);

    doc.font('Rounded').fontSize(10).fillColor('#1E293B').text(style.closingWord, leftX, doc.y);
    const sigY = doc.y + 6;
    doc.moveDown(4.5); // ruang tempel tanda tangan

    doc.font('Rounded-Bold').fontSize(10).fillColor('#1E293B')
      .text(templateConfig.SIGNER_1_NAME || '', leftX, doc.y, { underline: true });
    doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
      .text(templateConfig.SIGNER_1_TITLE || '', leftX, doc.y);
    if (templateConfig.SIGNER_1_COMPANY) {
      doc.font('Rounded').fontSize(9.5).text(templateConfig.SIGNER_1_COMPANY, leftX, doc.y);
    }
    if (templateConfig.CC_LIST) {
      doc.moveDown(1);
      doc.font('Rounded').fontSize(9).fillColor('#1E293B')
        .text('Cc: ' + renderPlaceholders(templateConfig.CC_LIST, tokens), leftX, doc.y, { width: pageWidth });
    }

    signatureAnchor = { x: leftX, y: sigY, width: 200, pageIndex: currentPageIndex };
    drawFooter(doc, style.footerVariant, templateConfig.KOP_SURAT);
    doc.end();
  });
}

/* ============================================================
   BERITA ACARA SERAH TERIMA (BAST) -> Buffer PDF
   Dokumen dua pihak: TANPA kop/logo dan TANPA nomor surat (sesuai
   contoh), judul di tengah, blok PIHAK PERTAMA & PIHAK KEDUA, daftar
   pernyataan bernomor, tabel rincian, lalu DUA blok tanda tangan
   berdampingan.
   ============================================================ */
function generateBastPdf(templateConfig, row, batchMeta, seq) {
  return new Promise((resolve, reject) => {
    const tokens = buildTokens(row, templateConfig, batchMeta, seq);
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    registerBrandFonts(doc);

    let currentPageIndex = 0;
    doc.on('pageAdded', () => { currentPageIndex += 1; });
    let signatureAnchor = null;
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), signatureAnchor }));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const letterDate = batchMeta.letterDate instanceof Date ? batchMeta.letterDate : new Date();

    doc.y = doc.page.margins.top + 20;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
      .text('BERITA ACARA SERAH TERIMA', leftX, doc.y, { width: pageWidth, align: 'center' });
    const subJudul = renderPlaceholders(templateConfig.PERIHAL_TEMPLATE || '', tokens);
    if (subJudul) {
      doc.font('Helvetica-Bold').fontSize(11)
        .text(subJudul, leftX, doc.y + 2, { width: pageWidth, align: 'center' });
    }
    doc.moveDown(2.5);

    // "Pada hari ini, <tgl> bulan <bln> tahun <thn>, yang bertanda tangan di bawah ini:"
    doc.font('Helvetica').fontSize(10).fillColor('#000000').text(
      `Pada hari ini,  ${letterDate.getDate()} bulan ${letterDate.getMonth() + 1} tahun ${letterDate.getFullYear()}, yang bertanda tangan di bawah ini:`,
      leftX, doc.y, { width: pageWidth });
    doc.moveDown(1.2);

    const blokPihak = (judul, nama, jabatan, perusahaan) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(judul, leftX, doc.y);
      doc.font('Helvetica').fontSize(10).text('Nama : ' + (nama || ''), leftX, doc.y);
      doc.font('Helvetica').fontSize(10).text('Jabatan : ' + (jabatan || ''), leftX, doc.y);
      doc.font('Helvetica').fontSize(10).text('Perusahaan : ' + (perusahaan || ''), leftX, doc.y);
      doc.moveDown(1);
    };
    blokPihak('PIHAK PERTAMA',
      templateConfig.SIGNER_1_NAME, templateConfig.SIGNER_1_TITLE, templateConfig.SIGNER_1_COMPANY);
    blokPihak('PIHAK KEDUA',
      renderPlaceholders(templateConfig.PIHAK2_NAMA || '', tokens),
      renderPlaceholders(templateConfig.PIHAK2_JABATAN || '', tokens),
      renderPlaceholders(templateConfig.PIHAK2_PERUSAHAAN || '{{PT_NAME}}', tokens));

    doc.font('Helvetica').fontSize(10).fillColor('#000000').text('Dengan ini menyatakan bahwa:', leftX, doc.y);
    doc.moveDown(0.4);
    const pernyataan = splitConfigList(templateConfig.BAST_STATEMENTS, tokens);
    if (pernyataan.length) {
      let no = 1;
      pernyataan.forEach((item) => {
        const y0 = doc.y;
        doc.font('Helvetica').fontSize(10).text(no + '.', leftX + 12, y0, { width: 16, lineBreak: false });
        doc.y = y0;
        doc.font('Helvetica').fontSize(10).text(item, leftX + 32, y0, { width: pageWidth - 32 });
        doc.moveDown(0.3);
        no += 1;
      });
    }
    doc.moveDown(0.8);

    doc.font('Helvetica').fontSize(10).text('Rincian perolehan:', leftX, doc.y);
    doc.moveDown(0.3);

    // Tabel rincian: kolom mengikuti DETAIL_TABLE_COLUMNS, nilainya dari row.
    const colLabels = (templateConfig.DETAIL_TABLE_COLUMNS || '').split('|').map((s) => s.trim()).filter(Boolean);
    if (colLabels.length) {
      const fieldMap = buildGenericFieldMap(colLabels);
      const colW = pageWidth / colLabels.length;
      const border = '#333333';
      let y = doc.y;
      // Tinggi header dihitung dari label terpanjang — kalau dipaksa satu
      // baris, judul seperti "Distribution Fee (DPP)" akan terpotong.
      doc.font('Helvetica-Bold').fontSize(8.5);
      const hH = Math.max(16, colLabels.reduce((mx, label) =>
        Math.max(mx, doc.heightOfString(renderPlaceholders(label, tokens), { width: colW - 8 })), 0) + 8);
      doc.rect(leftX, y, pageWidth, hH).fill('#7F7F7F');
      colLabels.forEach((label, i) => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF')
          .text(renderPlaceholders(label, tokens), leftX + i * colW + 4, y + 4, { width: colW - 8 });
      });
      doc.rect(leftX, y, pageWidth, hH).strokeColor(border).lineWidth(0.75).stroke();
      y += hH;

      const rowH = 15;
      doc.rect(leftX, y, pageWidth, rowH).strokeColor(border).lineWidth(0.75).stroke();
      colLabels.forEach((label, i) => {
        const getter = fieldMap[label];
        const val = getter ? getter(row) : (row[label] != null ? String(row[label]) : '');
        if (i > 0) doc.moveTo(leftX + i * colW, y).lineTo(leftX + i * colW, y + rowH).strokeColor(border).lineWidth(0.75).stroke();
        doc.font('Helvetica').fontSize(8.5).fillColor('#000000')
          .text(val, leftX + i * colW + 4, y + 4, { width: colW - 8, lineBreak: false });
      });
      y += rowH;

      // Baris total — angkanya sama dengan baris data karena BAST dibuat
      // per mitra (satu baris per dokumen), jadi total = nilai baris itu.
      doc.rect(leftX, y, pageWidth, rowH).fill('#D9D9D9');
      doc.rect(leftX, y, pageWidth, rowH).strokeColor(border).lineWidth(0.75).stroke();
      colLabels.forEach((label, i) => {
        const getter = fieldMap[label];
        const val = i === 0 ? '' : (getter ? getter(row) : '');
        if (i > 0) doc.moveTo(leftX + i * colW, y).lineTo(leftX + i * colW, y + rowH).strokeColor(border).lineWidth(0.75).stroke();
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000')
          .text(val, leftX + i * colW + 4, y + 4, { width: colW - 8, lineBreak: false });
      });
      y += rowH;
      doc.y = y + 16;
      doc.x = leftX;
    }

    doc.font('Helvetica').fontSize(10).fillColor('#000000')
      .text(renderPlaceholders(templateConfig.CLOSING, tokens), leftX, doc.y, { width: pageWidth });
    doc.moveDown(2);

    // Dua blok tanda tangan berdampingan.
    const colW2 = pageWidth / 2;
    const yTtd = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor('#000000')
      .text('PIHAK PERTAMA,', leftX, yTtd, { width: colW2, align: 'center' });
    doc.text(templateConfig.SIGNER_1_COMPANY || '', leftX, doc.y, { width: colW2, align: 'center' });
    const kiriBawah = doc.y;

    doc.font('Helvetica').fontSize(10)
      .text('PIHAK KEDUA,', leftX + colW2, yTtd, { width: colW2, align: 'center' });
    doc.text(renderPlaceholders(templateConfig.PIHAK2_PERUSAHAAN || '{{PT_NAME}}', tokens),
      leftX + colW2, doc.y, { width: colW2, align: 'center' });

    const sigY = Math.max(kiriBawah, doc.y) + 8;
    const namaY = sigY + 74; // ruang kosong buat tempel tanda tangan

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
      .text(templateConfig.SIGNER_1_NAME || '', leftX, namaY, { width: colW2, align: 'center', underline: true });
    doc.font('Helvetica').fontSize(10)
      .text(templateConfig.SIGNER_1_TITLE || '', leftX, doc.y, { width: colW2, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(10)
      .text(renderPlaceholders(templateConfig.PIHAK2_NAMA || '', tokens), leftX + colW2, namaY, { width: colW2, align: 'center', underline: true });
    doc.font('Helvetica').fontSize(10)
      .text(renderPlaceholders(templateConfig.PIHAK2_JABATAN || '', tokens), leftX + colW2, doc.y, { width: colW2, align: 'center' });

    // Tanda tangan ditempel di blok PIHAK PERTAMA (pihak Indosat).
    signatureAnchor = { x: leftX + colW2 / 2 - 60, y: sigY, width: 120, pageIndex: currentPageIndex };
    doc.end();
  });
}


/* ============================================================
   ===============  MESIN MEMO (IOM / NOTA DINAS)  ============
   ============================================================

   Hasil membandingkan enam memo referensi (IOM Payout MPx, IOM Payout
   SDP/3KIOSK, IOM Permohonan/Reva, ND Permohonan, IOM Request): KERANGKANYA
   SAMA SEMUA. Yang berbeda cuma isinya. Kerangka tetapnya:

     1. kop (logo kiri)
     2. judul dokumen di tengah, bergaris bawah  ("INTER OFFICE MEMO" /
        "NOTA DINAS")
     3. nomor surat di bawah judul
     4. blok kepala 3 baris  (To/From/Subject  atau  Kepada/Dari/Hal)
     5. garis pemisah horizontal
     6. BADAN: pasal bernomor 1..N
     7. pasal terakhir = kalimat penutup
     8. blok tanda tangan (3 varian: tunggal / grid 2x2 / tabel TTD)
     9. footer alamat + www + aksen bulat
    10. running header di halaman 2 dst (nomor + perihal)

   Karena itu TIDAK dibuat satu generator per jenis IOM. Yang dibuat satu
   mesin, lalu perbedaan tiap jenis dinyatakan sebagai DATA — daftar blok
   penyusun badan surat (MEMO_BLOCKS) + varian tanda tangan. Menambah jenis
   IOM baru nanti cukup menambah daftar blok, tanpa menulis kode baru.

   Jenis blok yang tersedia:
     heading    - judul pasal (tebal)
     paragraph  - paragraf biasa
     bullet     - butir "-"        (a/b/c kalau listStyle 'letter')
     subbullet  - butir tingkat 2
     link       - baris tautan (biru, bergaris bawah)
     table      - tabel, sumbernya SELALU sheet data yang sama; bentuknya
                  ditentukan `mode`:
                    ringkasan    -> dikelompokkan per kolom (mis. PROGRAM),
                                    kolom nilai dijumlahkan + baris TOTAL
                    rincian      -> satu baris per mitra + baris TOTAL
                    pivot_status -> Qty & Total per wilayah, dipecah
                                    Badan Usaha vs Individu (varian SDP)
   ============================================================ */

// Kolom baku sheet data (lihat Format_Data_Surat_per_Jenis.xlsx). Dipakai
// mesin untuk membedakan kolom identitas dari kolom nilai.
const MEMO_ID_COLUMNS = ['PROGRAM', 'REGION', 'AREA', 'BRANCH', 'STATUS_USAHA', 'ID_PARTNER', 'PARTNER_NAME', 'NO_OTTOCASH'];

function memoToNumber(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function memoFormatNumber(n) {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toLocaleString('id-ID');
  return neg ? '-' + s : s;
}
/* Kolom nilai = semua kolom yang BUKAN kolom identitas. Aturan ini yang
   membuat pengguna bebas menambah kolom angka di Excel tanpa mendaftarkannya
   di mana pun. */
function memoValueColumns(rows) {
  const seen = [];
  rows.forEach((r) => Object.keys(r || {}).forEach((k) => {
    const key = String(k).trim();
    if (!key || seen.includes(key)) return;
    if (MEMO_ID_COLUMNS.includes(key.toUpperCase())) return;
    seen.push(key);
  }));
  return seen;
}

/* Lebar kolom otomatis mengikuti isi (bukan dibagi rata) — supaya kolom
   "NO." yang isinya cuma 1-2 digit tidak selebar "PARTNER NAME", dan
   tidak ada ruang kosong menganggur di tiap sel. Kolom yang butuh lebih
   banyak tempat (teks panjang) dapat porsi lebih besar dari sisa ruang;
   kalau total kebutuhan melebihi lebar halaman, semua kolom dikecilkan
   proporsional supaya tetap muat & presisi. */
function computeAutoColumnWidths(doc, headers, body, totalWidth) {
  const padX = 4;
  const n = headers.length;
  const minColWidth = Math.min(34, totalWidth / n);

  doc.font('Helvetica-Bold').fontSize(8);
  const natural = headers.map((h) => doc.widthOfString(String(h == null ? '' : h)) + padX * 2 + 6);
  doc.font('Helvetica').fontSize(8);
  body.forEach((r) => {
    (r.cells || []).forEach((c, i) => {
      const w = doc.widthOfString(String(c == null ? '' : c)) + padX * 2 + 6;
      if (i < natural.length && w > natural[i]) natural[i] = w;
    });
  });

  const capped = natural.map((w) => Math.max(minColWidth, Math.min(w, totalWidth * 0.42)));
  const totalNatural = capped.reduce((a, b) => a + b, 0);

  if (totalNatural <= totalWidth) {
    const extra = totalWidth - totalNatural;
    const totalWeight = capped.reduce((a, b) => a + b, 0) || 1;
    return capped.map((w) => w + (extra * w) / totalWeight);
  }
  const scale = totalWidth / totalNatural;
  return capped.map((w) => Math.max(minColWidth * 0.7, w * scale));
}

/* ---------- tabel generik untuk memo ---------- */
/* Lebar kolom "presisi & padat": angka TIDAK PERNAH dipecah ke baris baru
   (lebarnya selalu cukup untuk digit terpanjang), kolom teks yang menyerap
   sisa ruang (boleh bungkus per kata), dan kalau tetap tidak muat ukuran
   huruf diturunkan bertahap (8 -> 6 pt) alih-alih mengorbankan angka. */
function isMemoTotalRow(r) {
  return Boolean(r.__total) || (r.cells || []).some((c) => /^\s*((sub|grand)\s*)?total\b/i.test(String(c == null ? '' : c)));
}

function computeSmartTableLayout(doc, headers, body, totalWidth, alignRight) {
  const n = headers.length;
  const padX = 3;
  const right = new Set(alignRight || []);
  const words = (s) => String(s == null ? '' : s).split(/\s+/).filter(Boolean);
  const sizes = [8, 7.5, 7, 6.5, 6];
  const measure = (fs) => {
    const w = (s, font) => { doc.font(font).fontSize(fs); return doc.widthOfString(String(s)); };
    return headers.map((h, i) => {
      const numeric = right.has(i);
      let cellFull = 0, cellWord = 0;
      body.forEach((r) => {
        const c = String((r.cells || [])[i] == null ? '' : r.cells[i]);
        const f = isMemoTotalRow(r) ? 'Helvetica-Bold' : 'Helvetica';
        cellFull = Math.max(cellFull, w(c, f));
        words(c).forEach((x) => { cellWord = Math.max(cellWord, w(x, f)); });
      });
      let headFull = w(h, 'Helvetica-Bold'), headWord = 0;
      words(h).forEach((x) => { headWord = Math.max(headWord, w(x, 'Helvetica-Bold')); });
      const pad = padX * 2 + 2;
      const cellPad = cellFull + pad, headPad = headWord + pad;
      if (numeric) {
        const need = Math.max(cellFull, headWord) + pad; // angka: tanpa bungkus
        return { min: need, full: Math.max(need, headFull + pad), cellPad, headPad };
      }
      return { min: Math.max(cellWord, headWord) + pad, full: Math.max(cellFull, headFull) + pad, cellPad, headPad };
    });
  };
  // Tahap 1 — "semua satu baris": cari ukuran huruf TERBESAR (8 -> 6 pt, kelipatan
  // 0.25) di mana setiap isi sel (nama mitra juga) muat satu baris penuh.
  // Hasilnya semua baris data tingginya seragam & kolom presisi; judul kolom
  // tetap boleh turun baris per kata.
  for (let fs = 8; fs >= 6 - 1e-9; fs -= 0.25) {
    const m = measure(fs);
    const need = m.map((x) => Math.max(x.cellPad, x.headPad));
    const sum = need.reduce((a, b) => a + b, 0);
    if (sum <= totalWidth) {
      const extra = totalWidth - sum;
      const widths = need.map((x) => x + (extra * x) / sum);
      return { widths, fontSize: fs, padX, singleLine: true };
    }
  }
  for (const fs of sizes) {
    const m = measure(fs);
    const sumMin = m.reduce((a, x) => a + x.min, 0);
    if (sumMin <= totalWidth || fs === sizes[sizes.length - 1]) {
      let widths = m.map((x) => x.min);
      if (sumMin > totalWidth) { const k = totalWidth / sumMin; return { widths: widths.map((x) => x * k), fontSize: fs, padX }; }
      let rest = totalWidth - sumMin;
      // 1) kolom yang masih bisa dilebarkan sampai muat satu baris penuh
      const grow = m.map((x) => Math.max(0, x.full - x.min));
      const sumGrow = grow.reduce((a, b) => a + b, 0);
      if (sumGrow > 0) {
        const give = Math.min(rest, sumGrow);
        widths = widths.map((x, i) => x + (give * grow[i]) / sumGrow);
        rest -= give;
      }
      // 2) sisa ruang dibagi proporsional supaya tabel selalu selebar area
      if (rest > 0.01) {
        const tot = widths.reduce((a, b) => a + b, 0);
        widths = widths.map((x) => x + (rest * x) / tot);
      }
      return { widths, fontSize: fs, padX };
    }
  }
  return { widths: headers.map(() => totalWidth / n), fontSize: 6, padX };
}

/* Pilih lebar tabel: mulai dari lebar sejajar teks badan; kalau agar semua
   isi muat SATU baris huruf harus < 7 pt, tabel dilebarkan bertahap sampai
   batas kanan-kiri halaman, lalu ke tepi lebar (margin 36 pt) — lebih baik
   tabel sedikit melebar daripada huruf mengecil / isi turun baris. */
function chooseTableLayout(doc, headers, body, alignRight, indent) {
  const pageTotal = doc.page.width;
  const ml = doc.page.margins.left;
  const inner = pageTotal - ml - doc.page.margins.right;
  const cands = [
    { left: ml + indent, width: inner - indent },
    { left: ml, width: inner },
    { left: 36, width: pageTotal - 72 },
  ];
  let last = null;
  for (const c of cands) {
    const lay = computeSmartTableLayout(doc, headers, body, c.width, alignRight);
    lay.left = c.left; lay.tableWidth = c.width;
    if (lay.singleLine && lay.fontSize >= 7) return lay;
    last = lay;
  }
  // Tidak ada yang mencapai 7 pt satu-baris: pakai yang paling lebar.
  return last;
}

function drawMemoTable(doc, headersRaw, bodyRaw, pageWidth, opts) {
  const options = opts || {};
  // Judul kolom "NILAI_SETELAH_PAJAK" boleh turun baris di tiap "_" (kata
  // panjang tanpa spasi adalah penyebab utama kolom jadi lebar & huruf kecil).
  const headers = headersRaw.map((h) => String(h == null ? '' : h).replace(/_/g, ' '));
  // Baris subtotal/total dari data (mis. "SUBTOTAL MPC") ikut ditebalkan.
  const body = bodyRaw.map((r) => (r.__total || !(r.cells || []).some((c) => /^\s*((sub|grand)\s*)?total\b/i.test(String(c == null ? '' : c))))
    ? r : { ...r, __total: true });
  // Tabel lebar (>= 6 kolom) memakai hampir seluruh lebar halaman; yang
  // sempit tetap menjorok sejajar teks pasalnya.
  // Tepi kiri tabel SELALU sejajar dengan teks badan di atasnya (bodyIndent),
  // tepi kanan = batas kanan halaman — jadi tabel "sinkron" dengan paragraf.
  const indent = options.indent || 0;
  const border = '#333333';
  const alignRight = options.alignRight || [];
  const layout = options.layout
    || (options.widths
      ? { widths: options.widths, fontSize: options.fontSize || 8, padX: 3 }
      : chooseTableLayout(doc, headers, body, alignRight, indent));
  const leftX = layout.left != null ? layout.left : doc.page.margins.left + indent;
  const width = layout.tableWidth != null ? layout.tableWidth : pageWidth - indent;
  const widths = layout.widths;
  const fs = layout.fontSize;
  const padX = layout.padX;
  const padY = 2.5;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

  const rowHeight = (cells, font) => {
    doc.font(font).fontSize(fs);
    return Math.max(fs + padY * 2 + 1.5, cells.reduce((mx, c, i) =>
      Math.max(mx, doc.heightOfString(String(c == null ? '' : c), { width: widths[i] - padX * 2 })), 0) + padY * 2 + 1);
  };
  const drawRow = (cells, y, { font, fill, color, centerAll }) => {
    const h = rowHeight(cells, font);
    if (fill) doc.rect(leftX, y, width, h).fill(fill);
    doc.rect(leftX, y, width, h).strokeColor(border).lineWidth(0.6).stroke();
    let x = leftX;
    cells.forEach((c, i) => {
      if (i > 0) doc.moveTo(x, y).lineTo(x, y + h).strokeColor(border).lineWidth(0.6).stroke();
      const align = alignRight.includes(i) ? 'right' : 'left';
      const txt = String(c == null ? '' : c);
      doc.font(font).fontSize(fs);
      // isi sel diratakan vertikal di tengah baris — angka sejajar dengan
      // nama mitra yang turun baris, bukan menempel di atas.
      const th = doc.heightOfString(txt, { width: widths[i] - padX * 2 });
      doc.fillColor(color).text(txt, x + padX, y + (h - th) / 2, { width: widths[i] - padX * 2, align });
      x += widths[i];
    });
    return h;
  };
  const headerStyle = { font: 'Helvetica-Bold', fill: '#7F7F7F', color: '#FFFFFF' };

  // Baris digambar di koordinat tetap (tidak auto pindah halaman) — dicek
  // manual; header diulang di halaman baru supaya tetap gampang dibaca.
  let y = doc.y;
  y += drawRow(headers, y, headerStyle);
  body.forEach((r) => {
    const isTotal = Boolean(r.__total);
    const style = { font: isTotal ? 'Helvetica-Bold' : 'Helvetica', fill: isTotal ? '#D9D9D9' : null, color: '#000000' };
    const h = rowHeight(r.cells, style.font);
    if (y + h > bottomLimit()) {
      doc.addPage();
      y = doc.y;
      y += drawRow(headers, y, headerStyle);
    }
    y += drawRow(r.cells, y, style);
  });
  doc.y = y + 10;
  doc.x = doc.page.margins.left;
}

/* Hitung SATU layout kolom untuk semua tabel yang judul kolomnya sama di
   satu memo (mis. beberapa tabel per program) — supaya lebar & posisi
   kolom antar tabel persis sejajar, bukan masing-masing menebak sendiri. */
function drawMemoTableSignature(headers, alignRight) {
  // Kunci = jumlah kolom + posisi kolom angka — tabel dengan "bentuk" yang
  // sama (mis. Ringkasan per Program & tabel per program) berbagi lebar kolom
  // walau nama kolom pertamanya beda (PARAMETER vs PARTNER NAME).
  return headers.length + ':' + (alignRight || []).join(',');
}

/* ---------- tiga bentuk tabel, semuanya dari sheet data yang sama ---------- */
function buildMemoTableData(mode, rows, block) {
  if (mode === 'auto') {
    // Tabel fleksibel: kolom & urutannya PERSIS seperti yang dipilih user
    // di panel "Kolom tabel yang ditampilkan" (block.tableCols, format
    // sama dengan tableCols di Blast Email Report: {key,label,numeric}) —
    // tidak ada pengelompokan/agregasi otomatis, tampil apa adanya per
    // baris, plus baris Total kalau ada kolom yang ditandai angka.
    const tableCols = Array.isArray(block.tableCols) && block.tableCols.length
      ? block.tableCols
      : Object.keys(rows[0] || {}).map((c) => ({ key: c, label: c, numeric: false }));
    const headers = tableCols.map((c) => c.label);
    const body = rows.map((r) => ({
      cells: tableCols.map((c) => (c.numeric ? memoFormatNumber(memoToNumber(r[c.key])) : String(r[c.key] ?? ''))),
    }));
    const hasNumeric = tableCols.some((c) => c.numeric);
    if (hasNumeric) {
      // Label "Total" ditaruh di kolom teks KEDUA (biasanya nama mitra) kalau
      // ada — kolom pertama biasanya sempit (mis. Entity) sehingga label
      // akan terpotong ke beberapa baris.
      const textIdx = tableCols.map((c, i) => (c.numeric ? -1 : i)).filter((i) => i >= 0);
      const labelIdx = textIdx.length > 1 ? textIdx[1] : textIdx[0];
      const totalLine = tableCols.map((c, i) => {
        if (c.numeric) return memoFormatNumber(rows.reduce((acc, r) => acc + memoToNumber(r[c.key]), 0));
        return i === labelIdx ? `Total (${rows.length} baris)` : '';
      });
      body.push({ cells: totalLine, __total: true });
    }
    return { headers, body, alignRight: tableCols.map((c, i) => (c.numeric ? i : -1)).filter((i) => i >= 0) };
  }

  const valueCols = memoValueColumns(rows);
  const groupBy = block.groupBy || 'PROGRAM';

  if (mode === 'pivot_status') {
    // Varian SDP: baris = wilayah, kolom = Qty & Total per status usaha.
    const statuses = block.statuses || ['Badan Usaha', 'Individu'];
    const valueCol = block.valueColumn || valueCols[0];
    const map = new Map();
    rows.forEach((r) => {
      const key = String(r.REGION || '-');
      if (!map.has(key)) map.set(key, statuses.map(() => ({ qty: 0, total: 0 })));
      const idx = statuses.findIndex((st) =>
        String(r.STATUS_USAHA || '').trim().toLowerCase() === String(st).trim().toLowerCase());
      if (idx >= 0) {
        const cell = map.get(key)[idx];
        cell.qty += 1;
        cell.total += memoToNumber(r[valueCol]);
      }
    });
    const headers = [block.groupHeader || 'REGION'];
    statuses.forEach((st) => { headers.push(st + ' — Qty'); headers.push(st + ' — Total'); });
    headers.push('Qty All'); headers.push('Total All');

    const body = [];
    const grand = statuses.map(() => ({ qty: 0, total: 0 }));
    map.forEach((cells, key) => {
      const line = [key];
      let qAll = 0, tAll = 0;
      cells.forEach((c, i) => {
        line.push(memoFormatNumber(c.qty)); line.push(memoFormatNumber(c.total));
        qAll += c.qty; tAll += c.total;
        grand[i].qty += c.qty; grand[i].total += c.total;
      });
      line.push(memoFormatNumber(qAll)); line.push(memoFormatNumber(tAll));
      body.push({ cells: line });
    });
    const totalLine = ['Total'];
    let gq = 0, gt = 0;
    grand.forEach((c) => { totalLine.push(memoFormatNumber(c.qty)); totalLine.push(memoFormatNumber(c.total)); gq += c.qty; gt += c.total; });
    totalLine.push(memoFormatNumber(gq)); totalLine.push(memoFormatNumber(gt));
    body.push({ cells: totalLine, __total: true });
    return { headers, body, alignRight: headers.map((_, i) => i > 0 ? i : -1).filter((i) => i > 0) };
  }

  const cols = block.columns
    ? String(block.columns).split(',').map((c) => c.trim()).filter(Boolean)
    : valueCols;

  if (mode === 'ringkasan') {
    const map = new Map();
    rows.forEach((r) => {
      const key = String(r[groupBy] || '-');
      if (!map.has(key)) map.set(key, cols.map(() => 0));
      const acc = map.get(key);
      cols.forEach((c, i) => { acc[i] += memoToNumber(r[c]); });
    });
    const headers = ['NO.', block.groupHeader || groupBy].concat(cols);
    const body = [];
    const grand = cols.map(() => 0);
    let no = 1;
    map.forEach((acc, key) => {
      body.push({ cells: [String(no++), key].concat(acc.map((v, i) => { grand[i] += v; return memoFormatNumber(v); })) });
    });
    body.push({ cells: ['TOTAL', ''].concat(grand.map(memoFormatNumber)), __total: true });
    return { headers, body, alignRight: cols.map((_, i) => i + 2) };
  }

  // mode 'rincian' — satu baris per mitra.
  const headers = ['NO.', block.groupHeader || 'PARTNER NAME'].concat(cols);
  const body = [];
  const grand = cols.map(() => 0);
  rows.forEach((r, i) => {
    body.push({
      cells: [String(i + 1), String(r.PARTNER_NAME || r.ID_PARTNER || '')]
        .concat(cols.map((c, ci) => { const v = memoToNumber(r[c]); grand[ci] += v; return memoFormatNumber(v); })),
    });
  });
  body.push({ cells: ['TOTAL', ''].concat(grand.map(memoFormatNumber)), __total: true });
  return { headers, body, alignRight: cols.map((_, i) => i + 2) };
}

/* ---------- blok tanda tangan: tiga varian ---------- */
function drawMemoSignature(doc, cfg, tokens, pageWidth, letterDate, signers) {
  const leftX = doc.page.margins.left;
  const variant = String(cfg.SIGNER_LAYOUT || 'tunggal').trim().toLowerCase();
  // Memo IOM selalu terbit dari kantor pusat kalau kota tidak diisi.
  const kotaTanggal = `${cfg.KOTA_SURAT || cfg.KOTA || 'Jakarta'}, ${formatTanggalID(letterDate)}`;

  if (variant === 'grid_2x2') {
    doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
      .text(kotaTanggal, leftX, doc.y, { width: pageWidth, align: 'right' });
    doc.moveDown(1.2);
    const colW = pageWidth / 2;
    let anchor = null;
    for (let baris = 0; baris < Math.ceil(signers.length / 2); baris++) {
      const yTop = doc.y;
      let bawah = yTop;
      for (let kol = 0; kol < 2; kol++) {
        const sg = signers[baris * 2 + kol];
        if (!sg) continue;
        const x = leftX + kol * colW;
        doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
          .text(sg.role || '', x, yTop, { width: colW, align: 'center' });
        doc.font('Rounded-Bold').fontSize(10)
          .text(sg.title || '', x, doc.y, { width: colW, align: 'center' });
        const yNama = doc.y + 62; // ruang tempel tanda tangan
        doc.font('Rounded-Bold').fontSize(10)
          .text(sg.name || '', x, yNama, { width: colW, align: 'center', underline: true });
        doc.font('Rounded').fontSize(9.5)
          .text(sg.nik ? 'NIK. ' + sg.nik : '', x, doc.y, { width: colW, align: 'center' });
        if (!anchor) anchor = { x: x + colW / 2 - 60, y: yNama - 58, width: 120 };
        bawah = Math.max(bawah, doc.y);
      }
      doc.y = bawah + 18;
    }
    return anchor || { x: leftX, y: doc.y, width: 120 };
  }

  if (variant === 'tanpa_ttd') {
    // Tidak semua surat butuh blok TTD tercetak — sebagian cukup butuh
    // BUKTI approval yang tercatat di sistem (siapa & kapan menyetujui,
    // lihat resolveBatchDecision/approved_at di server.js), tanpa perlu
    // Nama/Jabatan/NIK/tempat tanda tangan di PDF-nya. Skip = true supaya
    // applySignatureToBatch di server.js tidak mencoba nempel gambar TTD
    // ke sini (lihat pengecekan item.signature_anchor.skip di sana).
    doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
      .text(kotaTanggal, leftX, doc.y, { width: pageWidth, align: 'right' });
    doc.moveDown(1);
    doc.font('Rounded').fontSize(8.5).fillColor('#64748B')
      .text('Surat ini disetujui melalui sistem approval internal — bukti approval (nama penyetuju & waktu) tercatat di sistem, tidak dicetak sebagai tanda tangan fisik.', leftX, doc.y, { width: pageWidth });
    return { skip: true };
  }

  if (variant === 'tabel_ttd') {
    const kiriW = pageWidth * 0.62;
    let y = doc.y;
    const border = '#333333';
    signers.forEach((sg) => {
      const h = 46;
      doc.rect(leftX, y, pageWidth, h).strokeColor(border).lineWidth(0.7).stroke();
      doc.moveTo(leftX + kiriW, y).lineTo(leftX + kiriW, y + h).strokeColor(border).lineWidth(0.7).stroke();
      doc.font('Helvetica').fontSize(9.5).fillColor('#000000').text(sg.role || '', leftX + 6, y + 5, { width: kiriW - 12 });
      doc.font('Helvetica-Bold').fontSize(9.5).text(sg.name || '', leftX + 6, doc.y, { width: kiriW - 12, underline: true });
      doc.font('Helvetica').fontSize(9.5).text(sg.title || '', leftX + 6, doc.y, { width: kiriW - 12 });
      doc.font('Helvetica').fontSize(9.5).text('Signature', leftX + kiriW + 6, y + 5, { width: pageWidth - kiriW - 12 });
      y += h;
    });
    doc.y = y + 10;
    return { x: leftX + kiriW + 20, y: doc.y - 40, width: 100 };
  }

  // tunggal
  const sg = signers[0] || {};
  doc.font('Rounded').fontSize(9.5).fillColor('#1E293B')
    .text(kotaTanggal, leftX, doc.y, { width: pageWidth, align: 'center' });
  doc.font('Rounded').fontSize(9.5)
    .text(sg.title || '', leftX, doc.y, { width: pageWidth, align: 'center' });
  const yNama = doc.y + 66;
  doc.font('Rounded-Bold').fontSize(10).fillColor('#1E293B')
    .text(sg.name || '', leftX, yNama, { width: pageWidth, align: 'center', underline: true });
  doc.font('Rounded').fontSize(9.5)
    .text(sg.nik ? 'NIK.  ' + sg.nik : '', leftX, doc.y, { width: pageWidth, align: 'center' });
  return { x: leftX + pageWidth / 2 - 60, y: yNama - 60, width: 120 };
}

/* Penanda tangan diambil dari SIGNER_1_*, SIGNER_2_*, ... di konfigurasi
   jenis surat. Jumlahnya bebas — grid 2x2 memakai empat, tabel TTD memakai
   tiga, tunggal memakai satu. */
function collectMemoSigners(cfg) {
  const out = [];
  for (let i = 1; i <= 6; i++) {
    const name = cfg[`SIGNER_${i}_NAME`];
    if (!name) continue;
    out.push({
      name,
      title: cfg[`SIGNER_${i}_TITLE`] || '',
      role: cfg[`SIGNER_${i}_ROLE`] || '',
      nik: cfg[`SIGNER_${i}_NIK`] || '',
    });
  }
  return out;
}

/* ============================================================
   DEFINISI BAWAAN 3 JENIS IOM  (inilah "standarisasi" itu)
   ------------------------------------------------------------
   Ketiga IOM memakai mesin yang sama (generateMemoPdf). Yang berbeda
   cuma DATA di bawah ini: susunan pasal (MEMO_BLOCKS), bentuk tabel
   (mode), dan varian blok tanda tangan (SIGNER_LAYOUT). Kalau nanti ada
   jenis IOM baru, cukup tambah satu entri di sini — tidak menulis kode
   generator baru.

   Semua teks di bawah memakai placeholder {{...}} dan diisi dari sheet
   data / pengaturan batch. Definisi ini juga bisa ditimpa per jenis surat
   lewat tabel letter_templates (kolom config) tanpa mengubah file ini.
   ============================================================ */
const LETTER_DEFAULTS = {
  IOM_PERMOHONAN_REVA: {
    // IOM = Inter Office Memo — judul & label header dalam bahasa Inggris
    // sesuai standar formulir IOM perusahaan (lihat contoh IOM Payout MPx).
    DOC_TITLE: 'INTER OFFICE MEMO',
    HEADER_LABEL_1: 'To',      HEADER_VALUE_1: '{{MEMO_TO}}',
    HEADER_LABEL_2: 'From',    HEADER_VALUE_2: '{{MEMO_FROM}}',
    HEADER_LABEL_3: 'Subject', HEADER_VALUE_3: 'Permohonan Reversal {{PERIODE}}',
    NO_REF_FORMAT: '{{NO_SURAT}}',
    SIGNER_LAYOUT: 'tunggal',
    MEMO_BLOCKS: [
      { section: 1, type: 'paragraph', text: 'Sehubungan dengan proses pembayaran periode {{PERIODE}}, bersama ini kami mengajukan permohonan reversal atas transaksi yang tercantum pada rincian di bawah ini.' },
      { section: 2, type: 'heading',   text: 'Rincian Permohonan' },
      { section: 2, type: 'table',     mode: 'rincian' },
      { section: 3, type: 'paragraph', text: 'Dokumen pendukung dapat diakses melalui tautan berikut:' },
      { section: 3, type: 'link',      text: '{{LINK_DOKUMEN}}', url: '{{LINK_DOKUMEN}}' },
      { section: 4, type: 'paragraph', text: 'Demikian permohonan ini kami sampaikan. Atas perhatian dan kerja samanya kami ucapkan terima kasih.' },
    ],
  },

  IOM_PAYOUT_SDP: {
    DOC_TITLE: 'INTER OFFICE MEMO',
    HEADER_LABEL_1: 'To',      HEADER_VALUE_1: '{{MEMO_TO}}',
    HEADER_LABEL_2: 'From',    HEADER_VALUE_2: '{{MEMO_FROM}}',
    HEADER_LABEL_3: 'Subject', HEADER_VALUE_3: 'Payout SDP {{PERIODE}}',
    NO_REF_FORMAT: '{{NO_SURAT}}',
    SIGNER_LAYOUT: 'tabel_ttd',
    MEMO_BLOCKS: [
      { section: 1, type: 'paragraph', text: 'Bersama ini kami sampaikan permohonan pembayaran (payout) program SDP untuk periode {{PERIODE}} dengan rincian sebagaimana tabel di bawah ini.' },
      { section: 2, type: 'heading',   text: 'Rekapitulasi per Wilayah' },
      { section: 2, type: 'table',     mode: 'pivot_status' },
      { section: 3, type: 'paragraph', text: 'Pembayaran tidak dikenakan pajak sesuai ketentuan program SDP yang berlaku.' },
      { section: 4, type: 'paragraph', text: 'Demikian disampaikan untuk dapat ditindaklanjuti. Atas perhatiannya kami ucapkan terima kasih.' },
    ],
  },

  IOM_PAYOUT_MPX: {
    // Distandarisasi mengikuti contoh IOM Payout MPx asli (struktur saja —
    // lihat catatan privasi di README/percakapan: nama mitra/PT/nilai
    // NYATA tidak pernah ditaruh di sini, semua contoh di bawah pakai
    // placeholder/token).
    DOC_TITLE: 'INTER OFFICE MEMO',
    HEADER_LABEL_1: 'To',      HEADER_VALUE_1: '{{MEMO_TO}}',
    HEADER_LABEL_2: 'From',    HEADER_VALUE_2: '{{MEMO_FROM}}',
    HEADER_LABEL_3: 'Subject', HEADER_VALUE_3: 'IOM Payout Distribution Fee MPx Hybrid – {{PERIODE}}',
    NO_REF_FORMAT: '{{NO_SURAT}}',
    SIGNER_LAYOUT: 'grid_2x2',
    // Catatan pajak baku — bisa ditimpa per surat lewat NOTE_ITEMS kalau
    // suatu saat tarifnya beda.
    NOTE_ITEMS: 'Distribution Fee : MPx Distribution Fee Hybrid.|Distribution fees are subject to a 12% VAT rate (calculated as 11/12 x 12%) and a 2% WHT23.',
    MEMO_BLOCKS: [
      // Pasal 1 — "Refers to": daftar dokumen acuan, diisi per surat lewat
      // panel Detail Memo (satu baris = satu poin). Judulnya ditaruh di
      // blk.title (bukan blok heading terpisah) supaya kalau kosong,
      // JUDULNYA IKUT tidak tercetak — tidak ada "Refers to:" menggantung
      // tanpa isi.
      { section: 1, type: 'bulletlist', title: 'Refers to:', text: '{{REFERENSI}}' },

      { section: 2, type: 'heading',    text: '{{PERIHAL}}:' },
      { section: 2, type: 'bulletlist', text: '{{NOTE_ITEMS}}' },
      { section: 2, type: 'heading',    text: 'Ringkasan per Program' },
      { section: 2, type: 'table',      mode: 'ringkasan', groupBy: 'PROGRAM', groupHeader: 'PARAMETER' },

      // Pasal 3 — rincian per program, SATU sub-tabel untuk tiap nilai
      // unik di kolom PROGRAM yang BENAR-BENAR ada di data Excel-nya
      // (bisa "MPC"/"MP3", bisa nama lain) — tidak di-hardcode lagi,
      // supaya selalu cocok apa pun isi kolom PROGRAM-nya.
      { section: 3, type: 'heading',     text: 'Distribution Fee MPx Hybrid.' },
      { section: 3, type: 'table_group', groupColumn: 'PROGRAM' },

      { section: 4, type: 'paragraph', text: 'With reference to the subject mentioned above, we hereby propose the payment as detailed on the summary and breakdown table above. The detailed breakdown for each program is enclosed. The payment is requested to be made via bank transfer to each registered bank account.' },

      // Judul "Referensi Anggaran" ditaruh sebagai title di dalam blok
      // kvtable sendiri (bukan blok heading terpisah) — supaya kalau
      // BUDGET_TYPE/BUDGET_MTA_CC belum diisi, judulnya ikut tidak
      // tercetak juga (tidak ada judul menggantung tanpa isi).
      { section: 5, type: 'kvtable',   text: 'Referensi Anggaran', rows: [['Type Expenses', '{{BUDGET_TYPE}}'], ['MTA|CC', '{{BUDGET_MTA_CC}}']] },

      { section: 6, type: 'paragraph', text: 'Thank you for your kind attention and approval.' },
    ],
  },

  // Surat Pemberitahuan & BAST bukan memo internal — satu baris data = satu
  // dokumen ke mitra. Boilerplate di bawah dipetakan ke kolom standar sheet
  // "Surat pemberitahuan" (NOMINAL_A, NOMINAL_B, TOTAL) dan sheet "BAST"
  // (URAIAN, JUMLAH, NILAI) — semua kolom otomatis jadi token {{...}} lewat
  // buildTokens, jadi tidak perlu didaftarkan satu-satu di sini.
  PEMBERITAHUAN: {
    RECIPIENT_TITLE: 'Mitra',
    RECIPIENT_BLOCK: '{{PT_NAME}}',
    NO_REF_FORMAT: '{{ID}}/SP/{{MM}}/{{YYYY}}',
    PERIHAL_TEMPLATE: 'Pemberitahuan {{PERIODE}}',
    BODY_OPENING: 'Sehubungan dengan periode {{PERIODE}}, bersama ini kami sampaikan pemberitahuan dengan rincian sebagaimana tabel di bawah ini.',
    SUMMARY_TABLE_TITLE: 'Rincian Pembayaran',
    SUMMARY_TABLE_ROWS: 'Nominal A={{NOMINAL_A}}|Nominal B={{NOMINAL_B}}|Total={{TOTAL}}',
    CLOSING: 'Demikian pemberitahuan ini kami sampaikan. Atas perhatian dan kerja samanya kami ucapkan terima kasih.',
    ATTACHMENT_TITLE: 'Lampiran: Ketentuan Klaim Pembayaran',
    ATTACHMENT_INTRO: 'Pembayaran tunduk pada ketentuan berikut:',
    ATTACHMENT_ITEMS: 'Klaim diajukan paling lambat 30 (tiga puluh) hari kalender sejak tanggal surat ini.|Pembayaran akan diproses setelah dokumen pendukung diterima lengkap dan sesuai ketentuan.|Perusahaan berhak melakukan verifikasi ulang atas data yang diajukan.',
  },
  BAST: {
    PERIHAL_TEMPLATE: 'Berita Acara Serah Terima {{PERIODE}}',
    PIHAK2_NAMA: '{{PARTNER_NAME}}',
    PIHAK2_JABATAN: 'Mitra',
    PIHAK2_PERUSAHAAN: '{{PT_NAME}}',
    BAST_STATEMENTS: 'PIHAK PERTAMA telah menyerahkan, dan PIHAK KEDUA telah menerima, hasil sebagaimana rincian pada tabel di bawah ini.|Serah terima ini menjadi bukti bahwa hak dan kewajiban terkait telah dipenuhi oleh kedua belah pihak.',
    DETAIL_TABLE_COLUMNS: 'Uraian|Jumlah|Nilai',
    CLOSING: 'Demikian Berita Acara Serah Terima ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.',
  },

  /* FLEX sengaja MEMO_BLOCKS: [] — badan suratnya 100% datang dari
     templateConfig yang dikirim klien (narasi bebas + tabel kolom
     pilihan user), bukan dari daftar pasal tetap seperti 3 jenis IOM di
     atas. Header (To/From/Subject) & nomor surat tetap dari token yang
     sama (MEMO_TO/MEMO_FROM/NO_SURAT) supaya panel "Detail Memo" yang
     sudah ada di klien bisa dipakai apa adanya untuk jenis surat ini juga. */
  FLEX: {
    DOC_TITLE: 'INTER OFFICE MEMO',
    HEADER_LABEL_1: 'To',      HEADER_VALUE_1: '{{MEMO_TO}}',
    HEADER_LABEL_2: 'From',    HEADER_VALUE_2: '{{MEMO_FROM}}',
    HEADER_LABEL_3: 'Subject', HEADER_VALUE_3: '',
    NO_REF_FORMAT: '{{NO_SURAT}}',
    SIGNER_LAYOUT: 'tunggal',
    MEMO_BLOCKS: [],
  },
};

/* Gabungkan definisi bawaan dengan konfigurasi dari pengguna. Nilai yang
   sudah diisi pengguna SELALU menang; bawaan hanya mengisi yang kosong. */
function withLetterDefaults(cfg) {
  const base = LETTER_DEFAULTS[String((cfg || {}).TEMPLATE_CODE || '').trim()];
  if (!base) return cfg || {};
  const out = Object.assign({}, base, cfg || {});
  if (!Array.isArray(out.MEMO_BLOCKS) || !out.MEMO_BLOCKS.length) out.MEMO_BLOCKS = base.MEMO_BLOCKS;
  return out;
}

/* ============================================================
   TEKS BERFORMAT (bold / italic) di dalam isi surat & memo.
   Pengguna bisa menulis **tebal** (dua bintang) untuk bold, dan *miring*
   atau _miring_ (satu bintang / garis bawah) untuk italic, langsung di
   field teks bebas (paragraf, bullet, catatan, nilai kvtable, dsb) — mirip
   Markdown ringan.

   Renderer-nya sengaja TIDAK memakai fitur "continued text" bawaan pdfkit
   (menyambung beberapa .text() jadi satu baris) — waktu dicoba, mode itu
   kalau dicampur sama transform miring (buat sintesis italic, lihat di
   bawah) bikin spasi antar-segmen kadang hilang/salah posisi. Jadi di sini
   teksnya dipecah per KATA sendiri lalu digambar satu-satu dengan koordinat
   x/y yang dihitung manual, termasuk logika ganti barisnya — lebih verbose
   tapi hasilnya presisi & bisa dites langsung.

   Italic disintesis via transform miring (shear) karena belum ada file
   font italic resmi dari Indosat (baru ada Medium & Bold) — bukan font
   terpisah, cuma font yang sama digambar miring. Kalau nanti ada file
   italic resmi, tinggal registerFont baru & pakai di sini.
   ============================================================ */
const RICH_TEXT_RE = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
const ITALIC_SHEAR = 0.28; // ~16 derajat, kemiringan italic yang umum dipakai

function parseFormattedSegments(rawText) {
  const text = String(rawText == null ? '' : rawText);
  const segments = [];
  let lastIndex = 0;
  let m;
  RICH_TEXT_RE.lastIndex = 0;
  while ((m = RICH_TEXT_RE.exec(text))) {
    if (m.index > lastIndex) segments.push({ text: text.slice(lastIndex, m.index), bold: false, italic: false });
    if (m[1] !== undefined) segments.push({ text: m[1], bold: true, italic: false });
    else segments.push({ text: (m[2] !== undefined ? m[2] : m[3]), bold: false, italic: true });
    lastIndex = RICH_TEXT_RE.lastIndex;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), bold: false, italic: false });
  if (!segments.length) segments.push({ text: '', bold: false, italic: false });
  return segments;
}

// Pecah segmen jadi token kata (spasi jadi token sendiri juga, supaya lebar
// spasi ikut terhitung pas wrapping) sambil tetap membawa flag bold/italic
// masing-masing dari segmen asalnya.
function segmentsToWordTokens(segments) {
  const tokens = [];
  segments.forEach((seg) => {
    const parts = seg.text.split(/(\s+)/).filter((p) => p.length);
    parts.forEach((p) => tokens.push({ text: p, bold: seg.bold, italic: seg.italic }));
  });
  return tokens;
}

// Gambar satu kata, miring (shear) kalau italic. Shear dihitung relatif ke
// baseline y baris itu sendiri supaya posisi horizontalnya tidak melompat.
function drawWord(doc, str, wx, wy, italic) {
  if (!italic) { doc.text(str, wx, wy, { lineBreak: false }); return; }
  doc.save();
  doc.transform(1, 0, ITALIC_SHEAR, 1, -ITALIC_SHEAR * wy, 0);
  doc.text(str, wx, wy, { lineBreak: false });
  doc.restore();
}

// Render teks dengan dukungan **bold** / *italic* / _italic_ inline,
// auto-wrap manual ke baris berikutnya sesuai `width`. Dipanggil
// menggantikan doc.text(teks,...) polos di tempat-tempat isi surat yang
// biasa diisi bebas oleh pengguna. Sesudah dipanggil, doc.y ditinggal di
// baris terakhir (persis seperti doc.text() biasa) supaya doc.moveDown()
// setelahnya tetap berfungsi seperti sebelumnya.
function drawFormattedText(doc, rawText, x, y, width, opts = {}) {
  const {
    fontRegular = 'Rounded', fontBold = 'Rounded-Bold',
    size = 9.5, color = '#1E293B',
  } = opts;
  const tokens = segmentsToWordTokens(parseFormattedSegments(rawText));
  doc.fillColor(color);

  doc.font(fontRegular).fontSize(size);
  const lineHeight = doc.currentLineHeight(true);
  const spaceWidth = doc.widthOfString(' ');

  // Shear miring menggeser bagian ATAS huruf ke kanan tanpa menggeser
  // lebar-advance normalnya, jadi tanpa kompensasi, kata sesudah kata
  // miring kelihatan "nempel" (spasinya seperti hilang secara visual).
  // ITALIC_PAD menambah sedikit jarak ekstra setelah kata miring supaya
  // ada ruang buat bagian atas huruf yang condong ke kanan itu.
  const ITALIC_PAD = ITALIC_SHEAR * size * 0.8;

  let curX = x;
  let curY = y;
  let prevWasItalic = false;
  tokens.forEach((tok) => {
    const isSpace = /^\s+$/.test(tok.text);
    doc.font(tok.bold ? fontBold : fontRegular).fontSize(size);
    const tokWidth = isSpace ? spaceWidth : doc.widthOfString(tok.text);
    const extraLeading = (!isSpace && prevWasItalic) ? ITALIC_PAD : 0;

    if (!isSpace && curX + extraLeading + tokWidth > x + width && curX > x) {
      curX = x;
      curY += lineHeight;
    } else {
      curX += extraLeading;
    }
    // Jangan gambar spasi kalau lagi persis di awal baris (baris baru
    // nggak boleh menjorok gara-gara ada spasi sisa dari kata sebelumnya).
    if (isSpace && curX <= x) { prevWasItalic = false; return; }

    if (!isSpace) drawWord(doc, tok.text, curX, curY, tok.italic);
    curX += tokWidth;
    if (!isSpace) prevWasItalic = tok.italic;
  });

  doc.x = x;
  doc.y = curY + lineHeight;
}

function generateMemoPdf(templateConfig, rows, batchMeta) {
  const cfg = sanitizeMultilineFields(withLetterDefaults(templateConfig));
  const dataRows = (rows || []).map((r) => sanitizeMultilineFields(r));
  return new Promise((resolve, reject) => {
    const tokens = buildTokens(dataRows[0] || {}, cfg, batchMeta, 1);
    // bufferPages: kop (logo) & footer Indosat digambar di SETIAP halaman
    // sesuai SOP IOM; margin bawah dilebarkan supaya isi tidak menimpa footer.
    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, left: 56, right: 56, bottom: 125 }, bufferPages: true });
    registerBrandFonts(doc);

    let currentPageIndex = 0;
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), signatureAnchor }));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const letterDate = batchMeta.letterDate instanceof Date ? batchMeta.letterDate : new Date();
    const noSurat = renderPlaceholders(cfg.NO_REF_FORMAT, tokens);
    const perihal = renderPlaceholders(cfg.HEADER_VALUE_3 || cfg.PERIHAL_TEMPLATE || '', tokens);
    let signatureAnchor = null;

    // Running header di halaman 2 dst — sama seperti memo aslinya.
    doc.on('pageAdded', () => {
      currentPageIndex += 1;
      // Kop Indosat (logo) di tiap halaman lanjutan, nomor & perihal di bawahnya.
      const lh = drawLogo(doc, 'left');
      doc.font('Rounded').fontSize(9).fillColor('#1E293B');
      doc.text(noSurat, leftX, doc.page.margins.top + lh + 10, { width: pageWidth });
      if (perihal) doc.font('Rounded-Bold').fontSize(9).text(perihal, leftX, doc.y, { width: pageWidth });
      doc.moveTo(leftX, doc.y + 4).lineTo(leftX + pageWidth, doc.y + 4).strokeColor('#333333').lineWidth(1).stroke();
      doc.y = doc.y + 16;
    });

    // --- kop + judul + nomor ---
    const logoHeight = drawLogo(doc, 'left');
    doc.y = doc.page.margins.top + logoHeight + 20;
    const judul = renderPlaceholders(cfg.DOC_TITLE || 'NOTA DINAS', tokens);
    doc.font('Rounded-Bold').fontSize(12).fillColor('#1E293B')
      .text(judul, leftX, doc.y, { width: pageWidth, align: 'center', underline: true });
    doc.font('Rounded').fontSize(10).fillColor('#1E293B')
      .text(noSurat, leftX, doc.y + 3, { width: pageWidth, align: 'center' });
    doc.moveDown(1.4);

    // --- blok kepala 3 baris (To/From/Subject atau Kepada/Dari/Hal) ---
    const labelW = 62;
    [[cfg.HEADER_LABEL_1, cfg.HEADER_VALUE_1], [cfg.HEADER_LABEL_2, cfg.HEADER_VALUE_2], [cfg.HEADER_LABEL_3, cfg.HEADER_VALUE_3]]
      .forEach(([label, value]) => {
        if (!label && !value) return;
        const y0 = doc.y;
        doc.font('Rounded').fontSize(10).fillColor('#1E293B')
          .text(renderPlaceholders(label || '', tokens), leftX, y0, { width: labelW, lineBreak: false });
        doc.text(':', leftX + labelW, y0, { width: 8, lineBreak: false });
        doc.text(renderPlaceholders(value || '', tokens), leftX + labelW + 12, y0, { width: pageWidth - labelW - 12 });
        // Nilai kosong tidak menggeser doc.y — tanpa penjaga ini baris
        // "Kepada"/"Dari"/"Hal" bisa tercetak menumpuk di posisi yang sama.
        const minimalY = y0 + doc.currentLineHeight(true);
        if (doc.y < minimalY) doc.y = minimalY;
      });

    // --- garis pemisah ---
    doc.moveDown(0.6);
    doc.moveTo(leftX, doc.y).lineTo(leftX + pageWidth, doc.y).strokeColor('#333333').lineWidth(1).stroke();
    doc.moveDown(1.2);

    // --- badan: pasal bernomor dari daftar blok ---
    const blocks = Array.isArray(cfg.MEMO_BLOCKS) ? cfg.MEMO_BLOCKS : [];
    const bodyIndent = 26;

    // ---- Pra-hitung layout kolom tabel: semua tabel dengan judul kolom yang
    // sama memakai lebar kolom & ukuran huruf yang SAMA (data semua tabel itu
    // digabung dulu untuk mengukur), jadi antar tabel kolomnya persis sejajar.
    const tableLayouts = {};
    {
      const acc = {};
      const collect = (t) => {
        const sig = drawMemoTableSignature(t.headers, t.alignRight);
        if (!acc[sig]) acc[sig] = { headers: t.headers.map((h) => String(h == null ? '' : h).replace(/_/g, ' ')), body: [], alignRight: t.alignRight };
        acc[sig].body.push(...t.body);
      };
      blocks.forEach((blk) => {
        const type = String(blk.type || 'paragraph');
        if (type === 'table') {
          let subset = dataRows;
          if (blk.filterColumn && blk.filterValue != null) {
            subset = dataRows.filter((r) => String(r[blk.filterColumn] || '').trim().toLowerCase() === String(blk.filterValue).trim().toLowerCase());
          }
          if (subset.length) collect(buildMemoTableData(String(blk.mode || 'rincian'), subset, blk));
        } else if (type === 'table_group') {
          const groupCol = blk.groupColumn || 'PROGRAM';
          const keys = [];
          dataRows.forEach((r) => { const k = String(r[groupCol] || '').trim(); if (k && !keys.includes(k)) keys.push(k); });
          keys.forEach((k) => collect(buildMemoTableData('rincian', dataRows.filter((r) => String(r[groupCol] || '').trim() === k), blk)));
        }
      });
      Object.keys(acc).forEach((sig) => {
        const g = acc[sig];
        tableLayouts[sig] = chooseTableLayout(doc, g.headers, g.body, g.alignRight, bodyIndent);
      });
    }
    let nomorPasal = 0;
    let pasalTerakhir = null;

    blocks.forEach((blk) => {
      const section = Number(blk.section || 0);
      const teks = renderPlaceholders(blk.text || '', tokens);
      const type = String(blk.type || 'paragraph');

      // Sebagian jenis blok isinya bisa KOSONG tergantung data/pengisian
      // pengguna (referensi belum diisi, anggaran belum diisi, tabel
      // per-program tidak ada baris yang cocok). Kalau kosong, blok itu
      // dilewati SAMA SEKALI — termasuk nomor pasalnya — supaya tidak ada
      // pasal kosong menggantung atau nomornya bertumpuk sama pasal
      // berikutnya (ini yang bikin "5." hilang/ketimpa "6." sebelumnya).
      let bulletItems = null;
      let kvRows = null;
      let tableSubset = null;
      let groupedTables = null;

      if (type === 'bulletlist') {
        bulletItems = teks.split(/\r?\n|\|/).map((it) => it.trim()).filter(Boolean);
        if (!bulletItems.length) return;
      } else if (type === 'kvtable') {
        const rows = Array.isArray(blk.rows) ? blk.rows : [];
        kvRows = rows
          .map(([label, value]) => [renderPlaceholders(String(label || ''), tokens), renderPlaceholders(String(value || ''), tokens)])
          .filter(([, value]) => value);
        if (!kvRows.length) return;
      } else if (type === 'table') {
        let subset = dataRows;
        if (blk.filterColumn && blk.filterValue != null) {
          subset = dataRows.filter((r) =>
            String(r[blk.filterColumn] || '').trim().toLowerCase() === String(blk.filterValue).trim().toLowerCase());
        }
        tableSubset = subset;
        if (!subset.length) return;
      } else if (type === 'table_group') {
        // Satu sub-tabel per nilai unik di kolom pengelompok (mis. PROGRAM)
        // — otomatis mengikuti apa pun isi kolomnya di data Excel (MPC/MP3,
        // "Program Contoh A/B", atau nama lain), tidak pernah hardcode.
        const groupCol = blk.groupColumn || 'PROGRAM';
        const urutan = [];
        dataRows.forEach((r) => {
          const key = String(r[groupCol] || '').trim();
          if (key && !urutan.includes(key)) urutan.push(key);
        });
        groupedTables = urutan.map((key) => ({
          key,
          rows: dataRows.filter((r) => String(r[groupCol] || '').trim() === key),
        }));
        if (!groupedTables.length) return;
      }

      // Jaga supaya nomor pasal tidak pernah tercetak sendirian mepet di
      // dasar halaman lalu isinya "lompat" ke halaman berikutnya (nomor
      // pasal ketinggalan) — kalau ruang tersisa terlalu sempit, pindah
      // halaman dulu SEBELUM nomor pasal & isinya digambar.
      if (doc.y > doc.page.height - doc.page.margins.bottom - 44) {
        doc.addPage(); // memicu 'pageAdded' — running header & doc.y diatur di sana
      }

      // Nomor pasal ditulis sekali di blok pertama tiap pasal yang
      // benar-benar akan mencetak sesuatu (lihat pengecekan di atas).
      // Dikasih jarak ekstra SEBELUM nomor pasal baru (kecuali pasal
      // pertama) supaya antar poin tidak dempet-dempet — sebelumnya jarak
      // antar pasal cuma mengandalkan sisa spacing blok terakhir (kecil),
      // jadi kelihatan mepet terutama kalau pasal sebelumnya cuma 1 baris
      // pendek.
      if (section && section !== pasalTerakhir) {
        if (pasalTerakhir !== null) doc.moveDown(0.55);
        nomorPasal += 1; // urut 1,2,3… hanya untuk pasal yang benar-benar tercetak
        pasalTerakhir = section;
        const yPasal = doc.y;
        doc.font('Rounded').fontSize(10).fillColor('#1E293B')
          .text(nomorPasal + '.', leftX + 2, yPasal, { width: 20, lineBreak: false });
        doc.y = yPasal;
      }

      const x = leftX + bodyIndent;
      const w = pageWidth - bodyIndent;

      switch (type) {
        case 'heading':
          doc.font('Rounded-Bold').fontSize(10).fillColor('#1E293B').text(teks, x, doc.y, { width: w });
          doc.moveDown(0.4);
          break;
        case 'bullet': {
          const marker = blk.listStyle === 'letter' ? String.fromCharCode(97 + (blk.index || 0)) + '.' : '-';
          const y0 = doc.y;
          doc.font('Rounded').fontSize(9.5).fillColor('#1E293B').text(marker, x + 4, y0, { width: 14, lineBreak: false });
          doc.y = y0;
          drawFormattedText(doc, teks, x + 22, y0, w - 22, { size: 9.5, align: 'justify' });
          doc.moveDown(0.25);
          break;
        }
        case 'subbullet': {
          const y0 = doc.y;
          doc.font('Rounded').fontSize(9.5).fillColor('#1E293B').text('•', x + 20, y0, { width: 12, lineBreak: false });
          doc.y = y0;
          drawFormattedText(doc, teks, x + 36, y0, w - 36, { size: 9.5 });
          doc.moveDown(0.25);
          break;
        }
        case 'bulletlist': {
          // Daftar poin dari satu token (mis. {{REFERENSI}}) — tiap baris
          // (dipisah enter atau "|") jadi satu butir bullet. Dipakai untuk
          // pasal "Refers to" / catatan yang panjangnya tidak tetap. Judul
          // opsional (blk.title) sudah dipastikan cuma tercetak kalau ada
          // isinya (lihat pengecekan bulletItems di atas).
          if (blk.title) {
            doc.font('Rounded-Bold').fontSize(10).fillColor('#1E293B').text(renderPlaceholders(blk.title, tokens), x, doc.y, { width: w });
            doc.moveDown(0.3);
          }
          bulletItems.forEach((item) => {
            const y0 = doc.y;
            doc.font('Rounded').fontSize(9.5).fillColor('#1E293B').text('•', x + 4, y0, { width: 14, lineBreak: false });
            doc.y = y0;
            drawFormattedText(doc, item, x + 22, y0, w - 22, { size: 9.5, align: 'justify' });
            doc.moveDown(0.2);
          });
          doc.moveDown(0.2);
          break;
        }
        case 'kvtable': {
          // Tabel 2 kolom label/nilai sederhana (mis. "Referensi Anggaran":
          // Type Expenses / MTA|CC) — beda dari tabel data baris Excel.
          if (teks) {
            doc.font('Rounded-Bold').fontSize(9.5).fillColor('#1E293B').text(teks, x, doc.y, { width: w });
            doc.moveDown(0.3);
          }
          const tableX = x;
          const labelW2 = Math.min(180, w * 0.4);
          let y = doc.y;
          kvRows.forEach(([label, value]) => {
            const yTop = y;
            doc.rect(tableX, yTop, w, 20).strokeColor('#CBD5E1').lineWidth(0.6).stroke();
            doc.moveTo(tableX + labelW2, yTop).lineTo(tableX + labelW2, yTop + 20).strokeColor('#CBD5E1').lineWidth(0.6).stroke();
            doc.font('Rounded-Bold').fontSize(9).fillColor('#1E293B').text(label, tableX + 6, yTop + 5, { width: labelW2 - 12 });
            drawFormattedText(doc, value, tableX + labelW2 + 6, yTop + 5, w - labelW2 - 12, { size: 9 });
            y = yTop + 20;
          });
          doc.y = y + 6;
          break;
        }
        case 'link':
          doc.font('Rounded').fontSize(9.5).fillColor('#1D4ED8')
            .text(teks, x, doc.y, { width: w, underline: true, link: blk.url || undefined });
          doc.fillColor('#1E293B');
          doc.moveDown(0.4);
          break;
        case 'table': {
          if (teks) {
            doc.font('Rounded-Bold').fontSize(9.5).fillColor('#1E293B').text(teks, x, doc.y, { width: w });
            doc.moveDown(0.3);
          }
          const t = buildMemoTableData(String(blk.mode || 'rincian'), tableSubset, blk);
          drawMemoTable(doc, t.headers, t.body, pageWidth, { indent: bodyIndent, alignRight: t.alignRight, layout: tableLayouts[drawMemoTableSignature(t.headers, t.alignRight)] });
          break;
        }
        case 'table_group': {
          // Satu heading + satu tabel "rincian" per nilai unik yang
          // ketemu di data — lihat groupedTables di atas. Ini yang
          // menggantikan cara lama (nama program di-hardcode di kode).
          groupedTables.forEach((grp, gi) => {
            if (gi > 0) doc.moveDown(0.3);
            doc.font('Rounded-Bold').fontSize(9.5).fillColor('#1E293B').text(grp.key, x, doc.y, { width: w });
            doc.moveDown(0.3);
            const t = buildMemoTableData('rincian', grp.rows, blk);
            drawMemoTable(doc, t.headers, t.body, pageWidth, { indent: bodyIndent, alignRight: t.alignRight, layout: tableLayouts[drawMemoTableSignature(t.headers, t.alignRight)] });
          });
          break;
        }
        default:
          drawFormattedText(doc, teks, x, doc.y, w, { size: 9.5, align: 'justify' });
          doc.moveDown(0.5);
      }
      doc.x = leftX;
    });

    // --- tanda tangan ---
    doc.moveDown(1.5);
    if (doc.y > doc.page.height - 240) doc.addPage();
    signatureAnchor = drawMemoSignature(doc, cfg, tokens, pageWidth, letterDate, collectMemoSigners(cfg));
    signatureAnchor.pageIndex = currentPageIndex;

    // Footer Indosat (alamat + website + aksen) di SEMUA halaman, bukan
    // cuma halaman terakhir.
    const footerVariant = cfg.FOOTER_VARIANT === 'circle_sumatera' ? 'regional' : 'generic';
    const pr = doc.bufferedPageRange();
    for (let pi = 0; pi < pr.count; pi++) {
      doc.switchToPage(pr.start + pi);
      drawFooter(doc, footerVariant, cfg.KOP_SURAT);
    }
    doc.end();
  });
}

/* ============================================================
   GENERATE 1 SURAT (single-signer layout) -> Buffer PDF
   ============================================================ */
/* Jenis surat yang satu dokumennya merangkum BANYAK baris (memo IOM),
   bukan satu dokumen per baris. Dipakai server buat memilih alur generate. */
/* ============================================================
   SURAT KE MITRA (1 surat per baris data / per ID) -> Buffer PDF
   Format surat resmi ke mitra seperti contoh "Surat Nilai Rate Benefit
   OTF": tanggal, "Kepada Yth", blok label:nilai (Region / No Ref /
   Perihal), sapaan, narasi pembuka, tabel 1 baris (kolom pilihan user),
   narasi penutup, "Hormat kami", nama & jabatan penandatangan.
   SEMUA teks boleh memakai {{NAMA_KOLOM}} dari baris data, jadi isi tiap
   surat otomatis beda per ID. Konfigurasi (semua opsional, ada default):
     SM_KEPADA  SM_INFO ("Label = nilai" per baris)  NO_SURAT  HEADER_VALUE_3
     SM_SALUTATION  SM_INTRO  SM_CLOSING  SM_TABLE_COLS  SM_CLOSING_WORD
     SM_COMPANY  KOTA_SURAT  SIGNER_1_NAME  SIGNER_1_TITLE
   ============================================================ */
function smFormatCell(col, raw) {
  if (raw == null) return '';
  const isNum = typeof raw === 'number' || (col && col.numeric);
  if (!isNum) return String(raw);
  const n = typeof raw === 'number' ? raw : memoToNumber(raw);
  return n.toLocaleString('id-ID', { maximumFractionDigits: 4 });
}

function generateSuratMitraPdf(templateConfig, row, batchMeta, seq) {
  const cfg = sanitizeMultilineFields(templateConfig || {});
  const data = sanitizeMultilineFields(row || {});
  return new Promise((resolve, reject) => {
    const tokens = buildTokens(data, cfg, batchMeta || {}, seq || 1);
    const R = (s) => renderPlaceholders(s, tokens);
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    registerBrandFonts(doc);
    let pageIndex = 0;
    let signatureAnchor = null;
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), signatureAnchor }));
    doc.on('error', reject);

    const leftX = doc.page.margins.left;
    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageH = doc.page.height;
    const bottomLimit = pageH - 130; // sisakan zona footer letterhead
    const letterDate = (batchMeta && batchMeta.letterDate instanceof Date) ? batchMeta.letterDate : new Date();
    const F = 'Helvetica', FB = 'Helvetica-Bold';
    const FS = 10.5;
    const ink = '#111111';

    const newPage = () => {
      drawFooter(doc, 'regional', cfg.KOP_SURAT || 'Indosat Ooredoo Hutchison Sumatera | Jl. Perintis Kemerdekaan No.39, Sidorame Bar. I, Kec. Medan Perjuangan, Kota Medan, Sumatera Utara 20233 Indonesia');
      doc.addPage();
      doc.page.margins.bottom = 56;
      pageIndex += 1;
      const lh = drawLogo(doc, 'right');
      doc.y = doc.page.margins.top + lh + 10;
      doc.x = leftX;
    };
    const ensure = (h) => { if (doc.y + h > bottomLimit) newPage(); };
    const plain = (t) => String(t || '').replace(/\*\*|__|\*|_(?=\S)/g, '');

    // --- logo kanan atas + kota/tanggal kiri atas (sama dengan contoh) ---
    const logoH = drawLogo(doc, 'right');
    doc.font(F).fontSize(FS - 0.5).fillColor(ink)
      .text(`${cfg.KOTA_SURAT || cfg.KOTA || 'Jakarta'}, ${formatTanggalID(letterDate)}`, leftX, doc.page.margins.top + 20, { width: pageW * 0.6 });
    doc.y = doc.page.margins.top + logoH + 22;
    doc.x = leftX;

    // --- Kepada Yth ---
    const kepada = R(cfg.SM_KEPADA || '{{PARTNER_NAME}}');
    doc.font(FB).fontSize(FS + 0.5).fillColor(ink).text(`Kepada Yth: ${kepada}`, leftX, doc.y, { width: pageW });
    doc.text('Di Tempat', leftX, doc.y, { width: pageW });
    doc.moveDown(0.9);

    // --- blok label : nilai (Region / No Ref / Perihal ...) ---
    const infoLines = [];
    String(cfg.SM_INFO == null ? '' : cfg.SM_INFO).split('\n').forEach((ln) => {
      const i = ln.indexOf('=');
      if (i < 0) return;
      const label = ln.slice(0, i).trim();
      const val = R(ln.slice(i + 1)).trim();
      if (label && val) infoLines.push([label, val]);
    });
    const noRef = R(cfg.NO_SURAT || cfg.NO_REF_FORMAT || '').trim();
    if (noRef && !/tanpa no ref/i.test(noRef) && noRef !== '............') infoLines.push(['No Ref', noRef]);
    const perihal = R(cfg.HEADER_VALUE_3 || cfg.PERIHAL_TEMPLATE || '').trim();
    if (perihal) infoLines.push(['Perihal', perihal]);
    const labelW = 62;
    infoLines.forEach(([label, val]) => {
      const y0 = doc.y;
      doc.font(FB).fontSize(FS + 0.5).fillColor(ink);
      doc.text(label, leftX, y0, { width: labelW, lineBreak: false });
      doc.text(':', leftX + labelW, y0, { width: 10, lineBreak: false });
      doc.text(val, leftX + labelW + 14, y0, { width: pageW - labelW - 14 });
      doc.moveDown(0.35);
    });
    doc.moveDown(0.7);

    // --- paragraf (blank line = paragraf baru, "- " = bullet) ---
    const drawText = (raw) => {
      String(R(raw) || '').split(/\n\s*\n/).forEach((para) => {
        const p = para.replace(/^\n+|\n+$/g, '');
        if (!p.trim()) return;
        const lines = p.split('\n');
        let buf = [];
        const flush = () => {
          if (!buf.length) return;
          const t = buf.join(' ');
          const h = doc.font(F).fontSize(FS).heightOfString(plain(t), { width: pageW }) + 4;
          ensure(h);
          drawFormattedText(doc, t, leftX, doc.y, pageW, { fontRegular: F, fontBold: FB, size: FS, color: ink });
          doc.moveDown(0.8);
          buf = [];
        };
        lines.forEach((ln) => {
          const m = ln.match(/^\s*-\s+(.*)$/);
          if (m) {
            flush();
            const h = doc.font(F).fontSize(FS).heightOfString(plain(m[1]), { width: pageW - 18 }) + 4;
            ensure(h);
            const y0 = doc.y;
            doc.font(F).fontSize(FS).fillColor(ink).text('•', leftX + 4, y0, { width: 12, lineBreak: false });
            drawFormattedText(doc, m[1], leftX + 18, y0, pageW - 18, { fontRegular: F, fontBold: FB, size: FS, color: ink });
            doc.moveDown(0.3);
          } else buf.push(ln.trim());
        });
        flush();
      });
    };

    if (cfg.SM_SALUTATION) { ensure(24); drawFormattedText(doc, R(cfg.SM_SALUTATION), leftX, doc.y, pageW, { fontRegular: F, fontBold: FB, size: FS, color: ink }); doc.moveDown(0.8); }
    drawText(cfg.SM_INTRO || '');

    // --- tabel 1 baris: kolom pilihan user, header abu muda ---
    const cols = (Array.isArray(cfg.SM_TABLE_COLS) ? cfg.SM_TABLE_COLS : []).filter((c) => c && c.key);
    if (cols.length) {
      const headers = cols.map((c) => String(c.label || c.key));
      const cells = cols.map((c) => smFormatCell(c, data[c.key]));
      const widths = computeAutoColumnWidths(doc, headers, [{ cells }], pageW);
      const pad = 6;
      const hOf = (arr, font, size) => Math.max(24, arr.reduce((mx, t, i) => {
        doc.font(font).fontSize(size);
        return Math.max(mx, doc.heightOfString(String(t), { width: widths[i] - pad * 2 }));
      }, 0) + 14);
      const hh = hOf(headers, FB, 9.5);
      const dh = hOf(cells, F, 9.5);
      ensure(hh + dh + 10);
      const y0 = doc.y;
      doc.rect(leftX, y0, pageW, hh).fill('#F2F2F2');
      doc.rect(leftX, y0, pageW, hh + dh).lineWidth(0.8).strokeColor('#222222').stroke();
      doc.moveTo(leftX, y0 + hh).lineTo(leftX + pageW, y0 + hh).stroke();
      let x = leftX;
      cols.forEach((c, i) => {
        if (i > 0) doc.moveTo(x, y0).lineTo(x, y0 + hh + dh).strokeColor('#222222').lineWidth(0.8).stroke();
        doc.font(FB).fontSize(9.5).fillColor(ink).text(headers[i], x + pad, y0 + 8, { width: widths[i] - pad * 2, align: 'center' });
        doc.font(F).fontSize(9.5).fillColor(ink).text(cells[i], x + pad, y0 + hh + 8, { width: widths[i] - pad * 2, align: 'center' });
        x += widths[i];
      });
      doc.y = y0 + hh + dh + 16;
      doc.x = leftX;
    }

    drawText(cfg.SM_CLOSING || '');

    // --- penutup & penandatangan ---
    const noSig = String(cfg.SIGNER_LAYOUT || '').trim().toLowerCase() === 'tanpa_ttd';
    ensure(noSig ? 70 : 150);
    doc.moveDown(0.6);
    doc.font(F).fontSize(FS).fillColor(ink).text(cfg.SM_CLOSING_WORD || 'Hormat kami,', leftX, doc.y, { width: pageW });
    const company = R(cfg.SM_COMPANY == null ? 'PT Indosat Tbk' : cfg.SM_COMPANY);
    if (company) doc.text(company, leftX, doc.y, { width: pageW });
    if (noSig) {
      doc.moveDown(0.8);
      doc.font(F).fontSize(8).fillColor('#6B7280')
        .text('Surat ini disetujui melalui sistem approval internal — bukti approval (nama penyetuju & waktu) tercatat di sistem.', leftX, doc.y, { width: pageW * 0.8 });
      signatureAnchor = { skip: true, pageIndex };
    } else {
      const sigY = doc.y + 6;
      doc.moveDown(4.5);
      doc.font(FB).fontSize(FS + 0.5).fillColor(ink).text(cfg.SIGNER_1_NAME || '', leftX, doc.y, { width: pageW });
      doc.font(F).fontSize(FS).text(cfg.SIGNER_1_TITLE || '', leftX, doc.y, { width: pageW });
      signatureAnchor = { x: leftX, y: sigY, width: 200, pageIndex };
    }
    drawFooter(doc, 'regional', cfg.KOP_SURAT || 'Indosat Ooredoo Hutchison Sumatera | Jl. Perintis Kemerdekaan No.39, Sidorame Bar. I, Kec. Medan Perjuangan, Kota Medan, Sumatera Utara 20233 Indonesia');
    doc.end();
  });
}

/* Pintu masuk tunggal untuk semua format "1 surat per baris" yang dipilih
   dari Langkah 2: surat_mitra | pemberitahuan | bast. Pemberitahuan & BAST
   memakai generator lama (generatePemberitahuanPdf / generateBastPdf) dengan
   isi dari pengaturan di layar (field kosong yang dikirim klien menimpa
   bawaan contoh, jadi teks contoh tidak ikut tercetak). */
const PER_ROW_FORMATS = ['surat_mitra', 'pemberitahuan', 'bast'];
function generateFormatPdf(templateConfig, row, batchMeta, seq) {
  const cfg = { ...(templateConfig || {}) };
  const fmt = String(cfg.FORMAT_SURAT || '');
  // Generator Pemberitahuan & BAST mencetak teks polos — tanda **tebal**
  // dari editor dibuang supaya tidak muncul sebagai bintang di PDF.
  if (fmt === 'pemberitahuan' || fmt === 'bast') {
    Object.keys(cfg).forEach((k) => { if (typeof cfg[k] === 'string') cfg[k] = cfg[k].replace(/\*\*/g, ''); });
  }
  const r = sanitizeMultilineFields(row || {});
  let p;
  if (fmt === 'pemberitahuan') {
    p = generatePemberitahuanPdf(sanitizeMultilineFields(withLetterDefaults({ ...cfg, TEMPLATE_CODE: 'PEMBERITAHUAN' })), r, batchMeta || {}, seq || 1);
  } else if (fmt === 'bast') {
    p = generateBastPdf(sanitizeMultilineFields(withLetterDefaults({ ...cfg, TEMPLATE_CODE: 'BAST' })), r, batchMeta || {}, seq || 1);
  } else {
    p = generateSuratMitraPdf(cfg, r, batchMeta, seq);
  }
  // "Sertakan blok TTD" dimatikan -> tidak ada tanda tangan yang ditempel.
  if (String(cfg.SIGNER_LAYOUT || '').trim().toLowerCase() === 'tanpa_ttd') {
    return p.then((res) => ({ ...res, signatureAnchor: { skip: true, pageIndex: (res.signatureAnchor || {}).pageIndex || 0 } }));
  }
  return p;
}

function isAggregateLetter(templateCode) {
  return Boolean((STYLE_PRESETS[templateCode] || {}).aggregate);
}

function generateLetterPdf(templateConfig, row, batchMeta, seq) {
  templateConfig = sanitizeMultilineFields(withLetterDefaults(templateConfig));
  row = sanitizeMultilineFields(row);
  // Jenis surat yang tata letaknya beda total punya generator sendiri.
  const layoutKhusus = (STYLE_PRESETS[templateConfig.TEMPLATE_CODE] || {}).layout;
  if (layoutKhusus === 'pemberitahuan') return generatePemberitahuanPdf(templateConfig, row, batchMeta, seq);
  if (layoutKhusus === 'bast') return generateBastPdf(templateConfig, row, batchMeta, seq);
  return new Promise((resolve, reject) => {
    const tokens = buildTokens(row, templateConfig, batchMeta, seq);
    const style = STYLE_PRESETS[templateConfig.TEMPLATE_CODE] || DEFAULT_STYLE;
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    registerBrandFonts(doc);

    let currentPageIndex = 0;
    doc.on('pageAdded', () => { currentPageIndex += 1; });

    let signatureAnchor = null;
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), signatureAnchor }));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;

    // --- Logo (kiri/kanan tergantung template) ---
    const logoHeight = drawLogo(doc, style.logoPosition);
    doc.y = doc.page.margins.top + logoHeight + 14;
    doc.x = leftX;

    // --- Kota, tanggal ---
    const letterDate = batchMeta.letterDate instanceof Date ? batchMeta.letterDate : new Date();
    doc.font('Rounded').fontSize(10.5).fillColor('#1E293B')
      .text(`${templateConfig.KOTA_SURAT || templateConfig.KOTA || 'Jakarta'}, ${formatTanggalID(letterDate)}`, leftX, doc.y);
    doc.moveDown(1);

    // --- Blok identitas penerima (Kepada Yth / No Ref / Perihal) ---
    drawRecipientBlock(doc, templateConfig, tokens, pageWidth);

    // --- Salam ---
    if (templateConfig.SALUTATION) {
      doc.font('Rounded').fontSize(10.5).fillColor('#1E293B')
        .text(renderPlaceholders(templateConfig.SALUTATION, tokens), leftX, doc.y, { width: pageWidth });
      doc.moveDown(0.8);
    }

    // --- Pembuka ---
    doc.font('Rounded').fontSize(10.5).fillColor('#1E293B')
      .text(renderPlaceholders(templateConfig.BODY_OPENING, tokens), leftX, doc.y, { width: pageWidth, align: 'justify' });
    doc.moveDown(1);

    // --- Judul seksi opsional (mis. "A.    KPI Utama" di KPI_TARGET) ---
    if (style.sectionHeading) {
      doc.font('Rounded-Bold').fontSize(10).fillColor('#1E293B').text(style.sectionHeading, leftX, doc.y);
      doc.moveDown(0.4);
    }

    // --- Tabel rincian (gaya tergantung template) ---
    const colLabels = (templateConfig.DETAIL_TABLE_COLUMNS || '').split('|').map((s) => s.trim()).filter(Boolean);
    const fieldMap = buildGenericFieldMap(colLabels);
    if (style.tableStyle === 'horizontal') {
      drawHorizontalTable(doc, colLabels, fieldMap, row, tokens, pageWidth);
    } else {
      drawVerticalTable(doc, colLabels, fieldMap, row, tokens, pageWidth);
    }

    // --- Catatan (opsional, tergantung template) ---
    if (style.showCatatan && templateConfig.CATATAN) {
      drawCatatanBullets(doc, renderPlaceholders(templateConfig.CATATAN, tokens), pageWidth);
    }

    // --- Penutup + tanda tangan (rata kiri) ---
    signatureAnchor = drawClosingAndSignature(doc, templateConfig, tokens, style, pageWidth);
    signatureAnchor.pageIndex = currentPageIndex;

    // --- Footer letterhead resmi (alamat + website + aksen bulat) ---
    drawFooter(doc, style.footerVariant, templateConfig.KOP_SURAT);

    doc.end();
  });
}

module.exports = {
  formatRupiah,
  formatDecimalID,
  formatTanggalID,
  renderPlaceholders,
  buildTokens,
  generateLetterPdf,
  drawFooter,
  STYLE_PRESETS,
  LETTER_TYPE_NAMES,
  generateMemoPdf,
  generateSuratMitraPdf,
  generateFormatPdf,
  PER_ROW_FORMATS,
  isAggregateLetter,
  LETTER_DEFAULTS,
  withLetterDefaults,
  computeDetailTotal,
  LOGO_PATH,
  ACCENT_PATH,
  drawFormattedText,
};
