#!/bin/bash
# gabung-foto-zip.sh
#
# Gabungkan isi semua file ZIP "Foto_Etalase_dan_Tampak_Depan_Outlet_bagianXXX_*.zip"
# (hasil download "Download Foto (ZIP)" di Pendataan Outlet MartaHub, yang sekarang
# terbagi jadi banyak bagian karena diproses server-side) dari satu folder menjadi SATU
# folder baru yang isinya semua foto, tanpa sub-folder per bagian.
#
# Cara pakai:
#   1. Simpan script ini di mana saja, misal di Desktop.
#   2. Buka Terminal di Mac.
#   3. Kasih izin jalan (sekali saja):
#        chmod +x gabung-foto-zip.sh
#   4. Jalankan dengan path folder yang isinya file-file ZIP bagian tsb:
#        ./gabung-foto-zip.sh "/Users/nama-anda/Downloads"
#      (ganti path sesuai folder Downloads/folder tempat ZIP-ZIP itu disimpan)
#   5. Script akan membuat folder baru bernama "Foto_Gabungan" di DALAM folder yang
#      sama, isinya semua foto dari semua bagian ZIP sudah jadi satu.
#
# Kalau ada nama file foto yang sama persis di lebih dari satu ZIP (seharusnya tidak
# terjadi karena nama filenya sudah unik per outlet/jenis/tanggal), script ini akan
# otomatis menambahkan angka di belakang nama file supaya tidak saling menimpa.

set -euo pipefail

SRC_DIR="${1:-}"

if [ -z "$SRC_DIR" ]; then
  echo "Cara pakai: $0 /path/ke/folder/isi-zip"
  echo "Contoh    : $0 \"/Users/hiskia/Downloads\""
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "Folder tidak ditemukan: $SRC_DIR"
  exit 1
fi

# Normalisasi jadi absolute path
SRC_DIR="$(cd "$SRC_DIR" && pwd)"
OUT_DIR="$SRC_DIR/Foto_Gabungan"
TMP_DIR="$(mktemp -d)"

mkdir -p "$OUT_DIR"

# Cari semua file zip bagian (nama persis dari sistem: ..._bagianNNN_...zip),
# tapi fallback ke SEMUA .zip di folder tsb kalau tidak ada yang cocok pola itu -
# supaya tetap jalan kalau nama file sedikit berbeda.
shopt -s nullglob nocaseglob
ZIP_FILES=("$SRC_DIR"/*bagian*.zip)
if [ ${#ZIP_FILES[@]} -eq 0 ]; then
  ZIP_FILES=("$SRC_DIR"/*.zip)
fi
shopt -u nullglob nocaseglob

if [ ${#ZIP_FILES[@]} -eq 0 ]; then
  echo "Tidak ada file .zip ditemukan di: $SRC_DIR"
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "Ditemukan ${#ZIP_FILES[@]} file ZIP di: $SRC_DIR"
echo "Mengekstrak dan menggabungkan ke: $OUT_DIR"
echo

TOTAL_MOVED=0
TOTAL_RENAMED=0

for zf in "${ZIP_FILES[@]}"; do
  bn="$(basename "$zf")"
  echo "-> $bn"
  EXTRACT_DIR="$TMP_DIR/$(basename "$zf" .zip)"
  mkdir -p "$EXTRACT_DIR"
  # -q = quiet, -o = overwrite tanpa tanya
  unzip -q -o "$zf" -d "$EXTRACT_DIR"

  # Pindahkan semua file foto (apapun kedalaman sub-foldernya di dalam zip)
  # ke OUT_DIR, jaga nama file tapi hindari bentrok nama.
  while IFS= read -r -d '' f; do
    fname="$(basename "$f")"
    dest="$OUT_DIR/$fname"
    if [ -e "$dest" ]; then
      name="${fname%.*}"
      ext="${fname##*.}"
      n=1
      while [ -e "$OUT_DIR/${name}_dup${n}.${ext}" ]; do
        n=$((n + 1))
      done
      dest="$OUT_DIR/${name}_dup${n}.${ext}"
      TOTAL_RENAMED=$((TOTAL_RENAMED + 1))
    fi
    mv "$f" "$dest"
    TOTAL_MOVED=$((TOTAL_MOVED + 1))
  done < <(find "$EXTRACT_DIR" -type f -print0)
done

rm -rf "$TMP_DIR"

echo
echo "Selesai."
echo "Total foto digabung : $TOTAL_MOVED"
if [ "$TOTAL_RENAMED" -gt 0 ]; then
  echo "Nama bentrok (di-rename otomatis) : $TOTAL_RENAMED"
fi
echo "Lokasi folder hasil  : $OUT_DIR"
