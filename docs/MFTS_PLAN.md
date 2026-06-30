# Manpower Fulfillment Tracking System (MFTS)
### Sub-modul SandraHub — Spesifikasi & Penajaman Konsep

> **Posisi sistem:** *bukan* recruitment, *bukan* HRIS. MFTS adalah **SLA & accountability tracker** untuk pemenuhan manpower antara Internal Indosat ⇄ Agency. Satu kalimat: *"Posisi mana yang kosong, siapa yang sedang menggarap, macet di mana, salah siapa, dan harus didorong yang mana."*

---

## 0. North Star — ubah dari "pencatatan" ke "exception engine"

Mayoritas sistem tracking gagal karena jadi tabel besar yang harus dibaca manual. MFTS harus membalik logika: **sistem yang mencari masalah, bukan manusia.** Saat RM/NM buka aplikasi, layar pertama bukan daftar vacancy — tapi **daftar tindakan hari ini** yang sudah diurut berdasarkan dampak.

Tiga prinsip yang memandu semua keputusan desain:

1. **Exception-first** — yang sehat disembunyikan, yang bermasalah ditonjolkan.
2. **Akuntabilitas yang adil** — setiap keterlambatan harus bisa diatribusikan ke pihak yang benar (Agency *atau* Internal). Tanpa ini, agency tidak akan percaya angka SLA-nya.
3. **Update semurah mungkin** — agency cukup 1–2 tap untuk maju tahap. Kalau update terasa berat, data jadi basi dan seluruh sistem tidak berguna.

---

## 1. Ide pembeda (yang biasanya tidak terpikirkan)

Ini bagian terpenting dari penajaman. Tanpa ini, sistem hanya jadi versi rapi dari spreadsheet.

### 1.1 Stop-clock SLA (atribusi waktu Agency vs Internal) — **paling penting**
Masalah klasik: agency disalahkan padahal macet di sisi Indosat (menunggu approval offering, menunggu slot user interview, menunggu budget). Solusi: **setiap stage punya "owner"** (siapa yang harus menggerakkan saat ini). Jam SLA berjalan hanya untuk pihak yang sedang memegang bola.

- Total Age = Agency-owned days + Internal-owned days.
- Saat status masuk stage milik Internal (mis. *Waiting Offering Approval*, *Waiting User Interview Slot*), SLA agency **pause**.
- Dashboard bisa menjawab jujur: *"Vacancy ini umur 22 hari, tapi 9 hari di antaranya menunggu Internal."*

Efek: agency percaya angkanya → mereka mau pakai sistem → datanya hidup.

### 1.2 SLA per-stage, bukan hanya SLA total
Target waktu untuk **tiap tahap**, bukan cuma total 30 hari. Contoh: *Searching* ≤ 5 hari, *Interview → Offering* ≤ 3 hari, *Offering → Joined* ≤ 7 hari. Manfaat: bisa menandai sebuah stage **overdue** lebih awal walau total belum lewat SLA → peringatan dini, bukan otopsi.

### 1.3 Reason code / blocker terstruktur
Pertanyaan "kenapa belum terisi" harus jadi **data**, bukan teks bebas. Saat sebuah stage macet, agency/internal wajib pilih alasan dari daftar:
`Pelamar minim di area` · `Gaji di bawah ekspektasi pasar` · `Kandidat ghosting` · `Gagal background check` · `Menunggu approval internal` · `Kandidat terima offer lain`.
Dari sini lahir analitik akar masalah yang nyata (mis. *"60% vacancy DSF Aceh macet karena gaji di bawah pasar"* → keputusan kebijakan, bukan sekadar marah ke agency).

### 1.4 Candidate counter (jalan tengah tanpa upload dokumen)
Anda benar: **tanpa CV, tanpa dokumen.** Tapi sekadar **angka** kandidat per vacancy memberi insight besar tanpa beban ATS:
`Sourced: 5 · Interviewed: 2 · Offered: 1 · Declined: 1 (alasan: gaji)`.
Membedakan dua kemacetan yang terlihat sama: *"0 kandidat di-source"* (masalah sourcing) vs *"5 kandidat menolak offer"* (masalah offering/gaji). Cukup counter + alasan decline. Tetap ringan.

### 1.5 Verifikasi "Joined" oleh Internal (anti-gaming)
Agency menandai *Joined* → status jadi **Joined (pending verification)**. Branch/PIC Internal mengkonfirmasi orangnya benar masuk & lolos onboarding → baru **Closed**. Tanpa ini, SLA bisa dimanipulasi dengan mark joined prematur.

### 1.6 Kualitas, bukan cuma kecepatan — **Early Attrition**
Agency yang mengisi cepat tapi orangnya resign dalam 2 minggu **lebih buruk** dari yang lambat tapi stabil. Lacak **early attrition** (joiner yang resign dalam 30/90 hari). Gabungkan jadi **Fulfillment Quality Score = kecepatan × retensi**. Ini yang membedakan agency bagus vs agency "asal isi".

