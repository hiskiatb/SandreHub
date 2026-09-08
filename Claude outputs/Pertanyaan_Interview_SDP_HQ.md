# Daftar Pertanyaan untuk Interview Tim SDP HQ

Disusun dari analisis template `Simplified_SDP_Registration_Template_September.xlsx` (sheet `01_SDP_Registration`, `02_Termination_Main`, `03_Rebordering_Kec_Detail`, `04_Lists`, `05_Field_Guide`). Setiap pertanyaan menyasar kolom yang maknanya masih bisa ditafsirkan lebih dari satu cara, atau yang aturan pengisiannya tidak tertulis eksplisit di template.

---

## A. Submission Control

**1. SDP ID (New) & Pairing ID — didapatkan dari mana?**
Apakah kedua ID ini murni digenerate oleh sistem HQ setelah data disubmit, atau ada komponen yang diisi manual oleh Circle (misalnya kode singkatan wilayah)? Kalau digenerate HQ, apa aturan formatnya secara resmi — apakah sama dengan pola `[Identifier][KodePartner][YYMM][KodeCircle][UrutanSeq]` yang kami pakai di sistem kami sekarang, atau berbeda?

**2. Apakah "Registration Scope" menentukan ada/tidaknya Pairing ID?**
Field Guide menyebut Pairing ID "Required for Hybrid or pairing cases" — apakah ini berarti Pairing ID HANYA wajib diisi kalau Registration Scope = "Hybrid IM3+3ID", dan untuk "IM3 only"/"3ID only" kolom ini harus dikosongkan? Atau ada kasus non-Hybrid yang tetap butuh Pairing ID (misalnya migrasi antar partner)?

**3. Request Type — apakah "Update" dan "Hybrid Pairing" bisa terjadi bersamaan?**
Kalau sebuah SDP yang tadinya "IM3 only" mau ditambah jadi Hybrid, apakah dicatat sebagai Request Type = "Update" (karena SDP-nya sudah ada) atau "Hybrid Pairing" (karena menambah pairing baru)? Ini menentukan alur validasi mana yang berlaku.

**4. Submission Month vs Submission Date — mana yang jadi acuan cutoff Week 4/tanggal 25?**
Rules Pengisian menyebut "Data final wajib dikumpulkan ke HQ maksimal Week 4/sebelum tanggal 25" — cutoff ini dihitung dari Submission Date aktual, atau dari Submission Month (siklus bulanan)?

---

## B. Partner Identity

**5. SDP Name — apakah ada aturan penulisan/standardisasi resmi?**
Field Guide bilang "Use standardized SDP name; avoid abbreviations that are not nationally recognizable" — apakah ada daftar/pedoman resmi standar penamaan (misalnya format "SDP [Nama Wilayah]"), atau ini murni judgment Circle? Kalau ada draft SDP yang sudah pernah diajukan sebelumnya dengan nama berbeda, apakah nama itu harus konsisten dipakai selamanya, atau boleh direvisi di submission berikutnya?

**6. Customer Legal Name — sumber kebenarannya dokumen apa?**
Field Guide bilang "Must follow KTP/NPWP legal name" — kalau nama di KTP dan NPWP berbeda (kasus umum di Indonesia, misalnya NPWP pakai nama badan usaha), mana yang jadi acuan utama?

**7. KTP Number / NPWP Number — perlu validasi format checksum, atau cukup format panjang digit?**
Apakah HQ melakukan validasi otomatis (misalnya cek 16 digit KTP valid), atau validasi manual oleh reviewer HQ saat cek dokumen?

**8. Company Type & Status Company — apakah "Status Company: New/Existing" merujuk ke perusahaan atau ke SDP?**
"Existing" di sini artinya perusahaan partner-nya sudah pernah terdaftar sebagai partner IOH di lokasi lain, atau SDP-nya sendiri yang sudah ada (khusus Request Type = Update)?

---

## C. Location & Territory

**9. Kab/Kota — apakah harus persis sama dengan daftar wilayah resmi HQ (master territory), atau bebas isi teks?**
Kalau nama kabupaten yang ditulis Circle beda ejaan dengan master data HQ (misalnya "Kota Palembang" vs "Palembang"), apakah ditolak otomatis atau dikoreksi manual oleh reviewer HQ?

**10. Kecamatan Coverage — batas jumlah kecamatan per SDP, dan format penulisan multi-kecamatan?**
Kalau satu SDP mencakup banyak kecamatan, apakah ada batas maksimal? Format pemisahnya apa yang resmi (contoh di data pakai titik-koma ";") — apakah itu wajib, atau HQ punya cara parsing lain? Kalau kecamatan yang diisi ternyata sudah dicakup SDP lain (tumpang tindih), apakah itu otomatis ditolak sistem atau perlu dicek manual?

**11. Apakah kombinasi Circle/Region/Branch harus konsisten dengan hierarki wilayah resmi HQ?**
Field Guide bilang "Must follow operational territory owner" — territory resmi ini bersumber dari mana di sisi HQ (ada API/master data yang bisa kami sinkronkan), supaya validasi di sistem kami konsisten dengan territory HQ tanpa perlu Circle mengetik manual?

---

## D. Brand / System Requirement

**12. Need SAP Creation? / Need Oracle Creation? — formula-nya berdasarkan apa persis?**
Field Guide bilang "Auto-calculated based on Registration Scope" — apakah aturannya sesederhana: IM3 only → SAP saja, 3ID only → Oracle saja, Hybrid → keduanya? Atau ada pengecualian (misalnya SDP existing yang sudah punya akun tidak perlu create ulang)?

