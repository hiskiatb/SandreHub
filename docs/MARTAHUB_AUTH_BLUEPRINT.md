# MartaHub — Blueprint

> **Posisi sistem:** MartaHub = hub **Marketing / Trade Marketing & Visibility (Marcomm)**, modul baru di dalam app `tracehub` yang sama — reuse Supabase, `profiles`, dan pola RBAC yang sudah dipakai SandraHub/MFTS.
>
> **Isi dokumen:** **Bagian A — Register & Sign-in** (provisioning + login SSO seluruh hierarki Marcomm). **Bagian B — Activity Plan** (planning kegiatan oleh BME/RGE + check-in lokasi).

## Status implementasi (per 2026-07-02)

**Sudah dikerjakan:**
- **Skema v2 SQL** → `marta_hub/supabase_schema_v2.sql` (aditif, idempotent): `mh_assignments` (allowlist email pre-provision+pending), `mh_sites` (List Site), extend `mh_activities` utk 3-step, kolom scope+status di `mh_profiles`, trigger auto-bind SSO + RPC `mh_rebind_me`, RLS. **Belum dijalankan** karena project MartaHub (`pemltwhyidrajbyzynks`) **INACTIVE/paused**.
- **Mobile (Flutter) — auth dirombak ke SSO**: `auth_provider.dart` (Google/Outlook OAuth + state signedIn/pending/active + `refresh()`), router baru (`/login`,`/pending`, gate), `login_screen.dart` (tombol SSO), `pending_screen.dart` (email + copy). Alur OTP/register lama di-retire (`register_screen.dart`/`otp_verify_screen.dart` dikosongkan).

**Prasyarat agar auth berfungsi (butuh aksi Anda):**
1. **Restore** project Supabase MartaHub, lalu jalankan `supabase_schema_v2.sql`.
2. Di Supabase Auth: aktifkan provider **Google** & **Azure (Outlook)**, tambah **Redirect URL** `martahub://login-callback` (mobile) + URL web.
3. Native deep link: Android `intent-filter` + iOS `CFBundleURLSchemes` untuk `martahub://`.
4. `flutter pub get` + tes di device (SDK Flutter tak tersedia di sesi ini, jadi belum ter-`flutter analyze`).

- **Mobile — 3-step Activity Plan + check-in** (`create_plan_screen.dart` dirombak total + `sites_provider.dart` baru): stepper **Plan Info → Location → Check-in**. Step 1 auto Brand/Branch/BME-RGE + Event Name + Event Category multi-chip + Plan Date (1 tgl / rentang). Step 2 MC dropdown (dari `mh_sites` scope user) → Site ID dropdown → **auto-fill Network/Area dari site** + Address + POI multi. Step 3 **check-in geolokasi** (geolocator): hitung jarak ke site terpilih, radius toleransi 150 m → Valid/Tidak Valid + **Nearest Site(s)** (site pilihan ditandai hijau). Save ke `mh_activities` (kolom v2 + back-compat).

**Fase berikutnya (belum):** (a) selaraskan layar mobile lain (list/detail/dashboard/leaderboard/team) ke skema v2; (b) **web tracehub → /martahub** (upload List Site → generate slot → kelola assignment + kelola sites); (c) opsional peta (google_maps) di check-in bila API key tersedia.

**Catatan uji:** dropdown MC/Site butuh `mh_sites` terisi (dari upload List Site di web). Save insert dibungkus try/catch (surface error) — validasi mapping status/CHECK saat DB restore. Butuh izin lokasi (Android/iOS) utk geolocator.

---

# BAGIAN A — Register & Sign-in

Keputusan desain yang sudah dikunci:
- **Login = SSO Google + Outlook (Microsoft) saja.** Email = identitas sekaligus kunci mapping. Tidak ada kode akses/OTP untuk role Marcomm.
- **Pre-provision + fallback pending.** Email diisi lebih dulu oleh atasannya (sesuai hierarki) ke slot branch-brand; saat user sign-in dan email cocok → otomatis ter-bind. Kalau belum cocok → masuk **halaman pending**.
- **Halaman pending**: user tetap "masuk" tapi hanya melihat emailnya + tombol **Copy** + instruksi kirim ke Marcomm Region untuk di-assign. Belum ada akses data.

---

## 1. Hierarki Role & Kewenangan Provisioning

Empat lapis. Setiap lapis **hanya bisa mem-provision (assign email) lapis tepat di bawahnya**.

