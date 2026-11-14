// lib/smartMail/mdi.js — SALINAN mdi.js Smart Mail Sumatera. Logika tidak diubah; hanya nama tabel (awalan sm_)
// dan URL /downloads diarahkan ke /api/smart-mail/downloads.
import path from 'path';
import { kirimEmail } from './kirim.js';
import fs from 'fs';

// ============================================================================
// FLOW SURAT MDI / MPC
// 1 partner (gabungan semua branch) = 1 LETTER + 1 BAST = 1 email dengan 2 lampiran
// ============================================================================

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const LOGO_ATAS_URL = 'https://upload.wikimedia.org/wikipedia/commons/1/1d/Indosat_Ooredoo_Hutchison.png';
const LOGO_BAWAH_URL = 'https://indosatooredoo.com/iohassets/images/icons/ioh_circles.png';
const EMAIL_FROM = 'Sales Performance Sumatra <sandra@spmsumatera.site>';

export const escapeHtml = (val) => String(val ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const toNumber = (val) => {
    if (typeof val === 'number') return val;
    const s = String(val ?? '').trim();
    if (s === '' || s === '-') return 0;
    // Angka dari Excel bisa berformat "Rp.130.173.554" atau "130,173,554"
    const negatif = s.includes('-') || /^\(.*\)$/.test(s);
    const angka = Number(s.replace(/[^0-9]/g, ''));
    return negatif ? -angka : angka;
};

// Format sesuai contoh surat: Rp.130.173.554.- dan -Rp.8.018.547.-
export const formatRp = (num, akhiran = '') => {
    const n = Math.round(Number(num) || 0);
    const teks = `Rp.${Math.abs(n).toLocaleString('id-ID')}${akhiran}`;
    return n < 0 ? `-${teks}` : teks;
};

const formatTanggal = (iso) => {
    const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
    return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
};

const formatTanggalBast = (iso) => {
    const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
    return `${d.getDate()} bulan ${d.getMonth() + 1} tahun ${d.getFullYear()}`;
};

const cleanFileName = (s) => String(s ?? '').replace(/[/\\?%*:|"<>#]/g, '').replace(/\s+/g, ' ').trim();

const isiTemplate = (html, data) => {
    for (const [key, value] of Object.entries(data)) {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), () => value);
    }
    return html;
};

// Teks template sederhana -> HTML untuk surat:
// baris "1. ..." = daftar bernomor, baris "- ..." = sub-poin, baris kosong = paragraf baru, **teks** = tebal
export const teksKeHtml = (teks) => {
    const baris = escapeHtml(teks).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split(/\r?\n/);
    let html = '';
    let paragraf = [];
    let dalamOl = false, dalamUl = false, liTerbuka = false;
    const tutupParagraf = () => { if (paragraf.length) { html += `<p style="text-align: justify;">${paragraf.join('<br>')}</p>`; paragraf = []; } };
    const tutupUl = () => { if (dalamUl) { html += '</ul>'; dalamUl = false; } };
    const tutupDaftar = () => { tutupUl(); if (liTerbuka) { html += '</li>'; liTerbuka = false; } if (dalamOl) { html += '</ol>'; dalamOl = false; } };
    for (const b of baris) {
        const t = b.trim();
        const nomor = t.match(/^\d+[.)]\s+(.*)$/);
        const poin = t.match(/^[-•]\s+(.*)$/);
        if (!t) { tutupParagraf(); tutupDaftar(); continue; }
        if (nomor) {
            tutupParagraf(); tutupUl();
            if (liTerbuka) html += '</li>';
            if (!dalamOl) { html += '<ol>'; dalamOl = true; }
            html += `<li>${nomor[1]}`; liTerbuka = true;
        } else if (poin) {
            tutupParagraf();
            if (!dalamUl) { html += '<ul>'; dalamUl = true; }
            html += `<li>${poin[1]}</li>`;
        } else {
            tutupDaftar();
            paragraf.push(t);
        }
    }
    tutupParagraf(); tutupDaftar();
    return html;
};

