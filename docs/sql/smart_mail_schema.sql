-- docs/sql/smart_mail_schema.sql
-- Tabel Smart Mail Sumatera (menu Report Merge > Partner SDP & Partner MDI) di Supabase TraceHub.
-- Sama dengan supabase/schema.sql aplikasi asli, nama tabel diberi awalan sm_.
-- Aman dijalankan berulang kali. Jalankan di Supabase > SQL Editor.

-- Skema database Smart Mail Sumatra (Supabase / Postgres).
-- Aman dijalankan berulang kali: server.js juga menjalankan file ini saat start.

CREATE TABLE IF NOT EXISTS sm_history_surat (
    id SERIAL PRIMARY KEY,
    batch_id TEXT,
    jenis_surat TEXT,
    sdp_id TEXT,
    partner_name TEXT,
    periode TEXT,
    nominal TEXT,
    filename TEXT,
    url TEXT,
    html_url TEXT,
    email_to TEXT,
    email_cc TEXT,
    brand TEXT,
    type_sdp TEXT,
    html_content TEXT,
    is_blasted INTEGER DEFAULT 0,
    tabel_html TEXT,
    status TEXT,
    is_approved INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sm_history_surat_batch_id_idx ON sm_history_surat (batch_id);
CREATE INDEX IF NOT EXISTS sm_history_surat_filename_idx ON sm_history_surat (filename);

CREATE TABLE IF NOT EXISTS sm_approvals (
    batch_id TEXT PRIMARY KEY,
    approver_id TEXT,
    approver_name TEXT,
    approver_email TEXT,
    is_approved INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sm_jenis_surat (
    kode TEXT PRIMARY KEY,
    judul TEXT,
    isi TEXT
);

-- Template surat MDI (MPC): teks pembuka dan ketentuan klaim pada LETTER
CREATE TABLE IF NOT EXISTS sm_mdi_template (
    kode TEXT PRIMARY KEY,
    jenis_surat TEXT,
    nama_program TEXT,
    isi_pembuka TEXT,
    isi_ketentuan TEXT,
    is_system INTEGER DEFAULT 0
);
ALTER TABLE sm_mdi_template ADD COLUMN IF NOT EXISTS pengaturan TEXT;

-- [SandraHub] Token acak untuk link approve/reject di email (lihat lib/smartMail/server.js).
ALTER TABLE sm_approvals ADD COLUMN IF NOT EXISTS approval_token TEXT;

-- Template email blast MDI (subject + body) yang disimpan user
CREATE TABLE IF NOT EXISTS sm_mdi_email_template (
    nama TEXT PRIMARY KEY,
    subject TEXT,
    body TEXT
);

-- Aplikasi mengakses database lewat koneksi Postgres langsung (role postgres),
-- jadi RLS dinyalakan agar tabel tidak terbuka lewat API publik Supabase.
ALTER TABLE sm_history_surat ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_jenis_surat ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_mdi_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm_mdi_email_template ENABLE ROW LEVEL SECURITY;

-- Template surat SDP bawaan (dulu diisi otomatis oleh initDatabase() di server.js asli)
INSERT INTO sm_jenis_surat (kode, judul, isi) VALUES
('SALES_SUPPORT', 'Surat Pemberitahuan Nilai Sales Support', '<p>Yth. Rekan <b>{{brand}}</b>,</p> <p>Bersama ini disampaikan <b>Nilai Sales Support {{periode}}</b> dengan rincian sebagai berikut:</p> <table style="width:100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; border: 1px solid #000;"> <tbody> <tr> <td style="border: 1px solid #000; padding: 8px 12px;">Sales Support {{periode}}</td> <td style="border: 1px solid #000; padding: 8px 12px;">Rp {{nilai_sales}}</td> </tr> <tr style="background-color: #e2e2e2;"> <td style="border: 1px solid #000; padding: 8px 12px; font-weight: bold;">Total</td> <td style="border: 1px solid #000; padding: 8px 12px; font-weight: bold;">Rp {{nilai_sales}}</td> </tr> </tbody> </table> <p style="margin-top: 20px; font-weight: bold;">Catatan:</p> <ul style="padding-left: 20px; list-style-type: none; margin-left: 0;"> <li style="margin-bottom: 5px;"> Nilai imbalan jasa adalah sebelum disesuaikan dengan komponen PPh dan PPN.</li> <li style="margin-bottom: 5px;"> Ketentuan pembuatan invoice dan faktur pajak mengikuti mekanisme dan ketentuan yang sudah berjalan.</li> <li style="margin-bottom: 5px;"> Pembayaran Fee akan di lakukan melalui E-Wallet (Ottocash) & Rekening untuk Badan Usaha</li> <li> Jika ada hal yang perlu ditanyakan atau diklarifikasi <b>{{brand}}</b> dapat menghubungi Head Of <b>{{brand}}</b> di masing-masing Region</li> </ul> <p style="margin-top: 20px;">Demikian disampaikan, terima kasih atas perhatian dan kerja samanya.</p>'),
('SURAT_TARGET', 'Surat Pemberitahuan Target KPI', '<p>Yth. Rekan <b>{{brand}}</b>,</p> <p>Sejalan dengan tujuan perusahaan yaitu fokus pada peningkatan layanan ke pelanggan pada daerah rural & revenue di area <b>{{brand}}</b>.</p> <p>Berikut adalah KPI dan target yang digunakan sebagai perhitungan pencapaian untuk periode <b>{{periode}}</b>:</p> <p><b>A. KPI Utama</b></p> {{tabel_parameter}} <p>KPI utama akan menentukan jumlah imbalan jasa yang akan diberikan oleh PT. Indosat Tbk. Melalui KPI & target yang disampaikan diatas diharapkan menjadi acuan bagi <b>{{brand}}</b> untuk menunjukan performansi terbaik. Jika ada hal yang perlu ditanyakan atau diklarifikasi <b>{{brand}}</b> dapat menghubungi Head Of <b>{{brand}}</b> di masing-masing Region.</p>'),
('SURAT_OTF', 'Surat Pemberitahuan Nilai Rate Benefit OTF', '<p>Yth. Rekan <b>{{brand}}</b>,</p> <p>Dengan ini disampaikan nilai Rate Benefit OTF yang akan digunakan untuk periode payment Benefit OTF Periode <b>{{periode}}</b>, berdasarkan performance bulan sebelumnya, dengan rincian sebagai berikut:</p> {{tabel_parameter}} <p>Nilai Rate benefit ini akan efektif berlaku sebagai pembayaran Monthly KPI, TURS, Sales Margin dan Tactical*.</p> <p>Apabila terdapat perubahan terhadap tanggal efektif tersebut, maka pihak IOH akan menginformasikan lebih lanjut kepada Rekan Mitra <b>{{brand}}</b> melalui surat resmi.</p> <p>Demikian surat pemberitahuan ini kami sampaikan, atas kerjasamanya kami ucapkan terima kasih.</p>'),
('SURAT_CHAMPIONS', 'Surat Pemberitahuan Nilai Champions Fee', '<p>Yth. Rekan <b>{{type}}</b>,</p> <p>Bersama ini disampaikan Nilai Champions Fee <b>{{periode}}</b> dengan rincian sebagai berikut:</p> {{tabel_parameter}} <p><b>Catatan:</b></p> <ul style="padding-left: 20px; list-style-type: none; margin-left: 0;"> <li style="margin-bottom: 5px;"> Nilai imbalan jasa adalah sebelum disesuaikan dengan komponen PPh dan PPN.</li> <li style="margin-bottom: 5px;"> Ketentuan pembuatan invoice dan faktur pajak mengikuti mekanisme dan ketentuan yang sudah berjalan.</li> <li style="margin-bottom: 5px;"> Pembayaran Fee akan di lakukan melalui E-Wallet (Ottocash) & Rekening untuk Badan Usaha.</li> <li> Jika ada hal yang perlu ditanyakan atau diklarifikasi dapat menghubungi Head Of SDP di masing-masing Region.</li> </ul> <p>Demikian disampaikan, terima kasih atas perhatian dan kerja samanya.</p>'),
('SURAT_ADDITION', 'Surat Pemberitahuan Penambahan Insentif (Addition)', '<p>Dengan hormat,</p> <p>Sehubungan dengan hasil verifikasi dan rekonsiliasi data, telah dilakukan peninjauan kembali terhadap perhitungan Rate Benefit OTF pada periode <b>{{periode}}</b>. Berdasarkan hasil peninjauan tersebut, terdapat selisih perhitungan yang mengakibatkan adanya kekurangan insentif yang seharusnya diterima.</p> <p>Sebagai tindak lanjut atas hasil verifikasi dan rekonsiliasi tersebut, akan dilakukan penambahan insentif (Addition) atas selisih Rate Benefit OTF yang belum terhitung pada periode sebelumnya.</p> <p>Adapun rincian penambahan insentif (Addition) adalah sebagai berikut:</p> {{tabel_parameter}} <p>Kami mohon agar informasi mengenai penyesuaian insentif ini dapat menjadi perhatian. Penyesuaian tersebut dilakukan sebagai bagian dari proses verifikasi dan rekonsiliasi internal untuk memastikan kesesuaian data dan perhitungan insentif. Kami menyampaikan apresiasi atas pengertian dan kerja sama yang telah diberikan selama proses penyesuaian ini.</p> <p>Demikian disampaikan, terima kasih atas perhatian dan kerja samanya.</p>'),
('SURAT_DEDUCTION', 'Surat Pemberitahuan Pengurangan Insentif (Deduction)', '<p>Dengan hormat,</p> <p>Sehubungan dengan hasil verifikasi dan rekonsiliasi data, kami menemukan adanya ketidaksesuaian yang disebabkan oleh kesalahan dalam proses inject Rate Benefit OTF pada periode <b>{{periode}}</b>. Hal tersebut berdampak pada perhitungan integrasi yang telah diberikan, sehingga diperlukan penyesuaian terhadap nilai insentif melalui mekanisme deduction pada periode berikutnya.</p> <p>Sebagai tindak lanjut atas hasil verifikasi tersebut, akan dilakukan pengurangan insentif (deduction), dengan rincian sebagai berikut:</p> {{tabel_parameter}} <p>Dengan demikian, pengurangan sebesar <b>Rp {{daily_deduction}}</b> per hari akan diterapkan selama periode tersebut hingga mencapai total pengurangan sebesar <b>Rp {{total_deduction}}</b>.</p> <p>Kami mohon agar informasi mengenai penyesuaian insentif ini dapat menjadi perhatian. Penyesuaian tersebut dilakukan sebagai bagian dari proses verifikasi dan rekonsiliasi internal untuk memastikan kesesuaian data dan perhitungan insentif. Kami menyampaikan apresiasi atas pengertian dan kerja sama yang telah diberikan selama proses penyesuaian ini.</p> <p>Demikian disampaikan, terima kasih atas perhatian dan kerja samanya.</p>'),
('SURAT_LAINNYA', '{{custom_judul}}', '<p>{{custom_body}}</p>')
ON CONFLICT (kode) DO UPDATE SET judul = excluded.judul, isi = excluded.isi;
