# MartaHub — Spesifikasi Sistem (Keseluruhan)

> Update: 2026-09-09. Dokumen ini menggantikan versi lama `docs/MARTAHUB_SPEC.md` yang masih menggambarkan arsitektur lama (mobile Flutter terpisah, role sederhana `admin/head/tmv/bme/rge/pending`). Dokumen pelengkap yang lebih detail per-fitur tetap berlaku: `MARTAHUB_AUTH_BLUEPRINT.md` (auth/provisioning) dan `MARTAHUB_ACTIVITY_USER_SPEC.md` (Create Plan, Activity Details/Report, User Management, POSMAT, MD Activities — banyak bagian di sana masih berstatus 🆕 RENCANA, belum dikerjakan).

## 1. Apa itu MartaHub

MartaHub adalah modul **Sales Performance Management (SPM) — Marketing / Trade Marketing & Visibility** untuk region Sumatera Utara (dan region lain) milik Indosat Ooredoo Hutchison (IOH). Modul ini hidup **di dalam aplikasi Next.js `tracehub` yang sama** (bukan proyek terpisah), dengan backend Supabase-nya sendiri (project **MartaHub**, id `pemltwhyidrajbyzynks`) — terpisah dari project Supabase tracehub/SandraHub inti.

**Koreksi penting terhadap dokumentasi lama:** tidak ada aplikasi mobile Flutter terpisah yang sedang berjalan di production untuk MartaHub. Pengalaman "mobile" yang dipakai BME/RGE/dsb di lapangan disajikan oleh **route Next.js yang sama**, di bawah `app/martahub/m/*` (mobile-web, dioptimalkan untuk browser HP), sedangkan admin/monitoring/CMS memakai `app/martahub/*` (desktop). Kedua permukaan ini berbagi Supabase client (`lib/supabaseMarta.js`) dan RPC yang sama persis. Dokumen `MARTAHUB_AUTH_BLUEPRINT.md`/`MARTAHUB_ACTIVITY_USER_SPEC.md` yang menyebut `marta_hub/lib/features/...` (Flutter) menggambarkan rencana/eksperimen yang **tidak mencerminkan kode yang sedang berjalan saat ini** — anggap sebagai catatan desain historis, bukan source of truth arsitektur.

## 2. Dua Permukaan, Satu Backend

| Permukaan | Path | Untuk siapa |
|---|---|---|
| Desktop / CMS / Admin | `app/martahub/*` (mis. `activities`, `approval`, `assignments`, `calendar`, `settings`, `analytics`, `geo-compliance`, `insight`, `monitoring`, `msisdn-validation`, `posmat`, `posmat/mapping`, `validasi`) | Head/TMV/SPM Sumatera untuk memantau, approve, kelola user, kelola master data |
| Mobile-web | `app/martahub/m/*` (mis. `m/page.jsx` Beranda, `m/activities`, `m/posm/*`, `m/transfers`, `m/user-management`, `m/verify`, `m/notifications`, `m/calendar`, `m/management`) | BME/RGE/TL DSF/DSF/MD/dsb untuk membuat plan, check-in, submit actual, dsb, dari browser HP |

Autentikasi: login pakai sesi Supabase Auth project tracehub/SandraHub yang umum; begitu login, email dicocokkan ke `mh_profiles`/`mh_assignments` di project MartaHub (pola *identity bridge* — bukan dua database, hanya jalur identitas yang beda dari jalur data).

## 3. Hierarki Role (kondisi aktual di database saat ini)

`mh_profiles.role` **tidak** punya CHECK constraint enum (hanya dibatasi "lowercase, tanpa spasi") — set peran yang benar-benar dikenali sistem ditentukan oleh percabangan kode di RPC `mh_activities_for_me()` dan sejenisnya:

`admin`, `spm_sumatera`, `head`, `head_tm`, `tmv`, `tm_im3`, `tm_tri`, `bme_rge`, `tl_dsf`, `dsf`, `md`, `dse`, `gse`, `ae`, `promotor`, `cse_rse`, `bsm` (+ fallback role generik).

Distribusi role nyata di database saat ini (`mh_profiles`): `bme_rge: 12`, `head: 5`, `pending: 3`, `tmv: 2`, `spm_sumatera: 1`.

