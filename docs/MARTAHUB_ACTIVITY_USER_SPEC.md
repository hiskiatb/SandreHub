# MartaHub — Spec: Create Plan Activity, Activity Details, Activity Report, User Management, POSMAT Inventory & MD Activities

> Dokumen ini adalah **spec teknis khusus** untuk fitur inti MartaHub, dan **rencana revisi** yang belum dikerjakan. Fokusnya menjelaskan **kontrak data & koneksi antara web (`tracehub`) dan mobile (`marta_hub`)**, dan sejak revisi ini — **status tiap bagian ditandai eksplisit** supaya siapa pun yang baca langsung tahu mana yang sudah nyata berjalan dan mana yang masih rencana.
>
> Dokumen ini **melengkapi**, bukan menggantikan, spec arsitektur penuh di `tracehub/docs/MARTAHUB_SPEC.md`.

### Legenda status (dipakai di seluruh dokumen mulai revisi ini)

| Tanda | Arti |
|---|---|
| ✅ **BERJALAN** | Sudah diimplementasikan & berfungsi di kode saat ini. |
| 🔧 **REVISI** | Sudah ada, tapi kondisi saat ini **perlu diubah** — bagian ini menjelaskan kondisi lama DULU, lalu arah barunya. |
| 🆕 **RENCANA BARU** | Fitur baru — **belum ada sama sekali** di kode/skema. Perlu didesain & dibangun dari nol. |

**Sumber kebenaran (source of truth):**

| Lapisan | Lokasi |
|---|---|
| Mobile — wizard Create Plan | `marta_hub/lib/features/planning/presentation/screens/create_plan_screen.dart` |
| Mobile — Activity Details | `marta_hub/lib/features/planning/presentation/screens/plan_detail_screen.dart` |
| Mobile — Activity Report | `marta_hub/lib/features/submission/presentation/screens/submit_actual_screen.dart` |
| Mobile — data layer aktivitas | `marta_hub/lib/features/planning/presentation/providers/activity_provider.dart` |
| Mobile — Location Picker (peta) | `marta_hub/lib/features/planning/presentation/screens/location_picker_screen.dart` |
| Mobile — auth & binding profil | `marta_hub/lib/features/auth/presentation/providers/auth_provider.dart` |
| Web — Approval Center | `tracehub/app/martahub/approval/page.jsx` |
| Web — Activity Plan (monitoring) | `tracehub/app/martahub/activities/page.jsx` |
| Web — Calendar (versi dasar saat ini) | `tracehub/app/martahub/calendar/page.jsx` |
| Web — User Management | `tracehub/app/martahub/assignments/page.jsx` |
| Web — System Settings | `tracehub/app/martahub/settings/page.jsx` |
| Web — scope/RBAC helper | `tracehub/lib/martaScope.js` |
| Database | Supabase project **MartaHub** (`pemltwhyidrajbyzynks`) |

---

## 0. Prinsip Arsitektur & Desain (BARU — berlaku ke semua bagian di bawah)

### 0.1 Satu Dataset, Satu Project Supabase ✅ **BERJALAN** (perlu ditegaskan & dijaga)

**Ditegaskan/dikonfirmasi lewat revisi ini:** seluruh data MartaHub — plan, activity, profil user, site, dsb — hidup di **satu project Supabase yang sama** (project **MartaHub**, `pemltwhyidrajbyzynks`), **terpisah total** dari project yang dipakai SandraHub (tracehub inti).

Kondisi kode saat ini **sudah** mengikuti prinsip ini di lapisan data: baik mobile maupun web memakai client Supabase yang menunjuk ke project MartaHub yang sama (`lib/supabaseMarta.js` di web, `Supabase.instance.client` yang dikonfigurasi ke project MartaHub di mobile) — bukan dua database terpisah. Yang **berbeda** hanyalah jalur *login/identitas*:

- **Mobile**: sesi Supabase Auth asli langsung ke project MartaHub.
- **Web**: sesi login tetap lewat project SandraHub (gerbang tracehub secara umum) — begitu login, **email**-nya dicocokkan ke `mh_profiles` di project MartaHub (`getMartaScope`). Ini pola *identity bridge*, bukan berarti datanya di project yang beda — datanya tetap satu (MartaHub).

**Yang perlu dijaga ke depan:** jangan sampai ada modul baru MartaHub yang menyimpan sebagian datanya di project SandraHub (mis. gara-gara reuse tabel tracehub umum) — semua tabel `mh_*` harus tetap di project MartaHub satu ini.

### 0.2 Data Confidential Diproses Lokal — Evidence vs Reference 🔧 **REVISI BESAR (diperbaiki lagi)**

🔧 **Koreksi penting atas draft §0.2 sebelumnya** — dikonfirmasi user bahwa prinsip ini **bukan** "semua lat/lng dilarang di cloud". Yang benar adalah pembedaan dua jenis data lat/lng:

1. **Evidence (bukti lapangan)** — lat/lng yang **didapat dari hasil kerja BME/RGE/TL DSF/DSF/MD** (titik plan, titik check-in aktual, titik pemasangan POSMAT). **Ini BOLEH masuk database/cloud** — tidak melanggar prinsip apa pun. Ini yang selama ini sudah tersimpan di `mh_activities.latitude/longitude`, `checkin_lat/checkin_lng`, dan yang akan tersimpan di tabel pemasangan POSMAT (§8) — semuanya **evidence**, **bukan** data yang perlu disembunyikan.
2. **Reference/Master (rujukan validasi)** — lat/lng **outlet resmi** yang jadi acuan "benar/salah"-nya sebuah evidence (dipegang Head TMV secara lokal, §9.2). Data referensi inilah yang **tidak boleh diunggah** ke sistem/cloud — karena ini yang sensitif (daftar lengkap titik outlet resmi perusahaan). Referensi ini dipakai untuk **membandingkan** evidence yang disubmit terhadap lat/lng outlet yang seharusnya. Begitu perbandingan selesai, **hanya status hasilnya** (tervalidasi/tidak) yang di-push ke database — bukan angka referensinya.

Jadi alur validasi yang benar: **Evidence (boleh di cloud) dibandingkan terhadap Reference (wajib lokal, tidak pernah di cloud) → hasil perbandingan (status validasi) di-push ke cloud.**

**Kondisi SAAT INI:**

- `mh_activities.latitude`/`longitude` (titik plan) dan `checkin_lat`/`checkin_lng` (titik check-in aktual) — ini **evidence**, ✅ **sudah benar disimpan di cloud**, tidak perlu diubah/disembunyikan. Ditampilkan di tab **Map** Activity Details (§2.3) dan kartu konfirmasi Location Picker (§1.2) — **tetap boleh**.
- `mh_sites.latitude`/`longitude` — ini berperan sebagai **reference/master** dan **saat ini terbuka dibaca web** lewat RPC `mh_list_sites`. ✅ **Dikonfirmasi: `mh_sites` IKUT dipindah ke lokal-only**, sama seperti Outlet Lat/Lng Master (§9.2). ✅ **Namun — dikonfirmasi mekanisme baru yang menghapus dampak besar ke Check-In (lihat poin 3 di bawah):** Check-In **tidak lagi butuh `mh_sites` sama sekali** untuk validitasnya sendiri. Ini **bukan lagi blocker besar** seperti draft sebelumnya — cukup penyesuaian kecil (lihat §2.2/§12 gap 7a, sudah direvisi turun skalanya).
- Belum ada fitur validasi MSISDN sama sekali di kode saat ini.

**Arah RENCANA (🆕 belum diimplementasikan, perlu didesain lebih detail):**

1. Evidence lat/lng (plan, check-in, pemasangan POSMAT) **tetap disimpan di cloud seperti sekarang** — tidak perlu dipindah ke lokal.
2. Reference/master lat/lng outlet (`mh_sites` **dan** Outlet Lat/Lng Master baru §9.2) **dipindah ke lokal** (dikelola Head TMV lewat mekanisme link-folder-lokal, §9.1) — **tidak pernah** diunggah ke cloud.
3. ✅ **Dikonfirmasi — mekanisme validasi Check-In DUA LAPIS, jauh lebih sederhana dari draft sebelumnya:**
   - **Lapis 1 — Check-In vs titik event di Plan (evidence vs evidence, INSTAN, tidak berubah dari sekarang):** saat membuat Plan, titik lokasi event **sudah ditetapkan** (§1.2, evidence, disimpan di `mh_activities.latitude/longitude`). Saat Check-In, device membandingkan **posisi GPS saat itu** terhadap **titik event Plan itu sendiri** (bukan terhadap `mh_sites`) — kalau dalam **radius tertentu** (mis. **100 meter**, ✅ **dikonfirmasi: radius ini bisa di-set dari sistem**, jadi bukan angka hardcode) → **langsung terkonfirmasi valid, real-time di device**, sama seperti sekarang. Karena kedua titik yang dibandingkan (titik event Plan & titik check-in) **sama-sama evidence**, **tidak ada reference/master yang dibutuhkan** di lapis ini — jadi `mh_sites` pindah lokal **tidak berdampak** ke lapis ini sama sekali.
   - **Lapis 2 — titik event Plan vs Site resmi terdekat (evidence vs reference, BERKALA, baru/tambahan):** terpisah dari Check-In, di **menu Validasi (lokal)** (§9.2), Head TMV mencocokkan titik event yang disubmit BME/RGE (evidence, dari cloud) terhadap **Site yang di-assign** (reference, file lokal) — hasilnya berupa **status "event tervalidasi"** yang di-push ke database (bukan real-time, mengikuti pola rekonsiliasi berkala). Status ini **soal legitimasi lokasi event terhadap outlet resmi**, bukan soal valid/tidaknya Check-In itu sendiri — dua status yang **terpisah**.
4. ✅ **Dikonfirmasi: histori status tidak boleh hilang** — khusus untuk status hasil rekonsiliasi berkala (status "event tervalidasi" di atas, status MD Activities, status MSISDN), status lama **tetap tersimpan** (tidak dihapus/ditimpa hilang) saat ada update baru, hanya status *terkini* yang jadi acuan tampilan utama. Ini **tidak berlaku** untuk `checkin_valid` (Lapis 1) karena itu tetap perhitungan instan seperti sekarang, bukan hasil rekonsiliasi. Implikasi skema log/riwayat berversi ini masuk ke §5.
5. **Validasi MSISDN** — pola sudah jelas (§9.3): submitted MSISDN boleh di cloud (evidence), raw MSISDN tervalidasi (reference) tetap lokal, status hasil rekonsiliasi di-push ke cloud, dengan histori tetap tersimpan (poin 4).

