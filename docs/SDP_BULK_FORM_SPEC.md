# SPEC — Fitur SDP Form: Entry, Auto-fill, Tracking & Export HQ (Tahap 1: Circle Sumatera)

**Produk:** TraceHub → SandraHub → Form SDP
**Modul:** `app/dashboard/components/SDP_SubmissionForms.jsx` (+ komponen baru)
**Status dokumen:** Draft v1.1
**Tanggal:** 23 Juli 2026
**Penyusun:** Hiskia Sinaga
**Basis data:** Supabase project `kqxnoovrwaxsnpdynbgi` (SandraHub)

> Perubahan v1.1 vs v1.0: mengunci model **HQ spreadsheet = sumber kebenaran, web = alat bantu hulu (staging) khusus Circle Sumatera**; menjadikan **Export format HQ** sebagai fitur inti yang tahan perubahan template; memisahkan skema data kanonik dari lapisan export; mengoreksi klaim auto-fill; menaikkan SDP ID & perbaikan RLS ke Fase 0; menjadikan form mobile jalur utama CSE (paste grid untuk desktop/koordinator).

---

## 1. Ringkasan Eksekutif

Setiap Circle nasional wajib mengisi **satu spreadsheet HQ** (`Simplified_SDP_Registration_Template.xlsx` — data SDP se-IOH Indonesia; 8 sheet, 45 kolom di sheet registrasi) tiap siklus bulanan. Spreadsheet ini **tetap menjadi sumber kebenaran** yang dikonsumsi HQ.

Fitur ini **tidak menggantikan** spreadsheet HQ. Fitur ini adalah **alat bantu hulu untuk Circle Sumatera (Tahap 1)** dengan dua tujuan:

1. **Memudahkan pengisian** — beban isi yang tadinya terpusat di PIC Region dipecah ke tiap **CSE** (per cluster), dengan **auto-fill** kolom berulang dari master internal sehingga tidak mengetik ulang.
2. **Memudahkan tracking** — PIC Circle/Region memantau kelengkapan per CSE/cluster secara real-time.

Titik serah ke HQ = **paste**. Web menghasilkan **blok baris siap-tempel yang formatnya persis mengikuti spreadsheet HQ**, sehingga PIC Circle tinggal *copy dari web → paste ke spreadsheet HQ*. Karena template HQ bisa berubah, format paste ditangani oleh **lapisan export terpisah** (adaptor) tanpa mengganggu data inti.

Ringkas: **CSE mengisi di web (mudah, ter-scope, ter-validasi) → PIC Circle memantau → PIC Circle export blok HQ → paste ke spreadsheet HQ.**

---

## 2. Model Sistem & Sumber Kebenaran

```
        ┌─────────────────────── DOMAIN HQ (nasional) ───────────────────────┐
        │   Spreadsheet HQ  =  SUMBER KEBENARAN  (se-IOH, semua Circle)       │
        │   • Format bisa berubah tiap siklus                                 │
        │   • Punya kolom formula & kolom milik HQ                            │
        └───────────────▲─────────────────────────────────────────────────────┘
                        │  (4) PASTE blok siap-tempel — hanya kolom input manusia
                        │
        ┌───────────────┴──────────── DOMAIN KITA (Circle Sumatera) ──────────┐
        │  WEB SandraHub = STAGING / ALAT BANTU                               │
        │                                                                     │
        │  (1) CSE isi data  ──►  (2) DB kanonik (skema stabil kita sendiri)  │
        │        ▲ auto-fill dari master internal                             │
        │        │                                                            │
        │  (3) PIC Circle: tracking kelengkapan + validasi                    │
        │        │                                                            │
        │        └──►  EXPORT ADAPTER  ──►  blok format HQ  ──────────────────┘
        │              (pemetaan field kanonik → header HQ terkini)
        └─────────────────────────────────────────────────────────────────────┘
```

**Prinsip kunci:**

- **HQ spreadsheet = master.** Web tidak pernah menimpa atau menjadi pengganti data HQ. Aliran data **satu arah**: web → (paste) → HQ.
- **Skema kanonik kita stabil.** Data inti disimpan dalam skema milik kita (nama kolom sendiri), tidak terikat urutan/nama kolom HQ.
- **Export = adaptor terpisah.** Perubahan template HQ **hanya** memengaruhi lapisan export, bukan pengisian/tracking. Lihat §9.
- **Tidak ada sinkronisasi dua arah.** Menghindari drift & konflik versi.