export const DEFAULT_PEMBUKA = 'Berikut disampaikan {{jenis_surat}} periode {{periode}} dengan rincian sebagai berikut:';
export const DEFAULT_KETENTUAN = `Untuk melakukan klaim atas fee tersebut dimohon untuk menerbitkan invoice dengan batas akhir pada tanggal {{batas_invoice}} jam 23:59 dengan memperhatikan beberapa hal berikut ini:

1. Proses invoicing dilakukan di sistem Coupa
2. Invoice dan Faktur Pajak harus memenuhi beberapa kriteria sebagai berikut:
- Redaksi yang ditulis pada invoice adalah nilai total DPP.
- Dipotong PPh 23 sebesar {{pph_persen}}%
- Mencantumkan nomor rekening perusahaan (bukan perorangan)
- Materai senilai 10,000, dibubuhi tandatangan dan stempel Perusahaan
- Mencantumkan ‘terbilang’ untuk nilai total.
- Nomor Invoice harus dituliskan di bawah QR code Faktur Pajak
3. Dokumen yang diupload ke sistem Coupa adalah sebagai berikut:
- Scan attachment 1: Invoice
- Scan attachment 2: Faktur pajak (nomor invoice harus dituliskan di bawah QR code Faktur Pajak), PO, BAST dan Surat Pemberitahuan Imbalan Jasa.`;

// Pengaturan tampilan surat per template. {{NAMA_PROGRAM}} (huruf besar) = nama program dalam huruf kapital.
// rincian_bast: 'branch' = 1 baris per branch, 'komponen' = 1 baris per komponen fee
export const DEFAULT_PENGATURAN = {
    perihal: '{{jenis_surat}} Periode {{periode}} MPC {{nama_partner}}',
    judul_tabel: 'DPP {{NAMA_PROGRAM}}',
    label_total: '{{nama_program}} (sebelum pajak)',
    label_wilayah: 'Branch',
    judul_bast: 'MPC {{NAMA_PROGRAM}} - Periode {{periode}}',
    rincian_bast: 'branch',
};

const KETENTUAN_TACTICAL = `Untuk melakukan klaim atas rewards tersebut di mohon untuk segera submit invoice di COUPA dengan memperhatikan beberapa hal berikut ini:

1. Proses Invoicing dilakukan di Tim Circle Sumatera.
2. Invoice dan Faktur Pajak harus memenuhi beberapa kriteria sebagai berikut:
- Redaksi yang ditulis pada invoice adalah nilai total DPP.
- Dipotong PPh 23 sebesar {{pph_persen}}%
- Mencantumkan nomor rekening perusahaan (bukan perorangan)
- Materai senilai 10,000, dibubuhi tandatangan dan stempel Perusahaan
- Mencantumkan ‘terbilang’ untuk nilai total.
- Nomor Invoice harus dituliskan di bawah QR code Faktur Pajak
3. Dokumen yang di kirimkan kembali ke Tim Circle Sumatera (ukuran file total tidak lebih dari 1 MB):
- Scanned Invoice : Invoice (Nomor Invoice# Max 16 Character)
- Attachments : Faktur Pajak, BAST, & Surat Pemberitahuan di Merge menjadi satu file.`;

const TEMPLATE_SISTEM = [
    { kode: 'MDI_DISTRIBUTION_FEE', jenis_surat: 'Surat Pemberitahuan Imbalan Jasa Distribution Fee', nama_program: 'Distribution Fee', isi_pembuka: DEFAULT_PEMBUKA, isi_ketentuan: DEFAULT_KETENTUAN, pengaturan: {} },
    { kode: 'MDI_SALES_SUPPORT', jenis_surat: 'Surat Pemberitahuan Sales Support', nama_program: 'Sales Support', isi_pembuka: DEFAULT_PEMBUKA, isi_ketentuan: DEFAULT_KETENTUAN, pengaturan: {} },
    {
        kode: 'MDI_TACTICAL', jenis_surat: 'Surat Pemberitahuan Tactical ONO & Adj Trade Supply & Voucher Games', nama_program: 'Tactical Fee',
        isi_pembuka: 'Berikut disampaikan {{jenis_surat}} periode {{periode}} dengan rincian sebagai berikut:',
        isi_ketentuan: KETENTUAN_TACTICAL,
        pengaturan: {
            perihal: '{{jenis_surat}} Periode {{periode}}',
            judul_tabel: 'Tactical ONO & Adj Trade Supply & Voucher Game',
            label_total: 'Tactical Fee (sebelum pajak)',
            label_wilayah: 'Region',
            judul_bast: 'MPC Tactical Voucher Game – Periode {{periode}}',
            rincian_bast: 'komponen',
        },
    },
];

