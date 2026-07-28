# SDP Form — Handoff & Continuation

**Tujuan dokumen:** memungkinkan sesi/akun Claude berikutnya melanjutkan pekerjaan ini tanpa kehilangan konteks.
**Terakhir diperbarui:** 23 Juli 2026
**Repo:** `/Users/hiskiasinaga/tracehub` (Next.js 16 · React 19 · Supabase)
**Baca juga:** `docs/SDP_BULK_FORM_SPEC.md` (spec lengkap v1.1) & `docs/sql/sdp_fase0_migration.sql`.

---

## 1. Ringkasan tujuan

Memindahkan pekerjaan pengisian registrasi SDP dari **spreadsheet HQ yang rumit** ke web SandraHub, agar:
- **CSE** mengisi data SDP di cluster-nya (dropdown, bukan free-text; SDP ID otomatis).
- **PIC Region / SPM Sumatera** memantau kelengkapan lalu **export blok format HQ** untuk di-paste ke spreadsheet HQ.

**Model kunci:** spreadsheet HQ = sumber kebenaran; web = alat bantu hulu **Circle Sumatera (Tahap 1)**; serah-terima via **paste** (aliran satu arah web → HQ). Data inti disimpan skema kanonik; export = adaptor terpisah (tahan perubahan template HQ).

**Peran fitur:** `cse_rse`, `bsm` (approval master), `pic_region`, `spm_sumatera`. Export hanya `pic_region` + `spm_sumatera`.

**Alur sederhana (3 langkah):**
1. SPM **Upload Territory IOH** (acuan dropdown wilayah).
2. CSE **Isi SDP** (form mobile / paste grid).
3. PIC/SPM **Export ke HQ** → paste ke spreadsheet HQ.

---

## 2. Yang SUDAH selesai

### Database (Supabase project `kqxnoovrwaxsnpdynbgi`) — migrasi `sdp_fase0_foundation` sudah diterapkan ke produksi
- `sdp_registration`: kolom baru `partner_territory`, `cycle_month`; indeks unik `uq_sdp_registration_sdp_id_new`.
- Tabel `sdp_id_counter` + RPC `generate_sdp_id(p_brand,p_scope,p_circle,p_cycle_month,p_seq)` (§10A) — terverifikasi menghasilkan ID persis format HQ.
- Tabel `sdp_export_profile` (RLS: baca pic/spm, tulis spm).
- `sdp_master`: RLS diaktifkan (baca untuk semua user login — menutup celah anon, tidak memutus menu existing).

### Modul bersama `lib/sdp/` (semua util sudah unit-tested via node)
- `lists.js` — enum dari sheet `04_Lists` + daftar role.
- `idFormat.js` — format/preview SDP ID, regex `^(SDP|KSK)[1-5]\d{4}[1-4]\d{2}$`, peta Circle/PartnerCode.
- `validation.js` — validator field (KTP/NPWP/email/telp/enum/geo) + formula Need SAP/Oracle.
- `prefill.js` — auto-fill dari `sdp_master` + `isNewCreation()`.
- `hqExport.js` — `HQ_LAYOUT_REGISTRATION` (45 kolom persis) + `buildTSV`/`buildMatrix` (kolom formula/HQ dikosongkan).
- `territory.js` — parse `mf_territory.kec_id` ("KEC|KAB") → dropdown Kecamatan/Kab cascading.
- `index.js` — re-export semua.

### Komponen UI (`app/dashboard/components/`)
- **`SDP_QuickForm.jsx`** — form mobile per-SDP: scope terkunci, dropdown wilayah (termasuk Kab/Kecamatan dari Territory IOH), prefill SDP existing, auto-generate ID (+ pasangan Hybrid), isi `submitted_by`.
- **`SDP_BulkGrid.jsx`** — paste grid desktop: tempel dari Excel + dialog pemetaan kolom, validasi inline, dropdown wilayah, simpan draft (localStorage), kirim massal.
- **`SDP_Export.jsx`** — export TSV (copy) + XLSX (exceljs) format HQ, filter periode/status, scope Sumatera.
- **`SDP_StatusForm.jsx`** (diedit) — wiring kartu menu + render: `quickform`, `bulkgrid`, `export`.
- **`SDP_Home.jsx`** (diedit) — quick actions dashboard: Registrasi (Form), Registrasi Massal, Export ke HQ.