**13. Hybrid Type — nilai "DSE Still Not Hybrid", "BSM Still Not Hybrid", "HOS/HOR Still Not Hybrid" itu maksudnya apa?**
Ini istilah dari sheet `04_Lists` yang belum kami pahami konteksnya — apakah ini status transisi (SDP sedang proses jadi Hybrid tapi approval dari pihak DSE/BSM/HOS-HOR belum selesai)? Siapa yang mengubah status ini dari satu ke yang lain?

**14. SDP Type di sheet Termination & Rebordering hanya punya 2 pilihan (MITRA IM3 / 3KIOSK) — bagaimana untuk SDP yang Hybrid?**
Kami cek dropdown resminya di file Excel dan cuma ada 2 opsi. Untuk SDP yang sifatnya Hybrid dan mau di-terminate atau di-reborder, apakah dicatat 2 baris terpisah (satu per brand, seperti pola di sheet Registration), atau ada aturan lain yang belum tertulis di template?

---

## E. Bank & Finance

**15. Bank Account Number/Name — apakah harus atas nama Customer Legal Name yang sama persis, atau boleh berbeda (misal rekening pribadi PIC untuk badan usaha kecil)?**

**16. Commitment Fee Status — siapa yang mengubah status ini (Not Yet → Paid), dan berdasarkan bukti apa?**
Apakah ini diupdate manual oleh HQ setelah menerima bukti transfer, atau ada integrasi ke sistem finance/payment gateway? Kalau manual, dokumen bukti bayar disimpan di mana (di Main Document Folder yang sama, atau folder terpisah)?

---

## F. Document / Operational Readiness

**17. Main Document Folder Link — isi minimal apa saja yang wajib ada di dalam folder itu sebelum submission dianggap lengkap?**
Rules Pengisian menyebut dokumen mandatory: KTP, NPWP, Akta Pendirian, NIB/SIUP+SKDP+TDP (khusus badan usaha), Bank Account Number & Name, SPPKP, PKS. Apakah HQ mengecek satu-satu isi foldernya secara manual, atau ada checklist otomatis (nama file harus mengikuti pola tertentu, misalnya `KTP_SDPxxxx.pdf`)? Format link yang diterima harus Google Drive, atau bisa platform lain?

**18. Overall Mandatory Doc Status (formula, di sheet 02_Document_Checklist) — bagaimana relasinya ke Main Document Folder Link di sheet Registration?**
Field Guide menyebut sheet terpisah `02_Document_Checklist` yang tidak ada di template yang kami terima — apakah sheet ini memang sengaja tidak disertakan di versi "Simplified" ini, dan checklist dokumennya sekarang cukup lewat 1 link folder saja tanpa checklist per-dokumen di level row?

**19. Branding Update Required? — diputuskan oleh siapa?**
Field Guide bilang field ini "Required when Hybrid occurs or branding update is needed" — tapi siapa yang MEMUTUSKAN nilainya (Yes/No): Circle yang submit, atau HQ yang menilai setelah melihat kondisi fisik lokasi/foto SDP? Kalau Circle yang isi, berdasarkan kriteria/pedoman visual apa (ada SOP branding resmi)?

**20. Branding Status ("Aligned", "Need Update", "Mismatch", "Pending Decision", "N/A") — siapa yang menentukan status ini dan berdasarkan apa?**
Apakah ini hasil review foto/dokumentasi lokasi oleh HQ, atau self-assessment Circle? Kalau "Mismatch", ada SLA berapa lama untuk diperbaiki sebelum registrasi ditolak?

---

## G. HQ Status & Remarks

**21. Circle Submit Status — auto berdasarkan apa (kelengkapan field, atau submit action eksplisit)?**

**22. HQ Validation Status — SLA berapa lama biasanya dari submit sampai HQ update status ini?**
Ini penting untuk kami set ekspektasi ke Circle soal berapa lama harus menunggu sebelum menganggap ada yang macet.

**23. Final Registration Status — urutan status resminya seperti apa (Draft → On Progress → ... → Registered), dan apakah bisa "mundur" (misalnya dari On Progress kembali ke Need Revision)?**

---

## H. Sheet Termination & Rebordering (tambahan, di luar contoh Anda)

**24. "# KEC" (jumlah kecamatan) di sheet Termination — dihitung otomatis dari data existing SDP, atau diisi manual Circle saat submit terminasi?**

**25. "Kecamatan Return Completed?" & "Where the Kecamatan Return?" — apakah wajib diisi SEBELUM status Termination bisa "Approved", atau bisa menyusul setelah SDP resmi tutup?**

**26. Effective Date di Rebordering — apakah efektif berlaku otomatis di sistem HQ pada tanggal itu, atau perlu approval final dulu baru "aktif", meski tanggalnya sudah lewat?**

**27. Mapping Status di Rebordering — siapa pemilik status ini (Circle mengusulkan, HQ yang approve final)?**

---

## I. Pertanyaan lintas-sheet (arsitektur data)

**28. Apakah HQ punya master data wilayah (Circle/Region/Branch/Kab-Kota/Kecamatan) yang bisa kami sinkronkan berkala, supaya dropdown & validasi di sistem kami selalu konsisten dengan territory resmi HQ — tanpa Circle perlu mengetik manual dan berisiko typo?**

**29. Untuk SDP yang statusnya sudah "Registered" (live) di HQ tapi baru dicatat di sistem kami lewat fitur Import Data Awal — apakah HQ punya cara untuk kami cross-check kecocokan data (misalnya export terakhir dari HQ) supaya data baseline kami valid?**

**30. Kalau ada perbedaan data antara yang tercatat di sistem kami vs yang di HQ (karena proses manual/delay), sumber mana yang dianggap benar (source of truth) untuk keperluan operasional harian di Circle?**