export const bacaPengaturan = (nilai) => {
    let obj = nilai;
    if (typeof nilai === 'string') { try { obj = JSON.parse(nilai); } catch (e) { obj = {}; } }
    const hasil = { ...DEFAULT_PENGATURAN };
    for (const [k, v] of Object.entries(obj || {})) if (k in DEFAULT_PENGATURAN && String(v ?? '').trim() !== '') hasil[k] = String(v);
    return hasil;
};

// Hitung DPP/PPN/PPh/Total per branch. Kolom PPN/PPh/Total dari Excel dipakai jika ada.
export const hitungBranch = (branch, ppnPersen, pphPersen) => {
    const komponen = branch.komponen || {};
    const dpp = Object.values(komponen).reduce((sum, v) => sum + toNumber(v), 0);
    const ppn = branch.ppn !== undefined && branch.ppn !== '' ? toNumber(branch.ppn) : Math.round(dpp * ppnPersen / 100);
    const pphRaw = branch.pph !== undefined && branch.pph !== '' ? toNumber(branch.pph) : Math.round(dpp * pphPersen / 100);
    const pph = -Math.abs(pphRaw);
    const total = branch.total !== undefined && branch.total !== '' ? toNumber(branch.total) : dpp + ppn + pph;
    return { nama: branch.nama, komponen, dpp, ppn, pph, total };
};

let fontStylesCache = null;
const getFontStyles = (rootDir) => {
    if (fontStylesCache !== null) return fontStylesCache;
    try {
        const regular = fs.readFileSync(path.join(rootDir, 'Indosat Regular.ttf')).toString('base64');
        const bold = fs.readFileSync(path.join(rootDir, 'INDOSAT BOLD.TTF')).toString('base64');
        fontStylesCache = `<style>@font-face {font-family: 'Indosat'; src: url(data:font/truetype;charset=utf-8;base64,${regular}) format('truetype'); font-weight: normal;} @font-face {font-family: 'Indosat'; src: url(data:font/truetype;charset=utf-8;base64,${bold}) format('truetype'); font-weight: bold;}</style>`;
    } catch (err) {
        fontStylesCache = '';
    }
    return fontStylesCache;
};

const imgTtd = (dataUrl) => (dataUrl && /^data:image\/(png|jpe?g);base64,/.test(dataUrl)) ? `<img src="${dataUrl}">` : '';

