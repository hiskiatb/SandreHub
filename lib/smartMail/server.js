// lib/smartMail/server.js
// SALINAN server.js Smart Mail Sumatera (anggiesther/sa-automation, PR #1) untuk
// SandraHub. Logika endpoint TIDAK diubah. Yang disesuaikan hanya sambungannya:
//   - express/multer diganti expressShim.js (dipanggil dari app/api/smart-mail/[...path]/route.js)
//   - nama tabel diberi awalan sm_ (Supabase TraceHub), koneksi tetap lewat SUPABASE_DB_URL
//   - URL /downloads, /approve-document, /reject-document, /submit-reject diarahkan ke /api/smart-mail/...
//   - API key Resend lama (bocor) dihapus: hanya dari env RESEND_API_KEY
//   - path Chrome lokal untuk Mac + Chromium (chromium-min) di Vercel
//   - link approval memakai token acak + halaman konfirmasi (POST), lihat bagian approve-document
//   - kirim email lewat kirim.js: jeda antar email + coba ulang otomatis saat kena limit Resend
//   - inisialisasi tabel/seed saat start diganti SQL manual (docs/sql/smart_mail_schema.sql)
import express, { multer } from './expressShim.js';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import * as xlsx from 'xlsx';
import { Resend } from 'resend';
import { registerMdiRoutes } from './mdi.js';
import { kirimEmail } from './kirim.js';
import { db as dbSurat, pool, dbSiap, DB_BELUM_DISETEL } from './db.js';

// File pendukung (template HTML, font, tanda tangan) ada di lib/smartMail/assets.
const __dirname = path.join(process.cwd(), 'lib', 'smartMail', 'assets');
const app = express();
const isLocal = !process.env.VERCEL;

const resend = new Resend(process.env.RESEND_API_KEY || 're_belum_diatur');

// ============================================================================
// KONFIGURASI MULTER (MENGGUNAKAN MEMORY STORAGE AGAR AMAN DI VERCEL)
// ============================================================================
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Semua data tersimpan di Supabase: tanpa SUPABASE_DB_URL, API membalas pesan yang jelas (bukan error acak)
app.use('/api', (req, res, next) => dbSiap ? next() : res.status(503).json({ success: false, error: DB_BELUM_DISETEL }));

const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
const downloadsDir = isVercel ? '/tmp/downloads' : path.join(process.cwd(), '.tmp_smart_mail_downloads');

if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

export { pool };

// initDatabase() asli (CREATE TABLE + seed jenis_surat) dipindah ke docs/sql/smart_mail_schema.sql.



// ============================================================================
// PERBAIKAN: GET BROWSER
// ============================================================================
const CHROMIUM_PACK = 'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';
const CHROME_LOKAL = process.env.CHROME_PATH || (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
// [SandraHub] Logo Indosat di template surat dipanggil dari URL luar (Wikimedia & indosatooredoo.com).
// Saat ratusan surat dibuat, server luar itu bisa lambat/menahan request, sehingga render PDF
// menunggu selamanya (dulu timeout: 0) dan proses "Membuat File PDF" macet. Sekarang request
// ke 2 URL logo itu dilayani dari file lokal (assets/ioh-logo.png, ioh-circles.png); HTML surat
// tidak berubah. Request lain tetap jalan seperti biasa.
const LOGO_LOKAL = {
    'https://upload.wikimedia.org/wikipedia/commons/1/1d/Indosat_Ooredoo_Hutchison.png': 'ioh-logo.png',
    'https://indosatooredoo.com/iohassets/images/icons/ioh_circles.png': 'ioh-circles.png',
};
const logoCache = {};
const BATAS_RENDER_MS = 45000;
const pasangLogoLokal = async (page) => {
    page.setDefaultTimeout(BATAS_RENDER_MS);
    page.setDefaultNavigationTimeout(BATAS_RENDER_MS);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
        const file = LOGO_LOKAL[r.url()];
        if (!file) return r.continue();
        try {
            logoCache[file] = logoCache[file] || fs.readFileSync(path.join(__dirname, file));
            return r.respond({ status: 200, contentType: 'image/png', body: logoCache[file] });
        } catch (e) { return r.continue(); }
    });
};

const getBrowser = async () => {
    const browser = await launchBrowser();
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async () => { const page = await newPage(); await pasangLogoLokal(page); return page; };
    return browser;
};

const launchBrowser = async () => {
    const browser = await puppeteer.launch({
        // [SandraHub] di laptop: tab latar belakang tidak diperlambat (5 surat dirender bersamaan)
        args: isLocal ? ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] : chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: isLocal ? CHROME_LOKAL : await chromium.executablePath(CHROMIUM_PACK),
        headless: isLocal ? true : chromium.headless,
        ignoreHTTPSErrors: true,
        protocolTimeout: 90000,
    });
    return browser;
};


const getTemplateSurat = async (kode) => {
    const { rows } = await dbSurat.execute({ sql: "SELECT * FROM sm_jenis_surat WHERE kode = ?", args: [kode] });
    return rows[0];
};