Ringkasan cakupan (scope) tiap lapisan mengikuti kolom `region`/`brand`/`branch` di `mh_profiles`:

- **spm_sumatera** — superadmin, lintas semua region.
- **head / head_tm** — Head TMV, 1 per region, melihat semua brand & branch di regionnya.
- **tmv / tm_im3 / tm_tri** — Brand TMV, 1 per region×brand.
- **bme_rge** — pembuat plan lapangan (BME=urban, RGE=rural — dibedakan cakupan wilayah, bukan hak akses), scope 1 branch×brand.
- **tl_dsf, dsf, md** — role turunan di bawah BME/RGE (Team Leader DSF, Direct Sales Force, Material Distributor) — mewarisi brand/branch/region dari supervisor di atasnya, bukan diisi manual.
- **dse, gse, ae, promotor, cse_rse, bsm** — role lapangan tambahan yang juga dikenali RPC (varian tim penjualan/dukungan).
- **pending** — akun sudah register tapi belum di-assign scope oleh atasan; hanya bisa melihat halaman pending.

## 4. Alur Registrasi & Login

- User mendaftar lewat `app/marta/register/page.jsx`. Trigger DB `mh_handle_new_user()` (AFTER INSERT di `auth.users`) otomatis membuat/menyatukan baris `mh_profiles`.
- Client TIDAK melakukan INSERT ke `mh_profiles` (dulu menyebabkan error duplicate key `23505`) — sekarang client melakukan **UPDATE** ke baris yang sudah dibuat trigger, dengan logika: kalau profil sudah punya `role`/`status` non-`pending` (sudah pernah di-assign atasan), hanya `full_name`/`auth_code_id` yang diupdate (tidak menimpa scope); kalau masih pending, baru field `role/brand/auth_code_id/is_active` ikut diisi dari form registrasi.
- Setelah register, status defaultnya belum aktif (`is_active:false`) sampai atasan meng-assign/mengaktifkan scope-nya secara resmi (lewat `mh_assignments`/halaman User Management).

## 5. Modul & Alur Kerja Utama

### 5.1 Activity Plan (Plan → Actual → Approval)
- BME/RGE (atau role turunan) membuat **plan** kegiatan lapangan: kategori aktivitas, tanggal plan, site/lokasi, target.
- Setelah pelaksanaan, isi **laporan actual** (SP, FWA, Rebuy, Revenue 3 Bulan, Cost, dokumentasi foto).
- Alur status berbentuk siklus `draft → plan_submitted → approved → submitted (actual) → approved/rejected`, dengan approval dilakukan Head/TMV lewat **Approval Center** (`app/martahub/approval`) via RPC `mh_web_decide_plan` / `mh_web_decide_activity`.
- Data yang sama ditampilkan read-only untuk monitoring di **Activity Plan** CMS (`app/martahub/activities/page.jsx`) dan **Calendar** (`app/martahub/calendar`).
- **Import massal**: CMS Activity Plan mendukung import Excel (`.xlsx/.xls/.csv`) lewat `lib/martaPlanImport.js`, dengan mekanisme "klaim kepemilikan saat interaksi pertama" (RPC `mh_import_plan_batch`, trigger `_mh_profiles_claim_placeholder`) untuk baris backdoor yang awalnya belum terhubung ke user BME/RGE nyata (menampilkan placeholder sampai user itu benar-benar berinteraksi pertama kali dengan datanya).
- **Export Excel**: `app/martahub/activities/page.jsx` mengekspor data plan/actual ke `.xlsx` (via `exceljs`), dengan format angka Rupiah/integer/GPS/persen yang sesuai, serta kolom Plan Date & Actual Date sebagai **sel tanggal asli** (bukan teks) berformat tampilan `dd/mm/yyyy` (Short Date Excel standar) — tetap bisa diubah formatnya sendiri oleh user di Excel.

### 5.2 Dashboard Mobile-Web (`app/martahub/m/page.jsx` — "Beranda")
Menampilkan ringkasan bulan berjalan sesuai scope user yang login: jumlah Plan, jumlah Actual, Revenue (3M), Cost Ratio, persentase achievement. `Revenue (3M)` dan `Cost Ratio` akan menampilkan "-" bila belum ada data actual revenue/cost yang diisi untuk periode tsb (bukan bug — mencerminkan progres pengisian laporan actual BME/RGE yang memang belum lengkap).

