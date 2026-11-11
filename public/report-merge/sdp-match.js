/*
 * sdp-match.js
 * Logika "Blast Email Only" Partner SDP, diport apa adanya dari Smart Mail
 * Sumatera (index.html, PR #1 anggiesther/sa-automation, tombol Generate saat
 * appMode === "BLAST"):
 *   - Data = baris-baris sheet yang dipilih (tidak menggabung sheet lain).
 *   - Kolom dicari dari judul: ID = mengandung "id"/"kode", Nama = "nama"/
 *     "tujuan"/"partner", Brand = "brand"/"merek", Type = "type"/"tipe"/"jenis".
 *   - Email To = kolom "email"/"email_to" (bukan cc/from), Email CC = kolom
 *     yang mengandung "cc". Isi sel dipakai apa adanya (dipisah ; atau ,).
 *   - Metode "matching": tiap baris dapat PDF PERTAMA yang nama filenya
 *     mengandung ID atau nama mitra (huruf kecil). Baris tanpa PDF dilewati.
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

  function extractEmailFromExcelRow(rowData) {
    if (!rowData) return { email_to: "", email_cc: "" };
    var keys = Object.keys(rowData);
    var toKey = keys.find(function (k) {
      var kl = k.toLowerCase().trim();
      return kl === "email" || kl === "email_to" || kl === "email to" || kl.indexOf("email_to") >= 0 || (kl.indexOf("email") >= 0 && kl.indexOf("cc") < 0 && kl.indexOf("from") < 0);
    });
    var ccKey = keys.find(function (k) {
      var kl = k.toLowerCase().trim();
      return kl === "cc" || kl === "email_cc" || kl === "email cc" || kl.indexOf("cc") >= 0;
    });
    return {
      email_to: toKey ? String(rowData[toKey] || "").trim() : "",
      email_cc: ccKey ? String(rowData[ccKey] || "").trim() : "",
    };
  }

  function bacaBaris(row, index) {
    var keys = Object.keys(row);
    var idCol = cariKolom(keys, ["id", "kode"]);
    var nameCol = cariKolom(keys, ["nama", "tujuan", "partner"]);
    var brandCol = cariKolom(keys, ["brand", "merek"]);
    var typeCol = cariKolom(keys, ["type", "tipe", "jenis"]);
    var rawId = idCol ? String(row[idCol]) : "ID_" + index;
    var rawName = nameCol ? String(row[nameCol]) : "Mitra " + index;
    var email = extractEmailFromExcelRow(row);
    return {
      id: rawId,
      partner_name: rawName,
      type: typeCol ? row[typeCol] : "SDP REGULAR",
      brand: brandCol ? row[brandCol] : "Mitra IM3 & 3KIOSK",
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
      var matched = files.find(function (f) {
        var fName = f.name.toLowerCase();
        return fName.indexOf(sdpId) >= 0 || fName.indexOf(sdpName) >= 0;
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

  return { bacaBaris: bacaBaris, extractEmailFromExcelRow: extractEmailFromExcelRow, cocokkan: cocokkan, pecahEmail: pecahEmail };
});