### 1.7 Staleness ≠ Aging (deteksi "didiamkan")
Pisahkan dua metrik:
- **Age** = umur vacancy sejak open.
- **Idle days** = hari sejak update status terakhir.
Vacancy bisa masih muda tapi **didiamkan** (idle 6 hari tanpa gerak). Flag idle adalah sinyal paling awal bahwa agency lepas tangan — sering lebih actionable daripada aging.

### 1.8 Predicted fill date (proaktif, bukan reaktif)
Pakai rata-rata historis agency per stage tersisa untuk **memprediksi tanggal join** dan menandai *"diprediksi akan melewati SLA"* **sebelum** benar-benar lewat. Mengubah sistem dari "melaporkan kegagalan" menjadi "mencegah kegagalan".

### 1.9 Coverage risk (menghubungkan ke peta teritori SandraHub)
Ini sinergi besar: SandraHub sudah punya master **Region / Area / Branch / cluster**. Vacancy bukan sekadar "1 req kosong" — tapi **risiko coverage**: *"Area X sekarang 0 DSF aktif"*. Vacancy untuk area yang jadi **0 coverage** otomatis naik prioritas. Heatmap area under-covered = bahasa yang dimengerti manajemen bisnis, bukan bahasa HR.

### 1.10 Prioritas/kritikalitas vacancy
Tidak semua vacancy setara. Auto-derive prioritas: posisi **Branch Manager** atau area yang jadi **0 coverage** = *Critical*; 1 dari banyak DSF = *Normal*. Exception center mengurutkan berdasarkan **prioritas × aging**, bukan aging saja.

### 1.11 Nudge & eskalasi otomatis (pakai notif yang sudah ada)
- Tidak ada update > X hari → reminder ke PIC Agency.
- Lewat SLA → email eskalasi ke RM, lalu NM (eskalasi bertingkat).
TraceHub sudah punya `notificationService` — tinggal disambung. Ini yang membuat sistem "bekerja sendiri".

---

## 2. Modul (versi yang sudah dipertajam)

### Modul 1 — Manpower Master
Sumber kebenaran manpower aktif. Field inti sesuai rencana Anda (Employee ID, Nama, Email corp/personal, HP, Region/Area/Branch, Posisi, Agency, PIC Agency, Join Date, Status).
**Tambahan penting:**
- `seat_id` / kode posisi → agar satu "kursi" punya riwayat (siapa saja yang pernah mengisi). Membuat replacement chain & coverage akurat.
- `tenure` otomatis dari Join Date (input ke early-attrition).
- Sumber data: import massal (TraceHub sudah punya pola import wizard) + edit manual.

### Modul 2 — Vacancy Management
Vacancy lahir dari **dua** sumber, bukan satu:
1. **Replacement** — otomatis saat manpower di-set *Resign* (link ke `seat_id` & employee yang keluar).
2. **New headcount** — penambahan posisi baru (input manual). *Rencana awal Anda hanya cover resign — ini gap.*

Field: Vacancy ID, Position, Region/Area/Branch, Agency, Jenis (Replacement/New), Open Date, **Target Date** (kalau ada, mis. sebelum campaign), Priority, Current Stage, SLA total, **Age**, **Idle days**, **SLA owner saat ini**.

### Modul 3 — Progress Tracking (core)
Pipeline stage **configurable** (disimpan di tabel, bukan hardcode) agar proses bisa berubah tanpa ganti kode. Tiap stage punya: nama, urutan, **owner default** (Agency/Internal), **target hari**.

Pipeline default:
`Vacant → Agency Notified → Searching → Candidate Available → Interview Scheduled → Interview Passed → Offering → Joining Prep → Joined(pending verify) → Verified/Closed`
Dengan cabang status akhir: `Closed-Filled`, `Closed-Cancelled` (kebutuhan dibatalkan), `On-Hold` (di-pause sah, jam berhenti).

Setiap transisi mencatat: **dari→ke, oleh siapa, kapan, alasan (jika blocker), counter kandidat**. Update agency = 1 tap "Maju ke tahap berikut" (+ optional reason). Mobile-friendly.

### Modul 4 — Aging & Staleness
Dua dimensi (lihat 1.7). Pewarnaan aging tetap seperti rencana Anda (🟢 0–7 / 🟡 8–14 / 🟠 15–30 / 🔴 >30), **tapi berbasis Agency-owned days** (stop-clock), bukan kalender mentah. Idle days punya threshold sendiri (mis. ⚠️ >5 hari tanpa update).

### Modul 5 — Dashboard (exception-first)
**Layar utama = Action Center**, bukan tabel:
> 🚨 18 Vacancy Over SLA
> ⚠️ 7 Vacancy idle > 5 hari
> 🔴 Agency ABC rata-rata 42 hari (target 30)
> 🔴 Area Y → 0 coverage DSF
> 🟠 5 Vacancy diprediksi akan lewat SLA minggu ini

Lalu roll-up: **Total/Active/Vacancy/In-Progress/Filled bulan ini/Over-SLA**, drill-down **per Agency / per Region**. Plus **Timeline view** (gaya pelacakan paket) per vacancy — ini bagus, pertahankan, dan tandai stage yang jadi bottleneck.