**Dampak ke bagian lain dokumen ini**: §1.2 Location Picker (evidence — sudah benar, tidak perlu diubah), §2.2/§2.3 Activity Details (✅ **Check-In existing TIDAK PERLU didesain ulang** — validitasnya tetap instan/real-time, hanya radius-nya kini configurable dan dibandingkan terhadap titik event Plan, bukan `mh_sites`; ada **tambahan** status baru "event tervalidasi" dari Lapis 2, terpisah dari `checkin_valid` — lihat §12 gap 7a yang sudah direvisi turun skala), §8.2 MD Activities (rekonsiliasi berkala, stok berkurang setelah reconciliation bukan instan), §9.2 Outlet Lat/Lng Master & `mh_sites` (reference, wajib lokal, dipakai untuk Lapis 2 di atas), §10 Map View (menampilkan evidence — **sudah dikonfirmasi boleh**, tidak lagi jadi konflik prinsip).

---

## 1. BAGIAN — Create Plan Activity (Mobile)

**Layar:** `CreatePlanScreen` (`create_plan_screen.dart`) — wizard 4 step: **Plan Info → Target → Location → Review**, dipanggil dari `/activities/new` (create) atau `/activities/new?edit={id}` (lanjutkan draft / revisi plan).

### 1.0 Penamaan: "Event Category" → "Activity Category" 🔧 **REVISI (penamaan)**

Mulai revisi ini, istilah **"Event Category"** di seluruh UI & dokumen diganti jadi **"Activity Category"** (Kategori Aktivitas) — supaya konsisten dengan penamaan modul (Activity Plan, Activity Details, Activity Report, MD Activities), bukan "Event" yang berkonotasi lebih sempit.

- Kondisi kode saat ini: label UI masih "Event Category" (`_Label('Event Category'...)` dsb di `create_plan_screen.dart`), variabel `_eventCategory`, daftar `_categories`, dan `ActivitySummary.labelCategory`. Kolom database `mh_activities.event_category` juga masih pakai penamaan lama.
- Rencana: ganti **label tampilan** jadi "Activity Category" di semua layar (wizard, Activity Details, Activity Report, web Activity Plan). Penamaan **kolom database** (`event_category`) direkomendasikan **tetap** untuk sementara (menghindari migrasi lintas-tabel yang berisiko) — cukup ganti label & penamaan variabel yang user-facing; kolom fisik bisa direname di iterasi terpisah kalau memang diperlukan.
- Field `event_name` (nama activity) **tidak** diganti oleh instruksi ini — tetap "Activity Name"/nama kegiatan seperti biasa, hanya "Category"-nya yang diganti istilahnya.

### 1.1 Step demi step

| Step | Field | Wajib? | Catatan |
|---|---|---|---|
| 1. Plan Info | **Activity Category** (was: Event Category), Activity Name, Plan Date (+ Activity Calendar — lihat §1.1a), Cluster/Area (MC) | Category, Name, Date, MC wajib | MC menentukan daftar Site yang muncul di Step 3 |
| 2. Target | Target SP, Target FWA, Target Rebuy, Budget Cost | SP & Budget wajib | Semua numerik pakai `ThousandsFormatter` (pemisah ribuan live, `lib/shared/utils/number_format.dart`) |
| 3. Location | Site (dropdown by MC) **atau** Pilih di Peta, POI Type | Salah satu dari Site/Peta + POI wajib | Lihat §1.2 |
| 4. Review | — (read-only ringkasan semua step) | — | Judul AppBar berganti jadi nama activity; tombol utama berubah jadi **Submit** |

Stepper (lingkaran nomor di atas) bisa **di-tap langsung** untuk lompat step — mundur selalu boleh, maju hanya diizinkan kalau step-step di antaranya sudah lengkap (`_tryJumpTo`). Kalau belum, diarahkan ke step pertama yang bolong (haptic + auto-scroll ke field).

### 1.1a Activity Calendar di Plan Date 🆕 **RENCANA BARU**

Saat memilih **Plan Date**, selain date picker biasa, akan muncul juga **Activity Calendar** — tampilan kalender interaktif (konsep serupa kalender Microsoft Teams/Outlook: bulan/minggu, klik tanggal untuk lihat detail, warna per status) yang menampilkan plan/activity yang **sudah dibuat**, supaya user bisa langsung lihat jadwal yang sudah padat/kosong sebelum menetapkan tanggal baru.

**Visibilitas data di kalender ini mengikuti hierarki role** (role lengkap termasuk hierarki baru — lihat §4):

| Role | Yang terlihat di Activity Calendar |
|---|---|
| Head | **Semua** plan/activity, semua region & brand |
| TMV (Region×Brand) | **Semua** plan/activity milik siapa pun, dalam region×brand scope-nya (ini yang dimaksud "TMV Region bisa lihat semua user") |
| BME / RGE | Plan/activity miliknya sendiri, **plus** milik TL DSF/DSF/MD di bawahnya (lihat §4) |
| TL DSF | Plan/activity timnya sendiri (DSF di bawahnya) |
| DSF / MD | Plan/activity miliknya sendiri |

**Status implementasi:** web sudah punya versi **paling dasar** dari kalender ini (`calendar/page.jsx` — grid bulanan sederhana, klik tanggal untuk lihat daftar activity hari itu, sudah discope lewat `applyMartaScope`). Ini **prior art** yang bagus tapi **belum interaktif** setara Teams/Outlook (belum ada drag, belum week-view, belum tampilan padat/kosong per hari secara visual). Yang perlu dibangun:

1. Versi **mobile** dari kalender ini, muncul terintegrasi di alur pemilihan Plan Date (bukan halaman terpisah seperti di web).
2. Upgrade visual & interaksi supaya benar-benar terasa seperti kalender modern (Teams/Outlook-style) — bukan grid statis.
3. Selaraskan query scope-nya dengan hierarki role baru di §4 (kalender web saat ini scope-nya cuma region×brand TMV, belum tahu konsep TL DSF/DSF/MD).

### 1.2 Location — dua jalur yang setara

Sejak fitur peta ditambahkan, Step 3 punya dua cara mengisi lokasi, keduanya menulis ke pasangan kolom `latitude`/`longitude`/`address`/`site_id` yang sama:

1. **Dropdown Site** — pilih dari `mh_sites` (via `myScopeSitesProvider`, discope branch+brand user). Otomatis mengisi `network_category`/`area_potential` dari data site.
2. **Location Picker** (`location_picker_screen.dart`, tombol "Pilih di Peta") — peta OpenStreetMap (`flutter_map`, **bukan** Google Maps — API key Google Maps masih placeholder di native config, lihat §12). Fitur: pin tetap di tengah + peta yang digeser, kolom pencarian alamat (Nominatim), tombol GPS "Lokasi Saat Ini", dan panel geofencing (site terdekat + jarak real-time).

✅ **Diselesaikan (mengikuti prinsip §0.2 yang sudah diperbaiki):** Location Picker menampilkan & mengirim koordinat lat/lng ke `mh_activities` (lihat kartu konfirmasi & `_KV('Koordinat', ...)` di Review step) — koordinat ini adalah **evidence** (titik yang direncanakan BME/RGE), **bukan** data reference/master. Per §0.2, evidence **boleh** disimpan & ditampilkan seperti kondisi kode saat ini — **tidak perlu diubah**. Keputusan yang sebelumnya masih terbuka di titik ini (apakah §0.2 berlaku penuh di sini) **sudah terjawab: tidak berlaku**, karena §0.2 hanya membatasi data reference/master, bukan evidence.

### 1.3 Simpan Draft vs Submit

| Aksi | Method (provider) | Efek status | Kapan tersedia |
|---|---|---|---|
| **Simpan Draft** (ikon disket, selalu ada di semua step) | `createPlan()` / `updatePlan()` | Status tetap **`draft`** (create) atau tidak berubah (edit draft/revision_needed) | Semua step, kapan saja, field boleh belum lengkap |
| **Submit** (tombol utama, hanya muncul di step Review) | `submitPlan()` | Status → **`plan_submitted`** (menunggu approval) | Hanya saat semua step sudah lengkap |

`submitPlan()` menangani baik jalur create maupun edit, sekaligus membersihkan `approval_notes`/`approved_by*` lama.

### 1.4 Koneksi ke Web

- Plan `plan_submitted` muncul di **Approval Center** web, tabel "Menunggu Persetujuan Plan" → RPC **`mh_web_decide_plan`** → `approved` atau `revision_needed`.
- Semua plan tampil di **Activity Plan** web (`activities/page.jsx`) — read-only monitoring. ⚠️ Label status di sana **belum** diperbarui untuk `plan_submitted`/`revision_needed` (lihat §12).

---

## 2. BAGIAN — Activity Details (Mobile)

**Layar:** `PlanDetailScreen` (`plan_detail_screen.dart`), rute `/activities/{id}`.

### 2.1 Struktur

Header (nama activity, badge status berwarna, tanggal/lokasi/kategori, banner kontekstual) → 4 tab (**Summary**, **Report**, **Photo**, **Map**) → bottom action bar yang berubah sesuai status.

### 2.2 Matriks status → tampilan → aksi

`status` punya 7 nilai aktif; `approved` dipakai untuk dua titik siklus hidup, dibedakan lewat `hasActual`:

| `status` | `hasActual` | Label & warna | Banner header | Aksi bottom bar |
|---|---|---|---|---|
| `draft` | — | Draft (abu) | — | **Lanjutkan Plan** → wizard edit |
| `plan_submitted` | — | Menunggu Approval Plan (amber) | "Menunggu persetujuan plan…" | — |
| `revision_needed` | — | Revisi Plan (amber/warning) | Alasan revisi | **Revisi Plan** → wizard edit |
| `approved` | false | Siap Eksekusi (biru/info) | "Plan disetujui — siap eksekusi" | **Check In** → lalu **Report** |
| `approved` | true | Approved (hijau) | "Disetujui oleh X" | — |
| `submitted` | — | Pending Approval (biru) | — | — |
| `rejected` | — | Rejected (merah) | Alasan penolakan | **Revisi & Kirim Ulang** → Activity Report |

Gating: `canCheckin` = `status=='approved' && !hasActual`. `canReport` = `(status=='approved' && !hasActual) || status=='rejected'`.

✅ **Diselesaikan, menggantikan draft "REVISI BESAR" sebelumnya (lihat §0.2 poin 3):** Check-In **tidak perlu didesain ulang** — validitasnya (`checkin_valid`/`geo_compliant`) tetap dihitung **instan di device**, hanya saja acuannya berubah dari "jarak ke `mh_sites`" jadi **"jarak ke titik event Plan itu sendiri"** (evidence vs evidence), dengan **radius yang bisa di-set dari sistem** (mis. 100 meter, bukan hardcode — lihat gap baru di §12 soal UI setting radius ini). Karena `mh_sites` tidak lagi dipakai untuk hitungan ini, perpindahan `mh_sites` ke lokal-only **tidak berdampak** ke alur Check-In sehari-hari.