- **`SDP_BatchMonitor.jsx`** — dashboard kelengkapan (KPI + progres per cluster/CSE + daftar submission + "Tandai Validated" massal khusus SPM). Terwiring: kartu `monitor` + quick action.

### Progres fase
- ✅ Fase 0 (fondasi DB + modul), ✅ Fase 1 (form + grid + wiring), ✅ Fase 2 (auto-fill), ✅ Fase 3 (monitor tracking), ✅ Fase 4 (export HQ).
- ✅ Perbaikan: Kab/Kota & Kecamatan jadi dropdown dari Territory IOH.

---

## 3. Yang BELUM (harus dilanjutkan) — urut prioritas

1. **Verifikasi build & tes live (#20)** — jalankan `npm run dev`, login **1 akun CSE** → "Isi SDP" → kirim; login **PIC/SPM** → "Export". Pastikan insert lolos RLS & export cocok kolom HQ. (Belum pernah dites runtime.)
2. ~~**Rapikan menu**~~ ✅ **SELESAI (23 Jul 2026).** Tiga aksi utama jelas: **Registrasi SDP** (form baru `quickform`), **Terminate**, **Rebordering** (deep-link `submission_forms:termination|rebordering`). Form registrasi lama disembunyikan (kartu "Registration" dibuang dari landing `SDP_SubmissionForms`; back saat deep-link langsung keluar, tidak menampilkan landing lama). Ditambahkan: **stepper alur per peran** + **teks bantuan kontekstual** + **breadcrumb** di `SDP_Home`/`SDP_StatusForm`. **Main Document Link** kini pakai **link OneDrive** (tipe `link` + validasi `isUrl` di `lib/sdp/validation.js`), bukan upload web. Testing runtime masih ditunda (#20).
3. **Fase 3 — Dashboard tracking (#14)** `SDP_BatchMonitor.jsx`: kelengkapan per cluster/CSE (target vs terisi), bulk approve → status `validated`. Untuk pic_region/spm.
4. **Fase 3 — Reminder CSE (#15)** via `lib/email` (Resend) dari dashboard.
5. **Fase 4b — Upload template HQ → remap (#17)** isi/perbarui `sdp_export_profile` dari file HQ terbaru (cocokkan header) agar export tahan perubahan template.
6. **Fase 5 — Bulk update status (#18)** pilih banyak SDP → ubah `status_company`/`company_type` + catat ke `sdp_status_log`.
7. **Konfirmasi aturan ID ke HQ (#19)** — 3 hal tak konsisten di Excel: (a) pasangan Hybrid berbagi seq atau dua seq berurutan; (b) kapan Partner Code `1` (All Hybrid) dipakai; (c) definisi resmi bulan siklus (YYMM). Sesuaikan `generate_sdp_id` bila beda dari default (default sekarang: pasangan berbagi seq).
8. **Future:** partner master (dedup KTP/NPWP) untuk auto-fill identitas antar-siklus; pengetatan RLS tulis `sdp_registration` per cluster; mode grid untuk Termination/Rebordering.

---

## 4. Catatan penting / jebakan (WAJIB dibaca sebelum lanjut)

- **RLS insert:** `sdp_registration` mensyaratkan `submitted_by = auth.uid()`. Komponen baru sudah mengisinya via `supabase.auth.getUser()`. Form lama `SDP_SubmissionForms.jsx` TIDAK → itu sebab tabel sempat kosong. Jangan hapus baris ini.
- **Auth:** app pakai Supabase Auth (`signInWithPassword`), `profiles` dikunci `auth.uid()`, helper SQL `sdp_form_role()` membaca `profiles.role`.
- **Import extensionless:** relative import tanpa `.js` (konvensi repo, diselesaikan webpack). Untuk tes di node murni, tambah `.js` di salinan temp.
- **Lint React Compiler:** aturan `set-state-in-effect` & memoization muncul sebagai "error" di eslint CLI TAPI juga ada di komponen existing yang sudah produksi — **bukan** gate build. Jangan buang waktu mengejarnya.
- **SDP ID:** hanya di-generate untuk request New/Hybrid Pairing (server-side, transaksional). Update/Terminate/Remapping pakai ID existing (pilih di picker). Hybrid = 2 baris SDP/KSK berbagi seq.
- **Sumber dropdown wilayah:** Circle/Region/Area/Branch/MC dari RPC `sdp_territory_combos` (tabel `mc_cluster_mapping`); Kecamatan/Kab dari `mf_territory.kec_id` = "KECAMATAN|KABUPATEN".
- **Jangan sentuh tabel menu lain** (`mf_*`, `mc_cluster_mapping`, `profiles`, `mh_*`) — perubahan HANYA objek SDP.
- **Supabase MCP:** project SDP = `kqxnoovrwaxsnpdynbgi`, diakses lewat MCP server bernama `supabase-lama` di sesi ini (akun/token lain mungkin beda nama server; yang penting punya akses ke project ref itu).

---

## 5. Cara menjalankan & menguji

```bash
cd /Users/hiskiasinaga/tracehub
npm run dev            # jalankan lokal (Next 16, webpack)
# buka /dashboard, login akun test per role
npm run build          # cek kompilasi integrasi lintas-file
node_modules/.bin/eslint <file>   # cek parse (abaikan aturan React-compiler)
```

Verifikasi util modul (opsi cepat, tanpa app): salin `lib/sdp/*.js` ke folder temp, tambah ekstensi `.js` pada import relatif, jalankan dengan `node --input-type=module`.

---

## 6. PROMPT untuk akun Claude baru (salin-tempel)

> Saya melanjutkan pengembangan fitur **SDP Form** di project **TraceHub/SandraHub** (Next.js 16, React 19, Supabase). Konteks lengkap ada di repo: baca **`docs/SDP_HANDOFF.md`** (status & sisa pekerjaan), **`docs/SDP_BULK_FORM_SPEC.md`** (spec v1.1), dan **`docs/sql/sdp_fase0_migration.sql`**.
>
> Ringkas: web ini alat bantu **Circle Sumatera** untuk mendistribusikan pengisian registrasi SDP ke CSE + tracking, lalu **export blok format HQ** untuk di-paste ke spreadsheet HQ (HQ = sumber kebenaran). Peran: cse_rse, bsm, pic_region, spm_sumatera. Modul bersama ada di `lib/sdp/`; komponen di `app/dashboard/components/SDP_*.jsx`. DB Supabase project `kqxnoovrwaxsnpdynbgi` (Fase 0 sudah diterapkan: generator `generate_sdp_id`, kolom baru, `sdp_export_profile`, RLS `sdp_master`).
>
> **Aturan main:** (1) hanya sentuh objek SDP, jangan ubah tabel menu lain (`mf_*`, `mc_cluster_mapping`, `profiles`, `mh_*`); (2) insert `sdp_registration` WAJIB isi `submitted_by = auth.uid()`; (3) SDP ID di-generate server-side hanya untuk New/Hybrid Pairing; (4) ikuti pola komponen SDP existing (tema `mk(d)`, font DM Sans, import extensionless); (5) untuk perubahan DB produksi, tulis SQL untuk saya review dulu sebelum apply.
>
> **Lanjutkan dari daftar "Yang BELUM" di `docs/SDP_HANDOFF.md` §3**, mulai dari: [SEBUTKAN task yang diinginkan, mis. "rapikan menu" atau "Fase 3 dashboard tracking"]. Sebelum mulai, buat task list, dan konfirmasi rencana singkat ke saya.

---

## 7. Peta file cepat

| File | Peran |
|---|---|
| `lib/sdp/*.js` | Modul bersama (enum, ID, validasi, prefill, export, territory) |
| `app/dashboard/components/SDP_QuickForm.jsx` | Form mobile CSE |
| `app/dashboard/components/SDP_BulkGrid.jsx` | Paste grid desktop |
| `app/dashboard/components/SDP_Export.jsx` | Export format HQ |
| `app/dashboard/components/SDP_StatusForm.jsx` | Router menu Form SDP (wiring) |
| `app/dashboard/components/SDP_Home.jsx` | Dashboard + quick actions |
| `app/dashboard/components/SDP_SubmissionForms.jsx` | Form lama (pertimbangkan disembunyikan) |
| `docs/SDP_BULK_FORM_SPEC.md` | Spec lengkap |
| `docs/sql/sdp_fase0_migration.sql` | Migrasi Fase 0 + rollback |