---

## 3. Analitik yang benar-benar dipakai (bukan vanity)
- **Average Fulfillment Time** — total, dan dipecah **Agency-time vs Internal-time** (kunci keadilan).
- **Open Vacancy by Aging** — distribusi (funnel/histogram).
- **Top Bottleneck Stage** — stage yang paling sering menahan (mis. mayoritas mandek di *Searching*).
- **Agency Scorecard / Leaderboard** — avg fill time, over-SLA rate, **quality (retensi)**, **responsiveness (avg jeda update)**. Bisa jadi dasar alokasi vacancy berikutnya.
- **Reason-code analytics** — root cause kenapa lama (gaji? area? approval internal?).
- *(Sekunder)* Turnover trend — berguna sebagai konteks, **bukan inti**. Jangan jadikan headline; inti sistem adalah fulfillment.

---

## 4. Roles & Permissions — model berlapis (Circle → Region → Agency)

Empat lapisan, semua bisa **tracking sesuai tingkatannya** (scope Circle / Region):

| Lapisan | Role (kode usulan) | Scope | Wewenang |
|---|---|---|---|
| 1. Super Admin | `spm_sumatera` (sudah ada) | Circle Sumatera (semua) | **Upload IOH_territory**, kelola master (agency, stage/SLA, mapping agency↔region↔tipe), lihat semua. |
| 2. Salesforce Mgmt Sumatera | `sfm_sumatera` | **1 Circle = Sumatera** | **Alokasi manpower se-Circle Sumatera** (lintas 3 region), action center & scorecard level circle. |
| 3. Region Salesforce Mgmt | `rsfm_nsa` / `rsfm_ssa` / `rsfm_csa` | **1 Region** (North / South / Central Sumatera) | **Alokasi & monitoring di region-nya saja**, verifikasi join, eskalasi. |
| 4. Agency | `agency_pic` | Hanya **vacancy agency-nya** (di region & tipe yang ditugaskan) | **Pengisian manpower**: update stage, reason, counter kandidat. Tidak lihat agency lain. |

Catatan: scope difilter konsisten dari **kolom Region/Circle territory** (lihat §5/§8). Reuse user/profile & RBAC SandraHub yang ada — tambah role baru, jangan bikin sistem dari nol.

---

## 4b. Tipe Manpower (sub-menu) & Pemetaan Agency

Manpower sales terdiri dari beberapa **tipe**, masing-masing jadi **sub-menu** tersendiri:
- **DSF** ← *Fase 1 (yang dibangun dulu)*
- **DSE**
- **GSE & AE** (digabung jadi satu)

> Siapkan kerangka sub-menu untuk **keempat** (DSF, DSE, GSE+AE) sejak awal; hanya DSF yang difungsikan penuh di Fase 1, sisanya placeholder "segera".

**Agency berbeda per (tipe × region)** — tidak satu agency untuk semua. Contoh nyata:
- **DSF**: semua region → **Staffinc**.
- **DSE**: North Sumatera → **Staffinc**; region lain → **agency masing-masing**.
- **GSE & AE**: agency terpisah lagi (per region).

Karena itu pemetaan agency harus **data, bukan hardcode**: tabel `mf_agency_mapping(manpower_type, region, agency_id)`. Saat membuat vacancy untuk tipe+region tertentu, agency default otomatis terisi dari mapping ini.

---

## 5. Sketsa data model (Supabase)
- **`manpower_type`** (enum: `DSF` | `DSE` | `GSE_AE`) hadir di `mf_manpower`, `mf_vacancies`, `mf_territory` → semua bisa difilter per tipe (sub-menu).
- **`mf_agency_mapping`** (`manpower_type`, `region`, `agency_id`) — agency default per kombinasi tipe×region (mis. DSF/semua→Staffinc; DSE/NSA→Staffinc, lain→agency sendiri).
- `mf_manpower` (master; punya `seat_id`, `manpower_type`, status, join/resign date)
- `mf_agencies`, `mf_agency_pics`
- `mf_vacancies` (sumber: replacement→link manpower / new headcount; `manpower_type`, region, priority, target_date, current_stage, sla owner)
- `mf_stages` (definisi configurable: order, owner_default, target_days)
- `mf_vacancy_events` (audit trail: vacancy_id, from_stage, to_stage, actor, role, reason_code, note, candidate_counters_snapshot, ts) — **single source untuk timeline, aging, idle, dan semua analitik**
- `mf_reason_codes` (master alasan/blocker)
- `mf_candidate_counters` (per vacancy: sourced/interviewed/offered/declined + decline reason) — opsional Fase 2
- View/materialized view untuk dashboard (aging, idle, over-SLA, agency scorecard).

Semua waktu & metrik diturunkan dari `mf_vacancy_events` → tidak ada angka yang "dihitung manual" dan bisa salah.

---