🆕 **Tambahan (bukan pengganti):** ada status **baru**, terpisah dari `checkin_valid` — **"event tervalidasi"** — hasil pencocokan titik event Plan (evidence) terhadap Site resmi yang di-assign (reference), dilakukan Head TMV secara berkala di menu Validasi lokal (§9.2). Status ini **bertahap** (menunggu → valid/mismatch, histori tersimpan) mengikuti pola rekonsiliasi seperti bagian lain (§0.2 poin 4), tapi **tidak memblokir** atau mengubah alur Check-In yang sudah ada — ini soal legitimasi lokasi event terhadap outlet resmi, ditampilkan sebagai info tambahan (kemungkinan di tab Map, §2.3), bukan syarat untuk bisa Check-In/Report.

### 2.3 Isi 4 tab

- **Summary** — kartu performa (SP/FWA/Revenue/Cost/Productivity/Achievement), insight, info pembuat plan.
- **Report** — tabel Target vs Actual.
- **Photo** — grid foto dari `mh_documents`. *(masih grid biasa, belum sekolase Activity Report — §12.)*
- **Map** — koordinat plan vs check-in. ✅ Menampilkan **lat/lng plan & check-in** (`_KV('Plan Lat/Lng', ...)`, `_KV('Check-in Lat/Lng', ...)`) — ini **evidence**, boleh tetap ditampilkan apa adanya. ✅ **`checkin_valid`/`geo_compliant` TETAP instan seperti sekarang** (§2.2) — tidak ada perubahan UX di titik ini. 🆕 **Tambahan**: tab ini perlu menampilkan **status baru "event tervalidasi"** (§0.2 poin 3 Lapis 2, §9.2) sebagai info terpisah — nilainya memang baru terisi/berubah setelah rekonsiliasi berkala Head TMV, jadi field ini (bukan `checkin_valid`) yang perlu menampilkan kondisi awal "menunggu validasi" sebagai hal yang wajar. Ilustrasi peta di tab ini juga masih `CustomPainter` palsu, bukan peta OSM asli (§12).

### 2.4 Koneksi ke Web

Data yang sama dibaca di **Activity Plan** dan **Approval Center** (riwayat keputusan). ✅ Kolom lat/lng plan/check-in (evidence) **tetap terbaca web seperti sekarang** — tidak ada perubahan di titik ini.

---

## 3. BAGIAN — Activity Report (Mobile)

**Layar:** `SubmitActualScreen` (`submit_actual_screen.dart`), rute `/activities/{id}/submit` — wizard 3 step: **Activity Report → Documentation → Review & Submit**.

### 3.1 Step 1 — Activity Report

Form hasil aktual: SP, FWA, Rebuy (opsional), Revenue, Cost — pemisah ribuan live, 2 chip statistik live (Achievement/Productivity %), ~~toggle **POSMAT** (`posmat_compliant`)~~, Insight opsional.

🔧 **Dikonfirmasi: toggle `posmat_compliant` DIHAPUS** dari Activity Report — status POSMAT untuk suatu activity sepenuhnya diambil dari data MD Activities (§7/§8), bukan lagi diisi manual oleh BME/RGE di sini. Ini menghapus potensi dua sumber kebenaran yang sebelumnya jadi kekhawatiran. **Perlu dikerjakan**: hapus field toggle dari UI wizard (step ini), hapus dari Review step, dan putuskan nasib kolom `posmat_compliant` di `mh_activities` (deprecate/drop, atau biarkan tapi tidak dipakai — perlu keputusan migrasi terpisah).

### 3.2 Step 2 — Documentation (kolase foto)

Tanpa batas jumlah foto, kolase (cover + grid 3 kolom), fullscreen viewer (swipe/zoom/hapus), kompresi dijalankan saat Submit (bukan saat pilih foto).

### 3.3 Step 3 — Review & Submit → pipeline kompresi

1. `submitActual()` — update `mh_activities` (`actual_*`, `posmat_compliant`, `status → 'submitted'`).
2. `uploadActivityPhotos()` — kompresi tiap foto ke maksimal ~1MB (`flutter_image_compress`), upload ke bucket `mh-photos`, insert `mh_documents`. Overlay progress ditampilkan selama proses.

### 3.4 Koneksi ke Web

`status='submitted'` → Approval Center, tabel "Menunggu Persetujuan Report" → RPC `mh_web_decide_activity` → `approved` (final) / `rejected` (revisi & kirim ulang).

---

## 4. BAGIAN — User Management

### 4.1 Kondisi SAAT INI ✅ **BERJALAN**

Dua tabel: **`mh_assignments`** (source of truth, dikelola web halaman **User Management** — `assignments/page.jsx`) dan **`mh_profiles`** (runtime binding, disinkron RPC `mh_rebind_me()` saat mobile login).

Role yang ada sekarang (flat, tanpa hierarki di bawahnya): `head`, `tmv`, `bme`, `rge` — BME & RGE fungsional identik, cuma label beda.

### 4.2 Hierarki Baru di Bawah BME/RGE 🆕 **RENCANA BARU**

BME/RGE akan punya "anak buah" berjenjang, dan BME/RGE sendiri kini **brand-scoped** di bawah Brand TMV (✅ dikonfirmasi, lihat §4.5a):

```
Brand TMV (region × brand, mis. North Sumatera × 3ID)
   └── BME / RGE  (pembuat plan, existing role — kini scoped ke brand Brand TMV atasannya)
          └── TL DSF  (Team Leader DSF — mewarisi brand/branch/region dari BME/RGE)
                 └── DSF  (field sales, di bawah TL DSF — mewarisi brand/branch/region dari TL DSF)
          └── MD  (Material Distributor — mewarisi brand/branch/region dari BME/RGE; lihat §7/§8)
```

- **TL DSF (Team Leader DSF)** — role baru, berada di bawah BME/RGE. ✅ **Dikonfirmasi (§4.5a): BME/RGE tetap jadi atasan langsung** (bukan digantikan Brand TMV) — Brand TMV mengawasi di level BME/RGE, bukan langsung TL DSF/DSF/MD. TL DSF **bisa mengelola (tambah/edit/hapus) akun DSF miliknya sendiri** — ini kemampuan manajemen user yang **terbatas ke tim di bawahnya saja**, beda dari `canManage` admin tracehub yang bisa kelola semua assignment.
- **DSF** — role baru, field sales di bawah satu TL DSF tertentu. ✅ **Dikonfirmasi:** TL DSF & DSF dipakai untuk **membantu di event/activity** — mengisi laporan hasil penjualan. Saat mencatat actual (list sales), DSF **input MSISDN** pelanggan **+ ID** — ID inilah yang berperan sebagai **`org_id`** di alur Validity MSISDN (§9.3). Jadi `org_id` bukan kode organisasi generik — **`org_id` = ID unik DSF yang mencatat penjualan tersebut**.
- **Field wajib saat assign/membuat akun DSF** (dikonfirmasi): **ID DSF**, **Nama DSF**, **Email DSF** — ID DSF ini yang dipakai sebagai `org_id`. Field ini perlu ditambahkan ke form assign DSF (baik di web `assignments/page.jsx` maupun UI mobile "Kelola Tim" TL DSF di poin 4 bawah).
- **MD (Material Distributor)** — role baru, sejajar dengan TL DSF (sama-sama di bawah BME/RGE), bertugas memasang POSMAT/material di lapangan (detail penuh di §8). MD **tidak** mengelola user lain. ✅ **Dikonfirmasi ulang**: MD bebas memilih outlet mana pun (konsisten dengan mode "Terikat Outlet langsung" §8.1 — tidak ada pembatasan/penugasan outlet tertentu ke MD tertentu).
- ✅ **Dikonfirmasi:** TL DSF, DSF, dan MD **tidak** punya kolom brand/branch/region terisi manual sendiri — atribut ini **diwarisi** dari rantai supervisor (`supervisor_assignment_id` → ... → BME/RGE → Brand TMV), konsisten dengan §4.5a.

**Yang perlu dibangun (belum ada satu pun di kode/skema saat ini):**

1. Nilai role baru: `tl_dsf`, `dsf`, `md` — perlu ditambahkan ke CHECK constraint `mh_profiles.role` & `mh_assignments.role` (saat ini keduanya hanya izinkan role lama).
2. Kolom relasi hierarki — misal `mh_assignments.supervisor_assignment_id` (menunjuk assignment atasan langsung: DSF → TL DSF, TL DSF & MD → BME/RGE **atau Brand TMV**, tergantung hasil §4.5a) supaya query "siapa anak buah siapa" bisa dilakukan tanpa menebak dari region/branch semata.
3. **Kolom baru `dsf_org_id`** (atau nama serupa) di `mh_assignments`/`mh_profiles` khusus role `dsf` — dipakai sebagai `org_id` di pencocokan Validity MSISDN (§9.3). Ini kolom identitas, bukan rahasia — boleh di cloud (bukan reference/master, ini identitas user).
4. RPC baru untuk **TL DSF mengelola DSF-nya sendiri** — mirip pola `mh_assign_user`/`mh_update_assignment`/`mh_delete_assignment` yang sudah ada, tapi discope ke `supervisor_assignment_id = <assignment TL DSF yang login>`, dipanggil dari **mobile** (bukan hanya web) karena TL DSF kemungkinan besar adalah pengguna mobile, bukan pengguna panel web. Form-nya harus mencakup ID DSF/Nama/Email di atas.
5. UI mobile baru: layar "Kelola Tim" untuk TL DSF (daftar DSF miliknya, tambah/edit/hapus) — belum ada sama sekali.
6. UI web `assignments/page.jsx` perlu menampilkan hierarki ini (mis. expand BME/RGE atau Brand TMV → lihat TL DSF/DSF/MD di bawahnya), bukan cuma tabel flat seperti sekarang.
7. ✅ **Dikonfirmasi: DSF Sales Entry jadi bagian dari Activity Report (§3) yang sudah ada** — bukan layar mobile terpisah. Artinya alur Activity Report (§3.1–§3.3) perlu diperluas: ditambahkan step/field input MSISDN pelanggan (bisa multiple entry per report), dengan `org_id` terisi dari profil pengisi yang login (§4.2/§9.3). ✅ **Dikonfirmasi: field MSISDN ini tampil untuk SEMUA role pengisi Activity Report** (BME/RGE/TL DSF/DSF), **bukan** cuma khusus DSF/TL DSF — jadi field ini selalu ada di form, opsional diisi siapa pun yang submit report. **Perlu didesain lebih lanjut**: aturan `org_id` saat pengisi BUKAN role `dsf` (mis. kosong/null, atau ikut `org_id`/identitas pengisi itu sendiri — belum ditentukan, lihat §5).

### 4.3 Pemetaan role → `UserEntity` (mobile) — perlu diperluas 🔧 **REVISI**

Tabel pemetaan role saat ini (`user_entity.dart`) baru kenal `headTM`/`tmTRI`/`tmIM3`/`bme`/`rge`. Perlu ditambah varian untuk `tl_dsf`, `dsf`, `md` — masing-masing dengan `isFieldUser`/`isManager`/`canApprove` yang sesuai (kemungkinan besar: TL DSF/DSF/MD semuanya `isFieldUser=true`, `canApprove=false` — mereka bukan approver plan/report, hanya BME/RGE ke atas yang approve/dibuat plannya).