export const buildMdiDocuments = (partner, opsi, rootDir) => {
    const ppnPersen = Number(opsi.ppn_persen ?? 11);
    const pphPersen = Number(opsi.pph_persen ?? 2);
    const branches = (partner.branches || []).map(b => hitungBranch(b, ppnPersen, pphPersen));
    const namaKomponen = opsi.komponen || [];

    const totalKomponen = {};
    namaKomponen.forEach(k => { totalKomponen[k] = branches.reduce((s, b) => s + toNumber(b.komponen[k]), 0); });
    const total = branches.reduce((acc, b) => ({ dpp: acc.dpp + b.dpp, ppn: acc.ppn + b.ppn, pph: acc.pph + b.pph, total: acc.total + b.total }), { dpp: 0, ppn: 0, pph: 0, total: 0 });

    const namaProgram = escapeHtml(opsi.nama_program || 'Distribution Fee');
    const umum = {
        logo_atas: LOGO_ATAS_URL,
        logo_bawah: LOGO_BAWAH_URL,
        nama_partner: escapeHtml(partner.partner_name),
        periode: escapeHtml(opsi.periode),
        nama_program: namaProgram,
        nama_program_upper: namaProgram.toUpperCase(),
        pph_persen: escapeHtml(pphPersen),
    };
    const fontStyles = getFontStyles(rootDir);

    const pengaturan = bacaPengaturan(opsi.pengaturan);
    const isiVariabel = (teks) => String(teks || '')
        .replace(/{{NAMA_PROGRAM}}/g, () => String(opsi.nama_program || '').toUpperCase())
        .replace(/{{jenis_surat}}/gi, () => opsi.jenis_surat || '')
        .replace(/{{nama_program}}/gi, () => opsi.nama_program || '')
        .replace(/{{nama_partner}}/gi, () => partner.partner_name || '')
        .replace(/{{periode}}/gi, () => opsi.periode || '')
        .replace(/{{batas_invoice}}/gi, () => formatTanggal(opsi.batas_invoice))
        .replace(/{{pph_persen}}/gi, () => String(pphPersen));

    const barisKomponen = namaKomponen.map(k => `<tr><td>${escapeHtml(k)}</td><td class="nilai">${formatRp(totalKomponen[k], '.-')}</td></tr>`).join('');
    let letterHtml = fs.readFileSync(path.join(rootDir, 'template-mdi-letter.html'), 'utf8');
    letterHtml = isiTemplate(letterHtml, {
        ...umum,
        tanggal: formatTanggal(opsi.tanggal_surat),
        no_surat: escapeHtml(partner.no_surat),
        perihal: escapeHtml(isiVariabel(pengaturan.perihal)),
        judul_tabel: escapeHtml(isiVariabel(pengaturan.judul_tabel)),
        label_total: escapeHtml(isiVariabel(pengaturan.label_total)),
        label_wilayah: escapeHtml(pengaturan.label_wilayah),
        jenis_surat: escapeHtml(opsi.jenis_surat),
        baris_komponen: barisKomponen,
        daftar_branch: escapeHtml(branches.map(b => b.nama).filter(Boolean).join(', ')),
        total_dpp: formatRp(total.dpp, '.-'),
        total_ppn: formatRp(total.ppn, '.-'),
        total_pph: formatRp(total.pph, '.-'),
        total_transfer: formatRp(total.total, '.-'),
        isi_pembuka: teksKeHtml(isiVariabel(opsi.isi_pembuka || DEFAULT_PEMBUKA)),
        isi_ketentuan: teksKeHtml(isiVariabel(opsi.isi_ketentuan || DEFAULT_KETENTUAN)),
        ttd_surat: imgTtd(opsi.ttd_surat),
        nama_penandatangan: escapeHtml(opsi.penandatangan_surat?.nama),
        jabatan_penandatangan: escapeHtml(opsi.penandatangan_surat?.jabatan),
        unit_penandatangan: escapeHtml(opsi.penandatangan_surat?.unit),
        cc_surat: escapeHtml(opsi.cc_surat),
    }).replace('</head>', `${fontStyles}\n</head>`);

    // Rincian BAST: per branch (contoh Distribution Fee) atau per komponen fee (contoh Tactical)
    const barisRincian = pengaturan.rincian_bast === 'komponen'
        ? namaKomponen.map(k => hitungBranch({ nama: k, komponen: { [k]: totalKomponen[k] } }, ppnPersen, pphPersen))
        : branches;
    const totalBast = barisRincian.reduce((acc, b) => ({ dpp: acc.dpp + b.dpp, ppn: acc.ppn + b.ppn, pph: acc.pph + b.pph, total: acc.total + b.total }), { dpp: 0, ppn: 0, pph: 0, total: 0 });
    const barisBranch = barisRincian.map(b => `<tr><td>${escapeHtml(b.nama)}</td><td class="nilai">${formatRp(b.dpp)}</td><td class="nilai">${formatRp(b.ppn)}</td><td class="nilai">${formatRp(b.pph)}</td><td class="nilai">${formatRp(b.total)}</td></tr>`).join('')
        + `<tr><td class="nilai" colspan="2">${formatRp(totalBast.dpp)}</td><td class="nilai">${formatRp(totalBast.ppn)}</td><td class="nilai">${formatRp(totalBast.pph)}</td><td class="nilai">${formatRp(totalBast.total)}</td></tr>`;
    let bastHtml = fs.readFileSync(path.join(rootDir, 'template-mdi-bast.html'), 'utf8');
    bastHtml = isiTemplate(bastHtml, {
        ...umum,
        tanggal_bast: formatTanggalBast(opsi.tanggal_surat),
        judul_bast: escapeHtml(isiVariabel(pengaturan.judul_bast)),
        label_wilayah: escapeHtml(pengaturan.label_wilayah),
        nama_pihak1: escapeHtml(opsi.pihak_pertama?.nama),
        jabatan_pihak1: escapeHtml(opsi.pihak_pertama?.jabatan),
        nama_pihak2: escapeHtml(partner.pic_nama || '-'),
        jabatan_pihak2: escapeHtml(partner.pic_jabatan || '-'),
        baris_branch: barisBranch,
    }).replace('</head>', `${fontStyles}\n</head>`);

    return { letterHtml, bastHtml, total, branches };
};

