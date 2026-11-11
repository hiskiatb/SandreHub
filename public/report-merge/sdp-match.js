/*
 * sdp-match.js
 * Logika "Blast Email Only" Partner SDP, diport apa adanya dari Smart Mail
 * Sumatera (index.html, PR #1 anggiesther/sa-automation, tombol Generate saat
 * appMode === "BLAST"):
 *   - Data = baris-baris sheet yang dipilih (tidak menggabung sheet lain).
 *   - Kolom dicari dari judul: ID = mengandung "id"/"kode", Nama = "nama"/
 *     "tujuan"/"partner" (selain kolom ID), Brand = "brand"/"merek",
 *     Type = "type"/"tipe"/"jenis".
 *   - Email To = kolom "email"/"email_to" (bukan cc/from), Email CC = kolom
 *     yang mengandung "cc". Isi sel dipakai apa adanya (dipisah ; atau ,).
 *   - Metode "matching": tiap baris dapat PDF PERTAMA yang nama filenya
 *     mengandung ID atau nama mitra (huruf kecil, ID/nama kosong diabaikan).
 *     Baris tanpa PDF tidak dikirim.
 *   - Metode "broadcast": 1 PDF yang sama dikirim ke semua baris.
 *   - Satu email per baris (ID mitra).
 * Murni fungsi (tanpa DOM) supaya bisa dites di Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SdpMatch = api;
})(typeof self !== "undefined" ? self : this, function () {
  function cariKolom(keys, kata) {
    return keys.find(function (k) { return kata.some(function (kw) { return k.toLowerCase().indexOf(kw) >= 0; }); });
  }

  function extractKeys(keys) {
    return {
      to: keys.find(function (k) {
        var kl = k.toLowerCase().trim();
        return kl === "email" || kl === "email_to" || kl === "email to" || kl.indexOf("email_to") >= 0 || (kl.indexOf("email") >= 0 && kl.indexOf("cc") < 0 && kl.indexOf("from") < 0);
      }),
      cc: keys.find(function (k) {
        var kl = k.toLowerCase().trim();
        return kl === "cc" || kl === "email_cc" || kl === "email cc" || kl.indexOf("cc") >= 0;
      }),
    };
  }

  function extractEmailFromExcelRow(rowData) {
    if (!rowData) return { email_to: "", email_cc: "" };
    var k = extractKeys(Object.keys(rowData));
    return {
      email_to: k.to ? String(rowData[k.to] || "").trim() : "",
      email_cc: k.cc ? String(rowData[k.cc] || "").trim() : "",
    };
  }

  /** Kolom yang dipakai untuk 1 baris (atau 1 sheet). Nama tidak boleh sama dengan kolom ID
   * (perbaikan: di aplikasi asli kolom "PARTNER_ID" bisa terbaca sebagai kolom nama). */
  function petaKolom(row) {
    var keys = Object.keys(row || {});
    var idCol = cariKolom(keys, ["id", "kode"]);
    var sisa = keys.filter(function (k) { return k !== idCol; });
    var em = extractKeys(keys);
    return {
      id: idCol,
      nama: cariKolom(sisa, ["nama", "tujuan", "partner"]),
      brand: cariKolom(keys, ["brand", "merek"]),
      type: cariKolom(keys, ["type", "tipe", "jenis"]),
      email_to: em.to,
      email_cc: em.cc,
    };
  }

  function bacaBaris(row, index) {
    var k = petaKolom(row);
    var rawId = k.id ? String(row[k.id]).trim() : "ID_" + index;
    var rawName = k.nama ? String(row[k.nama]).trim() : "Mitra " + index;
    var email = extractEmailFromExcelRow(row);
    return {
      id: rawId,
      partner_name: rawName,
      type: k.type ? row[k.type] : "SDP REGULAR",
      brand: k.brand ? row[k.brand] : "Mitra IM3 & 3KIOSK",
      email_to: email.email_to,
      email_cc: email.email_cc,
    };
  }

  /**
   * rows: baris sheet terpilih; files: [{ name, ... }]; method: 'matching' | 'broadcast'.
   * Hasil: { emails: [{ ...baris, file }], barisTanpaPdf: [baris], fileTidakDipakai: [file] }
   * (barisTanpaPdf & fileTidakDipakai hanya untuk ditampilkan; aplikasi asli diam-diam melewatinya.)
   */
  function cocokkan(rows, files, method) {
    var emails = [], barisTanpaPdf = [];
    if (method === "broadcast") {
      var single = files[0];
      if (single) rows.forEach(function (row, i) { emails.push(Object.assign(bacaBaris(row, i), { file: single })); });
      return { emails: emails, barisTanpaPdf: [], fileTidakDipakai: files.slice(1) };
    }
    rows.forEach(function (row, i) {
      var b = bacaBaris(row, i);
      var sdpId = b.id.toLowerCase();
      var sdpName = b.partner_name.toLowerCase();
      // Perbaikan: sel ID/nama yang kosong tidak boleh dianggap cocok dengan semua file
      // (di aplikasi asli "".includes("") = true, jadi baris kosong menempel ke PDF pertama).
      var matched = files.find(function (f) {
        var fName = f.name.toLowerCase();
        return (sdpId && fName.indexOf(sdpId) >= 0) || (sdpName && fName.indexOf(sdpName) >= 0);
      });
      if (matched) emails.push(Object.assign(b, { file: matched }));
      else barisTanpaPdf.push(b);
    });
    var dipakai = new Set(emails.map(function (e) { return e.file; }));
    return { emails: emails, barisTanpaPdf: barisTanpaPdf, fileTidakDipakai: files.filter(function (f) { return !dipakai.has(f); }) };
  }

  /** Pecah isi sel email jadi daftar alamat (untuk ditampilkan / nanti dikirim). */
  function pecahEmail(s) {
    return String(s || "").split(/[;,]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  return { petaKolom: petaKolom, bacaBaris: bacaBaris, extractEmailFromExcelRow: extractEmailFromExcelRow, cocokkan: cocokkan, pecahEmail: pecahEmail };
});