## 6. Yang sebaiknya DI-EXCLUDE (biar tetap ramping)
- ❌ Upload CV / dokumen / kontrak. (Sesuai keinginan Anda — benar.)
- ❌ ATS penuh: penjadwalan kalender interview, profil kandidat, scoring. Cukup **counter + reason**.
- ❌ Payroll, kontrak, onboarding checklist detail.
- ❌ Proses recruitment sungguhan (job posting, sourcing channel). MFTS hanya **tracking**.
- ❌ Report builder generik di v1. Sediakan beberapa view yang sudah pasti dipakai + export CSV.
- ❌ Menjadikan turnover analytics sebagai fokus utama (geser ke sekunder).

---

## 7. Saran fase (biar cepat ada nilai)
**Fase 1 — MVP (nilai inti):** Manpower Master + Vacancy (replacement & new) + Stage tracking ber-timestamp + Aging/Idle + **Action Center** + roles dasar + Timeline view.
**Fase 2 — pembeda:** Stop-clock SLA (owner per-stage) + reason codes + candidate counters + nudge/eskalasi otomatis + Agency Scorecard.
**Fase 3 — decision support:** Predicted fill date + quality/early-attrition score + coverage heatmap (sambung peta teritori) + stage configurable via UI.

---

## 8. Catatan integrasi ke SandraHub / TraceHub
- Sub-menu baru di dashboard SandraHub (mis. rute `/dashboard` section baru atau `/mfts`), reuse tema, token desain, Supabase, dan RBAC yang sudah ada.
- Reuse **master teritori** (Region/Area/Branch/cluster) yang sudah ada agar konsisten dan mengaktifkan coverage view.
- Reuse `notificationService` untuk nudge & eskalasi.
- Update agency dibuat sangat ringan (mobile-first), idealnya cukup dari HP.

---

## 9. STATUS IMPLEMENTASI (per 2026-06-28) — handoff untuk sesi/akun berikutnya

> Untuk yang melanjutkan: web SandraHub ada di repo `tracehub` (Next.js 16, app router, `--webpack`, deploy Vercel). Supabase = project **TraceHub**, id `kqxnoovrwaxsnpdynbgi` (akses via MCP Supabase). Excel dibaca di browser pakai **SheetJS (`xlsx@0.18.5`)**; **menulis** .xlsx terkunci pakai **`exceljs@4.4.0`** (sudah di `package.json` — jalankan `npm install` setelah pull). Komponen MFTS inline-styled, terima props `{ supabase, theme('dark'|'light'), profile, scopeRegion, ... }` + palet sendiri via `mk(d)`, font DM Sans.
>
> **Cara test RLS** (rollback): `begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"<uuid>"}',true); … ; rollback;`. Helper SECURITY DEFINER baca `profiles` utk `auth.uid()`.

### ✅ SUDAH SELESAI

**Hierarki & role (4 lapis) — SUDAH dibuat:**
- L1 `spm_sumatera` (super admin). L2 `salesforce_mgmt_sumatera` (se-Circle). L3 `region_sfm_north` / `region_sfm_central` / `region_sfm_south` (per-region). L4 `agency` (eksternal).
- Role baru ditambah ke `app/sandra/register/page.jsx` (grup "Salesforce Management (Pemenuhan Manpower)" + "Agency") dan constraint `access_codes.valid_access_role` diperluas. `app/dashboard/page.jsx`: `SFM_ROLES`, `canMfts = isSPM || isIOHAny || isSFM`, peta `region_sfm_* → region` untuk scoping (`scopeRegion`), dan **early-redirect** `role==='agency' → /agency`.

**Auth Agency via kode registrasi (meniru "Kode Otoritas") — SUDAH:**
- Tabel `mf_agency_codes` (kode `AGN-XXXX-XXXX`, agency, label, revoke). Tab admin **Kode Agency** (`MFTS_AgencyCodes.jsx`, spm-only) untuk generate/list/revoke/copy.
- `app/agency/register/page.jsx` (validasi kode → OTP), `app/api/agency/validate-code/route.js` (public, service-role), `app/api/verify-otp/route.js` diperluas (role agency → set `profiles.mf_agency_id`, tandai kode terpakai, rollback user bila kode invalid). `app/agency/page.jsx` = portal agency (list vacancy ter-RLS + AdvanceModal).

**RLS `mf_*` — SUDAH dipersempit** (dulu permissive `authenticated` penuh):
- Helper: `mf_is_internal()`, `mf_my_region()`, `mf_can_edit_alloc(region)` (true utk spm/L2 semua; L3 hanya region-nya; circle/null hanya spm/L2).
- Policy `mf_*` = **internal-or-own-agency** (agency hanya lihat vacancy agency-nya). Teruji via rollback sim (agency lihat 1 vacancy bukan 2, 0 mapping, tak bisa insert vacancy; spm lihat semua; region_sfm hanya region-nya).