| Lapis | Jabatan | Kode role (usulan) | Scope data | Bisa assign |
|---|---|---|---|---|
| L1 | Super Admin | `spm_sumatera` *(sudah ada)* | Circle Sumatera (semua) | 3 Head Marcomm Region |
| L2 | Head of Trade Marketing & Visibility — Region | `mkt_head` (+ `mkt_region`) | 1 Region (semua brand & branch) | TMV IM3 & TMV 3ID di region-nya |
| L3 | Trade Marketing & Visibility — per Brand | `mkt_tmv` (+ `mkt_region`, `mkt_brand`) | 1 Region × 1 Brand | BME & RGE per branch di region×brand-nya |
| L4 | BME (urban) / RGE (rural) | `mkt_bme` / `mkt_rge` (+ `mkt_branch`, `mkt_brand`) | 1 Branch × 1 Brand | — (pelaksana) |

Catatan:
- **Region** = North / Central / South Sumatera (`north` / `central` / `south`, konsisten dgn MFTS `region_sfm_*`).
- **Brand** = `IM3` dan `3ID` (a.k.a. **TRI**). "TMV TRI" = `mkt_tmv` brand `3ID`.
- **BME vs RGE**: level & kewenangan **sama**; pembeda hanya cakupan wilayah — **BME = urban**, **RGE = rural**. Disimpan sebagai `coverage` = `urban|rural` (atau cukup dari kode role).
- Daripada meledakkan kode role per region×brand, dipakai **beberapa kode role + kolom scope** (`mkt_region`, `mkt_brand`, `mkt_branch`) di `profiles`. Lebih ringkas & fleksibel.

Contoh konkret (North Sumatera / 3ID):
`spm_sumatera` → assign **Head Marcomm North** → assign **TMV 3ID North** → assign **BME 3ID Branch Sales Medan** (urban) & **RGE 3ID Branch Sales Medan** (rural).

---

## 2. Sumber Mapping: List Site + Map SHP (bulanan)

Setiap bulan **wajib upload dua berkas**:
1. **List Site** — master site/outlet berisi kolom geo & administratif; dari sini diturunkan hierarki **Region → Area → Branch** per **Brand**.
2. **Map SHP** (shapefile) — batas wilayah geografis; dipakai di bagian **"Map SHP"** untuk **generate mapping** dan mengklasifikasi **urban vs rural** (menentukan slot BME vs RGE).

Alur pemrosesan:
1. Upload List Site + Map SHP untuk bulan berjalan.
2. Sistem generate **mapping master**: daftar unik `(Region, Area, Branch, Brand)` + klasifikasi urban/rural per site → agregasi ke level branch.
3. Dari mapping ini lahir **slot penugasan** per `(Branch, Brand, coverage)` — satu slot BME (urban) dan/atau RGE (rural) yang **menunggu diisi email**.
4. Sesuai hierarki, atasan mengisi **email** BME/RGE ke tiap slot. Email inilah yang nanti dipakai untuk Sign-in with Google/Outlook.

**Aturan re-upload aman (sticky), meniru MFTS territory:**
- Assignment email yang sudah ada **tidak ditimpa** oleh upload bulan baru.
- Branch/brand baru → muncul **slot kosong** baru untuk diisi.
- Branch yang hilang dari List Site bulan baru → assignment-nya **ditandai orphan** (bukan langsung dihapus) untuk ditinjau.
- Klasifikasi urban/rural yang berubah → beri peringatan sebelum simpan (agar BME↔RGE tidak tertukar diam-diam).

### 2a. Kolom List Site yang dipakai (dari file nyata `List Site_YYYYMM`)

File berisi ~47 kolom; yang relevan untuk mapping MartaHub:

| Tujuan | Kolom di file |
|---|---|
| Circle | `Circle New` |
| **Region** | `Region New` |
| **Area** | `Area` |
| **Branch** | `BRANCH` |
| Kecamatan / Kabupaten / Provinsi | `KECAMATAN`, `KABUPATEN`, `PROVINSI` |
| **Urban/Rural** (penentu BME vs RGE) | `KEC RURAL/URBAN` (utama), `KAB RURAL/URBAN` (fallback) |
| Site | `New Site ID`, `New Site Name`, `Site Type` |
| **Brand IM3** — cluster & partner | `MC`, `PT IM3`, `IM3 PARTNER_NM`, `MPC/SDP` |
| **Brand 3ID** — cluster & partner | `Cluster 3ID`, `MP3 ID`, `MP3_NM`, `MP3/3KIOSK` |
| Aktif per brand bulan ini | `LIST IM3 (Mon'YY)`, `LIST 3ID (Mon'YY)`, `LIST IOH (Mon'YY)` |
| **Lat/Long — CONFIDENTIAL** | `Long New`, `Lat New` |

