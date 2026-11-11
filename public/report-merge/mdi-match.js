/*
 * mdi-match.js
 * Logika pencocokan "Surat MDI (Partner MPC)" — Blast Email Only.
 * Diport dari Smart Mail Sumatera (mdi.html, PR #1 anggiesther/sa-automation):
 *   - Target blast = kombinasi unik NAMA PARTNER + TYPE dari Excel
 *     (baris type yang tidak ada di sheet terpilih dilengkapi dari sheet lain).
 *   - Tiap file PDF (Surat / BAST) dicocokkan ke target dari nama file:
 *     PARTNER_ID (nol di depan diabaikan) paling kuat, lalu nama partner
 *     terpanjang yang termuat di nama file, lalu token type.
 *   - Satu partner + type = satu email berisi Surat + BAST.
 * Murni fungsi (tanpa DOM) supaya bisa dites di Node:
 *   node -e "const M=require('./public/report-merge/mdi-match.js'); ..."
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MdiMatch = api;
})(typeof self !== "undefined" ? self : this, function () {
  // Kolom Excel dibaca otomatis dari judul kolom (tidak peka huruf besar/kecil).
  var MAPPING = [
    { key: "partner", cocok: ["partner name", "nama partner", "partner_name", "nama mpc", "mpc", "partner", "nama mitra", "mitra"] },
    { key: "email_to", cocok: ["email to", "email_to", "email"], tolak: "cc" },
    { key: "email_cc", cocok: ["email cc", "email_cc", "cc"] },
    { key: "type", cocok: ["type", "tipe", "type program", "program type"] },
    { key: "partner_id", cocok: ["partner id", "partner_id", "id partner", "id_partner", "vendor id", "vendor_id", "kode vendor", "vendor code", "kode partner", "supplier id", "id mpc"] },
  ];

  var POLA_EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  var KATA_UMUM = ["surat", "pemberitahuan", "bast", "letter", "attachment", "com", "incentive", "pt", "cv", "tbk", "final", "signed", "copy"];

  var normalisasi = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); };
  var tokenNama = function (s) { return " " + String(s == null ? "" : s).toLowerCase().replace(/\.pdf$/, "").replace(/[^a-z0-9]+/g, " ").trim() + " "; };
  var tanpaNolDepan = function (s) { return String(s == null ? "" : s).trim().replace(/^0+/, ""); };
  var kunci = function (nama, type) { return String(nama).toUpperCase().replace(/\s+/g, " ") + "|" + String(type || "").toUpperCase(); };

  /** Alamat email dari 1 sel: dipecah di ; , spasi, baris baru; "Nama <email>" / mailto: diambil alamatnya. */
  function bacaEmail(nilai) {
    var valid = [], invalid = [];
    String(nilai == null ? "" : nilai)
      .replace(/[ ​-‍⁠﻿]/g, " ")
      .replace(/mailto:/gi, " ")
      .split(/[;,\s]+/)
      .map(function (x) { return x.replace(/^[<("'\[]+|[>)"'\].:]+$/g, "").trim(); })
      .filter(Boolean)
      .forEach(function (x) {
        if (POLA_EMAIL.test(x)) valid.push(x);
        else if (x.indexOf("@") >= 0) invalid.push(x);
      });
    return { valid: valid, invalid: invalid };
  }

  function tambahEmail(arr, nilai, catatInvalid) {
    var hasil = bacaEmail(nilai);
    hasil.valid.forEach(function (e) {
      if (!arr.some(function (x) { return x.toLowerCase() === e.toLowerCase(); })) arr.push(e);
    });
    if (catatInvalid) hasil.invalid.forEach(catatInvalid);
  }

  function tebakKolom(cocok, tolak, kolom) {
    var lower = kolom.map(function (c) { return tolak && c.toLowerCase().indexOf(tolak) >= 0 ? "" : c.toLowerCase().trim(); });
    for (var i = 0; i < cocok.length; i++) {
      var idx = lower.indexOf(cocok[i]);
      if (idx >= 0) return kolom[idx];
    }
    for (var j = 0; j < cocok.length; j++) {
      var kata = cocok[j];
      var idx2 = lower.findIndex(function (c) { return c && c.indexOf(kata) >= 0; });
      if (idx2 >= 0) return kolom[idx2];
    }
    return "";
  }

  function kolomSheet(rows) {
    var kolom = [];
    rows.forEach(function (r) {
      Object.keys(r).forEach(function (k) { if (k.indexOf("__EMPTY") !== 0 && kolom.indexOf(k) < 0) kolom.push(k); });
    });
    return kolom;
  }

  function petaKolom(rows) {
    var kolom = kolomSheet(rows);
    var map = {};
    MAPPING.forEach(function (m) { map[m.key] = tebakKolom(m.cocok, m.tolak, kolom); });
    return map;
  }

  /**
   * sheets: { namaSheet: rows[] } (hasil XLSX.utils.sheet_to_json), sheetUtama: nama sheet terpilih.
   * Hasil: daftar target { key, partner_name, type, partner_id, email_to[], email_cc[], email_invalid[] }.
   */
  function buildTargets(sheets, sheetUtama) {
    var grup = new Map();
    var urutanSheet = [sheetUtama].concat(Object.keys(sheets).filter(function (s) { return s !== sheetUtama; }));
    urutanSheet.forEach(function (namaSheet, urutan) {
      var dataSheet = sheets[namaSheet] || [];
      var map = petaKolom(dataSheet);
      if (!map.partner || (urutan > 0 && !map.email_to)) return;
      var kunciSheet = new Set();
      dataSheet.forEach(function (r, idxBaris) {
        var nama = String(r[map.partner] == null ? "" : r[map.partner]).trim();
        if (!nama) return;
        var type = map.type ? String(r[map.type] == null ? "" : r[map.type]).trim() : "";
        var key = kunci(nama, type);
        // Sheet lain hanya melengkapi kombinasi partner + type yang belum ada.
        if (urutan > 0 && grup.has(key) && !kunciSheet.has(key)) return;
        kunciSheet.add(key);
        if (!grup.has(key)) grup.set(key, { key: key, partner_name: nama, type: type, partner_id: "", email_to: [], email_cc: [], email_invalid: [] });
        var t = grup.get(key);
        var lokasi = function (kolom) {
          return function (alamat) { t.email_invalid.push('"' + alamat + '" (sheet ' + namaSheet + ", kolom " + kolom + ", baris " + (idxBaris + 2) + ")"); };
        };
        if (map.email_to) tambahEmail(t.email_to, r[map.email_to], lokasi(map.email_to));
        if (map.email_cc) tambahEmail(t.email_cc, r[map.email_cc], lokasi(map.email_cc));
        if (map.partner_id && !t.partner_id) t.partner_id = String(r[map.partner_id] == null ? "" : r[map.partner_id]).trim();
      });
    });
    return Array.from(grup.values());
  }

  // Type di nama file: type yang dikenal dari Excel (terpanjang), atau kata terakhir nama file (mis. "..._MP3.pdf").
  function bacaTypeFile(namaFile, partner, semuaType) {
    var tokenFile = tokenNama(namaFile);
    var dikenal = semuaType.filter(function (t) { return tokenFile.indexOf(tokenNama(t)) >= 0; }).sort(function (a, b) { return b.length - a.length; });
    if (dikenal.length) return dikenal[0];
    var kataPartner = tokenNama(partner.partner_name).trim().split(" ");
    var akhir = tokenFile.trim().split(" ").pop();
    return akhir && /^[a-z0-9]{2,8}$/.test(akhir) && !/^\d+$/.test(akhir) && kataPartner.indexOf(akhir) < 0 && KATA_UMUM.indexOf(akhir) < 0 ? akhir.toUpperCase() : "";
  }

  /** Cari target untuk 1 nama file. Bisa menambah target baru ke `targets` (type di file tidak ada di Excel). */
  function cariTarget(namaFile, targets) {
    var nf = normalisasi(namaFile);
    var token = tokenNama(namaFile).trim().split(" ");
    var skor = function (t) {
      var pid = tanpaNolDepan(String(t.partner_id || "").toLowerCase());
      if (pid && token.some(function (x) { return tanpaNolDepan(x) === pid; })) return 10000;
      var n = normalisasi(t.partner_name);
      return n && nf.indexOf(n) >= 0 ? n.length : 0;
    };
    var berskor = targets.map(function (t) { return { t: t, s: skor(t) }; }).filter(function (x) { return x.s > 0; });
    if (!berskor.length) return { alasan: "nama partner tidak ditemukan di Excel" };
    var terbaik = Math.max.apply(null, berskor.map(function (x) { return x.s; }));
    var kandidat = berskor.filter(function (x) { return x.s === terbaik; }).map(function (x) { return x.t; });
    if (kandidat.length === 1 && !kandidat[0].type) return { target: kandidat[0] };

    var tokenFile = tokenNama(namaFile);
    var cocokType = kandidat.filter(function (t) { return t.type && tokenFile.indexOf(tokenNama(t.type)) >= 0; });
    if (!cocokType.length) {
      // Type di file (mis. MP3) tidak ada di Excel untuk partner ini: tetap jadi email terpisah,
      // Email To/CC dipinjam dari type lain partner yang sama (dengan peringatan).
      var semuaType = Array.from(new Set(targets.map(function (t) { return t.type; }).filter(Boolean)));
      var typeFile = bacaTypeFile(namaFile, kandidat[0], semuaType);
      if (!typeFile) {
        return { alasan: "type tidak terbaca dari nama file (type partner ini di Excel: " + kandidat.map(function (t) { return t.type || "-"; }).join(", ") + ")" };
      }
      var sumber = kandidat[0];
      var key = kunci(sumber.partner_name, typeFile);
      var pengganti = targets.find(function (t) { return t.key === key; });
      if (!pengganti) {
        pengganti = Object.assign({}, sumber, {
          key: key, type: typeFile,
          email_to: sumber.email_to.slice(), email_cc: sumber.email_cc.slice(), email_invalid: (sumber.email_invalid || []).slice(),
          typeSumber: kandidat.map(function (t) { return t.type; }).filter(Boolean).join(", "),
        });
        targets.push(pengganti);
      }
      return { target: pengganti };
    }
    var panjang = Math.max.apply(null, cocokType.map(function (t) { return tokenNama(t.type).length; }));
    var pilihan = cocokType.filter(function (t) { return tokenNama(t.type).length === panjang; });
    return pilihan.length === 1 ? { target: pilihan[0] } : { alasan: "cocok ke lebih dari 1 baris Excel" };
  }

  /**
   * files: [{ name, jenis: 'surat'|'bast', ...apa saja }]
   * Hasil: { emails: [{ target, surat[], bast[], peringatan[] }], tidakCocok: [{ file, alasan }] }
   */
  function cocokkan(targets, files) {
    var perTarget = new Map();
    var tidakCocok = [];
    files.forEach(function (f) {
      var hasil = cariTarget(f.name, targets);
      if (!hasil.target) { tidakCocok.push({ file: f, alasan: hasil.alasan }); return; }
      if (!perTarget.has(hasil.target.key)) perTarget.set(hasil.target.key, { target: hasil.target, surat: [], bast: [] });
      perTarget.get(hasil.target.key)[f.jenis === "bast" ? "bast" : "surat"].push(f);
    });
    var emails = Array.from(perTarget.values()).map(function (h) {
      var p = [];
      if (!h.surat.length) p.push("File Surat belum ada");
      if (!h.bast.length) p.push("File BAST belum ada");
      if (!h.target.email_to.length) p.push("Email To kosong");
      if (h.target.email_invalid && h.target.email_invalid.length) p.push("Alamat email tidak valid (dilewati): " + h.target.email_invalid.join(", "));
      if (h.target.typeSumber) p.push("Type " + h.target.type + " tidak ada di Excel untuk partner ini; Email To/CC diambil dari type " + h.target.typeSumber);
      h.peringatan = p;
      return h;
    }).sort(function (a, b) {
      return (a.target.partner_name + " " + a.target.type).localeCompare(b.target.partner_name + " " + b.target.type);
    });
    return { emails: emails, tidakCocok: tidakCocok };
  }

  return { MAPPING: MAPPING, bacaEmail: bacaEmail, petaKolom: petaKolom, buildTargets: buildTargets, cariTarget: cariTarget, cocokkan: cocokkan };
});