**Database lain yang sudah ada/ditambah:**
- Inti: `mf_agencies`, `mf_manpower` (punya `seat_id`, `manpower_type`, `mc_cluster`; PII phone/email **belum di-mask**), `mf_stages` (10 tahap ter-seed), `mf_reason_codes` (8 alasan), `mf_vacancies` (+`manpower_type`,`mc_cluster`,`brand`,`pair_cluster`), `mf_vacancy_events` (audit = sumber kebenaran).
- `mf_territory` (unik `brand`+`kec_id`; brand/kec_id/mc_cluster/branch/area/region/circle/first_seen/last_seen/active) + `mf_territory_uploads`.
- **`mf_territory_clusters`** = VIEW `security_invoker` DISTINCT (manpower_type,brand,mc_cluster) → **244 cluster** (122 IM3 + 122 3ID). Dibuat khusus utk hindari cap 1000-baris saat fetch territory mentah. **Frontend alokasi WAJIB baca dari view ini, bukan `mf_territory`.**
- `mf_agency_mapping` (tipe×region→agency), di-seed DSF→Staffinc 3 region.
- **`mf_allocation`** (target per cluster): `manpower_type, mc_cluster, brand, region/area/branch, target_count, pair_cluster, pair_brand`; UNIQUE(manpower_type, mc_cluster); RLS edit = `mf_can_edit_alloc(region)`.
- **`mf_hybrid_map`** (mapping hybrid, TANPA target): `manpower_type, scope_level(circle|region|area|branch|cluster), scope_value, region`; UNIQUE(manpower_type,scope_level,scope_value); RLS edit region-scoped. Teruji rollback.

**Frontend MFTS (`app/dashboard/components/`):**
- `MFTS_Module.jsx` — tabs **Vacancy · Alokasi · Manpower · Territory · Mapping Agency · Kode Agency(spm)**; sub-tab tipe **DSF / DSE / GSE_AE** (DSF fungsional, lain placeholder). Action Center + tabel vacancy + Maju stage + On-Hold + Tambah Vacancy (auto-agency dari mapping). `agencyOf` memo dari `mf_agency_mapping`. Semua view di-scope `scopeRegion` (L3).
- `MFTS_Manpower.jsx` — master manpower + **Resign → auto-buat vacancy replacement** (agency dari mapping, seat_id, prev_employee, event open). Ter-scope region.
- `MFTS_AgencyCodes.jsx` — admin kode agency (spm-only).
- `MFTS_Territory.jsx` — upload IOH Territory (.xlsb/.xlsx) di browser (tak berubah).
- **`MFTS_Allocation.jsx`** (BARU, fokus banyak iterasi):
  - Kolom urut **Brand · MC/Cluster · Branch · Area · Region · Kuota · Terisi · Vacancy · Gap · aksi**. Brand badge IM3(magenta)/3ID(oranye)/Hybrid(biru).
  - **Kuota** inline-edit → upsert `mf_allocation` (on conflict manpower_type,mc_cluster). **Generate** = buat `gap = target − terisi − open` vacancy (kind new, mc_cluster, agency dari mapping, seat_id, first stage, event open).
  - **Scope edit**: Sumatera (spm/L2) semua region; L3 hanya region-nya (input/tombol terkunci di luar region) — DB RLS juga menegakkan.
  - **Excel massal**: `Unduh Excel` → POST `app/api/mfts/allocation-template/route.js` (exceljs) menghasilkan .xlsx **sheet terkunci** (kolom Brand/MC-Cluster/Branch/Area/Region + kolom **Key**=`brand|cluster` utk XLOOKUP **read-only**; hanya **Target** editable, sorot kuning, validasi ≥0). `Unggah Excel` → baca pakai SheetJS → upsert target per cluster (out-of-scope/tak dikenal dilewati + ringkasan).
  - **Filter ala-Excel (cascading)** per kolom kategorikal: dropdown checkbox + cari; opsi kolom lain menyusut sesuai filter aktif (`optionsFor(k)` abaikan filter kolom sendiri); ada **Hapus filter** + indikator "X dari Y baris". Dropdown render `position:fixed` (anti-clip).
  - **Hybrid = MAPPING saja** (tombol Hybrid → `HybridMapModal`): tambah rule level **cluster/branch/area/region/circle** (circle hanya spm/L2), **tanpa kuota**. Saat suatu cakupan hybrid, pasangan IM3(`MC-…`)+3ID(`CS …`) **digabung jadi 1 baris brand "Hybrid"** dinamai **MC-** (base-name 1:1 terverifikasi 122 pasangan). Terisi/Vacancy/Gap dijumlah dari kedua anggota; kuota disimpan di cluster MC- kanonik (brand `HYBRID`). Cluster-level option menampilkan nama `MC-` saja (pasangan 3ID ikut otomatis via `baseName`).