// Subject & body email: placeholder {{jenis_surat}}, {{nama_program}}, {{nama_partner}}, {{periode}}, {{type}}
export const isiPlaceholderEmail = (teks, data) => String(teks || '')
    .replace(/{{jenis_surat}}/gi, () => data.jenis_surat || '')
    .replace(/{{nama_program}}/gi, () => data.nama_program || '')
    .replace(/{{nama_partner}}/gi, () => data.partner_name || '')
    .replace(/{{periode}}/gi, () => data.periode || '')
    .replace(/{{type}}/gi, () => data.type || '');

const bodyKeHtml = (teks) => "<div style='font-family: \"Segoe UI\", Arial, sans-serif; font-size: 14px; color: #4D4D4F; line-height: 1.6;'>"
    + escapeHtml(teks)
        .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>')
        .replace(/\n/g, '<br>')
    + '</div>';

// Pecah daftar email (; , spasi, baris baru), buang karakter tak terlihat, dan ambil hanya alamat yang formatnya valid
const POLA_EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const pecahEmail = (s) => [...new Set(String(s || '')
    .replace(/[\u00A0\u200B-\u200D\u2060\uFEFF]/g, ' ')
    .replace(/mailto:/gi, ' ')
    .split(/[;,\s]+/)
    .map(e => e.replace(/^[<("'\[]+|[>)"'\].:]+$/g, '').trim())
    .filter(e => POLA_EMAIL.test(e)))];

export function registerMdiRoutes(app, { dbSurat, getBrowser, resend, downloadsDir, rootDir }) {

    const renderPdf = async (browser, html, pdfPath) => {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0');
        await page.setContent(html, { waitUntil: 'load', timeout: 60000 }); // [SandraHub] dulu networkidle2; gambar kini dilayani lokal
        await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
        await page.close();
    };

    const simpanRiwayat = async (data) => {
        await dbSurat.execute({
            sql: `INSERT INTO sm_history_surat (batch_id, jenis_surat, sdp_id, partner_name, periode, nominal, filename, url, html_url, email_to, email_cc, brand, type_sdp, html_content, is_blasted, tabel_html)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '')`,
            args: [data.batch_id, data.jenis_surat, data.sdp_id, data.partner_name, data.periode, data.nominal, data.filename, `/api/smart-mail/downloads/${data.filename}`, `/api/smart-mail/downloads/${data.filename.replace('.pdf', '.html')}`, data.email_to, data.email_cc, 'MDI', data.type_sdp, data.html_content]
        });
    };

    // Pastikan PDF tersedia (di Vercel /tmp bisa hilang antar request) -> regenerate dari html_content
    const ambilPdf = async (filename, browserRef) => {
        const pdfPath = path.join(downloadsDir, filename);
        if (fs.existsSync(pdfPath)) return fs.readFileSync(pdfPath);
        const { rows } = await dbSurat.execute({ sql: "SELECT html_content FROM sm_history_surat WHERE filename = ?", args: [filename] });
        if (rows.length === 0 || !rows[0].html_content) return null;
        if (!browserRef.browser) browserRef.browser = await getBrowser();
        await renderPdf(browserRef.browser, rows[0].html_content, pdfPath);
        return fs.readFileSync(pdfPath);
    };


    const seedTemplate = async () => {
        try {
            for (const t of TEMPLATE_SISTEM) {
                await dbSurat.execute({
                    sql: `INSERT INTO sm_mdi_template (kode, jenis_surat, nama_program, isi_pembuka, isi_ketentuan, pengaturan, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)
                          ON CONFLICT (kode) DO NOTHING`,
                    args: [t.kode, t.jenis_surat, t.nama_program, t.isi_pembuka, t.isi_ketentuan, JSON.stringify(bacaPengaturan(t.pengaturan))]
                });
            }
        } catch (err) { console.error('Gagal menyiapkan template MDI:', err); }
    };
    const templateSiap = seedTemplate();

    app.get('/api/mdi/templates', async (req, res) => {
        try {
            await templateSiap;
            const { rows } = await dbSurat.execute("SELECT * FROM sm_mdi_template ORDER BY is_system DESC, kode");
            res.json({ success: true, data: rows.map(r => ({ ...r, pengaturan: bacaPengaturan(r.pengaturan) })), default_pembuka: DEFAULT_PEMBUKA, default_ketentuan: DEFAULT_KETENTUAN, default_pengaturan: DEFAULT_PENGATURAN });
        } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    });

    app.post('/api/mdi/templates', async (req, res) => {
        const { kode, jenis_surat, nama_program, isi_pembuka, isi_ketentuan, pengaturan } = req.body;
        if (!kode || !jenis_surat || !nama_program) return res.status(400).json({ success: false, error: 'Kode, jenis surat, dan nama program wajib diisi.' });
        const kodeBersih = String(kode).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        try {
            await dbSurat.execute({
                sql: `INSERT INTO sm_mdi_template (kode, jenis_surat, nama_program, isi_pembuka, isi_ketentuan, pengaturan, is_system) VALUES (?, ?, ?, ?, ?, ?, 0)
                      ON CONFLICT (kode) DO UPDATE SET jenis_surat = excluded.jenis_surat, nama_program = excluded.nama_program, isi_pembuka = excluded.isi_pembuka, isi_ketentuan = excluded.isi_ketentuan, pengaturan = excluded.pengaturan`,
                args: [kodeBersih, jenis_surat, nama_program, isi_pembuka || DEFAULT_PEMBUKA, isi_ketentuan || DEFAULT_KETENTUAN, JSON.stringify(bacaPengaturan(pengaturan))]
            });
            res.json({ success: true, kode: kodeBersih, message: 'Template MDI berhasil disimpan!' });
        } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    });

    // Template email blast (subject + body) yang disimpan user. Tabel dipastikan ada sebelum dipakai,
    // agar tetap jalan walau database lama belum punya tabel ini.
    let tabelEmailSiap = null;
    const pastikanTabelEmail = () => {
        if (!tabelEmailSiap) {
            tabelEmailSiap = dbSurat.execute(`CREATE TABLE IF NOT EXISTS sm_mdi_email_template (nama TEXT PRIMARY KEY, subject TEXT, body TEXT)`)
                .catch(err => { tabelEmailSiap = null; throw err; });
        }
        return tabelEmailSiap;
    };

    app.get('/api/mdi/email-templates', async (req, res) => {
        try {
            await pastikanTabelEmail();
            const { rows } = await dbSurat.execute("SELECT * FROM sm_mdi_email_template ORDER BY nama");
            res.json({ success: true, data: rows });
        } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    });

    app.post('/api/mdi/email-templates', async (req, res) => {
        const nama = String(req.body.nama || '').trim();
        const { subject, body } = req.body;
        if (!nama || !subject || !body) return res.status(400).json({ success: false, error: 'Nama, subject, dan isi email wajib diisi.' });
        try {
            await pastikanTabelEmail();
            await dbSurat.execute({
                sql: `INSERT INTO sm_mdi_email_template (nama, subject, body) VALUES (?, ?, ?)
                      ON CONFLICT (nama) DO UPDATE SET subject = excluded.subject, body = excluded.body`,
                args: [nama, subject, body]
            });
            res.json({ success: true, nama });
        } catch (err) {
            console.error('Gagal menyimpan template email MDI:', err);
            res.status(500).json({ success: false, error: `Database menolak penyimpanan: ${err.message}` });
        }
    });

    app.delete('/api/mdi/email-templates/:nama', async (req, res) => {
        try {
            await pastikanTabelEmail();
            await dbSurat.execute({ sql: "DELETE FROM sm_mdi_email_template WHERE nama = ?", args: [req.params.nama] });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    });

    app.delete('/api/mdi/templates/:kode', async (req, res) => {
        try {
            await dbSurat.execute({ sql: "DELETE FROM sm_mdi_template WHERE kode = ? AND is_system = 0", args: [req.params.kode] });
            res.json({ success: true, message: 'Template berhasil dihapus' });
        } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    });

    app.post('/api/mdi/generate', async (req, res) => {
        const { partners, batch_id } = req.body;
        if (!partners || partners.length === 0) return res.status(400).json({ success: false, error: 'Data partner MDI belum dipilih.' });

        const batchId = batch_id || `MDI-${Date.now()}`;
        const kodePeriode = cleanFileName(req.body.kode_periode || '');
        let browser;
        try {
            browser = await getBrowser();
            const hasil = [];
            for (const partner of partners) {
                const { letterHtml, bastHtml, total, branches } = buildMdiDocuments(partner, req.body, rootDir);
                const namaDasar = `${cleanFileName(partner.partner_name)}${kodePeriode ? '_' + kodePeriode : ''}_${batchId}`;
                const letterFile = `LETTER_MPC_${namaDasar}.pdf`;
                const bastFile = `BAST_MPC_${namaDasar}.pdf`;

                for (const [file, html] of [[letterFile, letterHtml], [bastFile, bastHtml]]) {
                    fs.writeFileSync(path.join(downloadsDir, file.replace('.pdf', '.html')), html);
                    await renderPdf(browser, html, path.join(downloadsDir, file));
                }

                const emailTo = pecahEmail(partner.email_to).join('; ');
                const emailCc = pecahEmail(partner.email_cc).join('; ');
                const riwayat = { batch_id: batchId, partner_name: partner.partner_name, periode: req.body.periode, nominal: String(total.dpp), email_to: emailTo, email_cc: emailCc, sdp_id: partner.no_surat || partner.partner_name };
                await simpanRiwayat({ ...riwayat, jenis_surat: `MDI - ${req.body.jenis_surat}`, type_sdp: 'MDI LETTER', filename: letterFile, html_content: letterHtml });
                await simpanRiwayat({ ...riwayat, jenis_surat: `MDI - ${req.body.jenis_surat}`, type_sdp: 'MDI BAST', filename: bastFile, html_content: bastHtml });

                hasil.push({
                    partner_name: partner.partner_name,
                    no_surat: partner.no_surat,
                    branches: branches.map(b => b.nama),
                    total,
                    email_to: emailTo,
                    email_cc: emailCc,
                    letter: { filename: letterFile, url: `/api/smart-mail/downloads/${letterFile}` },
                    bast: { filename: bastFile, url: `/api/smart-mail/downloads/${bastFile}` },
                });
            }
            res.json({ success: true, batch_id: batchId, results: hasil });
        } catch (error) {
            console.error('Gagal generate surat MDI:', error);
            res.status(500).json({ success: false, error: error.message });
        } finally {
            if (browser) await browser.close();
        }
    });

    app.post('/api/mdi/send-emails', async (req, res) => {
        const { items, subject, pesan, jenis_surat, nama_program, periode, batch_id } = req.body;
        if (!items || items.length === 0) return res.status(400).json({ success: false, error: 'Target pengiriman email tidak ditemukan.' });

        const browserRef = { browser: null };
        const hasilKirim = [];
        try {
            for (const item of items) {
                const arrayEmailTujuan = pecahEmail(item.email_to);
                if (arrayEmailTujuan.length === 0) {
                    hasilKirim.push({ key: item.key, type: item.type, partner_name: item.partner_name, status: 'Gagal (Alamat Email Kosong)', is_success: false });
                    continue;
                }
                try {
                    // Lampiran: file hasil generate di server (filenames) atau upload langsung dari browser (mode Blast Email Only)
                    // Isi lampiran dikirim ke Resend sebagai string base64 (sama seperti alur SDP)
                    const lampiran = (item.attachments || []).map(a => ({ filename: a.filename, content: String(a.content || '').split(',').pop().trim() }));
                    const lampiranKosong = lampiran.filter(l => !l.content).map(l => l.filename);
                    if (lampiranKosong.length) {
                        hasilKirim.push({ key: item.key, type: item.type, partner_name: item.partner_name, status: `Gagal (isi lampiran kosong: ${lampiranKosong.join(', ')})`, is_success: false });
                        continue;
                    }
                    let adaYangHilang = false;
                    for (const filename of (item.filenames || [])) {
                        const buffer = await ambilPdf(filename, browserRef);
                        if (!buffer) { adaYangHilang = true; break; }
                        lampiran.push({ filename, content: buffer.toString('base64') });
                    }
                    if (adaYangHilang || lampiran.length === 0) {
                        hasilKirim.push({ key: item.key, type: item.type, partner_name: item.partner_name, status: 'Gagal (Dokumen PDF hilang dari server)', is_success: false });
                        continue;
                    }

                    const dataPlaceholder = { jenis_surat, nama_program, periode, partner_name: item.partner_name, type: item.type };
                    const emailPayload = {
                        from: EMAIL_FROM,
                        to: arrayEmailTujuan,
                        subject: isiPlaceholderEmail(item.subject || subject, dataPlaceholder),
                        html: bodyKeHtml(isiPlaceholderEmail(item.pesan || pesan, dataPlaceholder)),
                        attachments: lampiran
                    };
                    const arrayEmailCC = pecahEmail(item.email_cc);
                    if (arrayEmailCC.length > 0) emailPayload.cc = arrayEmailCC;

                    const sendResponse = await kirimEmail(resend, emailPayload); // jeda + coba ulang saat kena limit (kirim.js)
                    if (sendResponse.error) {
                        hasilKirim.push({ key: item.key, type: item.type, partner_name: item.partner_name, status: `Ditolak Resend: ${sendResponse.error.message}`, is_success: false });
                    } else {
                        const namaFile = lampiran.map(l => l.filename);
                        // [SandraHub] Email sudah terkirim: error update riwayat tidak boleh membuatnya dilaporkan gagal.
                        let catatanRiwayat = '';
                        try {
                            await dbSurat.execute({ sql: `UPDATE sm_history_surat SET is_blasted = 1 WHERE batch_id = ? AND filename IN (${namaFile.map(() => '?').join(', ')})`, args: [batch_id, ...namaFile] });
                        } catch (eDb) {
                            console.error('Email terkirim, tapi status riwayat gagal diperbarui:', eDb.message);
                            catatanRiwayat = ' (status riwayat belum ter-update)';
                        }
                        hasilKirim.push({ key: item.key, type: item.type, partner_name: item.partner_name, status: 'Berhasil' + catatanRiwayat, is_success: true });
                    }
                } catch (e) {
                    hasilKirim.push({ key: item.key, type: item.type, partner_name: item.partner_name, status: `Kegagalan Internal: ${e.message}`, is_success: false });
                }
            }
        } finally {
            if (browserRef.browser) await browserRef.browser.close();
        }
        res.json({ success: true, results: hasilKirim });
    });
}