### 4.4 Dua Lapis "Role" — Tetap Berlaku ✅ **BERJALAN**

Role akses admin panel tracehub (`profile.role`) vs role MartaHub (`scope.role`/`mh_profiles.role`) tetap dua hal terpisah seperti sebelumnya — hierarki baru di atas murni menambah nilai di lapisan role MartaHub, tidak mengubah lapisan role tracehub umum.

### 4.5 Role Nasional Baru: SPM Sumatera (Superadmin) 🆕 **RENCANA BARU**

Berdasarkan hasil diskusi lanjutan, ada satu role tambahan di **atas** hierarki BME/RGE yang sudah dijelaskan di §4.2 — ini bukan bagian dari cabang BME/RGE, melainkan role **superadmin nasional**:

- **SPM Sumatera** — role **superadmin**, berwenang **memetakan (assign) siapa yang menjadi "Head TMV" di setiap region**, lintas seluruh region (bukan cuma Sumatera — penamaan "Sumatera" dipertahankan apa adanya per instruksi user, meski cakupannya nasional). Ini **satu-satunya role yang benar-benar baru** di nilai database.
- ✅ **Dikonfirmasi: "Head TMV" = relabel role `head` yang sudah ada, "Brand TMV" = relabel role `tmv` yang sudah ada.** Jadi **tidak perlu** nilai CHECK constraint baru untuk keduanya — cukup ganti label tampilan UI (mirip pola rename Activity Category di §1.0), `mh_profiles.role`/`UserEntity.role` untuk `head`/`tmv` **tidak berubah** secara struktur.
- **Yang perlu dibangun** (belum ada sama sekali di kode/skema): nilai role baru **hanya** `spm_sumatera` di CHECK constraint; RPC untuk SPM Sumatera menetapkan/mengganti siapa yang berperan sebagai "Head TMV" (role `head`) di tiap region; UI web untuk SPM Sumatera melakukan pemetaan ini (kemungkinan di halaman User Management yang sama, sebagai layer akses tertinggi); relabel tampilan "Head"→"Head TMV" dan "TMV"→"Brand TMV" di seluruh UI web/mobile yang relevan.

### 4.5a Struktur Konkret Head TMV & Brand TMV (contoh Sumatera) 🆕 **RENCANA BARU**

Dikonfirmasi contoh nyata struktur regional yang dipakai (untuk wilayah Sumatera — pola yang sama berlaku di region lain):

```
SPM Sumatera (superadmin, lintas region)
   ├── Head TMV — North Sumatera
   │      ├── Brand TMV — North Sumatera × IM3
   │      └── Brand TMV — North Sumatera × 3ID
   ├── Head TMV — Central Sumatera
   │      ├── Brand TMV — Central Sumatera × IM3
   │      └── Brand TMV — Central Sumatera × 3ID
   └── Head TMV — South Sumatera
          ├── Brand TMV — South Sumatera × IM3
          └── Brand TMV — South Sumatera × 3ID
```

- **Head TMV**: 1 per region — untuk Sumatera ada **3** (North Sumatera, Central Sumatera, South Sumatera).
- **Brand TMV**: 2 per region (satu per brand: **IM3** dan **3ID**) — untuk Sumatera berarti **6** Brand TMV total (3 region × 2 brand).
- Ini konsisten dengan skema scope existing (`mh_profiles.region` + `mh_profiles.brand`) — Head TMV di-scope by region saja, Brand TMV di-scope by region **dan** brand.

✅ **Dikonfirmasi — relasi Brand TMV ↔ BME/RGE (menjawab open item sebelumnya, gap 29):** Brand TMV **membawahi langsung BME/RGE**, tapi BME/RGE di bawahnya kini **ter-scope per brand** — contoh: Brand TMV 3ID membawahi "BME-BME 3ID" (bukan BME generik lintas-brand). Jadi BME/RGE **tetap ada** sebagai peran/pembuat-plan (tidak dihapus/diganti Brand TMV), hanya saja sekarang setiap BME/RGE punya atribut brand yang mengikuti Brand TMV atasannya. Pola yang sama berlaku turun ke bawah: **TL DSF, DSF, dan MD masing-masing "membawa" (mewarisi) atribut brand × branch × region dari supervisor di atasnya** — bukan field yang diisi manual terpisah, melainkan diturunkan dari rantai supervisor (BME/RGE → Brand TMV → Head TMV → region).

Diagram gabungan (contoh Brand TMV 3ID di satu region):

```
Head TMV — North Sumatera
   └── Brand TMV — North Sumatera × 3ID
          └── BME/RGE (brand=3ID, region=North Sumatera)
                 ├── TL DSF (brand=3ID, region=North Sumatera, diwarisi dari BME/RGE)
                 │      └── DSF (brand=3ID, region=North Sumatera, diwarisi dari TL DSF)
                 └── MD (brand=3ID, region=North Sumatera, diwarisi dari BME/RGE)
```

Konsekuensi skema: `supervisor_assignment_id` (§4.2/§5) tetap **BME/RGE → Brand TMV** sebagai relasi atasan langsung layer BME/RGE; sedangkan brand/branch/region pada TL DSF/DSF/MD **tidak perlu kolom terpisah** — cukup di-derive dari `supervisor_assignment_id` chain saat query (atau didenormalisasi untuk performa, bila perlu). Ini **penyederhanaan** dibanding dua opsi yang sebelumnya diajukan (bukan opsi (a) murni atau (b) murni, melainkan gabungan: BME/RGE tetap ada seperti opsi (a), tapi sekarang brand-scoped di bawah Brand TMV seperti implikasi opsi (b)).

---

## 5. Referensi Skema — Kolom yang Relevan

*(Skema lengkap: `MARTAHUB_SPEC.md` §6. 🆕 = kolom/tabel yang diusulkan, belum ada di database — jangan dikira sudah ada.)*

### `mh_activities` (existing)

| Kolom | Tipe | Catatan |
|---|---|---|
| `status` | text, CHECK 10 nilai (7 aktif dipakai) | `draft`\|`plan_submitted`\|`submitted`\|`revision_needed`\|`approved`\|`rejected`\|(4 legacy belum dipakai) |
| `event_category` | text | 🔧 label tampilan jadi "Activity Category" (§1.0); nama kolom fisik **tetap** untuk sekarang |
| `latitude`, `longitude`, `checkin_lat`, `checkin_lng` | numeric/numeric/numeric/float8 | ✅ **evidence, sudah benar disimpan & ditampilkan di cloud/web** (§0.2) — **tidak** perlu dipindah/disembunyikan, catatan sebelumnya di baris ini sudah usang, lihat §0.2 poin 1 |
| `checkin_valid`, `geo_compliant` | bool | ✅ **tetap instan** (§2.2/§0.2 poin 3 Lapis 1) — dihitung dari jarak Check-In ke titik event Plan itu sendiri (bukan ke `mh_sites`), dengan radius configurable (lihat kolom setting radius di bawah) |
| `posmat_compliant` | bool | ✅ **Dikonfirmasi: DROP kolom ini** — toggle sudah dihapus dari Activity Report (§3.1), status POSMAT sepenuhnya dari MD Activities, dan kolomnya di-drop dari skema (bukan dibiarkan tak terpakai) — migrasi drop kolom perlu masuk ke rencana migrasi (§12 gap 20) |
| *(belum ada)* `event_site_status` (nama sementara) | text/enum + histori | 🆕 kolom/tabel baru diusulkan — status **"event tervalidasi"** (§0.2 poin 3 Lapis 2, §9.2): hasil rekonsiliasi berkala titik event Plan (evidence) vs Site yang di-assign (reference). **Terpisah** dari `checkin_valid` — jangan disatukan jadi satu kolom |

### `mh_profiles` / `mh_assignments` (existing, perlu extend)

| Kolom | Tipe | Catatan |
|---|---|---|
| `role` | text, CHECK | 🔧 perlu tambah nilai `tl_dsf`, `dsf`, `md`, **dan `spm_sumatera`** (§4.5) — `head`/`tmv` **tidak berubah**, cukup relabel tampilan |
| *(belum ada)* `supervisor_assignment_id` | uuid | 🆕 kolom baru diusulkan — relasi TL DSF↔DSF, BME/RGE↔TL DSF/MD (atau Brand TMV↔TL DSF/MD, tergantung §4.5a) |
| *(belum ada)* `dsf_org_id` (khusus role `dsf`) | text, unik | 🆕 kolom baru diusulkan — ID unik DSF yang dipakai sebagai `org_id` di Validity MSISDN (§9.3), diisi saat assign DSF bersama Nama & Email |

### 🆕 Setting baru yang diusulkan — Radius Validasi (belum ada satu pun)

| Kolom/tabel (usulan) | Isi |
|---|---|
| `mh_settings.checkin_radius_meters` (atau tabel settings serupa yang mungkin sudah dibuat di System Settings page) | ✅ **Dikonfirmasi: radius Check-In vs titik event Plan bisa di-set dari sistem** (§0.2 poin 3 Lapis 1, §2.2) — nilai default diusulkan **100 meter**, diedit lewat UI web (kemungkinan besar masuk ke halaman System Settings yang sudah ada). **Perlu didesain**: apakah radius ini satu nilai global, atau bisa berbeda per region/branch/brand (belum ditanyakan ke user — dianggap satu nilai global dulu sampai ada permintaan sebaliknya). |
| `mh_settings.md_activity_radius_meters` (baru) | ✅ **Dikonfirmasi: radius TERPISAH dari `checkin_radius_meters`** — khusus untuk validasi lokasi pemasangan MD Activities mode 1/2 (§8.2 poin 7), evidence titik pemasangan vs Site yang di-assign. Nilai defaultnya **belum diusulkan** (perlu ditentukan Head TMV/SPM Sumatera saat setup), diedit di UI web yang sama dengan setting radius Check-In. |

### 🆕 Tabel baru yang diusulkan — DSF Sales Entry (belum ada satu pun)

| Tabel (usulan) | Isi |
|---|---|
| `mh_dsf_sales_entries` (nama sementara) | MSISDN yang dicatat saat membantu event: `activity_id` (event yang dibantu), `org_id` (✅ **dikonfirmasi: field ini muncul untuk SEMUA pengisi Activity Report**, bukan cuma DSF/TL DSF — kalau pengisi bukan DSF, `org_id`-nya kemungkinan kosong/null atau mengikuti profil pengisi, **perlu didesain**: aturan pasti `org_id` untuk pengisi non-DSF), `msisdn`, `submitted_at` — inilah yang jadi sumber "MSISDN disubmit" yang dicocokkan di Validity MSISDN (§9.3) |

### 🆕 Konsep baru yang diusulkan — Skor Geo Compliance (belum ada satu pun, lihat §8.3)