---

## 3. Latar Belakang & Masalah

### 3.1 Kondisi saat ini (As-Is)

| Aspek | Kondisi |
|---|---|
| Media input | Spreadsheet HQ bertemplate 8 sheet, 45 kolom; dipakai semua Circle |
| Pengisi (Sumatera) | PIC Region terpusat — satu orang menangani banyak cluster |
| Cara isi | Manual per baris; kolom berulang (geografi, partner, CSE) diketik ulang |
| Validasi | Tidak ada; salah ketik geografi/format sering lolos |
| Tracking | Tidak ada visibilitas siapa sudah/belum mengisi |
| Sumber kebenaran | Spreadsheet HQ (benar) — tapi proses menuju ke sana berantakan |

### 3.2 Titik nyeri (khusus sisi Sumatera)

- Beban terpusat di PIC Region — tidak scalable.
- Pengetikan ulang kolom berulang tiap siklus.
- Template ruwet: kolom input tercampur kolom auto & kolom HQ.
- Rawan error geografi/format karena free-text.
- Tak ada progress visibility → PIC Region tidak tahu harus mengingatkan siapa.

### 3.3 Tujuan (Goals)

- Pecah pengisian ke tiap CSE sesuai scope cluster.
- Hilangkan pengetikan ulang lewat auto-fill master internal.
- Beri PIC Circle/Region dashboard kelengkapan.
- Hasilkan **blok paste yang cocok format HQ**, tahan terhadap perubahan template.
- **Batasi Tahap 1 ke Circle Sumatera.**

### 3.4 Bukan tujuan (Non-Goals)

- **Bukan** pengganti spreadsheet HQ; web tidak jadi system of record HQ.
- **Bukan** rollout nasional di Tahap 1 (Sumatera dulu; region lain menyusul).
- **Tidak** mengubah proses approval HQ (validasi, SAP/Oracle creation).
- **Tidak** integrasi situs eksternal (OSS/NIB/NPWP/AHU) — future work (§13).

---

## 4. Persona & Peran

| Role (`profiles.role`) | Scope | Peran dalam fitur |
|---|---|---|
| `cse_rse` | 1 cluster (`profiles.cluster`) × brand | **Pengisi utama** — isi/lengkapi SDP cluster-nya (utamanya via HP) |
| `bsm` | 1 branch (`bsm_branch`) × brand (`bsm_brand`) | Isi/menyetujui SDP branch-nya |
| `pic_region` | 1 region Sumatera | Pantau kelengkapan, ingatkan CSE, validasi |
| `spm_sumatera` | Penuh Sumatera | Supervisi lintas region + **export blok HQ** |
| `internal_ioh` / `ioh_*` | Baca-saja | Monitoring lintas region Sumatera |

Scope diturunkan dari `profiles` (`role`, `cluster`, `bsm_branch`, `bsm_brand`, `region`) yang sudah dipakai `SDP_SubmissionForms.jsx`.

---

## 5. Proses Bisnis SDP (konteks — agar fitur tidak salah tempel)

Satu workbook HQ menampung **3 proses** di sheet terpisah:

- `01_SDP_Registration` — **tambah/ubah** SDP (Request Type: New, Update, Hybrid Pairing).
- `02_Termination` — **tutup** SDP (partner resign/fired/jadi hybrid).
- `03_Rebordering` — **pindah cakupan kecamatan** antar SDP.

Sheet `Summary`: `Live bulan ini − Terminate + New ± Rebordering = Live bulan depan` → prosesnya **per siklus bulanan** (Submission Month).

**Brand & Hybrid:** IM3 (sistem SAP) dan 3ID/3Kiosk (sistem Oracle). Partner yang jualan keduanya = **Hybrid**, didaftarkan 2 baris (IM3 & 3ID) yang dikaitkan lewat **Pairing ID**. Kolom *Need SAP/Oracle* terisi otomatis dari Registration Scope.

**7 langkah HQ (sheet `00_TataCaraPengisian`):**