**Aturan generate slot (per bulan):**
1. Ambil baris yang aktif untuk brand terkait: brand **IM3** bila `LIST IM3` aktif (atau `MC` terisi); brand **3ID** bila `LIST 3ID` aktif (atau `Cluster 3ID` terisi). Satu site bisa muncul di kedua brand.
2. Kelompokkan per `(Region New, Area, BRANCH, Brand)`.
3. Dalam tiap grup, tentukan coverage dari `KEC RURAL/URBAN`:
   - ada site **URBAN** → butuh slot **BME** (brand tsb).
   - ada site **RURAL** → butuh slot **RGE** (brand tsb).
4. Hasilnya: daftar slot `(Region, Area, Branch, Brand, coverage∈{urban,rural})` → tiap slot menunggu **1 email** (BME untuk urban, RGE untuk rural).

**CONFIDENTIAL — `Long New` / `Lat New` tidak disimpan ke DB.** Klasifikasi urban/rural sudah tersedia dari kolom `KEC/KAB RURAL/URBAN`, jadi koordinat tak diperlukan untuk auth/mapping. Map SHP dipakai hanya untuk **visualisasi/validasi batas** (opsional), bukan sumber urban/rural. Kalau nanti peta perlu koordinat, simpan terpisah dgn RLS ketat & jangan expose ke klien tak berhak.

---

## 3. Alur Register / Provisioning (mengisi email)

Provisioning = **mengisi email ke slot**, bukan user mengisi form sendiri.

```
spm_sumatera  ──assign email──▶  Head Marcomm (North/Central/South)
Head Marcomm  ──assign email──▶  TMV IM3 & TMV 3ID (region-nya)
TMV (brand)   ──assign email──▶  BME/RGE per Branch (region×brand-nya)
                                   ▲
                     slot lahir dari List Site + Map SHP (bulanan)
```

Detail:
1. Atasan buka daftar slot dalam scope-nya (mis. TMV 3ID North melihat semua branch 3ID North + kolom urban→BME / rural→RGE).
2. Isi **email** (Gmail/Outlook korporat) tiap slot → tercatat sebagai **entri allowlist**: `(email → role, region, brand, branch, coverage)`.
3. Satu email hanya boleh aktif di **satu slot**. Kalau email sudah dipakai slot lain → tolak + tampilkan slot pemiliknya.
4. Bisa **revoke/ubah** email slot; user yang emailnya dicabut otomatis turun ke status **pending** saat berikutnya membuka sistem.

---

## 4. Alur Sign-in (SSO Google / Outlook)

```
[Sign in with Google] / [Sign in with Outlook]
                 │  (OAuth → email terverifikasi, dinormalkan lowercase)
                 ▼
       Cari email di allowlist (mkt_assignments, status aktif)
                 │
      ┌──────────┴───────────┐
   COCOK                  TIDAK COCOK
      │                        │
 bind profile:          buat profile "pending"
 role+region+brand+      (tanpa scope)
 branch dari slot             │
      │                        ▼
      ▼                 ┌───────────────────────────────────────────┐
 Masuk penuh ke         │ HALAMAN PENDING                            │
 dashboard sesuai       │ • Tampil: email Anda (mis. a@ex.com)       │
 scope-nya              │ • [Copy email]                            │
                        │ • "Berikan email ini ke Marcomm Region    │
                        │    Anda untuk di-assign ke Branch Anda."  │
                        │ • Tidak ada akses data sampai di-assign.  │
                        └───────────────────────────────────────────┘
```

Aturan:
- Email dinormalkan (lowercase, trim) sebelum dicocokkan; Google & Outlook diperlakukan sama selama email sama.
- Begitu atasan meng-assign email yang tadinya pending → **refresh / login ulang** → user langsung masuk penuh (profile pending di-upgrade ke slot).
- User pending muncul di **antrian "Perlu di-assign"** milik Marcomm Region/TMV terkait (mereka lihat email + waktu daftar) untuk dipasangkan ke slot.
- Super admin bisa melihat semua pending lintas region sebagai jaring pengaman.

---

## 5. Sketsa Data Model (Supabase)