| Konsep (usulan) | Isi |
|---|---|
| Skor Geo Compliance (dihitung **on-the-fly**, bukan tabel tersimpan — direkomendasikan) | Persentase evidence berstatus "valid" dari total evidence yang **sudah** direkonsiliasi (status "event tervalidasi" + MD Activities mode 1/2 + hasil review Street Branding), per user/per periode. Formula lengkap & hal yang masih perlu direview: lihat §8.3. |

### 🆕 Tabel baru yang diusulkan — POSMAT Inventory (belum ada satu pun)

| Tabel (usulan) | Isi |
|---|---|
| `mh_posmat_types` | Master jenis material POSMAT (nama, kategori, apakah *reusable* [`last_used`-tracked] atau *single-use/consumable*) |
| `mh_posmat_stock` | Stok per MD per periode bulan — kuota awal (diset Head), bisa bertambah (top-up) di tengah periode, sisa stok berjalan |
| `mh_posmat_movements` | Log tiap pemakaian/pemindahan — MD, jenis material, activity terkait, waktu, status validasi lokasi (bukan lat/lng mentah — lihat §0.2) |

### 🆕 Tabel/kolom baru yang diusulkan — MD Activities (belum ada satu pun)

| Tabel/kolom (usulan) | Isi |
|---|---|
| `mh_md_installations` (atau kolom tambahan di `mh_documents`/tabel baru) | Activity yang dipasangi material oleh MD: activity_id, md_user_id, posmat_type_id, status validasi lokasi (`valid`/`mismatch` — bukan lat/lng mentah), waktu pemasangan |

---

## 6. Katalog RPC

### Existing ✅

| RPC | Dipanggil oleh |
|---|---|
| `mh_rebind_me()` | Mobile, tiap login/resume |
| `mh_web_decide_plan` | Approval Center — approve/revisi plan |
| `mh_web_decide_activity` | Approval Center — approve/tolak report actual |
| `mh_list_assignments`, `mh_assign_user`, `mh_update_assignment`, `mh_delete_assignment`, `mh_dismiss_pending` | Web User Management |
| `mh_branch_brand_list`, `mh_list_sites` | Web Master Data |

### 🆕 Diusulkan (belum ada)

| RPC (usulan) | Fungsi |
|---|---|
| `mh_tl_dsf_assign_dsf` / `..._update` / `..._delete` | TL DSF kelola DSF miliknya sendiri (mobile) — scoped ke `supervisor_assignment_id` |
| `mh_posmat_set_monthly_stock` | Head set/top-up kuota stok bulanan per MD/jenis material |
| `mh_posmat_record_usage` | MD catat pemakaian material di suatu activity → kurangi stok, catat status validasi lokasi |
| `mh_calendar_list` (atau extend RPC activity list) | Ambil daftar activity untuk Activity Calendar, sudah discope hierarki role baru |

---

## 7. BAGIAN BARU — POSMAT Material Inventory 🆕 **RENCANA BARU**

**Kenapa fitur ini ada:** BME/RGE membuat plan activity, tapi tidak selalu bisa hadir sendiri di semua activity (bentrok jadwal di hari yang sama) — jadi **MD** yang datang memasang material POSMAT/branding di lokasi.

**Konsep inti:**

- Ada **beberapa jenis material POSMAT** — perlu master data jenis material (dikelola Head TMV/Brand TMV di web, submenu "Jenis Material" — §9).
- Dua sifat stok berbeda per jenis:
  1. **Berpindah / reusable** — dilacak lewat "last used" (siapa/di mana terakhir dipakai), tidak habis dipakai, bisa berpindah antar lokasi/MD.
  2. **Sekali pakai / consumable** — habis begitu dipakai, stok berkurang permanen.
- **Head TMV/Brand TMV menetapkan kuota stok bulanan** per MD/jenis material — 🔧 **dikonfirmasi: input via FORM WEB biasa** (bukan lewat mekanisme link-folder-lokal §9.1 — itu dipakai untuk hal lain, lihat §9.2/§9.3). Ini menjawab kontradiksi yang sebelumnya ada di dokumen ini antara §6 (RPC `mh_posmat_set_monthly_stock`) dan §9.1: **RPC/form web yang benar.**
- **Stok bersifat rolling (carry-over)**: sisa stok yang belum habis di suatu bulan **tidak hangus** — terbawa ke periode berikutnya, ditambah alokasi baru bulan itu. Jadi saldo yang ditampilkan ke MD/Head adalah akumulasi (saldo lama + top-up baru), bukan reset ke nol tiap bulan. ✅ **Dikonfirmasi: carry-over tanpa batas (no expiry)** — saldo boleh menumpuk terus antar periode tanpa masa berlaku; tidak ada mekanisme hangus otomatis yang perlu dibangun.
- **Daftar material yang muncul ke MD/BME saat mencatat pemakaian** otomatis terbatas ke jenis yang **sudah disediakan/di-stok-kan oleh Head TMV** — tidak bisa pilih jenis yang belum ada stoknya.
- 🆕 **Target Terpasang** — selain kuota stok, ada menu terpisah (web) untuk Head TMV menetapkan **target jumlah pemasangan** per branch × brand (KPI, bukan jumlah stok fisik) — dipakai untuk mengukur pencapaian pemasangan terhadap target, terpisah dari perhitungan sisa stok.
- MD (atau BME/RGE yang mencatat bersama MD) memakai stok ini untuk memasang material via **MD Activities** (§8) — pemakaian mengurangi stok (untuk yang consumable) atau mencatat perpindahan (untuk yang reusable).

**Yang perlu didesain lebih lanjut** (belum final di dokumen ini, perlu sesi desain terpisah): unit pengukuran stok (per keping/per set?), aturan carry-over (expiry/tidak), skema & RPC untuk Target Terpasang, tampilan laporan stok untuk Head (dashboard stok per MD/wilayah, termasuk pencapaian vs target).

---

## 8. BAGIAN BARU — MD Activities 🆕 **RENCANA BARU**

**Menu terpisah dari Activity Plan** — ini poin penting, jangan digabung jadi satu list/screen dengan Activity Plan atau Activity Details BME/RGE karena beda aktor & beda tujuan. Dikonfirmasi: hasil pemasangan MD **tidak** muncul di layar Activity Details — sepenuhnya lewat menu "MD Activities" sendiri.

**Akses:** MD (pencatatan individual) **dan** BME/RGE (bisa mencatat/melihat bersama, dengan menandai "sedang bersama MD siapa") — jadi menu ini diakses dua role, bukan MD-eksklusif.

### 8.1 Tiga mode pemasangan (dikonfirmasi — lebih luas dari draft sebelumnya)

1. **Terikat Activity** — MD (atau BME/RGE) pilih salah satu activity yang sedang berjalan di branch-nya untuk dikaitkan dengan pemasangan. ✅ **Dikonfirmasi: self-assign** — MD bebas memilih activity mana pun di branch-nya sendiri, **tidak ada** proses penugasan eksplisit dari BME/RGE/TL DSF lebih dulu.
2. **Terikat Outlet langsung** — pilih dari daftar outlet/site yang ada di branch tersebut, **tanpa** perlu ada activity plan yang mendasarinya.
3. **Street Branding** — pemasangan di lokasi bebas (tidak terikat outlet/site terdaftar sama sekali, mis. pemasangan di jalan/lokasi umum).

Satu entri pencatatan **bisa mencakup beberapa jenis POSMAT sekaligus** (multi-material per kunjungan), dengan quantity per jenis, dan input `outlet_id` (untuk mode 1 & 2) saat mencatat.

### 8.2 Alur validasi lokasi

✅ **Dikonfirmasi, mengikuti §0.2 (evidence vs reference, pola rekonsiliasi berkala):**

1. Aplikasi mencatat **lat/lng lokasi pemasangan** (evidence) — koordinat ini **boleh disinkron ke cloud** segera saat submit, seperti data evidence lainnya.
2. **Untuk mode Terikat Activity / Terikat Outlet** — evidence ini **belum langsung tervalidasi saat submit**. Validasinya terjadi lewat **rekonsiliasi berkala di web**: Head TMV membandingkan evidence (dari cloud) terhadap reference outlet (file lokal mereka, §9.2), lalu status hasilnya di-push/di-update ke record — **status lama tidak hilang**, hanya status terkini yang jadi acuan tampilan (histori tersimpan, §0.2). Jadi **tidak real-time di device MD**.
3. **Untuk mode Street Branding** — ✅ **Dikonfirmasi: validasi MANUAL**, bukan geofencing otomatis (karena memang tidak ada titik outlet reference untuk dibandingkan). BME/TMV **meninjau dokumentasi/foto yang dikirimkan MD** dan memutuskan valid/tidak secara manual. ✅ **Dikonfirmasi: review ini digabung ke Approval Center yang sudah ada** (bukan menu/layar terpisah) — submission Street Branding masuk sebagai jenis item baru di antrean Approval Center existing, direview dengan pola approve/reject yang sama seperti plan/report (RPC baru mengikuti pola `mh_web_decide_activity`, lihat §6). **Perlu didesain lebih lanjut**: bagaimana Approval Center membedakan tampilan antara item plan/report biasa vs item Street Branding (kemungkinan perlu tab/filter tambahan agar tidak campur aduk di satu daftar).
4. **Begitu rekonsiliasi menghasilkan status valid** (mode 1/2, otomatis via geofencing setelah rekonsiliasi) **atau disetujui manual** (mode 3, Street Branding) → stok material berkurang (atau dicatat "pindah" untuk material reusable). **Konsekuensi:** stok **tidak berkurang instan saat MD submit** untuk mode 1/2 (menunggu rekonsiliasi harian, lihat §0.2) — perlu dipastikan UX di mobile MD menampilkan status "menunggu validasi" yang jelas.
5. ✅ **Dikonfirmasi: jika hasil rekonsiliasi/review TIDAK sesuai (mismatch/ditolak) → stok TETAP dikurangi, TIDAK di-rollback.** Pemasangan tetap tercatat, stok yang sudah terpakai saat submit tidak dikembalikan. Konsekuensi mismatch **bukan** ke stok, melainkan ke **skor Geo Compliance** individu (§8.3, baru) — jadi mismatch/ditolak **tetap jadi bahan evaluasi kinerja**, bukan lewat pemotongan/pengembalian stok.
6. Yang tersinkron ke cloud/web: **evidence lat/lng pemasangan** (boleh, ✅) **dan** status hasil perbandingan/review (`menunggu validasi` → `valid`/`mismatch`, dengan histori) — yang **tidak pernah** disinkron hanyalah **reference/master outlet** itu sendiri (§0.2).
7. ✅ **Dikonfirmasi: radius toleransi validasi lokasi mode 1/2 TERPISAH dari radius Check-In** (§5) — dua setting radius independen: `mh_settings.checkin_radius_meters` (§0.2/§2.2, Check-in vs titik event Plan) dan `mh_settings.md_activity_radius_meters` (baru, khusus MD Activities mode 1/2, evidence pemasangan vs Site assigned). Nilai default masing-masing perlu ditentukan Head TMV/SPM Sumatera saat setup (belum ada angka default yang diusulkan di sini — beda konteks fisik: Check-in di titik event yang sama, MD Activities memvalidasi ke outlet fisik yang mungkin lebih longgar/lebih ketat).

