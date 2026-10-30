# Analisis Sampel: Penilaian Visibility Branding dari Foto Outlet

Saya ambil 4 outlet dari file `MartaHub_DataSubmission_LinkFoto_2026-10-29_8_FOTO.xlsx` yang baru diupload, lalu saya buka langsung foto etalase & tampak depannya satu per satu untuk menilai visibility branding IM3/3ID secara manual (sebagai contoh cara kerja "model" penilaian sebelum dibangun otomatis). **Jawabannya: bisa**, dan hasil 4 contoh di bawah menunjukkan datanya memang cukup kaya untuk dinilai otomatis — termasuk menemukan kasus penting: beberapa outlet "pasang nama" IM3/3ID tapi etalasenya justru dikuasai banner kompetitor.

## Metodologi skor (0–100, mengikuti 5 kolom yang sudah ada di Excel-mu)

| Komponen | Bobot | Yang dinilai |
|---|---|---|
| Poster | 20 | Jumlah & ukuran poster IM3/3ID yang terlihat jelas, tidak tertutup |
| Shopblind (papan nama/etalase) | 20 | Apakah elemen paling dominan di depan toko branding IM3/3ID atau malah kompetitor |
| Flagchain | 20 | Ada/tidaknya untaian bendera kecil bermerek |
| Table Mate / Tent Card | 20 | Kartu meja kasir ber-branding |
| Sticker Etalase | 20 | Stiker kaca/etalase ber-logo |

## Hasil 4 outlet sampel

| Outlet | Foto diperiksa | Skor Visibility | Temuan |
|---|---|---|---|
| **DAMAR PONSEL** | etalase1, tapak_depan1 | **4/100** | Shopblind penuh **SIMPATI/Telkomsel** ("TERBAIK UNTUKMU SIMPATI Rp35RIBU") — kompetitor menguasai elemen paling besar. Hanya ada 1 poster kecil IM3 "PAS" yang terhalang dekorasi lain. 3ID: nihil sama sekali. |
| **TIA PONSEL** | etalase1/2/3, tapak_depan1 | **4/100** | Etalase utama didominasi warna **Telkomsel + Smartfren**, nama toko sendiri ditulis di atas banner Telkomsel. IM3 cuma muncul lewat 1 stiker QR kecil di kaca. 3ID hanya tampak sebagai kartu produk di rak (bukan materi branding). |
| **MIRA CELL** | etalase1/2/3, tapak_depan1 | **0/100** | Tampak depan dikuasai banner **"DAP" (aksesoris)** dan **XL 5G+**. Tidak ada poster/shopblind/sticker IM3 atau 3ID sama sekali di bagian depan. Produk IM3 (SATSPAM) & 3ID (Happy) hanya terlihat di rak sebagai barang dagangan, bukan materi branding. |
| **YULI PONSEL** | tapak_depan1 | **44/100** | Outlet terbaik di sampel ini: ada poster IM3 harga paket (berdiri sendiri, jelas terbaca), poster 3ID "Tri kasih lebih", dan banner counter bertuliskan "Tri lebih hemat, sinyal cepat!" dua kali. Tidak ada banner kompetitor besar yang mengganggu. |

## Kesimpulan sampel ini

- **Paling kuat untuk IM3 dan 3ID sekaligus: YULI PONSEL** (44/100) — satu-satunya dari 4 sampel yang benar-benar punya poster dedicated kedua brand tanpa didominasi kompetitor.
- 3 outlet lain (**DAMAR PONSEL, TIA PONSEL, MIRA CELL**) skornya mendekati nol — bukan karena fotonya buram/kurang, tapi karena etalase mereka memang dikuasai materi kompetitor (Telkomsel/Simpati, Smartfren, XL, aksesoris pihak ketiga). Ini temuan yang justru actionable buat tim lapangan: 3 dari 4 outlet butuh re-deployment materi IM3/3ID.
- Perbandingan IM3 vs 3ID di sampel ini relatif seimbang di YULI PONSEL; di 3 outlet lain dua-duanya sama-sama lemah, jadi belum ada pola "IM3 selalu menang" atau sebaliknya — butuh sampel lebih besar untuk kesimpulan brand-level.

## Kalau mau dibangun jadi fitur otomatis di web

Ini sudah saya buktikan manual untuk 4 outlet dari ~1050 baris yang ada di file-mu. Untuk dibangun permanen (misal: tiap kali ada submission foto baru, sistem otomatis kasih skor + ringkasan tanpa saya buka satu-satu), yang perlu diputuskan:

1. **Provider AI vision** (mis. Claude vision via API, atau model vision lain) — ada biaya per gambar, perlu API key disimpan sebagai secret di Supabase Edge Function.
2. **Trigger**: dijalankan saat submit (real-time, nambah waktu tunggu user) vs batch terjadwal (lebih murah, hasil muncul agak delay).
3. **Output**: kolom skor yang sudah ada (Poster/Shopblind/Flagchain/Table Mate/Sticker) diisi otomatis + 1 kolom ringkasan teks + flag "didominasi kompetitor" seperti temuan di atas.
4. **Volume**: file ini saja ~1050 baris x sampai 4 foto = berpotensi ribuan panggilan AI vision kalau diproses semua sekaligus — perlu strategi batching/throttling biar tidak kena limit atau biaya membengkak.

Kalau mau lanjut ke tahap ini, saya bisa mulai dari milih provider & desain skema kolom barunya.