- **`mkt_site_uploads`** — audit upload bulanan (month, total, new_count, uploaded_by).
- **`mkt_sites`** — baris List Site ter-normalisasi (tanpa lat/long): `site_id, site_name, circle, region, area, branch, provinsi, kabupaten, kecamatan, coverage(urban|rural), mc, cluster_3id, im3_active(bool), t3id_active(bool), site_type, first_seen_month, last_seen_month, active`. **Long/Lat tidak disimpan.**
- **`mkt_branches`** (view/derived) — unik `(region, area, branch, brand)` + flag butuh_bme (ada urban) / butuh_rge (ada rural).
- **`mkt_assignments`** — allowlist inti:
  `id, email(lower, unique aktif), role(mkt_head|mkt_tmv|mkt_bme|mkt_rge), region, brand, branch, coverage, assigned_by, assigned_at, status(active|revoked|orphan), note`.
- **`profiles`** (extend yang sudah ada): `hub` tandai `martahub`, `role`, `mkt_region`, `mkt_brand`, `mkt_branch`, `mkt_coverage`, `status(active|pending)`.
- Auth: **Supabase OAuth** provider **Google** + **Azure (Outlook/Microsoft)**. Tanpa tabel kode akses untuk hub ini.

Binding saat login (server-side, aman):
`profile.role/region/brand/branch ← mkt_assignments WHERE email = auth.email() AND status='active'`. Kalau tak ada → `status='pending'`.

---

## 6. RBAC (ringkas)

| Role | Lihat | Assign |
|---|---|---|
| `spm_sumatera` | semua | Head Marcomm |
| `mkt_head` | region-nya (semua brand & branch) | TMV IM3/3ID region-nya |
| `mkt_tmv` | region × brand-nya | BME/RGE branch di region×brand-nya |
| `mkt_bme` / `mkt_rge` | branch × brand-nya saja | — |

RLS difilter konsisten dari kolom `mkt_region / mkt_brand / mkt_branch` — pola sama seperti scoping MFTS.

---

## 7. Aturan penting & edge case

- **Satu email = satu slot aktif.** Cegah dobel-assign; tampilkan pemilik lama bila bentrok.
- **Sticky lintas bulan:** upload List Site/SHP baru tak menghapus email yang sudah ter-assign; hanya menambah slot baru & menandai orphan untuk yang hilang.
- **Urban/rural berubah** → peringatan (BME↔RGE bisa tertukar).
- **Revoke** → user turun ke pending, bukan terhapus (audit tetap ada).
- **Domain email**: opsi batasi hanya domain korporat tertentu (mis. `@ioh.co.id`) — perlu dikonfirmasi apakah dipakai.
- **Audit**: setiap assign/revoke tercatat (siapa, kapan) untuk akuntabilitas.

---

## 8. Yang masih perlu dikonfirmasi

1. ~~Kolom List Site & penentu urban/rural~~ → **beres**: pakai kolom `Region New / Area / BRANCH`, brand dari `MC` (IM3) & `Cluster 3ID`, urban/rural dari `KEC RURAL/URBAN`.
2. **Coverage grain**: BME/RGE dipetakan per `(Branch × Brand × coverage)`. Apakah cukup 1 BME + 1 RGE per branch-brand, atau bisa lebih dari satu (mis. per Area di dalam branch)?
3. Apakah **satu orang** bisa memegang **>1 branch/brand** (multi-assignment) atau strictly 1:1.
4. Pembatasan **domain email** saat SSO (hanya email korporat, mis. `@ioh.co.id`?).
5. Nama brand final untuk tampilan: `3ID` atau `TRI` (data tetap satu nilai).
6. Kalau di satu branch-brand hanya ada site urban (atau hanya rural), berarti hanya slot BME (atau RGE) saja yang dibuat — konfirmasi ini yang diinginkan.

---

# BAGIAN B — Activity Plan (BME / RGE)

> **Tujuan:** BME/RGE membuat **rencana kegiatan (event)** yang akan dikerjakan di lapangan, lalu **check-in lokasi** saat pelaksanaan untuk memvalidasi bahwa event benar dilakukan di area site yang direncanakan. Konteks (Brand/Branch/MC/BME-RGE) otomatis dari profil user yang login — user tidak perlu memilihnya.

Form terdiri **3 langkah**. Semua field yang "sesuai user" **read-only auto-fill** dari profil (hasil mapping Bagian A).

## B1. Step 1 — Plan Info