### 5.3 POSM/POSMAT
Rencana modul untuk kelola **material POSM** (Point of Sale Material) — master jenis material, stok per MD per periode, log pemakaian/pemasangan di lapangan, dengan validasi lokasi pemasangan (evidence vs reference — lihat §5.6). Route mobile: `m/posm/*` (≥7 sub-route). Route desktop: `posmat`, `posmat/mapping`.

### 5.4 MD Installation / DSF Sales / MSISDN Validation
- **MD Installation**: pencatatan pemasangan material oleh role `md`, termasuk varian "retailer installation".
- **DSF Sales Entry**: role `dsf`/`tl_dsf` mencatat penjualan (MSISDN pelanggan + ID DSF sebagai `org_id`) sebagai bagian dari alur Activity Report.
- **MSISDN Validation** (`app/martahub/msisdn-validation`): rekonsiliasi berkala antara MSISDN yang disubmit (evidence, cloud) vs data MSISDN resmi (reference, lokal — lihat §5.6), hasilnya status validasi yang di-push ke cloud (bukan angka mentahnya).

### 5.5 Outlet/Site Mapping
- **List Site** bulanan diupload untuk menurunkan hierarki Region→Area→Branch per Brand, dan menentukan klasifikasi urban/rural (menentukan kebutuhan slot BME vs RGE).
- Assignment email bersifat *sticky*: upload List Site baru tidak menimpa assignment yang sudah ada; hanya menambah slot baru atau menandai branch yang hilang sebagai *orphan* untuk ditinjau, bukan otomatis dihapus.
- Route terkait: `posmat/mapping`, `geo-compliance`.

### 5.6 Prinsip Data Lokasi: Evidence vs Reference
- **Evidence** (titik hasil kerja lapangan — lat/lng plan, check-in aktual, titik pemasangan POSMAT) **boleh disimpan di cloud** dan ditampilkan di web/mobile apa adanya.
- **Reference/Master** (lat/lng outlet resmi, dipakai untuk memvalidasi evidence) bersifat sensitif dan idealnya dikelola lokal oleh Head TMV, tidak diunggah ke cloud — hanya **status hasil perbandingannya** (valid/tidak) yang di-push ke database.
- Validasi Check-In memakai **dua lapis**: Lapis 1 (instan, di device) membandingkan titik check-in terhadap titik event Plan itu sendiri (evidence vs evidence, radius configurable, default diusulkan 100m); Lapis 2 (berkala, oleh Head TMV) membandingkan titik event Plan terhadap Site resmi (evidence vs reference) — hasilnya status "event tervalidasi" terpisah dari status check-in Lapis 1.

### 5.7 Approval Center, Settings, Analytics, Notifications, Presence
- **Approval Center** (`app/martahub/approval`): antrian keputusan plan/actual yang menunggu persetujuan Head/TMV.
- **Settings** (`app/martahub/settings`): parameter sistem (kandidat: radius validasi check-in, radius validasi MD Activities, dsb).
- **Analytics/Insight/Monitoring**: ringkasan performa lintas region/brand/branch.
- **Notifications & Presence**: notifikasi in-app dan mekanisme heartbeat/online-status.

## 6. Skema Database (ringkas, ~52 tabel `mh_*`)

Tabel inti yang paling sering disentuh: `mh_profiles` (identitas+scope user), `mh_assignments` (source of truth provisioning email→role/scope), `mh_activities` (plan+actual, kolom lengkap termasuk `status`, `event_category`, `latitude/longitude`, `checkin_lat/checkin_lng`, `checkin_valid`, `geo_compliant`, `actual_*`, `posmat_compliant`), `mh_sites` (master List Site), `mh_documents` (foto/lampiran, bucket `mh-photos`).

Modul lain masing-masing punya tabel tersendiri untuk POSM (`mh_posmat_types`, `mh_posmat_stock`, `mh_posmat_movements` — sebagian masih rencana), MD Installation, DSF Sales Entry, MSISDN Validation, Outlet Mapping, Notifications, Presence, serta tabel audit/log terkait. Detail kolom lengkap tersedia di riwayat query skema sesi ini; untuk kolom yang benar-benar dipakai di kode saat ini, `mh_activities` dan `mh_profiles`/`mh_assignments` adalah yang paling stabil dan aktif dipakai.