**Yang perlu didesain lebih lanjut:** alur approval/review untuk mode 1/2 yang ditandai mismatch (siapa yang lihat, di mana); desain tab/filter di Approval Center supaya item Street Branding tidak campur dengan item plan/report biasa (lihat poin 3 di atas); formula perhitungan skor Geo Compliance secara pasti (lihat §8.3, masih diusulkan — perlu direview lagi sebelum implementasi).

### 8.3 Skor Geo Compliance 🆕 **RENCANA BARU (diusulkan, perlu direview)**

✅ **Dikonfirmasi arahnya:** mismatch/ditolak **tidak** memicu rollback stok (§8.2 poin 5) — sebagai gantinya, jadi bahan **skor evaluasi kinerja** bernama **Geo Compliance**, dengan aturan **diusulkan berikut** (user secara eksplisit meminta ini dipikirkan dulu, jadi ini adalah **draft awal untuk direview**, bukan keputusan final):

**Formula yang diusulkan:**

```
Geo Compliance % (per user, per periode) =
   (jumlah evidence berstatus "valid" setelah direkonsiliasi)
   ÷ (total evidence yang SUDAH direkonsiliasi pada periode itu)
   × 100%
```

- **Cakupan evidence yang dihitung** — digabung dari tiga sumber status lokasi yang sudah dibahas di dokumen ini: status **"event tervalidasi"** (Check-in vs Site, §0.2 poin 3 Lapis 2), status **MD Activities mode 1/2** (pemasangan vs Site, §8.2), dan hasil **review manual Street Branding** (approve/reject dihitung sebagai valid/mismatch, §8.2 poin 3) — supaya satu skor merangkum seluruh kepatuhan lokasi, bukan cuma satu jenis aktivitas.
- **Evidence yang BELUM direkonsiliasi** ("menunggu validasi") **tidak dihitung** di pembilang maupun penyebut — supaya skor tidak bias hanya karena rekonsiliasi belum sempat jalan. Ini berarti skor bisa berubah beberapa hari ke belakang seiring rekonsiliasi harian jalan (histori tetap tersimpan per §0.2 poin 4).
- ✅ **Dikonfirmasi: penilaian BERJENJANG/BERTINGKAT, dari bawah ke atas** — bukan cuma pelaksana lapangan (MD/DSF) yang dinilai, **semua level di hierarki ikut dinilai** (§4.2/§4.5a), tapi skor tiap level di atas adalah **agregasi dari level di bawahnya**, mengikuti rantai `supervisor_assignment_id`:
  1. **Level paling bawah (MD/DSF)** — skor dihitung langsung dari evidence yang mereka kerjakan sendiri (formula dasar di atas).
  2. **TL DSF** — agregat dari skor seluruh DSF di bawahnya.
  3. **BME/RGE** — agregat dari skor seluruh MD (dan TL DSF/DSF, kalau relevan ke lokasi) di bawahnya, brand-scoped sesuai §4.5a.
  4. **Brand TMV** — agregat dari skor seluruh BME/RGE di bawahnya (region × brand).
  5. **Head TMV** — agregat dari seluruh Brand TMV di regionnya.
  6. **SPM Sumatera** — agregat nasional dari seluruh Head TMV.
  Jadi tiap level melihat **skornya sendiri** (kalau dia ikut mengerjakan evidence langsung) **plus** skor rata-rata/agregat tim di bawahnya — pola yang sama seperti Activity Calendar berjenjang di §1.1a dan visibilitas hierarki lain di dokumen ini.
- **Metode agregasi per level naik** — 🆕 **perlu ditentukan**: rata-rata sederhana dari skor anak buah, atau rata-rata berbobot jumlah evidence (supaya anak buah dengan evidence lebih banyak berpengaruh lebih besar ke skor atasannya) — **direkomendasikan rata-rata berbobot jumlah evidence**, supaya konsisten dengan cara skor level bawah dihitung (persentase dari total evidence, bukan rata-rata skor individu yang disamaratakan).
- **Periode**: mengikuti periode pelaporan yang sudah ada (mingguan/bulanan, selaras dengan Achievement chart §3.1) — bukan kumulatif sepanjang masa, supaya mencerminkan kinerja terkini, dihitung ulang di tiap level pada periode yang sama.
- **Tampilan**: diusulkan jadi stat chip baru di Detail Achievement (mirip pola chip POSMAT yang sudah ada, §3.1) untuk level individu, dan kartu ringkas berjenjang (drill-down: klik skor Head TMV → lihat breakdown per Brand TMV → per BME/RGE → per MD/DSF) di dashboard web untuk level manajerial.

**Yang PERLU dikonfirmasi/direview lebih lanjut sebelum implementasi** (formula di atas masih draft): apakah ketiga sumber (event tervalidasi, MD Activities, Street Branding) **dibobot sama rata** atau ada pembobotan berbeda (mis. Street Branding, yang manual, dianggap beda bobot dari geofencing otomatis); metode agregasi rata-rata berbobot vs sederhana antar-level (poin di atas); skema tabel/RPC penyimpanannya (dihitung on-the-fly dari tabel status yang ada vs disimpan sebagai skor teragregasi tersendiri — direkomendasikan **on-the-fly** dulu supaya tidak nambah lapisan sinkronisasi baru, kecuali performa query berjenjang jadi masalah, baru dipertimbangkan materialized view/tabel cache).

---

## 9. BAGIAN BARU — Menu Web "POSMAT Stock" (Stock Management + Validity MSISDN) 🆕 **RENCANA BARU**

Menu **top-level baru di web** bernama **"POSMAT Stock"** (sejajar dengan Activity Plan, User Management, dst), berisi sub-menu: **Jenis Material**, **Stok & Mutasi** (form web biasa, lihat §7), **Target Terpasang** (§7), **Outlet Lat/Lng Master** (§9.2), dan **Validity** (§9.3).

**Akses:** SPM Sumatera (superadmin, §4.5), Head TMV (per region), Brand TMV (per brand).

🔧 **Koreksi dari draft sebelumnya:** mekanisme "link folder lokal" (§9.1) **TIDAK** dipakai untuk Stok & Mutasi (itu form web biasa, dikonfirmasi di §7) — mekanisme ini dipakai khusus untuk **Outlet Lat/Lng Master** (§9.2) dan **Validity MSISDN** (§9.3), dua-duanya soal data mentah/confidential yang sengaja tidak lewat cloud.

### 9.1 Mekanisme "Link Folder Lokal" — dipakai di Outlet Lat/Lng Master & Validity MSISDN

Konsepnya: user memasukkan **path folder lokal di laptopnya sendiri** (laptop Head TMV / Brand TMV / SPM Sumatera — bukan server), lalu web menampilkan semacam **file manager** untuk memilih file mana yang dipakai sebagai sumber data, dan **kolom mana yang di-link ke field mana** yang dibutuhkan sistem. Alur folder→file→mapping kolom ini **disimpan sebagai metadata di database**, supaya saat dibuka lagi, mapping-nya sudah "diingat" — tinggal pilih ulang foldernya.

🔧 **Catatan batasan teknis (dikonfirmasi ke user, sudah disetujui arahnya):** browser **tidak bisa** membuka file di komputer user secara otomatis tanpa aksi user — ini pembatasan keamanan browser (khususnya via *File System Access API*, yang saat ini hanya didukung Chrome/Edge, **tidak** di Firefox/Safari). Maka konfirmasi dari user: **path, alur, dan mapping kolom disimpan** di database, tapi **user tetap harus grant akses ulang (pilih folder lagi) setiap kali browser/sesi dibuka ulang** — sistem tidak menyimpan izin akses file itu sendiri secara permanen, hanya menyimpan *hasil konfigurasinya* (path yang diingat, kolom yang sudah dipetakan) supaya proses pilih-ulang jadi cepat (tidak perlu setting mapping dari nol tiap kali).

**Prinsip kerahasiaan yang tetap dijaga:** file mentah di folder lokal ini **tidak pernah diunggah/disimpan ke server/cloud** — pemrosesan (baca file, pencocokan data) terjadi di sisi browser/lokal, dan yang dikirim ke database MartaHub **hanya hasil akhirnya** (status, bukan file mentah) — konsisten dengan prinsip §0.2.

### 9.2 Sub-menu Outlet Lat/Lng Master 🆕 **RENCANA BARU**

Dikonfirmasi: **daftar lat/lng setiap outlet** ini adalah data **reference/master** (§0.2) — dikelola **secara offline/lokal** oleh Head TMV lewat mekanisme §9.1, **tidak pernah** diunggah ke cloud. Ini **berbeda** dari `mh_sites` yang selama ini terbuka dibaca web — 🔧 perlu diperjelas apakah `mh_sites.latitude/longitude` yang ada sekarang akan **digantikan** oleh mekanisme lokal ini, atau tetap ada berdampingan untuk keperluan lain (mis. dropdown Site di §1.2 tetap butuh koordinat site untuk keperluan non-validasi seperti menampilkan jarak perkiraan).

✅ **Dikonfirmasi: dipakai untuk DUA hal** (pakai pola rekonsiliasi berkala di web yang sama, konsisten dengan §0.2 poin 3):
1. **Evidence lokasi pemasangan MD** (§8.2) — dicocokkan terhadap outlet reference untuk menghasilkan status valid/mismatch pemasangan POSMAT.
2. 🆕 **Evidence titik event Plan** (§0.2 poin 3 Lapis 2, §2.2) — dicocokkan terhadap **Site yang di-assign** ke Plan tersebut, menghasilkan status baru **"event tervalidasi"**, terpisah dari `checkin_valid`.

Kedua-duanya **tidak instan** (rekonsiliasi berkala), hasilnya (status valid/mismatch, dengan histori §0.2 poin 4) di-push balik ke record evidence masing-masing. Ini menghapus opsi "distribusi terbatas ke device" yang sebelumnya masih dipertimbangkan — satu pola rekonsiliasi berkala dipakai seragam di MD Activities dan validasi titik event Plan, sementara Check-In sendiri (Lapis 1, §0.2/§2.2) tetap instan dan **tidak** memakai menu ini sama sekali.

### 9.3 Sub-menu Validity — Rekonsiliasi MSISDN

Fungsinya: mencocokkan (reconcile) **daftar MSISDN yang disubmit oleh DSF/TL DSF** (saat mereka membantu event/activity mencatat penjualan, §4.2) terhadap **file mentah tervalidasi** (berisi MSISDN, org_id, datetime) yang dipegang Head TMV/Brand TMV/SPM Sumatera secara lokal — file mentah ini **tidak pernah diunggah**, hanya diproses lokal via mekanisme §9.1.

