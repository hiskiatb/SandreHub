/**
 * lib/sdp/territory.js
 * Sumber dropdown Kecamatan & Kab/Kota dari master Territory IOH (`mf_territory`).
 * Data kecamatan+kabupaten disimpan di kolom `kec_id` berformat "KECAMATAN|KABUPATEN"
 * (mis. "PULAU TIGA BARAT|NATUNA"). Helper ini memecahnya jadi opsi dropdown
 * cascading (Kab/Kota → Kecamatan) supaya kolom tidak free-text.
 */

export function parseKecId(kecId) {
  const s = String(kecId || "").trim();
  if (!s) return { kecamatan: "", kabupaten: "" };
  const [kec, kab] = s.split("|");
  return { kecamatan: (kec || "").trim(), kabupaten: (kab || "").trim() };
}

const sortArr = (it) => [...it].sort((a, b) => String(a).localeCompare(String(b)));

/**
 * Index dari baris mf_territory (kolom kec_id).
 * @returns {{ kabupatens: string[], kecByKab: Map<string,Set>, kabByKec: Map<string,string>,
 *             kecamatanFor: (kab?: string) => string[], kabOf: (kec: string) => string }}
 */
export function buildKecIndex(rows) {
  const kabSet = new Set();
  const kecByKab = new Map();
  const kabByKec = new Map();
  const allKec = new Set();
  (rows || []).forEach((r) => {
    const { kecamatan, kabupaten } = parseKecId(r.kec_id);
    if (!kecamatan) return;
    allKec.add(kecamatan);
    if (kabupaten) {
      kabSet.add(kabupaten);
      if (!kecByKab.has(kabupaten)) kecByKab.set(kabupaten, new Set());
      kecByKab.get(kabupaten).add(kecamatan);
    }
    if (!kabByKec.has(kecamatan)) kabByKec.set(kecamatan, kabupaten || "");
  });
  return {
    kabupatens: sortArr(kabSet),
    kecByKab,
    kabByKec,
    kecamatanFor: (kab) => (kab && kecByKab.has(kab)) ? sortArr(kecByKab.get(kab)) : sortArr(allKec),
    kabOf: (kec) => kabByKec.get(kec) || "",
  };
}