| # | Aktivitas | Owner | SLA |
|---|---|---|---|
| 1 | HQ bagikan template | HQ | Week 2 (10–17) |
| **2** | **Isi data registrasi (Sheet 01)** | **Circle + Region + Partner** | **Week 2–4** |
| **3** | **Upload dokumen ke folder** | **Circle + Region + Partner** | **Week 2–4** |
| 4 | Submit final ke HQ | Circle | maks Week 4 (<tgl 25) |
| 5 | HQ validasi + request akun (SAP/Oracle) | HQ | setelah submit |
| 6 | Validasi Final ID | Circle + HQ | setelah akun dibuat |
| 7 | Partner buat PO & bayar Commitment Fee | Partner | setelah ID valid |

**Fitur ini hanya memindahkan Langkah 2–3 ke web (untuk Sumatera).** Langkah 1,4,5,6 tetap HQ/Circle; Langkah 7 milik partner. Web membantu Circle menyelesaikan Langkah 2–3 lebih cepat & rapi, lalu menyerahkannya via paste (bagian dari Langkah 4).

---

## 6. Ruang Lingkup Fitur (Tahap 1)

- **F1 — Entry data (CSE):** form per-SDP mobile-friendly sebagai jalur utama; **paste grid** sebagai alat desktop untuk pengisian massal (PIC/SPM/CSE desktop).
- **F2 — Auto-fill dari master internal:** kurangi pengetikan ulang kolom berulang.
- **F3 — Tracking kelengkapan (PIC Circle/Region):** monitoring + reminder.
- **F4 — Export blok format HQ (inti):** hasilkan baris siap-tempel yang cocok kolom HQ, tahan perubahan template.
- **F5 — Bulk update status (internal):** perluasan update status badan usaha jadi aksi massal (kenyamanan internal, tidak dikirim ke HQ).

Fokus Tahap 1: **Registration** (sheet 01). Termination & Rebordering menyusul (§12).

---

## 7. Detail Fungsional

### F1 — Entry data (CSE)

**Jalur utama (mobile) — `SDP_QuickForm` (baru/derivasi form existing):**
- Form per-SDP satu layar, ramah HP (CSE orang lapangan).
- Kolom scope (Circle/Region/Branch/Cluster/Brand) terisi & terkunci dari `profiles`.
- Validasi inline; simpan draft; submit.

**Jalur desktop (massal) — `SDP_BulkGrid` (baru):**
- Tabel editable seperti spreadsheet; **paste banyak baris** dari Excel.
- Saat paste, tampilkan **dialog pemetaan kolom** (header sumber → field kanonik) sebelum commit — ini juga yang membuat kita tahan kalau CSE menyalin dari file berformat beda.
- Kolom scope terkunci; baris di luar scope ditolak & ditandai (bukan diam-diam diubah).
- Sel invalid diberi border merah + alasan; hanya baris valid yang tersimpan.

Enum dropdown mengikuti sheet `04_Lists` (Request Type, Registration Scope, Company Type, Status Company, Commitment Fee Status, dst) sebagai konstanta bersama.

### F2 — Auto-fill dari master internal (jujur soal cakupan)

**Realita data saat ini (terverifikasi):** `sdp_master` berisi 630 baris / 328 SDP tapi **hanya kolom geografi + nama** (`sdp_id, sdp_name, sdp_type, pt_name, region, branch, area, cluster`) — **tidak ada** KTP/NPWP/bank/PIC. `sdp_registration` **masih 0 baris**. Artinya:

- **Yang bisa di-auto-fill sekarang:** kolom **geografi & submitter** (Circle, Region, Branch, Micro Cluster, Brand, CSE Name/Email) dan — untuk Request Type = Update — SDP Name / Partner / Territory / Type dari `sdp_master`.
- **Yang tetap diketik baru:** identitas partner (legal name, KTP, NPWP, bank, PIC, alamat), terutama untuk **New** — auto-fill tidak menolong di sini sampai ada **partner master**.

**Rekomendasi:** bangun **partner master** (dedup by KTP/NPWP) supaya reuse antar-siklus benar-benar bekerja mulai siklus ke-2. Untuk Tahap 1, klaim auto-fill dibatasi pada kolom geografi/submitter + reuse SDP existing.