const simpanRiwayatSurat = async (data, namaFile) => {
    const { lastInsertRowid } = await dbSurat.execute({
        sql: `INSERT INTO sm_history_surat (batch_id, jenis_surat, sdp_id, partner_name, periode, nominal, filename, url, html_url, email_to, email_cc, brand, type_sdp, html_content, is_blasted, tabel_html)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [data.batch_id, data.jenis_surat, data.sdp_id, data.partner_name, data.periode, data.nilai_sales, namaFile, data.url, data.html_url, data.email_to, data.email_cc, data.brand, data.type_sdp, data.html_content, 0, data.tabel_html]
    });
    return lastInsertRowid;
};


registerMdiRoutes(app, { dbSurat, getBrowser, resend, downloadsDir, rootDir: __dirname });

app.get('/downloads/:filename', async (req, res) => {
    const filePath = path.join(downloadsDir, req.params.filename);
    if (fs.existsSync(filePath)) {
        return res.sendFile(path.resolve(filePath));
    }
    
    try {
        const { rows } = await dbSurat.execute({ sql: "SELECT html_content FROM sm_history_surat WHERE filename = ?", args: [req.params.filename] });
        if (rows.length > 0 && rows[0].html_content) {
            const browser = await getBrowser();
            const page = await browser.newPage();
            await page.setContent(rows[0].html_content, { waitUntil: 'load', timeout: 60000 });
            await page.pdf({ path: filePath, format: 'A4', printBackground: true });
            await page.close();
            await browser.close();
            return res.sendFile(path.resolve(filePath));
        }
    } catch (e) {
        console.error("Gagal auto-regenerate PDF:", e);
    }
    res.status(404).send('Dokumen PDF tidak ditemukan di server dan arsip sistem.');
});

// ============================================================================
// UPLOAD EXCEL - MEMORY BUFFER
// ============================================================================
app.post('/upload-sdp', upload.single('excelFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Tidak ada file yang diunggah' });
        }
        
        // Baca Excel dari memory buffer
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        
        const sheetNames = workbook.SheetNames;
        const parsedData = {};

        sheetNames.forEach(sheet => {
            parsedData[sheet] = xlsx.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" });
        });

        res.json({ success: true, sheetNames, parsedData });
    } catch (error) {
        console.error("Error parsing Excel:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// TEMPLATE API
// ============================================================================
app.get('/api/templates', async (req, res) => {
    try {
        const { rows } = await dbSurat.execute("SELECT * FROM sm_jenis_surat");
        res.json({ success: true, data: rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/templates', async (req, res) => {
    const { kode, judul, isi } = req.body;
    if (!kode || !judul || !isi) return res.status(400).json({ success: false, error: "Semua kolom wajib diisi" });
    try {
        await dbSurat.execute({
            sql: `INSERT INTO sm_jenis_surat (kode, judul, isi) VALUES (?, ?, ?)
                  ON CONFLICT(kode) DO UPDATE SET judul = ?, isi = ?`,
            args: [kode, judul, isi, judul, isi]
        });
        res.json({ success: true, message: "Template berhasil disimpan!" });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/templates/:kode', async (req, res) => {
    try {
        await dbSurat.execute({ sql: "DELETE FROM sm_jenis_surat WHERE kode = ?", args: [req.params.kode] });
        res.json({ success: true, message: "Template berhasil dihapus" });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================================
// GENERATE SURAT
// ============================================================================
app.post('/api/generate-surat', async (req, res) => {
    const { jenis_surat, custom_jenis_surat, custom_body, sisa_no_ref, periode, nama_penandatangan, posisi_penandatangan, data_rekan } = req.body;
    if (!data_rekan || data_rekan.length === 0) return res.status(400).send("Kesalahan: Data mitra belum dipilih.");

    let browser; // [SandraHub] dideklarasikan di luar try supaya Chrome tetap ditutup kalau ada error
    try {
        let templateSurat;
        
        if (jenis_surat === 'NEW_TEMPLATE_MANUAL') {
            // FIX 1: Hapus tempelan {{tabel_parameter}} ganda. Frontend sudah mengirimkannya otomatis.
            templateSurat = {
                judul: custom_jenis_surat || "Surat Pemberitahuan",
                isi: `<p>Yth. Rekan <b>{{brand}}</b>,</p>
                      <div style="text-align: justify; margin-top: 15px; margin-bottom: 15px;">
                          ${custom_body}
                      </div>`
            };
        } else {
            templateSurat = await getTemplateSurat(jenis_surat);
            if (!templateSurat) return res.status(400).send("Templat dokumen tidak ditemukan.");
        }

        browser = await getBrowser();
        let hasilGenerate = [];
        const generatedBatchId = req.body.batch_id || `BATCH-${Date.now()}`;

        const processPDF = async (sdp, browserInstance) => {
            let htmlContent = fs.readFileSync(path.join(__dirname, 'template-dinamis.html'), 'utf8');
            let fontStyles = "";
            try {
                const regularFont = fs.readFileSync(path.join(__dirname, 'fonts', 'Indosat-Regular.ttf')).toString('base64');
                const boldFont = fs.readFileSync(path.join(__dirname, 'fonts', 'Indosat-Bold.ttf')).toString('base64');
                fontStyles = `<style>@font-face {font-family: 'Indosat'; src: url(data:font/truetype;charset=utf-8;base64,${regularFont}) format('truetype'); font-weight: normal; font-style: normal;} @font-face {font-family: 'Indosat'; src: url(data:font/truetype;charset=utf-8;base64,${boldFont}) format('truetype'); font-weight: bold; font-style: normal;} body, p, table, td, th, span, div, li, ul { font-family: 'Indosat', Arial, sans-serif !important; } b, strong, th { font-family: 'Indosat', Arial, sans-serif !important; font-weight: bold !important; }</style>`;
            } catch(err) {}
            
            htmlContent = htmlContent.includes('</head>') ? htmlContent.replace('</head>', `${fontStyles}\n</head>`) : `${fontStyles}\n${htmlContent}`;

            const dateObj = new Date();
            const tglSurat = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const logoAtasUrl = 'https://upload.wikimedia.org/wikipedia/commons/1/1d/Indosat_Ooredoo_Hutchison.png';
            const logoBawahUrl = 'https://indosatooredoo.com/iohassets/images/icons/ioh_circles.png';

            let isiSuratFinal = templateSurat.isi;
            // FIX 2: Gunakan flag 'gi' agar replace teks mengabaikan huruf besar/kecil ({{periode}} == {{Periode}})
            let perihalFinal = templateSurat.judul.replace(/{{periode}}/gi, periode);

            if (jenis_surat === 'NEW_TEMPLATE_MANUAL' || !['SALES_SUPPORT', 'SURAT_TARGET', 'SURAT_OTF', 'SURAT_CHAMPIONS', 'SURAT_ADDITION', 'SURAT_DEDUCTION'].includes(jenis_surat)) {
                const finalCustomTitle = custom_jenis_surat || templateSurat.judul.replace(/{{periode}}/gi, periode) || "Surat Pemberitahuan";
                perihalFinal = finalCustomTitle.includes(periode) ? finalCustomTitle : `${finalCustomTitle} ${periode}`;
                isiSuratFinal = isiSuratFinal.replace(/{{custom_judul}}/gi, finalCustomTitle);
            }

            let finalBrand = sdp.brand ? sdp.brand.trim() : "Mitra IM3 & 3KIOSK";
            if(finalBrand.toUpperCase() === "IM3") finalBrand = "Mitra IM3 & 3KIOSK";

            let tabelParameterHTML = "";
            let valDaily = "0", valTotal = "0";
            
            if (sdp.dynamic_params && sdp.dynamic_params.length > 0) {
                tabelParameterHTML = `<table style="width:100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; border: 1px solid #000;"><thead><tr style="background-color: #f2f2f2;">`;
                sdp.dynamic_params.forEach(param => { tabelParameterHTML += `<th style="border: 1px solid #000; padding: 10px; text-align: center;">${param.key}</th>`; });
                tabelParameterHTML += `</tr></thead><tbody><tr>`;
                
                sdp.dynamic_params.forEach(param => {
                    let val = param.value;
                    let numVal = val;
                    if (!isNaN(val) && val !== "" && val !== null && val !== "-") numVal = Number(val).toLocaleString('id-ID');
                    tabelParameterHTML += `<td style="border: 1px solid #000; padding: 10px; text-align: center; font-weight: 500;">${numVal}</td>`;
                    
                    const keyLower = param.key.toLowerCase();
                    if (keyLower.includes('daily') && (keyLower.includes('deduction') || keyLower.includes('deduct'))) valDaily = numVal;
                    if (keyLower.includes('total') && (keyLower.includes('deduction') || keyLower.includes('deducted') || keyLower.includes('deduct'))) valTotal = numVal;

                    // FIX 3: Sisipkan nilai SEMUA kolom Excel secara dinamis ke dalam paragraf
                    const regexDynamicParam = new RegExp(`{{${param.key}}}`, 'gi');
                    isiSuratFinal = isiSuratFinal.replace(regexDynamicParam, numVal);
                });
                tabelParameterHTML += `</tr></tbody></table>`;
            }

            const nilaiDbAsli = sdp.nilai_sales ? String(sdp.nilai_sales).trim() : "0";
            const formattedNilaiSales = Number(nilaiDbAsli.replace(/[^0-9]/g, '')).toLocaleString('id-ID');

            let emailTableHTML = tabelParameterHTML;
            if (jenis_surat === 'SALES_SUPPORT') {
                emailTableHTML = `<table style="width:100%; max-width:500px; border-collapse: collapse; margin: 15px 0; font-size: 13px; border: 1px solid #000;">
                    <tbody>
                        <tr>
                            <td style="border: 1px solid #000; padding: 8px 12px;">Sales Support ${periode}</td>
                            <td style="border: 1px solid #000; padding: 8px 12px; text-align: center;">Rp ${formattedNilaiSales}</td>
                        </tr>
                        <tr style="background-color: #e2e2e2;">
                            <td style="border: 1px solid #000; padding: 8px 12px; font-weight: bold;">Total</td>
                            <td style="border: 1px solid #000; padding: 8px 12px; font-weight: bold; text-align: center;">Rp ${formattedNilaiSales}</td>
                        </tr>
                    </tbody>
                </table>`;
            }
            
            isiSuratFinal = isiSuratFinal.replace(/{{tabel_parameter}}/gi, tabelParameterHTML);
            isiSuratFinal = isiSuratFinal.replace(/{{daily_deduction}}/gi, valDaily);
            isiSuratFinal = isiSuratFinal.replace(/{{total_deduction}}/gi, valTotal);
            
            htmlContent = htmlContent.replace(/{{isi_surat}}/gi, isiSuratFinal);
            htmlContent = htmlContent.replace(new RegExp(`{{perihal}}\\s*{{periode}}`, 'gi'), '{{perihal}}');
            
            let formattedSisaRef = sisa_no_ref.trim();
            if (!formattedSisaRef.startsWith('/')) formattedSisaRef = '/' + formattedSisaRef;
            const no_ref_lengkap = `${String(sdp.id).toUpperCase()}${formattedSisaRef}`;

            const signatureHTML = `<div id="ttd-box" style="height: 100px; margin: 5px 0 2px 0; display: block;"></div><b>${nama_penandatangan}</b>`;

            const dataDinamis = {
                tanggal: tglSurat, tujuan_sdp: sdp.partner_name, alamat_sdp: "Di Tempat", region: sdp.region || "Sumatera",
                brand: finalBrand, no_ref: no_ref_lengkap, perihal: perihalFinal, periode: periode, nilai_sales: formattedNilaiSales,
                nama_penandatangan: signatureHTML, posisi_penandatangan: posisi_penandatangan, logo_atas: logoAtasUrl, logo_bawah: logoBawahUrl
            };

            for (const [key, value] of Object.entries(dataDinamis)) {
                htmlContent = htmlContent.replace(new RegExp(`{{${key}}}`, 'gi'), value);
            }

            // Pembersihan jika periode ganda akibat render
            htmlContent = htmlContent.replace(new RegExp(`${periode} ${periode}`, 'gi'), periode);

            const cleanId = String(sdp.id).replace(/[/\\?%*:|"<>]/g, '');
            const cleanPartner = String(sdp.partner_name).replace(/[/\\?%*:|"<>]/g, '');
            const cleanRegionNaming = String(sdp.region_naming || "Sumatera").replace(/[/\\?%*:|"<>]/g, '');
            const namaFile = `${cleanRegionNaming}_${cleanPartner}_${cleanId}_${generatedBatchId}.pdf`;
            
            const pdfPath = path.join(downloadsDir, namaFile);
            const htmlPath = path.join(downloadsDir, namaFile.replace('.pdf', '.html'));
            fs.writeFileSync(htmlPath, htmlContent);

            const page = await browserInstance.newPage();
            await page.setUserAgent('Mozilla/5.0');
            await page.setContent(htmlContent, { waitUntil: 'load', timeout: BATAS_RENDER_MS }); // [SandraHub] dulu networkidle2 + timeout: 0 (bisa menunggu selamanya); semua gambar kini lokal, jadi 'load' cukup
            await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
            await page.close();

            const pdfUrl = `/api/smart-mail/downloads/${namaFile}`;
            const htmlUrl = `/api/smart-mail/downloads/${namaFile.replace('.pdf', '.html')}`;
            const finalJenisSuratDB = jenis_surat === 'NEW_TEMPLATE_MANUAL' ? (custom_jenis_surat || 'CUSTOM_MANUAL') : jenis_surat;

            await simpanRiwayatSurat({
                batch_id: generatedBatchId, jenis_surat: finalJenisSuratDB, partner_name: sdp.partner_name, region: sdp.region || "Sumatera", no_ref_lengkap, periode, nilai_sales: nilaiDbAsli,
                sdp_id: sdp.id, url: pdfUrl, html_url: htmlUrl, email_to: sdp.email_to || "", email_cc: sdp.email_cc || "", brand: finalBrand, type_sdp: sdp.type || "SDP REGULAR", html_content: htmlContent, tabel_html: emailTableHTML
            }, namaFile);
            
            return { id: sdp.id, partner_name: sdp.partner_name, type: sdp.type, url: pdfUrl, filename: namaFile, is_blasted: false, tabel_html: emailTableHTML };
        };

        const chunkSize = 5;
        for (let i = 0; i < data_rekan.length; i += chunkSize) {
            const chunk = data_rekan.slice(i, i + chunkSize);
            const results = await Promise.all(chunk.map(sdp => processPDF(sdp, browser)));
            hasilGenerate.push(...results);
        }

        await browser.close();
        browser = null;
        res.json({ success: true, batch_id: generatedBatchId, results: hasilGenerate });
    } catch (error) {
        if (browser) await browser.close().catch(() => {});
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// SISTEM APPROVAL
// ============================================================================
app.post('/api/request-approval', async (req, res) => {
    const { batch_id, approver_id, approver_name, approver_email, summary_html } = req.body;
    if (!batch_id || !approver_email) return res.status(400).json({ success: false, error: 'Detail Batch atau Email Approver tidak valid.' });

    try {
        // [SandraHub] Token acak per pengajuan: link di email hanya berlaku dengan token ini (batch_id saja mudah ditebak).
        const approvalToken = crypto.randomBytes(24).toString('hex');
        await dbSurat.execute({
            sql: `INSERT INTO sm_approvals (batch_id, approver_id, approver_name, approver_email, is_approved, status, rejection_reason, approval_token) VALUES (?, ?, ?, ?, 0, 'pending', NULL, ?)
                  ON CONFLICT(batch_id) DO UPDATE SET approver_id = ?, approver_name = ?, approver_email = ?, is_approved = 0, status = 'pending', rejection_reason = NULL, approval_token = ?`,
            args: [batch_id, approver_id, approver_name, approver_email, approvalToken, approver_id, approver_name, approver_email, approvalToken]
        });

        const historyResult = await dbSurat.execute({ sql: "SELECT * FROM sm_history_surat WHERE batch_id = ?", args: [batch_id] });
        const totalSurat = historyResult.rows.length;
        
        let jenisSuratDisplay = "Dokumen";
        if (totalSurat > 0) {
            const rowSurat = historyResult.rows[0].jenis_surat;
            if (rowSurat === 'SALES_SUPPORT') jenisSuratDisplay = "Sales Support";
            else if (rowSurat === 'SURAT_TARGET') jenisSuratDisplay = "Target KPI";
            else if (rowSurat === 'SURAT_OTF') jenisSuratDisplay = "Rate Benefit OTF";
            else if (rowSurat === 'SURAT_CHAMPIONS') jenisSuratDisplay = "Champions Fee";
            else if (rowSurat === 'SURAT_ADDITION') jenisSuratDisplay = "Addition Insentif";
            else if (rowSurat === 'SURAT_DEDUCTION') jenisSuratDisplay = "Deduction Insentif";
            else jenisSuratDisplay = rowSurat; 
        }

        let attachments = [];
        const browser = await getBrowser();
        const page = await browser.newPage();
        
        const pdfSummaryContent = `
            <!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Ringkasan Dokumen Batch ${batch_id}</title>
                <style>body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #333; } h2 { color: #ED1C24; border-bottom: 2px solid #ED1C24; padding-bottom: 10px; } table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; } th { background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 8px; text-align: center; } td { border: 1px solid #dee2e6; padding: 8px; }</style>
            </head><body>
                <h2>Ringkasan Pengajuan Persetujuan Dokumen</h2>
                <p><b>Batch ID:</b> ${batch_id}<br><b>Jenis Surat:</b> Surat ${jenisSuratDisplay}<br><b>Total Dokumen:</b> ${totalSurat} Surat</p>
                ${summary_html}
            </body></html>
        `;
        
        await page.setContent(pdfSummaryContent, { 
 waitUntil: 'load', 
            timeout: BATAS_RENDER_MS // [SandraHub] dulu networkidle2 + timeout: 0
        });
        const summaryPdfBuffer = await page.pdf({ 
            format: 'A4', 
            printBackground: true, 
            landscape: true,
            timeout: 60000 
        });
        await browser.close();

        attachments.push({ filename: `Ringkasan_Dokumen_${batch_id}.pdf`, content: Buffer.from(summaryPdfBuffer).toString('base64') });

        if (totalSurat > 0) {
            const sampleFile = historyResult.rows[0];
            const filePath = path.join(downloadsDir, sampleFile.filename);
            if (fs.existsSync(filePath)) attachments.push({ filename: `[SAMPEL]_Surat_${sampleFile.filename}`, content: fs.readFileSync(filePath).toString('base64') });
        }
        
        const dateWIB = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const timestampReq = `${days[dateWIB.getDay()]}, ${dateWIB.getDate()} ${months[dateWIB.getMonth()]} ${dateWIB.getFullYear()} pukul ${String(dateWIB.getHours()).padStart(2, '0')}:${String(dateWIB.getMinutes()).padStart(2, '0')} WIB`;

        const baseUrl = req.headers.host.includes('localhost') ? `http://${req.headers.host}` : `https://${req.headers.host}`;
        const magicLinkApprove = `${baseUrl}/api/smart-mail/approve-document?batch_id=${encodeURIComponent(batch_id)}&token=${approvalToken}`;
        const magicLinkReject = `${baseUrl}/api/smart-mail/reject-document?batch_id=${encodeURIComponent(batch_id)}&token=${approvalToken}`;

        await kirimEmail(resend, {
            from: 'Sales Performance Sumatra <sandra@spmsumatera.site>', to: approver_email,
            subject: `[ACTION REQUIRED] Persetujuan Surat ${jenisSuratDisplay} - ${batch_id}`,
            attachments: attachments,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 25px; color: #4D4D4F; max-width: 700px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #ED1C24; margin-top: 0;">Persetujuan Tanda Tangan Digital</h2>
                    <p>Dear Bapak <b>${approver_name}</b>,</p>
                    <p>Smart Mail Sumatra (SMS) memohon persetujuan dan tanda tangan digital Anda untuk <b>${totalSurat} dokumen surat</b> yang telah diproses.</p>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ED1C24;">
                        <p style="margin: 0; font-size: 14px;"><b>Batch ID:</b> ${batch_id}</p>
                        <p style="margin: 8px 0 0 0; font-size: 14px;"><b>Jenis Surat:</b> Surat ${jenisSuratDisplay}</p>
                        <p style="margin: 8px 0 0 0; font-size: 14px;"><b>Waktu Pengajuan:</b> ${timestampReq}</p>
                        <p style="margin: 8px 0 0 0; font-size: 14px;"><b>Total Dokumen:</b> ${totalSurat} Surat</p>
                    </div>
                    <p style="font-size: 14px; margin-top: 20px; line-height: 1.6;">Rincian parameter operasional serta daftar mitra secara lengkap dapat Anda tinjau pada <b>dokumen PDF terlampir (Ringkasan_Dokumen_${batch_id}.pdf)</b>. Sebagai bahan pertimbangan lebih lanjut, kami juga telah melampirkan 1 (satu) contoh dokumen surat jadi pada email ini.</p>
                    <p style="margin-top: 30px; font-weight: bold;">Tindakan Persetujuan:</p>
                    <table width="100%" cellspacing="0" cellpadding="0" style="margin-top: 15px;"><tr>
                        <td align="center" style="padding-right: 10px;"><a href="${magicLinkApprove}" style="padding: 14px 24px; background-color: #32BCAD; color: white; font-weight: bold; text-decoration: none; border-radius: 6px; display: block; font-size: 14px; text-align: center;">✅ SETUJUI & TANDATANGANI</a></td>
                        <td align="center" style="padding-left: 10px;"><a href="${magicLinkReject}" style="padding: 14px 24px; background-color: #ED1C24; color: white; font-weight: bold; text-decoration: none; border-radius: 6px; display: block; font-size: 14px; text-align: center;">❌ TOLAK / MINTA REVISI</a></td>
                    </tr></table>
                </div>
            `
        });
        res.json({ success: true, message: "Tautan persetujuan (Magic Link) berhasil dikirim." });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/check-approval', async (req, res) => {
    const { batch_id } = req.query;
    if (!batch_id) return res.json({ is_approved: false, status: 'pending' });
    try {
        const { rows } = await dbSurat.execute({ sql: "SELECT is_approved, status, rejection_reason FROM sm_approvals WHERE batch_id = ?", args: [batch_id] });
        if (rows.length === 0) res.json({ is_approved: false, status: 'pending' });
        else res.json({ is_approved: rows[0].is_approved === 1, status: rows[0].status || (rows[0].is_approved === 1 ? 'approved' : 'pending'), reason: rows[0].rejection_reason || "" });
    } catch (err) { res.json({ is_approved: false, status: 'pending' }); }
});

// ============================================================================
// [SandraHub] Keamanan link approval:
// - link di email membawa token acak (sm_approvals.approval_token); tanpa token yang
//   cocok, approve/reject ditolak.
// - GET hanya menampilkan halaman konfirmasi; persetujuan baru terjadi saat approver
//   menekan tombol (POST). Jadi pratinjau link oleh aplikasi email tidak ikut menyetujui.
// - Tombol "Mode Simulasi" di aplikasi (tanpa token) tetap jalan, tapi hanya untuk
//   pengguna SandraHub yang login (req.authed diisi oleh app/api/smart-mail/[...path]).
// ============================================================================
const tokenCocok = (row, token) => {
    if (!row || !row.approval_token || !token) return false;
    const a = Buffer.from(String(row.approval_token)), b = Buffer.from(String(token));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const escAttr = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HALAMAN_LINK_TIDAK_VALID = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Link Tidak Berlaku</title><style>body{font-family:'Segoe UI',sans-serif;background:#f4f7f6;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .card{background:#fff;padding:40px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.1);text-align:center;max-width:500px;} h1{color:#ED1C24;}</style></head><body><div class="card"><h1>⚠️ Link Tidak Berlaku</h1><p>Link persetujuan ini tidak valid atau sudah diganti dengan pengajuan yang lebih baru. Gunakan link dari email permintaan persetujuan terbaru.</p></div></body></html>`;

app.get('/approve-document', async (req, res) => {
    const { batch_id, token } = req.query;
    if (!batch_id) return res.status(400).send("<h3>❌ Parameter Batch ID tidak valid.</h3>");
    // Mode Simulasi dari aplikasi (pengguna login, tanpa token): langsung proses seperti aslinya.
    if (!token && req.authed) return prosesApprove(batch_id, res);
    try {
        const { rows } = await dbSurat.execute({ sql: "SELECT * FROM sm_approvals WHERE batch_id = ?", args: [batch_id] });
        const row = rows[0];
        if (!tokenCocok(row, token)) return res.status(403).send(HALAMAN_LINK_TIDAK_VALID);
        if (row.is_approved === 1) return res.send("<h3>✅ Kumpulan dokumen ini telah mendapatkan persetujuan sebelumnya.</h3>");
        const { rows: jml } = await dbSurat.execute({ sql: "SELECT COUNT(*) AS n FROM sm_history_surat WHERE batch_id = ?", args: [batch_id] });
        res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Konfirmasi Persetujuan</title><style>body{font-family:'Segoe UI',sans-serif;background:#f4f7f6;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .card{background:#fff;padding:35px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.1);width:100%;max-width:480px;text-align:center;} h2{color:#32BCAD;margin-top:0;} button{width:100%;padding:14px;background:#32BCAD;color:#fff;border:none;border-radius:6px;font-weight:bold;font-size:15px;cursor:pointer;} button:hover{opacity:0.9;} button:disabled{opacity:.6;cursor:wait;}</style></head><body><div class="card"><h2>✅ Konfirmasi Persetujuan</h2><p style="color:#4D4D4F;">Batch ID: <b>${escAttr(batch_id)}</b><br>Total dokumen: <b>${Number(jml[0]?.n || 0)} surat</b></p><p style="color:#666;font-size:14px;margin-bottom:22px;">Dengan menekan tombol di bawah, Bapak <b>${escAttr(row.approver_name)}</b> menyetujui dan menandatangani seluruh dokumen pada batch ini.</p><form method="POST" action="/api/smart-mail/approve-document" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').innerText='⏳ Memproses tanda tangan...';"><input type="hidden" name="batch_id" value="${escAttr(batch_id)}"><input type="hidden" name="token" value="${escAttr(token)}"><button type="submit">SETUJUI &amp; TANDATANGANI</button></form></div></body></html>`);
    } catch (err) { res.status(500).send("<h3>❌ Terjadi galat pada sistem saat memuat halaman persetujuan.</h3>"); }
});

app.post('/approve-document', async (req, res) => {
    const { batch_id, token } = req.body;
    if (!batch_id) return res.status(400).send("<h3>❌ Parameter Batch ID tidak valid.</h3>");
    try {
        const { rows } = await dbSurat.execute({ sql: "SELECT * FROM sm_approvals WHERE batch_id = ?", args: [batch_id] });
        if (!tokenCocok(rows[0], token)) return res.status(403).send(HALAMAN_LINK_TIDAK_VALID);
    } catch (err) { return res.status(500).send("<h3>❌ Terjadi galat pada sistem saat merekam persetujuan Anda.</h3>"); }
    return prosesApprove(batch_id, res);
});

// Isi approve-document asli (tidak diubah): set approved, tempel TTD, kirim email evidence.
async function prosesApprove(batch_id, res) {
    try {
        const checkAppr = await dbSurat.execute({ sql: "SELECT * FROM sm_approvals WHERE batch_id = ?", args: [batch_id] });
        const row = checkAppr.rows[0];
        if (!row) return res.status(500).send("<h3>❌ Rekam data persetujuan tidak ditemukan di dalam sistem.</h3>");
        if (row.is_approved === 1) return res.send("<h3>✅ Kumpulan dokumen ini telah mendapatkan persetujuan sebelumnya.</h3>");

        await dbSurat.execute({ sql: "UPDATE sm_approvals SET is_approved = 1, status = 'approved', rejection_reason = NULL WHERE batch_id = ?", args: [batch_id] });
        const historyResult = await dbSurat.execute({ sql: "SELECT * FROM sm_history_surat WHERE batch_id = ?", args: [batch_id] });
        const files = historyResult.rows;

        if (files.length > 0) {
            try {
                const browser = await getBrowser();
                const signatureMap = { 'rengga': 'Sign Pak Rengga Permana.jpeg', 'anjar': 'Sign Pak Anjar Budi Kurniawan.jpeg', 'anjaya': 'Sign Pak Anjaya Satriya Adinata.jpeg', 'yesias': 'Sign Pak Yesias Petrus Boeboe.jpeg', 'ahmad': 'Sign Pak Ahmad Mujaini.jpeg', 'agung': 'Sign Pak Agung Hery Purwanto.jpeg', 'pompi': 'Sign Pak Pompi Saefudin.jpeg' };
                const sigFile = signatureMap[row.approver_id] || 'Sign Pak Rengga Permana.jpeg';
                const localSigPath = path.join(__dirname, 'Signatures', sigFile);
                let signatureImg = "";
                try {
                    if (fs.existsSync(localSigPath)) {
                        const base64Image = fs.readFileSync(localSigPath, { encoding: 'base64' });
                        const ext = path.extname(localSigPath).toLowerCase();
                        signatureImg = `<img src="data:${ext === '.png' ? 'image/png' : 'image/jpeg'};base64,${base64Image}" style="height: 100px; width: auto; display: block; margin: 0; padding: 0;">`;
                    }
                } catch (err) {}
                
                const chunkSize = 5;
                for (let i = 0; i < files.length; i += chunkSize) {
                    const chunk = files.slice(i, i + chunkSize);
                    await Promise.all(chunk.map(async (file) => {
                        const htmlPath = path.join(downloadsDir, file.filename.replace('.pdf', '.html'));
                        let html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : (file.html_content || "");
                        if (html) {
                            html = html.replace(/<div id="ttd-box"([^>]*)>[\s\S]*?<\/div>/g, `<div id="ttd-box"$1>${signatureImg}</div>`);
                            await dbSurat.execute({ sql: "UPDATE sm_history_surat SET html_content = ? WHERE id = ?", args: [html, file.id] });
                            const page = await browser.newPage();
                            await page.setUserAgent('Mozilla/5.0');
                            await page.setContent(html, { waitUntil: 'load', timeout: 60000 }); // [SandraHub] dulu networkidle0
                            await page.pdf({ path: path.join(downloadsDir, file.filename), format: 'A4', printBackground: true });
                            await page.close();
                        }
                    }));
                }
                await browser.close();
            } catch (e) { console.error("Kesalahan melampirkan Tanda Tangan:", e); }
        }

        try {
            const dateApproveWIB = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
            const daysArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
            const monthsArr = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            const timestampEvidence = `${daysArr[dateApproveWIB.getDay()]}, ${dateApproveWIB.getDate()} ${monthsArr[dateApproveWIB.getMonth()]} ${dateApproveWIB.getFullYear()} pukul ${String(dateApproveWIB.getHours()).padStart(2, '0')}:${String(dateApproveWIB.getMinutes()).padStart(2, '0')} WIB`;

            await kirimEmail(resend, {
                from: 'Sales Performance Sumatra <sandra@spmsumatera.site>', to: row.approver_email,
                subject: `[EVIDENCE] Persetujuan Surat - ${batch_id}`,
                html: `<div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 25px; color: #4D4D4F; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px;"><div style="text-align: center; margin-bottom: 20px;"><h1 style="color: #32BCAD; margin: 0;">✅ Validasi Berhasil</h1></div><p>Dear Bapak <b>${row.approver_name}</b>,</p><p>Email ini menjadi bukti otentik persetujuan serta legalisasi tanda tangan digital dokumen.</p><div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #32BCAD;"><p style="margin: 0; font-size: 14px;"><b>ID Proses (Batch):</b> ${batch_id}</p><p style="margin: 8px 0 0 0; font-size: 14px;"><b>Kuantitas Dokumen:</b> ${files.length} Surat</p><p style="margin: 8px 0 0 0; font-size: 14px;"><b>Tercatat Pada:</b> ${timestampEvidence}</p></div><p style="font-size: 13px; color: #6c757d; margin-top: 20px;">Sistem otomatis melanjutkan distribusi dokumen.</p></div>`
            });
        } catch (emailErr) {}

        res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Persetujuan Berhasil</title><style>body{font-family:'Segoe UI',sans-serif;background:#f4f7f6;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .card{background:#fff;padding:40px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.1);text-align:center;max-width:500px;} h1{color:#32BCAD;} p{color:#4D4D4F;}</style></head><body><div class="card"><h1>✅ Persetujuan Terekam Sistem</h1><p>Sebanyak <strong>${files.length} Dokumen Resmi</strong> telah berhasil disetujui.</p><p style="font-size: 13px; color: #888;">Anda dipersilakan untuk menutup halaman browser ini.</p></div></body></html>`);
    } catch (err) { res.status(500).send("<h3>❌ Terjadi galat pada sistem saat merekam persetujuan Anda.</h3>"); }
}

app.get('/reject-document', async (req, res) => {
    const { batch_id, token } = req.query;
    if (!batch_id) return res.status(400).send("Parameter Batch ID tidak teridentifikasi.");
    try {
        const { rows } = await dbSurat.execute({ sql: "SELECT approval_token FROM sm_approvals WHERE batch_id = ?", args: [batch_id] });
        if (!tokenCocok(rows[0], token)) return res.status(403).send(HALAMAN_LINK_TIDAK_VALID);
    } catch (err) { return res.status(500).send("Kesalahan sistem memuat halaman penolakan."); }
    res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Penolakan Dokumen</title><style>body{font-family:'Segoe UI',sans-serif;background:#f4f7f6;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .card{background:#fff;padding:35px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.1);width:100%;max-width:480px;} h2{color:#ED1C24;margin-top:0;} textarea{width:100%;padding:12px;border:1px solid #ccc;border-radius:6px;margin-bottom:18px;box-sizing:border-box;font-family:inherit;font-size:14px;} button{width:100%;padding:14px;background:#ED1C24;color:#fff;border:none;border-radius:6px;font-weight:bold;font-size:15px;cursor:pointer;transition:0.2s;} button:hover{opacity:0.9;}</style></head><body><div class="card"><h2>❌ Instruksi Revisi Dokumen</h2><p style="color:#666; font-size:14px; margin-bottom: 20px;">Batch ID: <b>${escAttr(batch_id)}</b><br>Mohon lampirkan keterangan atau catatan revisi.</p><form action="/api/smart-mail/submit-reject" method="POST"><input type="hidden" name="batch_id" value="${escAttr(batch_id)}"><input type="hidden" name="token" value="${escAttr(token)}"><textarea name="alasan" rows="5" placeholder="Tuliskan poin revisi di sini..." required></textarea><button type="submit">Kirim Instruksi Revisi</button></form></div></body></html>`);
});

app.post('/submit-reject', async (req, res) => {
    const { batch_id, alasan, token } = req.body;
    try {
        const { rows } = await dbSurat.execute({ sql: "SELECT approval_token FROM sm_approvals WHERE batch_id = ?", args: [batch_id] });
        if (!tokenCocok(rows[0], token)) return res.status(403).send(HALAMAN_LINK_TIDAK_VALID);
        await dbSurat.execute({ sql: "UPDATE sm_approvals SET status = 'rejected', rejection_reason = ?, is_approved = 0 WHERE batch_id = ?", args: [alasan, batch_id] });
        res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Dokumen Direvisi</title><style>body{font-family:'Segoe UI',sans-serif;background:#f4f7f6;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .card{background:#fff;padding:40px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.1);text-align:center;max-width:500px;} h1{color:#ED1C24;}</style></head><body><div class="card"><h1>❌ Pengajuan Dikembalikan</h1><p>Catatan revisi Anda telah direkam dan diinformasikan ke dalam sistem operasional.</p><p style="font-size: 13px; color: #888;">Anda dipersilakan untuk menutup browser.</p></div></body></html>`);
    } catch (err) { res.status(500).send("Kesalahan sistem menyimpan instruksi penolakan."); }
});

// ============================================================================
// HISTORY & EMAIL BLAST
// ============================================================================
app.get('/api/history', async (req, res) => {
    try {
        // Riwayat SDP dan MDI dipisah berdasarkan kolom brand
        const filterFlow = req.query.flow === 'mdi' ? "h.brand = 'MDI'" : "(h.brand IS NULL OR h.brand <> 'MDI')";
        // html_content (isi HTML surat + font base64, ratusan KB per file) tidak ikut dikirim ke daftar riwayat,
        // karena total respons bisa melewati batas 4,5 MB Vercel. Server mengambilnya sendiri per file saat dibutuhkan.
        const kolom = 'h.id, h.batch_id, h.jenis_surat, h.sdp_id, h.partner_name, h.periode, h.nominal, h.filename, h.url, h.html_url, h.email_to, h.email_cc, h.brand, h.type_sdp, h.is_blasted, h.tabel_html, h.created_at';
        const { rows } = await dbSurat.execute(`SELECT ${kolom}, COALESCE(a.is_approved, h.is_approved) AS is_approved, a.approver_name, COALESCE(a.status, h.status) AS status, a.rejection_reason FROM sm_history_surat h LEFT JOIN sm_approvals a ON h.batch_id = a.batch_id WHERE ${filterFlow} ORDER BY h.created_at DESC`);
        res.json({ success: true, data: rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/history', async (req, res) => {
    try {
        const filterFlow = req.query.flow === 'mdi' ? "brand = 'MDI'" : "(brand IS NULL OR brand <> 'MDI')";
        await dbSurat.execute(`DELETE FROM sm_history_surat WHERE ${filterFlow}`);
        await dbSurat.execute("DELETE FROM sm_approvals WHERE batch_id NOT IN (SELECT DISTINCT batch_id FROM sm_history_surat WHERE batch_id IS NOT NULL)");
        res.json({ success: true, message: "Keseluruhan data riwayat telah dibersihkan." });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/send-emails', async (req, res) => {
    const { data_email, periode, subject, pesan } = req.body;
    if (!data_email || data_email.length === 0) return res.status(400).json({ success: false, error: 'Target pengiriman email tidak ditemukan.' });

    let hasilKirim = [];
    for (const data of data_email) {
        if (!data.email_to || String(data.email_to).trim() === "") {
            hasilKirim.push({ sdp_id: data.sdp_id, partner_name: data.partner_name, status: 'Gagal (Alamat Email Kosong)', is_success: false });
            continue;
        }

        try {
            let fileBuffer;
            if (data.file_base64) {
                fileBuffer = Buffer.from(data.file_base64.split(',')[1] || data.file_base64, 'base64');
            } else {
                const filePath = path.join(downloadsDir, data.filename);
                if (!fs.existsSync(filePath)) {
                    hasilKirim.push({ sdp_id: data.sdp_id, partner_name: data.partner_name, status: 'Gagal (Dokumen PDF hilang dari server)', is_success: false });
                    continue;
                }
                fileBuffer = fs.readFileSync(filePath);
            }
            
            const arrayEmailTujuan = String(data.email_to).split(';').map(e => e.trim()).filter(e => e !== "");
            const arrayEmailCC = data.email_cc ? String(data.email_cc).split(';').map(e => e.trim()).filter(e => e !== "") : [];

            const sdpType = data.type || "SDP";
            
            const itemSubject = data.subject || subject;
            const itemPesan = data.pesan || pesan;
            
            const finalSubject = itemSubject.replace(/{{nama_rekan}}/g, data.partner_name).replace(/{{periode}}/g, periode).replace(/{{type}}/g, sdpType);
            const finalPesan = itemPesan.replace(/{{nama_rekan}}/g, data.partner_name).replace(/{{periode}}/g, periode).replace(/{{type}}/g, sdpType);
            
            const htmlPesan = "\x3Cdiv style='font-family: \"Segoe UI\", Arial, sans-serif; font-size: 14px; color: #4D4D4F; line-height: 1.6;'\x3E" + finalPesan.replace(/\n/g, '\x3Cbr\x3E') + "\x3C/div\x3E";

            const emailPayload = {
                from: 'Sales Performance Sumatra <sandra@spmsumatera.site>',
                to: arrayEmailTujuan,
                subject: finalSubject,
                html: htmlPesan,
                attachments: [{ filename: data.filename, content: fileBuffer.toString('base64') }]
            };
            if (arrayEmailCC.length > 0) emailPayload.cc = arrayEmailCC;

            try {
                const sendResponse = await kirimEmail(resend, emailPayload); // jeda + coba ulang saat kena limit (kirim.js)
                if (sendResponse.error) {
                    hasilKirim.push({ sdp_id: data.sdp_id, partner_name: data.partner_name, status: `Ditolak Resend: ${sendResponse.error.message}`, is_success: false });
                } else {
                    await dbSurat.execute({ sql: "UPDATE sm_history_surat SET is_blasted = 1 WHERE filename = ?", args: [data.filename] });
                    hasilKirim.push({ sdp_id: data.sdp_id, partner_name: data.partner_name, status: `Berhasil`, is_success: true });
                }
            } catch (e) {
                hasilKirim.push({ sdp_id: data.sdp_id, partner_name: data.partner_name, status: `Ditolak Sistem Email: ${e.message}`, is_success: false });
            }
        } catch (error) {
            hasilKirim.push({ sdp_id: data.sdp_id, partner_name: data.partner_name, status: `Kegagalan Internal: ${error.message}`, is_success: false });
        }
    }
    res.json({ success: true, results: hasilKirim });
});

// ============================================================================
// ENDPOINT KHUSUS MODE "BLAST EMAIL ONLY"
// ============================================================================
app.post('/api/save-history-blast-only', async (req, res) => {
    const { records } = req.body;
    if (!records || records.length === 0) {
        return res.json({ success: false, error: 'Tidak ada data history' });
    }

    try {
        let completed = 0;
        let hasError = false;

        for (const r of records) {
            await dbSurat.execute({
                sql: `INSERT INTO sm_history_surat 
                    (batch_id, jenis_surat, periode, sdp_id, partner_name, brand, type_sdp, email_to, email_cc, status, is_approved, is_blasted, filename, tabel_html) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    r.batch_id, r.jenis_surat, r.periode, r.sdp_id, r.partner_name, r.brand, r.type_sdp, r.email_to, r.email_cc, r.status, r.is_approved, r.is_blasted, r.filename, r.tabel_html || ""
                ]
            });
            completed++;
        }

        if (completed === records.length) {
            res.json({ success: true, message: 'History blast berhasil disimpan' });
        }
    } catch (err) {
        console.error("Error simpan history blast:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/update-history-blast-status', async (req, res) => {
    const { records } = req.body;
    if (!records || records.length === 0) return res.json({ success: true });

    try {
        let completed = 0;
        for (const r of records) {
            await dbSurat.execute({
                sql: `UPDATE sm_history_surat SET is_blasted = ? WHERE batch_id = ? AND sdp_id = ?`,
                args: [r.is_blasted, r.batch_id, r.sdp_id]
            });
            completed++;
        }
        
        if (completed === records.length) {
            res.json({ success: true });
        }
    } catch (err) {
        console.error("Error update status blast:", err);
        res.status(500).json({ success: false, error: 'Ada error saat update status' });
    }
});



export default app;