✅ **Dikonfirmasi: `org_id` = ID unik DSF** yang mencatat penjualan tersebut (§4.2) — bukan kode organisasi generik. Jadi saat DSF input MSISDN pelanggan, ID DSF miliknya sendiri otomatis melekat sebagai `org_id` pada submission itu — inilah yang dicocokkan terhadap `org_id` di file raw Head TMV.

**Format MSISDN — dikonfirmasi:** input MSISDN (baik yang disubmit user maupun yang ada di file raw) **wajib berformat awalan `62`** (kode negara Indonesia, contoh `628123456789`) — **bukan** `0812...` atau `+62812...`. ✅ **Dikonfirmasi: validasi ketat di titik input** — sistem **memastikan** input harus diawali `62` saat pengisian (bukan auto-convert dari format lain di belakang layar). Perlu diterapkan sebagai validasi form di mobile (submit MSISDN) dan saat parsing kolom di file raw (§9.1).

**Alur:**

1. Head TMV/Brand TMV/SPM Sumatera masuk ke sub-menu Validity, pilih folder → pilih file raw (MSISDN/org_id/datetime tervalidasi) → petakan kolomnya (sekali saja, tersimpan untuk pemakaian berikutnya).
2. Sistem mencocokkan MSISDN dari file lokal itu dengan MSISDN yang sudah tersubmit oleh user-user di laporan SP/FWA/Rebuy (data ini sudah ada di database MartaHub).
3. Hasil pencocokan ditulis sebagai **kolom baru "status tervalidasi"** pada data pelaporan MSISDN (SP/FWA/Rebuy) yang **bertingkat/hierarkis** — artinya kolom status ini bisa dilihat rinciannya oleh **semua tingkatan role** di hierarki (BME/RGE, TL DSF, DSF, MD, Head, TMV, dst), bukan cuma oleh user yang submit.
4. **Frekuensi:** upload & pencocokan dilakukan **berkala tapi manual** dari menu ini (bukan cron job otomatis) — Head TMV/Brand TMV/SPM Sumatera yang menentukan kapan menjalankannya.

**Dua jenis hasil validasi — dikonfirmasi (menjawab open item sebelumnya soal "nuansa status"):**

1. **Ketersediaan MSISDN** — apakah MSISDN yang disubmit **tercatat/tidak** di raw data (ditemukan / tidak ditemukan).
2. **Kecocokan org_id** — jika MSISDN **ditemukan** di raw data, tapi `org_id` yang tercatat di raw **berbeda** dari `org_id` yang diajukan/disubmit user → sistem **menyebutkan org_id yang seharusnya** (nilai org_id yang benar dari raw data), supaya penyimpangan bisa langsung dikoreksi — bukan cuma ditandai "tidak valid" tanpa keterangan.

Jadi nilai "status tervalidasi" minimal punya 3 kemungkinan: **(a)** MSISDN tidak ditemukan di raw; **(b)** MSISDN ditemukan & org_id cocok (valid penuh); **(c)** MSISDN ditemukan tapi org_id tidak cocok (disertai nilai org_id yang seharusnya).

✅ **Dikonfirmasi:** koreksi org_id **tidak** otomatis meng-update record — sistem hanya **menampilkan sebagai catatan/flag** ("org_id seharusnya: X"), lalu user/atasannya yang mengoreksi secara manual. Ini juga menegaskan MSISDN dipakai sebagai **kunci pencocokan utama**, org_id dicek sebagai atribut terpisah (bukan bagian dari kunci gabungan).

**Yang masih perlu didesain lebih lanjut (open item, lihat §12):**
- Skema tepatnya untuk menyimpan "catatan org_id seharusnya" ini — kolom terpisah, atau tabel log rekonsiliasi tersendiri yang bisa diakses semua tingkatan role?
- Relasi "Head TMV"/"Brand TMV" dengan role `head`/`tmv` yang sudah ada di kode — perlu direkonsiliasi sebelum implementasi (lihat §4.5).
- Skema tabel baru untuk menyimpan metadata path/mapping kolom (per user/per laptop), dan skema kolom "status tervalidasi" baru pada tabel pelaporan MSISDN yang mana persisnya (`mh_activities` atau tabel terpisah).

---

## 10. BAGIAN BARU — Map View: Sinkronisasi Activity & POSMAT dengan Filter Layer 🆕 **RENCANA BARU**

Dikonfirmasi: **Map View** (layar peta agregat di mobile, sudah ada sejak tahap awal — bukan tab Map per-activity di §2.3) akan disinkron untuk menampilkan **beberapa jenis data sekaligus** di satu peta — activity (dari Activity Plan) dan POSMAT yang sudah terpasang (dari MD Activities, §8) — dengan **pemfilteran layer yang baik**, supaya user bisa memilih mau melihat lapisan apa saja.

✅ **Ketegangan dengan §0.2 sudah terjawab:** titik lat/lng yang ditampilkan di Map View ini adalah **evidence** (titik plan activity, titik pemasangan POSMAT) — per klarifikasi §0.2 terbaru, evidence **boleh** disinkron & ditampilkan. Jadi Map View ini **tidak melanggar** prinsip data confidential; yang tetap **tidak boleh** ditampilkan di Map View (atau di mana pun) hanyalah data **reference/master** outlet (§9.2) itu sendiri secara langsung — tapi menampilkan evidence activity/POSMAT yang *sudah divalidasi* terhadap reference itu **tidak masalah**.

**Filter layer yang dikonfirmasi (multi-pilih):**
- Per jenis data — Activity Plan vs POSMAT terpasang.
- Per jenis material POSMAT.
- Per status validasi (valid/mismatch).
- Per periode waktu.
- Per role/tim (mis. filter ke BME/RGE atau MD tertentu).

**Yang perlu didesain lebih lanjut:**
- Apakah Map View ini juga tersedia di **web** (utamanya untuk Head TMV/SPM Sumatera), atau murni fitur mobile.
- Bagaimana performa/query-nya kalau data activity+POSMAT sudah banyak (perlu strategi clustering/pagination di peta).
- Kombinasi filter (mis. filter jenis data + status + periode sekaligus) — perlu desain UI filter yang tidak membingungkan saat banyak kombinasi dipilih bersamaan.

---

## 11. Diagram Alur Status — Activity Plan/Report (existing, ✅ tidak berubah oleh revisi ini)

```
draft ──(Submit)──▶ plan_submitted ──(approve)──▶ approved(hasActual=false, "Siap Eksekusi")
  ▲                        │                                │
  │                        └──(revision_needed)──▶ revision_needed ─┘ (kembali ke wizard)
  │ (Simpan Draft, kapan saja)                                      │
  │                                                                   ▼ Check In → Report
  │                                                              status → submitted
  │                                                                   │
  │                                                    (approve, mh_web_decide_activity)
  │                                    ┌──────────────────────────────┤
  │                                    ▼                               ▼
  │                    approved(hasActual=true, SELESAI)  rejected ──(Revisi & Kirim Ulang)──▶ submitted (ulang)
  └────────────────────────────────────────────────────────────────────┘
```

*(Diagram terpisah untuk alur MD Activities/POSMAT belum dibuat — menyusul setelah desain §7/§8 difinalkan.)*

---

## 12. Known Gaps & Follow-up (kumulatif — termasuk temuan revisi ini)