| Pemicu | Kolom auto-terisi | Sumber |
|---|---|---|
| Baris baru | Circle, Region, Branch, Micro Cluster, Brand, CSE Name/Email | `profiles` |
| Pilih SDP existing (Update) | SDP Name, Partner, Territory, Type, Area | `sdp_master` (perluas `pickSdp`) |
| Pilih Kecamatan/Kab-Kota | Kabupaten, Micro Cluster, Area, Region | `mf_territory` (3.838 baris) |
| Pilih Registration Scope | Need SAP?, Need Oracle? | formula (§10) |
| Pilih partner terdaftar (siklus ≥2) | legal name, KTP, NPWP, bank, PIC, alamat | partner master (future) |

Semua field auto tetap bisa di-override, kecuali kolom scope yang terkunci.

### F3 — Tracking kelengkapan (`SDP_BatchMonitor`, baru)

Untuk `pic_region` / `spm_sumatera`. Per periode:
- KPI: target, terisi, valid, submitted, sisa.
- Breakdown per cluster/CSE: nama, terisi vs target, status (Belum mulai / Progress / Lengkap), timestamp.
- Daftar baris invalid untuk ditindaklanjuti.
- **Reminder** ke CSE yang belum lengkap (via Resend/email — sudah ada di `lib/email`).
- **Bulk approve** baris valid → status `validated`.

Target per cluster: dari jumlah `sdp_master` di cluster (untuk update) atau di-set manual.

### F4 — Export blok format HQ (fitur inti, tahan perubahan template)

**Tujuan:** hasilkan output yang PIC Circle tinggal paste ke spreadsheet HQ.

**Dua mode output:**
1. **Copy-to-clipboard (TSV):** blok baris tab-separated sesuai urutan kolom HQ → paste langsung ke sheet HQ.
2. **Download `.xlsx`:** file berformat template HQ (pakai `exceljs`, sudah ada di `package.json`).

**Aturan penting:**
- **Hanya kolom yang diisi manusia** (Circle/Region/Partner) yang di-export pada **posisi kolom yang tepat**. Kolom **formula** (Need SAP/Oracle, Final Registration Status) dan kolom **milik HQ** (HQ Validation, SAP/Oracle Account, Final ID) **dibiarkan kosong** agar formula & proses HQ tidak tertimpa.
- Nilai enum & format tanggal **dinormalkan agar sama persis** dengan yang diharapkan HQ.
- Filter default: **Circle Sumatera**, periode terpilih, status `validated`.

**Tahan perubahan template (adaptor):**
- Sistem menyimpan **"profil format HQ"** = pemetaan `field_kanonik → label header HQ` + posisi kolom.
- Saat template HQ berubah, PIC **upload file HQ terbaru** → sistem membaca baris header → **mencocokkan berdasarkan nama header** → memperbarui profil (kolom yang tak dikenal ditandai untuk pemetaan manual sekali).
- Karena data inti kanonik, perubahan ini **tidak menyentuh** F1/F2/F3.

### F5 — Bulk update status (internal)

- Dari daftar SDP, pilih banyak baris (checkbox) → ubah `status_company` / `company_type` / status internal lain sekaligus.
- Catat tiap perubahan ke `sdp_status_log` (`action`, `field_changes` jsonb, `changed_by`, `changed_at`).
- Sifatnya **internal** (mempermudah kerja Sumatera); tidak menjadi kolom yang dikirim ke HQ kecuali diminta.

---

## 8. Skema Data

### 8.1 Tabel existing yang dipakai

| Tabel | Peran | Catatan |
|---|---|---|
| `sdp_registration` | Simpanan kanonik registrasi | RLS ON (3 policy — **perlu diverifikasi men-scope per cluster/region**) |
| `sdp_master` | Sumber auto-fill SDP existing | **RLS OFF, 0 policy — celah, harus diperbaiki (§8.4)** |
| `mf_territory` | Sumber geografi (3.838 baris) | RLS ON |
| `mc_cluster_mapping` | Mapping cluster↔branch↔region | — |
| `profiles` | Scope & identitas submitter | — |
| `sdp_status_log` | Audit perubahan status (F5) | RLS ON |
| RPC `sdp_territory_combos` | Kombinasi geografi dropdown | sudah dipakai form existing |

### 8.2 Perubahan skema wajib (Fase 0)

**(a) Kolom hilang.** Form (`REG_FIELDS`) mengirim `partner_territory`, tapi kolom ini **tidak ada** di `sdp_registration` — insert yang menyertakannya gagal.
```sql
ALTER TABLE sdp_registration ADD COLUMN IF NOT EXISTS partner_territory text;
```
> Terverifikasi: dari 49 field `REG_FIELDS`, hanya `partner_territory` yang tak punya kolom. Tambahkan uji regresi agar setiap field form punya kolom DB.