**Update 2026-06-28 — Alokasi per-bulan & keamanan upload territory:**
- **Alokasi sekarang per-period (bulan).** `mf_allocation` dapat kolom `period` (YYYYMM); unique diganti jadi `(manpower_type, mc_cluster, period)`. `mf_vacancies` dapat `target_period` (bulan yang dipenuhi seat; null = legacy/bulan berjalan). Migrasi `mfts_allocation_period`.
- **`MFTS_Allocation.jsx`**: switcher bulan (default **bulan depan** — pemenuhan diselesaikan sebelum bulan berjalan), prev/next + chip "Bulan ini/Bulan depan". **Carry-forward**: target bulan baru otomatis **mewarisi** angka bulan sebelumnya (`effAlloc` = period ini ?? bulan lalu), ditandai badge "warisan" (input dashed); tombol **Salin dari {bulan lalu}** memmaterialkan warisan ke rows konkret. Gap/generate/total/Excel semua period-aware; vacancy digenerate menyimpan `target_period`. Open-vacancy dihitung per-period (legacy null hanya pada bulan berjalan).
- **`MFTS_Territory.jsx` aman saat upload bulan baru**: (1) **preserve-on-blank** — region/area/branch/mc_cluster lama tidak ditimpa nilai kosong dari file baru (hanya nilai non-kosong yang berbeda yang menang); (2) **peringatan hybrid** sebelum simpan — daftar cluster ter-hybrid (mis. region *Central Sumatera*) yang akan kehilangan cakupan atau berubah geo. Jadi hybrid yang sudah di-set tetap aman walau territory bulan berikutnya diunggah.
- **Vacancy — Roster DSF via Excel** (`MFTS_Module.jsx` + route `app/api/mfts/roster-template/route.js`): tombol **Unduh/Unggah Roster** di toolbar Vacancy (DSF). Kolom: `BRAND, ID_DSF_IM3, ID_DSF_3ID, ID_STAFFINC, NAMA_DSF, MC, BRANCH, REGION, CIRCLE, ID_STAFFINC_TL, NAMA_TL` (+ `Key`=seat_id tersembunyi/terkunci utk matching). **1 baris per seat** (gabungan open-vacancy + manpower aktif) — seat **vacant tetap muncul**; **hybrid 1 baris** (Brand "Hybrid", ID IM3 & 3ID terpisah → tidak double). Identitas (Brand/MC/Branch/Region/Circle) terkunci; isian DSF/TL sorot kuning. **Unggah** upsert `mf_manpower` per `seat_id` (cluster asli direkonstruksi dari seat_id `…-DSF-NN`), set agency dari mapping, dan **menutup vacancy** seat itu (`closed_filled` + event) agar gap alokasi konsisten. Migrasi `mfts_manpower_dsf_roster_fields` (+kolom brand/id_dsf_im3/id_dsf_3id/id_staffinc/id_staffinc_tl/nama_tl/circle) & unique `(manpower_type, seat_id)`. (Excel progress stage/status lama digantikan; edit stage tetap via tombol "Maju".)
- **Progress bar % untuk operasi massal**: komponen `MFTS_Progress.jsx` (bar + persentase + "done/total"). Dipasang di: **Unggah Roster** (Vacancy), **Unggah Excel target** & **Buat semua seat** & **Salin target** (Alokasi), **Simpan territory**. State `prog={done,total,label}` diupdate tiap iterasi loop (await per item → React re-render live).
- **FIX duplikat di portal Agency + kejelasan periode**: akar masalah = `mf_vacancies` menumpuk banyak baris per seat (354 baris utk 177 seat; 331 `closed_filled` dari operasi roster/rekonsiliasi berulang). **Data dirapikan jadi 1 baris per seat** (filled→`closed_filled`, vacant→`open`; 176 duplikat dihapus, event cascade). Portal Agency kini: buang `closed_cancelled`, **dedupe per seat_id**, "Terisi" hanya utk `closed_filled`, + kolom **Periode** (mis. "Jul 2026") biar jelas. Aturan umum seluruh flow: **1 seat = 1 baris** (terisi via manpower, vacant via 1 open vacancy).
- **Alur Agency: Join → Verifikasi internal**: saat agency maju ke stage **"Joined (pending verify)"**, modal minta identitas joiner (NAMA_DSF + ID_DSF_IM3/3ID + ID_STAFFINC + TL; hybrid wajib 2 ID) → disimpan di **vacancy** (agency tak boleh tulis manpower; `joined_name` kolom baru, migrasi `mfts_vacancy_joined_name`). Internal melihat baris ber-badge **VERIFIKASI** di tab Vacancy → **Verifikasi** membuat `mf_manpower` (active, dari identitas seat) + tutup seat (`closed_filled`, stage Verified); **Tolak** mengembalikan ke Joining Prep. Anti-gaming + tanpa upload ulang. Agency dropdown stage tak bisa pilih stage terminal. Modal agency mewajibkan **reason code** bila stage tidak maju (macet). **Beranda agency "Perlu tindakan"**: panel exception-first (over-SLA → idle) dengan tombol Tindak langsung.
- **Urutan hierarkis di semua tabel**: data diurut **Region → Area → Branch → MC/Cluster → Brand** (cakupan terluas ke tersempit) di Alokasi, Roster/Manpower (internal & agency), dan Vacancy (internal & agency) → mudah dipindai tanpa filter/cari.
- **TL & ID lengket di seat vacant + filter di SEMUA kolom**: `mf_vacancies` ditambah `id_staffinc, id_staffinc_tl, nama_tl` (migrasi `mfts_vacancy_sticky_staffinc_tl`) → roster upload/download, resign, dan baris vacant di Roster menyimpan/menampilkan TL + ID STAFFINC (lengket walau vacant; data lama yang dipair ke seat vacant perlu **re-upload roster** karena dulu belum ada kolomnya). **Filter ala-Excel kini di SETIAP kolom** di semua tabel: Roster/Manpower (internal & agency), Vacancy (internal & agency), dan Alokasi (termasuk Kuota/Terisi/Vacancy/Gap via field numerik `fkuota/fterisi/fvac/fgap`).
- **ID DSF lengket di seat + Vacancy = to-do agency**: `mf_vacancies` dapat kolom `id_dsf_im3`/`id_dsf_3id` (migrasi `mfts_vacancy_sticky_dsf_ids`). ID **menempel di seat**: resign menyalin ID dari manpower ke vacancy; roster (download tampil, upload simpan) menjaga ID walau seat VACANT; **boleh diganti / boleh kosong** (seat baru yang ID-nya belum dibuat automation). Tab **Vacancy kini hanya menampilkan seat yang belum terisi** (status bukan `closed%`) — yang sudah terisi tak muncul. Ditambah kolom **ID_DSF_IM3 & ID_DSF_3ID** (inline-edit, simpan ke vacancy) untuk menandai DSF mana yang sebenarnya diisi. **Portal Agency (`app/agency/page.jsx`) di-tab seperti SPM**: dipisah tab **Vacancy** (seat perlu diproses, tombol Maju) dan **Manpower** (roster DSF aktif agency, read-only). Keduanya pakai **filter ala-Excel bersama** (`MFTS_TableFilter`: Select All/Apply/draggable) — Vacancy difilter Brand/MC/Region/Branch/Periode/Stage; Manpower difilter Brand/MC/Branch/Region/Circle. Agency baca `mf_manpower` via RLS own-agency. Stat "Perlu diisi"/"Sudah terisi" jadi badge angka di tab.
- **Filter ala-Excel disempurnakan (semua tab MFTS)**: `MFTS_TableFilter.FilterMenu` kini punya **(Pilih Semua)** di atas (check/uncheck semua, indikator partial), **TIDAK auto-apply** → tombol **Terapkan** & **Bersihkan**, dan popup **bisa digeser** (drag header). Alokasi di-refactor memakai FilterMenu bersama ini (hapus filter lokalnya) supaya perilaku seragam di Vacancy, Manpower (Roster), dan Alokasi.
- **Kolom seragam + filter ala-Excel di semua tab**: komponen baru `MFTS_TableFilter.jsx` (cascading checkbox + cari + **Pilih semua / Hapus semua**). **Manpower** kini = **Roster DSF per seat** (terisi + vacant) dgn kolom seragam `BRAND · ID_DSF_IM3 · ID_DSF_3ID · ID_STAFFINC · NAMA_DSF · MC · BRANCH · REGION · CIRCLE · ID_STAFFINC_TL · NAMA_TL · STATUS` + filter tiap kolom; form Add/Edit diperluas dgn field roster; toggle tampilkan resign. **Vacancy** dapat kolom Brand/MC/Region + filter ala-Excel yang sama. **Alokasi** sudah punya filter. ManpowerForm/Roster simpan ke kolom `mf_manpower` yang sama dgn roster Excel → konsisten lintas tab.
- **"VACANT" = kursi kosong (bukan orang)**: di roster, `NAMA_DSF="VACANT"` (atau kosong) **tetap vacant** walau kolom lain terisi. Upload: hanya nama nyata yang jadi manpower + menutup vacancy; baris VACANT → hapus manpower seat itu (bila ada) & buka kembali vacancy-nya. Download: kursi kosong ditandai `NAMA_DSF=VACANT`, kolom DSF/TL kosong. Hitung "terisi" di Alokasi **mengecualikan** nama VACANT. (Rekonsiliasi data lama: 22 manpower "VACANT" dihapus, duplikat open seat ditutup → 155 terisi + 22 vacant = 177 target, 0 over/under.)
- **FIX duplikasi seat lintas bulan + alur kurangi kuota**: `openVac` kini dihitung **global per cluster** (bukan per `target_period`), sehingga target bulan berikutnya yang **sama → gap 0** (tak buat seat baru/duplikat); hanya **penambahan** target yang membuat seat (delta). Kurangi kuota: `saveTarget` **memblokir** target < jumlah terisi (harus pindahkan/keluarkan DSF dulu via Manpower); jika kelebihan ada di seat **open**, muncul tombol **Tutut N seat** (batalkan `closed_cancelled` + event; prioritas seat belum digarap lalu terbaru). Kolom Gap menampilkan `+N` (amber) saat kelebihan, dan badge "Terisi X > kuota Y" saat over-filled.
- **UX Alokasi**: (a) **period tidak lagi melompat** saat pindah tab — disimpan di cache level-modul (`PERIOD_CACHE`) karena komponen di-unmount tiap ganti tab; (b) **banner period sticky & menonjol** ("Sedang mengedit alokasi bulan: …") di atas tabel agar tak salah edit bulan; (c) tombol **Buat semua seat · N** (massal) untuk semua cluster ber-gap dalam wewenang/filter sekaligus, tidak satu-satu — muncul otomatis setelah unggah Excel target. Lock bulan ≥ `LOCK_START` (Juni 2026).
- **FIX cap 1000-baris pada diff territory**: fetch existing `mf_territory` di `generate()` dulu tak ber-paginate → Supabase batasi 1000 baris, jadi baris >1000 (mis. 3838−1000 = 2838) keliru terdeteksi "BARU". Sekarang di-paginate `.range()` per 1000 sampai habis, jadi re-upload file sama = 0 kec/cluster baru.
- **Re-upload territory aman dari "cluster baru" palsu**: identitas baris territory = `brand|kec_id` (kecamatan), jadi upload bulan depan dgn format terpisah **MC (IM3)** & **CS (3ID)** tidak pernah dianggap kecamatan baru. Nama cluster dirapikan spasi-ganda (`\s+`→` `) saat baca, plus preview kini menampilkan **diff level cluster** ("0 cluster baru ✓" / "N cluster baru") agar bisa dipastikan re-upload = 0 cluster baru. Vacancy hasil generate juga pakai label `MC-` di `position`.
- **Label MC- untuk SEMUA baris alokasi**: nama cluster yang ditampilkan selalu `MC-<base>` (termasuk non-hybrid 3ID yang aslinya `CS …`); brand badge (IM3/3ID/Hybrid) yang membedakan. `key`/`mc_cluster` internal tetap nama asli agar cocok dgn territory/manpower/vacancy. Excel template ikut menampilkan label `MC-`, dan upload dicocokkan via **Brand + label** (`byLabel`) supaya pasangan IM3/3ID base-sama tak bentrok. Filter & search pakai label.
- **Kanonik MC- deterministik**: baris hybrid di alokasi selalu dinamai/di-key `MC-<base>` (bukan tergantung brand mana yang kebetulan ada bulan itu) → alokasi & rule stabil lintas upload. Upload territory tetap memisahkan **MC (IM3)** dan **CS (3ID)**; saat **breakdown disimpan**, rule hybrid level-cluster **otomatis dinormalkan** ke `MC-<base>` (dedup + update di `save()` `MFTS_Territory.jsx`). Opsi cluster di HybridMapModal juga kanonik `MC-` (IM3 & 3ID ikut via `baseName`).