1. **Web `activities/page.jsx` belum tahu status `plan_submitted`/`revision_needed`.** (dari revisi sebelumnya, masih berlaku)
2. **Kolom duplikat di `mh_activities`** (`event_category` vs `event_categories`, `plan_date` vs `plan_date_start`/`plan_date_end`, dst — lihat `MARTAHUB_SPEC.md` §11).
3. **Activity Details — tab Photo & Map belum diupgrade** ke kolase & peta OSM asli.
4. **Google Maps API key masih placeholder** — Location Picker sengaja pakai OpenStreetMap.
5. **Realtime assignment revocation ada jeda** — efektif setelah `mh_rebind_me()` dipanggil ulang, bukan instan.
6. **RLS disabled di 4 tabel non-MartaHub** (`sdp_monthly_uploads`, `sdp_master`, `sdp_monthly_data`, `mh_site_uploads`) — perlu perhatian tim keamanan data, di luar cakupan dokumen ini.
7. ~~Mekanisme perbandingan evidence↔reference real-time vs berkala~~ — ✅ **SUDAH TERJAWAB**: rekonsiliasi berkala di web dipakai untuk MD Activities, Validity MSISDN, dan status "event tervalidasi" (§0.2 poin 3 Lapis 2) — sedangkan Check-In sendiri (Lapis 1) tetap instan, lihat gap 7a di bawah yang sudah direvisi turun skala.
7a. ~~BLOKER PALING BERDAMPAK: `mh_sites` pindah lokal memaksa Check-In didesain ulang total~~ — ✅ **SUDAH TERJAWAB, BUKAN LAGI BLOCKER BESAR.** Mekanisme baru dikonfirmasi: Check-In divalidasi terhadap **titik event Plan itu sendiri** (evidence vs evidence), bukan terhadap `mh_sites`, dengan **radius configurable** (default 100m, lihat §5 setting baru) — tetap **instan di device seperti sekarang**, tidak ada perubahan UX Check-In yang dipakai user sehari-hari. Perpindahan `mh_sites` ke lokal-only jadi **tidak berdampak** ke Check-In sama sekali. Yang **tersisa untuk dibangun** (jauh lebih kecil dari draft sebelumnya): (a) UI setting radius di web (§5), (b) status baru terpisah "event tervalidasi" (hasil rekonsiliasi titik event Plan vs Site assigned, §9.2) yang tampil sebagai info tambahan di tab Map (§2.3) — bukan syarat Check-In/Report — dengan skema histori (gap 7b).
7b. 🆕 **Skema versi/histori status validasi (§0.2 poin 4) belum didesain** — berlaku untuk status baru **"event tervalidasi"** (gap 7a), status validasi MD Activities (§8.2), dan status tervalidasi MSISDN (§9.3). **Tidak** berlaku untuk `checkin_valid` (tetap instan, bukan hasil rekonsiliasi). Perlu tabel log terpisah (bukan kolom tunggal yang di-overwrite) supaya status lama tetap bisa diaudit sementara status terkini tetap jadi acuan tampilan.
8. 🆕 **Rename "Event Category" → "Activity Category" belum diterapkan di kode** — baru tercatat sebagai rencana di dokumen ini (§1.0).
9. 🆕 **Activity Calendar (§1.1a) di mobile belum dibangun sama sekali** — web baru punya versi paling dasar (grid bulanan tanpa interaksi Teams-style).
10. 🆕 **Hierarki User Management baru (TL DSF/DSF/MD, §4.2), POSMAT Inventory (§7), dan MD Activities (§8) seluruhnya rencana baru** — belum ada satu pun tabel, RPC, atau layar yang dibangun. Perlu sesi desain teknis terpisah (skema detail, unit stok, radius validasi, alur approval mismatch) sebelum mulai implementasi.
11. ~~Konflik konseptual POSMAT~~ — ✅ **SUDAH TERJAWAB**: toggle `posmat_compliant` **dihapus**, status POSMAT sepenuhnya dari data MD Activities. Lihat §3.1. Sisa pekerjaan: keputusan migrasi kolom `posmat_compliant` existing (deprecate/drop).
12. ~~Role "SPM Sumatera" belum direkonsiliasi~~ — ✅ **SEBAGIAN TERJAWAB**: "Head TMV"/"Brand TMV" adalah relabel role `head`/`tmv` existing (tidak butuh nilai constraint baru); hanya `spm_sumatera` yang benar-benar baru. Lihat §4.5. Yang **masih terbuka**: apakah penamaan "SPM Sumatera" tetap dipakai apa adanya walau cakupannya nasional (belum ditanyakan ulang, dianggap sudah final sesuai instruksi user sejauh ini).
13. 🆕 **Mekanisme link-folder-lokal (§9.1) baru didesain secara konsep, belum diverifikasi teknis** — perlu dicek apakah pendekatan *File System Access API* (Chrome/Edge-only) cukup, atau perlu fallback untuk Firefox/Safari (mis. upload manual biasa tiap sesi tanpa "smart re-link").
14. 🆕 **Skema Validity MSISDN (§9.3) belum final** — kunci pencocokan, nilai enum status tervalidasi, dan tabel target kolom baru masih perlu didesain sebelum implementasi.
15. 🆕 **Menu web "POSMAT Stock" (§9) sepenuhnya rencana baru** — belum ada satu pun halaman, RPC, atau tabel metadata (path/mapping kolom) yang dibangun.
16. ~~Real-time vs rekonsiliasi berkala untuk §8.2~~ — ✅ **SUDAH TERJAWAB**: rekonsiliasi berkala di web, stok berkurang setelah rekonsiliasi, bukan instan saat submit. Lihat §8.2.
17. ~~Validasi lokasi Street Branding belum punya mekanisme~~ — ✅ **SUDAH TERJAWAB**: validasi manual oleh BME/TMV, meninjau dokumentasi/foto yang dikirim MD (bukan geofencing otomatis), digabung ke Approval Center existing (bukan menu terpisah). Lihat §8.2 poin 3.
18. ~~Aturan carry-over stok POSMAT belum final~~ — ✅ **SUDAH TERJAWAB**: tanpa batas (no expiry), saldo menumpuk terus antar periode. Lihat §7.
19. 🆕 **Fitur "Target Terpasang" per branch×brand (§7) sepenuhnya baru** — belum ada skema tabel, RPC, atau rancangan UI sama sekali.
20. 🆕 **Migrasi data lama — dikonfirmasi:** `mh_activities` (evidence) **tidak perlu** dibersihkan/dihapus. Yang perlu: (a) `mh_sites` (reference) **dikonfirmasi pindah ke lokal** — dampaknya ke Check-In sudah **jauh lebih kecil** dari draft sebelumnya (gap 7a sudah terjawab), tapi migrasi datanya sendiri (memindahkan isi `mh_sites` jadi file lokal Head TMV, menonaktifkan RPC `mh_list_sites` yang lama) tetap perlu direncanakan, (b) assign `supervisor_assignment_id` secara manual untuk seluruh user existing berrole `bme`/`rge` begitu hierarki §4.2 dan role SPM Sumatera (§4.5) diaktifkan. Rencana teknis migrasinya sendiri (urutan, downtime, siapa yang menjalankan) **belum dibuat**.
21. ~~Penugasan MD ke activity~~ — ✅ **SUDAH TERJAWAB**: self-assign, MD bebas pilih activity di branch-nya. Lihat §8.1.
22. ~~Map View (§10) bertentangan dengan §0.2~~ — ✅ **SUDAH TERJAWAB**: evidence lat/lng boleh ditampilkan, Map View tidak melanggar prinsip. Lihat §10.
23. ~~Daftar filter layer Map View belum lengkap~~ — ✅ **SUDAH TERJAWAB**: 5 jenis filter dikonfirmasi (per jenis data, jenis material, status validasi, periode, role/tim). Lihat §10.
24. ~~Alur koreksi org_id otomatis vs manual~~ — ✅ **SUDAH TERJAWAB**: manual (catatan/flag, bukan auto-update). Lihat §9.3. Yang **masih terbuka**: skema penyimpanan catatan ini (kolom vs tabel log terpisah).
25. ~~Normalisasi format MSISDN otomatis vs ditolak~~ — ✅ **SUDAH TERJAWAB**: validasi ketat di titik input (bukan auto-convert). Lihat §9.3.
26. ~~Perlu sesi desain teknis khusus untuk redesign Check-In~~ — ✅ **TIDAK LAGI DIPERLUKAN**: Check-In tidak didesain ulang (gap 7a sudah terjawab); yang tersisa cuma kerja implementasi kecil (setting radius, status "event tervalidasi" baru), bukan sesi desain arsitektur terpisah.
27. ~~UI antrean review manual untuk Street Branding belum didesain~~ — ✅ **SEBAGIAN TERJAWAB**: digabung ke Approval Center existing (§8.2 poin 3). Yang **masih terbuka**: desain tab/filter di Approval Center supaya item Street Branding tidak campur dengan item plan/report biasa, dan RPC approve/reject-nya (mengikuti pola `mh_web_decide_activity`, belum dibuat).
28. ~~Migrasi kolom `posmat_compliant` yang di-deprecate belum direncanakan~~ — ✅ **SUDAH TERJAWAB**: drop kolom (§5). Rencana migrasi drop-nya sendiri (kapan, siapa yang jalankan) masuk ke gap 20.
29. ~~BLOKER STRUKTURAL: relasi Brand TMV ↔ BME/RGE belum ditegaskan~~ — ✅ **SUDAH DIJAWAB**: Brand TMV membawahi BME/RGE langsung, BME/RGE tetap ada sebagai pembuat plan tapi kini brand-scoped (mis. "BME 3ID"); TL DSF/DSF/MD tetap di bawah BME/RGE (bukan langsung di bawah Brand TMV), mewarisi atribut brand/branch/region dari rantai supervisor di atasnya (§4.2/§4.5a). Blocker struktural yang masih tersisa di dokumen ini tinggal **gap 7a** (redesign Check-In akibat `mh_sites` pindah lokal).
30. ~~Flow baru "DSF Sales Entry" belum didesain~~ — ✅ **SUDAH TERJAWAB**: jadi bagian dari Activity Report (§3) yang sudah ada, bukan layar terpisah, dan field MSISDN tampil untuk **semua** pengisi Activity Report, bukan cuma DSF/TL DSF (§4.2 poin 7). Yang **masih terbuka**: aturan `org_id` untuk pengisi non-DSF (kosong/null vs ikut identitas pengisi); belum ada wireframe/skema final untuk step tambahan ini (`mh_dsf_sales_entries` masih nama tabel sementara).
31. 🆕 **Field ID/Nama/Email DSF (§4.2) belum ditambahkan ke UI assign existing** — baik di web `assignments/page.jsx` maupun (belum ada) UI mobile "Kelola Tim" TL DSF.
32. ~~Apakah mismatch/ditolak tetap mengurangi stok POSMAT~~ — ✅ **SUDAH TERJAWAB**: stok **tetap dikurangi, tidak rollback** — konsekuensinya dialihkan ke skor Geo Compliance baru (§8.3), bukan ke stok. Lihat §8.2 poin 5.
33. ~~Radius toleransi MD Activities sama dengan Check-In atau beda~~ — ✅ **SUDAH TERJAWAB**: radius **terpisah** (`mh_settings.md_activity_radius_meters`, §5/§8.2 poin 7) — nilai defaultnya **belum ditentukan**, perlu diputuskan sebelum implementasi.
34. 🔧 **Skor Geo Compliance (§8.3) — cakupan role SUDAH TERJAWAB, detail agregasi masih draft.** ✅ **Dikonfirmasi: penilaian berjenjang/bertingkat dari bawah ke atas** — semua level hierarki dinilai (MD/DSF → TL DSF → BME/RGE → Brand TMV → Head TMV → SPM Sumatera), skor tiap level atas adalah agregasi dari level di bawahnya (§8.3). Yang **masih draft/perlu direview**: metode agregasi antar-level (rata-rata sederhana vs berbobot jumlah evidence — direkomendasikan berbobot), pembobotan antar-sumber data (event tervalidasi/MD Activities/Street Branding sama rata atau beda), dan mekanisme penyimpanan (on-the-fly vs tabel agregat) — bukan permintaan eksplisit user melainkan draft yang diminta untuk "dipikirkan", perlu direview sekali lagi sebelum implementasi.

---

*Revisi terakhir: menegaskan **cakupan penilaian Skor Geo Compliance (§8.3, gap 34)** — ✅ **dikonfirmasi: berjenjang/bertingkat dari bawah ke atas**, bukan cuma pelaksana lapangan. Semua level hierarki ikut dinilai (MD/DSF → TL DSF → BME/RGE → Brand TMV → Head TMV → SPM Sumatera), dengan skor tiap level atas berupa **agregasi dari level di bawahnya** mengikuti rantai `supervisor_assignment_id` (§4.2/§4.5a) — konsisten dengan pola visibilitas hierarki lain di dokumen ini (Activity Calendar §1.1a, dst). Metode agregasi antar-level (rata-rata sederhana vs berbobot jumlah evidence) masih draft, direkomendasikan berbobot. Revisi sebelumnya menjawab 4 detail: field MSISDN Sales Entry tampil untuk semua pengisi Activity Report; radius toleransi MD Activities terpisah dari radius Check-In; mismatch/ditolak tidak me-rollback stok (dialihkan ke Skor Geo Compliance); kolom `posmat_compliant` di-drop. Revisi sebelum itu menyelesaikan gap 7a (blocker Check-In terbesar) — Check-In tetap instan divalidasi terhadap titik event Plan sendiri, radius configurable; status baru "event tervalidasi" dari rekonsiliasi berkala di menu Validasi lokal. Revisi-revisi lebih awal menjawab: DSF Sales Entry jadi bagian Activity Report; validasi Outlet Lat/Lng Master pakai rekonsiliasi berkala; review Street Branding digabung ke Approval Center; carry-over stok tanpa batas; relasi Brand TMV↔BME/RGE; struktur regional Head TMV/Brand TMV; field ID/Nama/Email DSF; MD bebas pilih outlet; relabel Head TMV/Brand TMV. Status dokumen: **tidak ada lagi blocker struktural/bisnis besar** — sisa open item di §12 murni detail implementasi (metode agregasi, pembobotan sumber, mekanisme penyimpanan skor, dst). Dokumen ini sudah siap jadi basis development §4/§7/§8/§9.*