**(b) SDP ID — auto-generate (jalur kritis, sudah diputuskan).** Alur resmi HQ (slide *Partner Naming SDP Standardization*) menetapkan langkah ke-5 = **"Circle Automation Create ID"**, jadi ID **digenerate sistem**, bukan diketik. Web kita mengambil peran otomasi Circle ini. Detail algoritma di §10A. Simpan hasil di `sdp_id_new` + **indeks unik**; sediakan tabel counter untuk running sequence.

**(c) Penghubung periode (minimal — hindari over-engineering).** Cukup andalkan `submission_month` + scope submitter untuk monitoring Tahap 1. Tabel batch/assignment terpisah **ditunda** sampai terbukti perlu.

**(d) Profil format export.**
```sql
CREATE TABLE sdp_export_profile (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet         text NOT NULL,          -- '01_SDP_Registration' | '02_..' | '03_..'
  version_label text,                   -- mis. 'HQ Jul-2026'
  mapping       jsonb NOT NULL,         -- { field_kanonik: {header, col_index, human_input:bool} }
  is_active     boolean DEFAULT true,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now()
);
```

### 8.3 (Future) Partner master
Tabel `sdp_partner` (dedup by KTP/NPWP) untuk mengaktifkan auto-fill identitas partner antar-siklus. Di luar Fase 0–1.

### 8.4 Perbaikan RLS (Fase 0)
- **`sdp_master`:** aktifkan RLS + policy `SELECT` untuk user terautentikasi Sumatera (saat ini terbuka via anon key — siapa pun yang login bisa membaca 328 SDP + nama partner).
- **`sdp_registration`:** verifikasi 3 policy existing benar-benar men-scope tulis per `cluster`/`region`; CSE hanya boleh menulis di cluster-nya.

---

## 9. Mapping Kolom Kanonik ↔ Export HQ