## 7. Katalog RPC (ringkas)

Ada **~140 fungsi `mh_*`** (semua `SECURITY DEFINER`) yang mengimplementasikan seluruh logika akses/scope — client (baik desktop maupun mobile-web) hampir tidak pernah query tabel langsung untuk data lintas-user, melainkan lewat RPC. Kelompok utama:

- **Activity lifecycle**: `mh_activities_for_me`, `mh_import_plan_batch`, `mh_web_decide_plan`, `mh_web_decide_activity`, RPC edit-request/revisi.
- **Registrasi & Auth**: `mh_handle_new_user` (trigger), `mh_rebind_me`, `_mh_profiles_claim_placeholder` (trigger klaim kepemilikan baris backdoor-import), `_mh_can_manage_activity_as`.
- **Assignment/User Management**: RPC assign/update/delete assignment (pola `mh_assign_user`/`mh_update_assignment`/`mh_delete_assignment` dan varian).
- **POSM**: plan/alokasi/klaim material.
- **MD Installation**: termasuk varian retailer installation.
- **Outlet Mapping**: beberapa RPC dengan overload signature berbeda.
- **DSF/MSISDN**: workflow submit dan rekonsiliasi.
- **Geo-compliance, Notifications, Presence/heartbeat, Super-admin management, Branch management, Folder-link storage, Settings, Bulk web-decision**.

## 8. Perbaikan & Perubahan Penting (sesi 2026-09)

1. **Registrasi**: fix duplicate-key error — ganti INSERT jadi UPDATE yang menghormati scope yang sudah di-assign atasan.
2. **Import Excel Plan Date**: parser lama gagal total pada file yang selnya berformat `d-mmm-yy`/`d-mmm` (tanpa tahun di teks tampilan). Diperbaiki dengan membaca **nilai numerik serial Excel mentah** langsung dari sel (bukan teks hasil format), dikonversi ke tanggal dengan aritmetika integer (`Math.round(serial) - 25569` hari sejak epoch 1899-12-30) agar imun terhadap ambiguitas teks maupun bias floating-point yang sempat menyebabkan 12 baris salah mundur sehari ke 31 Agustus.
3. **Database residual**: 12 baris `plan_date='2026-08-31'` hasil import sebelum fix di atas, dikoreksi manual jadi `2026-09-01` (per ID, sudah diverifikasi silang ke file sumber).
4. **Export Excel**: kolom Plan Date/Actual Date sekarang sel bertipe Date asli (bukan teks) dengan format tampilan `dd/mm/yyyy`, tetap bisa diubah user di Excel.
5. **Dugaan duplikasi Plan/Actual di mobile-web** (Beranda & Aktivitas Region menampilkan ~2× angka sebenarnya): sudah diverifikasi berkali-kali di level database & RPC (query langsung, simulasi RPC dengan JWT user tertentu, simulasi window-function persis seperti PostgREST) — **tidak ada duplikasi di server**. Ditambahkan **dedupe by-id defensif** di client (`app/martahub/m/page.jsx` dan `app/martahub/m/activities/page.jsx`) sebagai jaring pengaman, **belum di-commit** (menunggu deploy manual oleh user) — akar masalah sesungguhnya di sisi client masih belum ditemukan pasti kalau dedupe ini ternyata tidak menuntaskan gejalanya.
6. **Revenue (3M)/Cost Ratio kosong**: dikonfirmasi bukan bug — mencerminkan data actual revenue yang memang belum diisi BME/RGE untuk periode berjalan.

## 9. Catatan Operasional Penting

- **Perubahan kode dilakukan langsung di checkout lokal user** (`~/tracehub` di Mac user, dijangkau lewat device bridge), **bukan** lewat commit otomatis.
- **Standing instruction dari user**: Claude tidak pernah menjalankan `git add`/`commit`/`push` sendiri lagi — semua commit & deploy dilakukan manual oleh user dari terminalnya sendiri.
- Dua file mobile-web (`app/martahub/m/page.jsx`, `app/martahub/m/activities/page.jsx`) saat ini memiliki perubahan dedupe yang **belum di-commit user** — perlu direview & di-deploy manual oleh user kapan pun mereka siap.