| Field | Isi |
|---|---|
| **Brand** | auto dari user (IM3 / 3ID) — read-only |
| **Branch** | auto dari user — read-only |
| **Micro Cluster (MC)** | auto dari user — read-only *(MC untuk IM3, Cluster untuk 3ID)* |
| **BME / RGE** | auto dari user (nama + role) — read-only |
| **Event Name** | teks, wajib |
| **Event Category** | **multi-select**: Direct Selling · Join Event · Open Booth · Project · Sponsorship · Thematic |
| **Plan Date** | **1 tanggal** atau **rentang tanggal** (mulai–selesai) |

> Catatan: di draf ada "Direct Selling" dua kali → dianggap satu. Kategori disimpan sebagai daftar (bisa >1).

## B2. Step 2 — Location

| Field | Isi |
|---|---|
| **MC** | dropdown dari daftar MC/Cluster yang ada di **branch user** |
| **SITE ID** | dropdown dari daftar Site ID di **MC yang dipilih** |
| **Network Category** | Strong / Medium / Weak |
| **Area Potential** | High / Medium / Low |
| **Address** | **search suggestion** (autocomplete alamat) — tetap **bisa diedit** manual |
| **POI** | **multi-select**: Government · Market · Public Area · Sport Stadium · Villages |

**Auto-fill dari SITE ID (jika sumbernya tersedia):** begitu Site ID dipilih, **Network Category** & **Area Potential** diisi otomatis dari atribut site tersebut; user boleh override. (Perlu konfirmasi kolom sumbernya — lihat B5.)

## B3. Step 3 — Check-in Location

- **Peta di-crop hanya ke area MC** yang dipilih di Step 2 (batas/bounding dari kumpulan site di MC itu).
- Event punya **pinpoint** + **radius toleransi** dari site yang dipilih (Step 2).
- Saat user **check-in** (ambil GPS perangkat):
  - **Di dalam radius** site terpilih → **Location Status: Valid**.
  - **Di luar radius** → **Check-in Tidak Valid**; tampilkan **Nearest Site(s): {LIST SITE}** diurut jarak terdekat, dengan **site yang dipilih di Step 2 ditandai hijau**.
- Ringkasan setelah check-in valid (dibawa dari step sebelumnya, sebisanya auto dari SITE ID):
  - **Network Category** — dari Step 2 (auto dari Site ID bila memungkinkan).
  - **Area Potential** — dari Step 2 (auto dari Site ID bila memungkinkan).
  - **Address** — dari Step 2 bila sudah terisi.
  - **POI Type** — dari Step 2.

**Catatan koordinat:** validasi radius & "nearest site" **butuh lat/long site**. Karena itu koordinat **tetap disimpan** tapi **terbatas** (RLS ketat, hitung jarak di server / edge function, tidak di-expose ke klien yang tak berhak). Ini pengecualian dari aturan umum "lat/long tak disimpan" — hanya untuk kebutuhan check-in.

## B4. Sketsa Data Model

- **`mkt_activity_plans`**: `id, created_by, role(bme|rge), brand, branch, mc, event_name, event_categories(jsonb array), plan_date_start, plan_date_end(nullable=1 hari), site_id, network_category(strong|medium|weak), area_potential(high|medium|low), address, poi(jsonb array), status(draft|planned|done|cancelled), created_at, updated_at`.
- **`mkt_activity_checkins`**: `id, plan_id, checked_by, checkin_lat, checkin_lng (restricted), site_id, distance_m, valid(bool), nearest_sites(jsonb), checkin_at`.
- **Radius toleransi**: konfigurable (mis. default 100–300 m), bisa global atau per Site Type; simpan di config/`mkt_settings`.
- Scope RLS: BME/RGE hanya plan miliknya (branch×brand). Atasan (TMV/Head) lihat plan di scope-nya (read/monitor).

## B5. Yang perlu dikonfirmasi (Activity Plan)

1. **Sumber Network Category & Area Potential per Site** — apakah dari List Site (kandidat kolom: `RGS CATEGORY`, `Traffic Category`, atau `Win50, S88, etc`) atau file terpisah? Kalau tak ada → field diisi manual.
2. **Radius toleransi** check-in (meter) — nilai defaultnya berapa, dan apakah beda per Site Type / urban-rural?
3. **Autocomplete Address** — pakai layanan apa (Google Places / lainnya)? Perlu API key.
4. **Batas MC di peta** — di-crop dari bounding box site-site MC, atau dari boundary SHP?
5. Apakah **check-in wajib di dalam radius** untuk dianggap sah, atau invalid tetap boleh tersimpan dgn catatan (untuk audit)?