Field kanonik = nama kolom DB kita (stabil). Export = adaptor ke header HQ (bisa berubah). Kolom sheet `01_SDP_Registration` (45), penanda **Isi** = kolom manusia yang di-export; **Auto**/**HQ** = dikosongkan saat export.

| Field kanonik (DB) | Kolom HQ (default) | Export? | Auto-fill sumber |
|---|---|---|---|
| `sdp_id_new` | SDP ID (New) | Isi | **auto-generate §10A** |
| `pairing_id` | Pairing ID | Isi (jika Hybrid) | — |
| `brand` | Brand | Isi | `profiles`/pilihan |
| `submission_month` | Submission Month | Isi | periode |
| `submission_date` | Submission Date | Isi | tgl submit |
| `request_type` | Request Type | Isi | list |
| `registration_scope` | Registration Scope | Isi | list |
| `circle` `region` `branch` | Circle / Region / Branch | Isi | `profiles`/`mf_territory` |
| `sdp_name` | SDP Name | Isi | `sdp_master` (Update) |
| `partner_company_name` | Partner / Company Name | Isi | `sdp_master.pt_name` |
| `customer_legal_name` | Customer Legal Name | Isi | partner master (future) |
| `company_type` `status_company` | Company Type / Status Company | Isi | list |
| `ktp_number` `npwp_number` | KTP / NPWP Number | Isi | partner master (future) |
| `pic_name_partner` `pic_phone_number` `pic_email_partner` | PIC Partner … | Isi | partner master (future) |
| `msisdn_master_trx` | MSISDN MASTER TRX | Isi | — |
| `email_pic_ioh` | Email PIC IOH | Isi | `profiles.email` |
| `kabupaten` `kecamatan_coverage` | Kab/Kota / Kecamatan Coverage | Isi | `mf_territory` |
| `partner_territory` *(kolom baru)* | Partner Territory | Isi | `sdp_master` |
| `bill_to_address` `ship_to_address` `kode_pos` | alamat … | Isi | partner master (future) |
| `hybrid_type` | Hybrid Type | Isi (jika Hybrid) | — |
| `cse_name` `cse_partner_id` `cse_number` | CSE … | Isi | `profiles` |
| `bank_*` | Bank … | Isi | partner master (future) |
| `commitment_fee_status` | Commitment Fee Status | Isi | list |
| `main_document_folder_link` | Main Document Folder Link | Isi | — |
| `branding_update_required` `branding_status` | Branding … | Isi | rule |
| `need_sap_creation` `need_oracle_creation` | Need SAP/Oracle? | **Auto → kosong** | formula (§10) |
| `circle_submit_status` | Circle Submit Status | Auto | status |
| `hq_validation_status` | HQ Validation Status | **HQ → kosong** | — |
| `final_registration_status` | Final Registration Status | **Auto → kosong** | formula |
| `remarks` | Remarks | Isi | — |

Adaptor export membaca `sdp_export_profile.mapping` untuk menempatkan tiap field kanonik ke posisi kolom HQ yang benar; kolom bertanda **kosong** tidak diisi agar formula/HQ tak tertimpa.

---

## 10. Kolom Auto-Generated (Formula)

- **Need SAP Creation?** = `Ya` bila scope mengandung IM3 (IM3 only / Hybrid IM3+3ID / Hybrid IM3 Single); selain itu `Tidak`.
- **Need Oracle Creation?** = `Ya` bila scope mengandung 3ID (3ID only / Hybrid IM3+3ID / Hybrid 3ID Single); selain itu `Tidak`.
- **Circle Submit Status** = mengikuti status internal (Draft/Submitted/Validated).
- **Final Registration Status** = kombinasi HQ Validation + SAP/Oracle creation + ID validation (rule `05_Field_Guide`).

Formula dihitung di aplikasi untuk keperluan internal/tracking. Saat **export**, kolom-kolom ini **dikosongkan** agar formula asli di sheet HQ yang menghitung (menghindari bentrok).

---

## 10A. Standardisasi SDP ID & Nama PT (auto-generate)

Sumber: slide HQ *Partner Naming SDP Standardization* (Indosat Ooredoo Hutchison). Berlaku untuk **NEW creation** sampai unifikasi terjadi (ID lama tetap seperti apa adanya).

### 10A.1 Format SDP ID

`[Identifier][PartnerCode][YYMM][CircleCode][RunningSeq]` — total **8 digit** setelah prefix (1+4+1+2).
Contoh `SDP 2 2505 3 01` → disatukan menjadi `SDP22505301` (Single IM3, Kalisumapa, Mei-2025, urut 01).

| Segmen | Panjang | Isi | Diturunkan dari |
|---|---|---|---|
| Identifier | 3 huruf | `SDP` (Mitra IM3) / `KSK` (3Kiosk/3ID) | `brand` |
| Partner Code | 1 digit | lihat tabel di bawah (per **baris**, bukan scope utuh) | `brand` + status hybrid |
| Period | 4 digit | YYMM **bulan siklus/live target** | `submission_month` (siklus) |
| Circle Code | 1 digit | 1 Sumatera · 2 Jakarta Raya · 3 Kalisumapa · 4 Java | `circle` |
| Running Seq | 2 digit | urut, zero-padded | counter per (periode, circle) |

> **Terverifikasi terhadap 44 ID di `01_SDP_Registration`.** Circle Code cocok 100%. Period semua `2607` (Jul-2026) meski submit Juni → ambil **bulan siklus target**, bukan `submission_date`. Regex validasi: `^(SDP|KSK)[1-5]\d{4}[1-4]\d{2}$`.

**Partner Code (per baris = brand + status hybrid):**

| Baris | Partner Code | Arti | Contoh di Excel |
|---|---|---|---|
| IM3, single (IM3 only) | 2 | Single IM3 | `SDP22607402` |
| 3ID, single (3ID only) | 3 | Single 3ID | `KSK32607401` |
| IM3, bagian pasangan Hybrid | 4 | Single Hybrid IM3 | `SDP42607301` |
| 3ID, bagian pasangan Hybrid | 5 | Single Hybrid 3ID | `KSK52607302` |
| Satu baris mewakili keduanya | 1 | All Hybrid | jarang/legacy — **konfirmasi HQ** |

> Koreksi penting: registrasi **Hybrid dibuat DUA baris** (IM3 kode 4, 3ID kode 5), bukan satu baris kode 1. Data contoh memakai kode 1 hanya sporadis di baris Update — perlu klarifikasi HQ.

**Circle Code (Tahap 1):** Sumatera = **1**.

### 10A.2 Algoritma generate (pseudocode)

```
identifier  = brand == 'IM3' ? 'SDP' : 'KSK'
isHybrid    = registration_scope startsWith 'Hybrid'   // atau ada pairing
partnerCode = isHybrid ? (brand=='IM3' ? 4 : 5)
                       : (brand=='IM3' ? 2 : 3)
yymm        = format(cycle_month, 'YYMM')              // bulan siklus/live target; Jul-2026 → '2607'
circleCode  = { Sumatera:1, 'Jakarta Raya':2, Kalisumapa:3, Java:4 }[circle]
seq         = nextSequence(yymm, circleCode)          // 2 digit, per (periode, circle)
sdp_id_new  = identifier + partnerCode + yymm + circleCode + pad2(seq)
```

- **Running sequence** berurut dalam grup `(yymm, circleCode)` — di Excel, Java menerus 01→05 lintas brand/partner-code. Reset tiap periode. Gunakan tabel counter transaksional (hindari balapan saat banyak CSE submit bersamaan). Biarkan nomor **bolong** bila ada submit yang batal (jangan dipakai ulang).
- **Hybrid (Pairing):** menghasilkan **dua ID** — baris IM3 `SDP…` + baris 3ID `KSK…` — saling mengisi `pairing_id`. Apakah pasangan **berbagi seq yang sama** atau dua seq berurutan **belum konsisten** di data contoh → tetapkan satu aturan + konfirmasi HQ.
- **Indeks unik** di `sdp_id_new` mencegah duplikat; validasi bentuk pakai regex di atas.
- **Legacy:** ID lama panjangnya bervariasi (mis. `SDP2081`, `SDP2086`, `SDP32402003`, `SDP2023056`) — tidak mengikuti pola 8-digit; taxonomy hanya untuk NEW creation sampai unifikasi.

### 10A.3 Alur pembuatan ID (resmi HQ)

`1. Entity Finalization → 2. Document Completion → 3. Circle Submit Appointment to HQ → 4. HQ Approve → 5. Circle Automation Create ID`

Web kita menjalankan **langkah 5** (otomasi Circle) setelah entity & dokumen final dan perubahan disetujui — konsisten dengan status internal `validated` sebelum ID final diterbitkan.

### 10A.4 Standardisasi Nama PT (helper pengisian)

Format: **`PT [MC] [KECAMATAN]`** — nama PT mewakili MC/kecamatan lokasi Depo. Contoh: `PT TANGGAMUS WONOSOBO`. Bila nama kecamatan tak familiar di territory, Circle boleh memakai nama kecamatan yang paling dikenal. Web menyediakan **saran nama** (dari `mc_cluster` + `kecamatan` master) sebagai bantuan, tetap bisa diedit.

> Catatan HQ: untuk alokasi produk fisik, nama di **SAP** (IM3) dan **Oracle EBS** (3ID) harus selaras karena order system membedakan per brand.

---

## 11. Validasi & Kontrol Akses

**Validasi (inline sebelum submit):** wajib minimal (SDP Name, Request Type, Scope, Partner, geografi); KTP 16 digit (text); NPWP format valid; email valid; telepon/MSISDN numerik `08`/`62`; enum harus dari `04_Lists`; geografi konsisten ke `mf_territory` (dengan **fallback/override** bila kecamatan belum ada di master); Hybrid → Pairing ID + Hybrid Type + Branding wajib; peringatan duplikat SDP/partner.

**Akses:**

| Role | Entry | Kolom geo | Tracking | Bulk approve | Export HQ |
|---|---|---|---|---|---|
| `cse_rse` | Ya (cluster) | terkunci | — | — | — |
| `bsm` | Ya (branch) | terkunci | — | — | — |
| `pic_region` | Opsional | region-nya | Ya | Ya | Ya |
| `spm_sumatera` | Ya | penuh Sumatera | Ya | Ya | Ya |
| `ioh_*` | — | — | baca-saja | — | — |

Menu baru di `SDP_StatusForm.jsx` (`MENUS`): "Isi SDP" (form/grid) untuk pengisi; "Monitor & Export" untuk koordinator.

---

## 12. Rencana Implementasi Bertahap

| Fase | Lingkup | Output |
|---|---|---|
| **0 — Fondasi** | `partner_territory`; keputusan **SDP ID**; **perbaikan RLS** `sdp_master`/verifikasi `sdp_registration`; `sdp_export_profile`; konstanta `04_Lists` | DB aman & siap, tanpa regresi |
| **1 — Entry (F1)** | Form mobile per-SDP + paste grid desktop, scope Sumatera | CSE bisa isi ter-scope & ter-validasi |
| **2 — Auto-fill (F2)** | Perluas `pickSdp` + auto-fill geo/submitter/formula | Pengetikan ulang geografi hilang |
| **3 — Tracking (F3)** | `SDP_BatchMonitor` + reminder | PIC Circle punya visibilitas |
| **4 — Export HQ (F4)** | Copy-TSV + `.xlsx` format HQ + adaptor profil + upload template | Blok siap-tempel, tahan perubahan template |
| **5 — Bulk status (F5)** | Aksi massal status + audit | Kenyamanan internal |
| **Lanjutan** | Termination & Rebordering, partner master, rollout region lain | Cakupan penuh |

---

## 13. Non-Fungsional & Future Work

**Non-fungsional:** grid mampu ~500 baris (virtualisasi bila perlu); RLS ketat per scope; audit ke `sdp_status_log`; export idempotent & selalu cerminan DB; ramah mobile untuk CSE.

**Future work:** partner master (auto-fill identitas antar-siklus); integrasi eksternal OSS/NIB/NPWP/AHU; generator SDP ID sesuai `Naming ID`; mode grid untuk Termination/Rebordering; rollout ke Circle lain setelah Sumatera stabil.

---

## 14. Acceptance Criteria

- [ ] CSE membuka form di HP; Circle/Region/Branch/Cluster/Brand terisi & terkunci otomatis.
- [ ] CSE (desktop) paste 20 baris; dialog pemetaan kolom muncul; baris invalid & di luar scope ditandai.
- [ ] Pilih SDP existing mengisi otomatis SDP Name/Partner/Territory/Type dari `sdp_master`.
- [ ] **SDP ID ter-generate otomatis sesuai §10A** (mis. baris IM3 hybrid · siklus Jul-2026 · Sumatera · seq 01 → `SDP42607101`, pasangan 3ID → `KSK52607101`); lolos regex `^(SDP|KSK)[1-5]\d{4}[1-4]\d{2}$`; tidak ada duplikat.
- [ ] Need SAP/Oracle terisi otomatis dari Scope (untuk tracking internal).
- [ ] PIC Circle melihat progress per cluster/CSE + kirim reminder.
- [ ] **Export menghasilkan blok TSV & `.xlsx` dengan urutan kolom HQ; kolom formula/HQ kosong; enum & tanggal cocok; hanya Sumatera & status `validated`.**
- [ ] **Upload template HQ baru → sistem mencocokkan header & memperbarui profil export tanpa mengubah data inti.**
- [ ] `sdp_master` tidak lagi terbaca oleh user di luar scope (RLS aktif).
- [ ] Bulk update `status_company` tercatat di `sdp_status_log`.

---

## 15. Pertanyaan Terbuka

1. ~~**SDP ID (New):** generate sistem atau input?~~ **Resolved:** auto-generate sesuai §10A ("Circle Automation Create ID"). Perlu konfirmasi HQ (terlihat tidak konsisten di data Excel): (a) apakah pasangan Hybrid berbagi running-seq yang sama atau dua seq berurutan; (b) kapan Partner Code `1` (All Hybrid) dipakai vs pasangan 4/5; (c) definisi resmi "bulan siklus" untuk YYMM.
2. **Reminder:** email (Resend, sudah ada), in-app, atau keduanya?
3. **Kolom yang di-export:** apakah cukup kolom input manusia, atau HQ juga ingin sebagian kolom auto ikut terisi dari kita?
4. **Termination & Rebordering:** ikut di Tahap 1 atau menyusul?
5. **Partner master:** dibangun lebih awal (agar auto-fill identitas cepat berguna) atau ditunda?

---

*Model terkunci: HQ spreadsheet = sumber kebenaran; web = alat bantu hulu Circle Sumatera; serah-terima via paste format HQ lewat lapisan export yang tahan perubahan template. Nama tabel/kolom terverifikasi terhadap project `kqxnoovrwaxsnpdynbgi` per 23 Juli 2026.*