### ⛔ BELUM — rencana lanjutan (urut prioritas)

1. **DSE & GSE_AE** difungsikan (saat ini placeholder; kerangka tab + mapping sudah ada). Perlu data territory/agency per tipe.
2. **Manpower Master UI lengkap** (CRUD + **import massal**) — sekarang baru list + resign.
3. **Verifikasi "Joined" oleh Internal** (anti-gaming): agency mark joined → *pending verify* → Internal Branch/PIC konfirmasi → Closed.
4. **Stop-clock SLA per-owner** (Agency-time vs Internal-time). Owner sudah dicatat di event; belum dihitung jadi waktu terpisah.
5. **Timeline view per vacancy** (gaya pelacakan paket) dari `mf_vacancy_events` + tandai bottleneck.
6. **Analitik**: Agency Scorecard (avg fill, over-SLA, retensi/early-attrition, responsiveness), reason-code analytics, predicted fill date, **coverage heatmap** (sambung territory + alokasi: area 0-coverage auto-prioritas).
7. **Nudge & eskalasi otomatis** (reuse `notificationService`).
8. **PII masking** `mf_manpower` (HP/email) — pola seperti MSISDN di dsf-dashboard.

### ⚠️ Gap kritis (penentu adopsi) — belum dibangun
- **Cara update di lapangan** ringan — WhatsApp/Telegram atau magic-link tanpa login.
- **Alur sanggah atribusi SLA** (mirip "Laporkan" di PNL) agar agency percaya angka.
- **SLA & eskalasi sisi Internal** (jangan jadi black-hole saat jam agency pause).
- **Anti-gaming**: aturan On-Hold (siapa/durasi/auto-resume), cegah backdating, pantau distribusi reason-code.
- **Hari kerja + kalender libur** (Lebaran dll) untuk SLA, bukan kalender mentah.

### Catatan teknis & migrasi
- Migrasi Supabase terkait MFTS sudah diterapkan: agency-auth foundation, `mf_*` RLS rework, `mfts_allocation` (+`mc_cluster` di manpower/vacancies), `mfts_allocation_brand_hybrid` (brand/pair cols + backfill), `mfts_territory_clusters_view`, `mfts_hybrid_map`, **`mfts_allocation_period`** (`period` di alokasi + `target_period` di vacancy + unique baru). RLS `mf_allocation` tetap region-based (tak berubah; kolom `period` di luar predikat RLS).
- `exceljs` ditambahkan ke `dependencies` — **wajib `npm install`** sebelum build/deploy.
- Verifikasi tanpa build penuh: parse JSX via `@babel/parser` (plugin jsx) + simulasi logika via node; RLS via rollback sim. Belum ada `next build` end-to-end di sesi ini.
- Lint `set-state-in-effect` muncul di komponen MFTS (sama seperti `page.jsx`) — tidak memblokir build.
- Default kolom territory hanya tebakan; user pilih sendiri tiap upload.
