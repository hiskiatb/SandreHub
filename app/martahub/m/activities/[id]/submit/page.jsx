"use client";
/**
 * /martahub/m/activities/[id]/submit — Submit Laporan Actual (web mobile),
 * setara submit_actual_screen.dart. Cakupan iterasi ini:
 *   - MSISDN per jenis (SP/FWA): ketik manual (SEMUA browser) + scan kamera
 *     via BarcodeDetector API (Chrome/Edge/Android — TIDAK tersedia di
 *     Safari/iOS, tombol scan otomatis disembunyikan bila tidak didukung,
 *     manual entry tetap jalur utama yang selalu berfungsi).
 *   - Cek kepemilikan MSISDN (mh_dsf_check_msisdn_owner) + ajukan
 *     pemindahan (mh_dsf_request_msisdn_transfer) kalau nomor sudah ditag
 *     org lain — SAMA PERSIS dgn alur Flutter, bukan disederhanakan.
 *   - Rebuy Pulsa/Data, Cost Actual, Insight.
 *   - submitActual() → status 'pending_validation' → trigger server
 *     otomatis memutuskan approved/revision_actual (TIDAK ada approval
 *     manusia lagi utk fase ini).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Plus, QrCode, Trash2, Loader2, CheckCircle2, AlertTriangle, MapPin, Camera, ImagePlus, X } from "lucide-react";
import supabaseMarta from "../../../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../../_shared/MobileShell";
import { isValidMsisdn, normalizeMsisdn } from "../../../_shared/msisdn";

const CATS = [
  { key: "sp", label: "SP (Starter Pack)" },
  { key: "fwa", label: "FWA" },
];

const MIN_PHOTOS = 2;
const PHOTO_BUCKET = "mh-photos";

/** Kompres gambar ke maksimal ~1MB via canvas (setara compressToMaxSize di
 * Flutter) — jalan sepenuhnya di browser, tidak butuh server. */
function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale); height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Gagal memproses gambar")), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gagal membaca gambar")); };
    img.src = url;
  });
}

export default function SubmitActualPage() {
  const { id: activityId } = useParams();
  const router = useRouter();
  const { loading, userId, scope } = useMartaSession();

  const [activity, setActivity] = useState(null);
  const [types, setTypes] = useState({ sp: [], fwa: [] });
  const [dataLoading, setDataLoading] = useState(true);
  const [err, setErr] = useState("");

  const [orgId, setOrgId] = useState("");
  const [selectedType, setSelectedType] = useState({ sp: null, fwa: null });
  const [entries, setEntries] = useState({ sp: [], fwa: [] }); // {msisdn, typeId, typeName}
  const [pendingTransfers, setPendingTransfers] = useState({ sp: [], fwa: [] });
  const [msisdnInput, setMsisdnInput] = useState({ sp: "", fwa: "" });
  const [msisdnErr, setMsisdnErr] = useState({ sp: null, fwa: null });

  const [rebuyPulsa, setRebuyPulsa] = useState("0");
  const [rebuyData, setRebuyData] = useState("0");
  const [costActual, setCostActual] = useState("0");
  const [insight, setInsight] = useState("");

  // Dokumentasi foto — WAJIB minimal 2 sebelum bisa kirim (sama persis
  // dgn `_minPhotos`/`_docsValid` di submit_actual_screen.dart Flutter).
  const [photos, setPhotos] = useState([]); // {file, previewUrl}
  const [uploadProgress, setUploadProgress] = useState(null); // {done, total}
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  function addPhotoFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setPhotos((prev) => [...prev, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }
  function removePhoto(i) {
    setPhotos((prev) => { URL.revokeObjectURL(prev[i].previewUrl); return prev.filter((_, idx) => idx !== i); });
  }
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [conflict, setConflict] = useState(null); // { category, typeId, typeName, msisdn, owner }
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const scanSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (loading) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: a, error: e1 }, { data: sp }, { data: fwa }, { data: profile }] = await Promise.all([
          supabaseMarta.from("mh_activities").select("id,event_name,brand,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,status,checkin_valid").eq("id", activityId).single(),
          supabaseMarta.from("mh_product_types").select("id,name,unit_price").eq("category", "sp").eq("active", true).order("name"),
          supabaseMarta.from("mh_product_types").select("id,name,unit_price").eq("category", "fwa").eq("active", true).order("name"),
          scope?.email ? supabaseMarta.from("mh_profiles").select("dsf_org_id").eq("email", scope.email.toLowerCase()).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (e1) throw e1;
        if (!alive) return;
        setActivity(a);
        setTypes({ sp: sp || [], fwa: fwa || [] });
        if (profile?.dsf_org_id) setOrgId(profile.dsf_org_id);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat aktivitas");
      } finally {
        if (alive) setDataLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loading, activityId, scope]);

  if (loading || dataLoading) return <MobileShell active="activities"><ShellSpinner /></MobileShell>;
  if (err && !activity) return <MobileShell active="activities"><div style={{ padding: 40, textAlign: "center", color: "#C62828", fontSize: 13 }}>{err}</div></MobileShell>;

  const orgMissing = !orgId.trim();

  function isDuplicateLocal(cat, msisdn) {
    return entries[cat].some((e) => e.msisdn === msisdn) || pendingTransfers[cat].some((p) => p.msisdn === msisdn);
  }

  async function addMsisdn(cat, rawMsisdn) {
    if (orgMissing) { setMsisdnErr((e) => ({ ...e, [cat]: "Isi ORG ID dulu sebelum menambah MSISDN." })); return; }
    const typeId = selectedType[cat];
    if (!typeId) { setMsisdnErr((e) => ({ ...e, [cat]: "Pilih jenis dulu sebelum menambah MSISDN." })); return; }
    const norm = normalizeMsisdn(rawMsisdn);
    if (!isValidMsisdn(norm)) { setMsisdnErr((e) => ({ ...e, [cat]: 'Format MSISDN tidak valid (wajib diawali "62" atau "0").' })); return; }
    if (isDuplicateLocal(cat, norm)) { setMsisdnErr((e) => ({ ...e, [cat]: "Nomor ini sudah ditambahkan." })); return; }

    const typeObj = types[cat].find((t) => t.id === typeId);
    setMsisdnErr((e) => ({ ...e, [cat]: null }));

    // Cek kepemilikan — kalau sudah ditag di event lain, tawarkan pemindahan
    // alih-alih langsung menambahkan (mencegah double-count SP/FWA).
    try {
      const { data: ownerRows } = await supabaseMarta.rpc("mh_dsf_check_msisdn_owner", { p_msisdn: norm });
      const owner = ownerRows && ownerRows.length > 0 ? ownerRows[0] : null;
      if (owner) {
        setConflict({ category: cat, typeId, typeName: typeObj?.name, msisdn: norm, owner });
        return;
      }
    } catch {
      // best-effort — kalau cek gagal, tetap lanjut tambahkan (jangan blokir input)
    }

    let tagLat = null, tagLng = null;
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 }));
        tagLat = pos.coords.latitude; tagLng = pos.coords.longitude;
      } catch { /* best-effort */ }
    }

    setEntries((prev) => ({ ...prev, [cat]: [...prev[cat], { msisdn: norm, typeId, typeName: typeObj?.name, taggedAt: new Date().toISOString(), tagLat, tagLng }] }));
    setMsisdnInput((prev) => ({ ...prev, [cat]: "" }));
  }

  async function resolveConflictTransfer() {
    if (!conflict) return;
    if (orgMissing) { setErr("ORG ID wajib diisi sebelum mengajukan pemindahan MSISDN."); return; }
    try {
      await supabaseMarta.rpc("mh_dsf_request_msisdn_transfer", {
        p_entry_id: conflict.owner.entry_id,
        p_to_activity_id: activityId,
        p_category: conflict.category,
        p_product_type_id: conflict.typeId,
        p_org_id: orgId.trim(),
      });
      setPendingTransfers((prev) => ({ ...prev, [conflict.category]: [...prev[conflict.category], { msisdn: conflict.msisdn }] }));
      setConflict(null);
    } catch (e) {
      setErr(e.message || "Gagal mengajukan pemindahan MSISDN");
    }
  }

  function removeEntry(cat, msisdn) {
    setEntries((prev) => ({ ...prev, [cat]: prev[cat].filter((e) => e.msisdn !== msisdn) }));
  }

  async function submit() {
    if (photos.length < MIN_PHOTOS) {
      setErr(`Wajib upload minimal ${MIN_PHOTOS} foto dokumentasi sebelum mengirim laporan.`);
      return;
    }
    setSaving(true); setErr("");
    try {
      const actualSp = entries.sp.length;
      const actualFwa = entries.fwa.length;
      const revenue = [...entries.sp, ...entries.fwa].reduce((sum, e) => {
        const t = [...types.sp, ...types.fwa].find((x) => x.id === e.typeId);
        return sum + (t?.unit_price || 0);
      }, 0);

      const { data, error } = await supabaseMarta.from("mh_activities").update({
        actual_date: new Date().toISOString().slice(0, 10),
        actual_sp: actualSp,
        actual_fwa: actualFwa,
        actual_rebuy_pulsa: Number(rebuyPulsa) || 0,
        actual_rebuy_data: Number(rebuyData) || 0,
        actual_rev_3m: revenue,
        cost_actual: Number(costActual) || 0,
        insight: insight.trim() || null,
        status: "pending_validation",
      }).eq("id", activityId).select("status,validation_status,validation_note").single();
      if (error) throw error;

      // Upload foto dokumentasi — SETELAH laporan pokok tersimpan (kalau
      // upload sebagian gagal, laporan tetap tersubmit; sama spt Flutter).
      setUploadProgress({ done: 0, total: photos.length });
      for (let i = 0; i < photos.length; i++) {
        try {
          const blob = await compressImage(photos[i].file);
          const path = `${activityId}/${Date.now()}_${i}.jpg`;
          const { error: upErr } = await supabaseMarta.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
          if (upErr) throw upErr;
          await supabaseMarta.from("mh_documents").insert({ activity_id: activityId, uploader_id: userId, storage_path: path, file_type: "photo" });
          supabaseMarta.functions.invoke("media-relay", { body: { bucket: PHOTO_BUCKET, path } }).catch(() => {});
        } catch { /* best-effort per foto, lanjut foto berikutnya */ }
        setUploadProgress({ done: i + 1, total: photos.length });
      }

      // Kirim entries per kelompok kategori+jenis — best-effort, laporan
      // pokok TETAP tersubmit walau bagian ini gagal (sama spt Flutter).
      for (const cat of ["sp", "fwa"]) {
        const byType = new Map();
        for (const e of entries[cat]) {
          if (!byType.has(e.typeId)) byType.set(e.typeId, []);
          byType.get(e.typeId).push(e);
        }
        for (const [typeId, list] of byType) {
          try {
            await supabaseMarta.rpc("mh_dsf_submit_sales_entries", {
              p_activity_id: activityId,
              p_org_id: orgId.trim(),
              p_category: cat,
              p_product_type_id: typeId,
              p_entries: list.map((e) => ({ msisdn: e.msisdn, imei: null, tagged_at: e.taggedAt, tag_lat: e.tagLat, tag_lng: e.tagLng })),
            });
          } catch { /* best-effort, lanjut kelompok berikutnya */ }
        }
      }

      setResult(data);
    } catch (e) {
      setErr(e.message || "Gagal mengirim laporan");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    const validated = result.status === "approved";
    return (
      <MobileShell active="activities">
        <div style={{ padding: "60px 24px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: validated ? "rgba(21,128,61,0.1)" : "rgba(180,83,9,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            {validated ? <CheckCircle2 size={30} color="#15803D" /> : <AlertTriangle size={30} color="#B45309" />}
          </div>
          <div style={{ marginTop: 18, fontSize: 17, fontWeight: 800, color: "#17181C" }}>
            {validated ? "Laporan tervalidasi otomatis" : "Laporan perlu ditinjau"}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#6B6B76", lineHeight: 1.6 }}>
            {result.validation_note || (validated ? "Check-in cocok dengan site event ini." : "Titik check-in tidak cocok dengan site manapun di event ini — approver bisa meninjau manual.")}
          </div>
          <button onClick={() => router.replace(`/martahub/m/activities?open=${activityId}`)}
            style={{ marginTop: 26, width: "100%", height: 48, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
            Selesai
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell active="activities">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 16px) 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.back()} style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>Laporan Actual</div>
            <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>{activity?.event_name}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        {err && <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

        {/* ORG ID */}
        <Card>
          <FieldLabel text="ORG ID" required hint="ID yang dikreditkan utk penjualan berikutnya" />
          <TextInput value={orgId} onChange={setOrgId} placeholder="Masukkan ORG ID aktif" error={orgMissing} />
        </Card>

        {CATS.map((c) => (
          <SalesSection key={c.key} cat={c.key} label={c.label}
            types={types[c.key]} selectedType={selectedType[c.key]} onSelectType={(v) => setSelectedType((s) => ({ ...s, [c.key]: v }))}
            input={msisdnInput[c.key]} onInputChange={(v) => setMsisdnInput((s) => ({ ...s, [c.key]: v }))}
            onAdd={() => addMsisdn(c.key, msisdnInput[c.key])}
            entries={entries[c.key]} onRemove={(m) => removeEntry(c.key, m)}
            pending={pendingTransfers[c.key]} error={msisdnErr[c.key]}
            scanSupported={scanSupported}
            onScanResult={(text) => addMsisdn(c.key, text)}
          />
        ))}

        <Card>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel text="Rebuy Pulsa" />
              <NumberInput value={rebuyPulsa} onChange={setRebuyPulsa} prefix="Rp" />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel text="Rebuy Data" />
              <NumberInput value={rebuyData} onChange={setRebuyData} prefix="Rp" />
            </div>
          </div>
          <FieldLabel text="Cost Actual" top />
          <NumberInput value={costActual} onChange={setCostActual} prefix="Rp" />
          <FieldLabel text="Insight" top hint="Opsional" />
          <TextInput value={insight} onChange={setInsight} placeholder="Catatan/insight dari lapangan…" multiline />
        </Card>

        {/* Dokumentasi Foto — WAJIB minimal MIN_PHOTOS sebelum bisa kirim */}
        <Card>
          <FieldLabel text="Dokumentasi Foto" required hint={`Minimal ${MIN_PHOTOS} foto · ${photos.length} terpilih`} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => cameraInputRef.current?.click()}
              style={{ flex: 1, height: 46, borderRadius: 12, border: "1.5px dashed #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Camera size={16} /> Ambil Foto
            </button>
            <button onClick={() => galleryInputRef.current?.click()}
              style={{ flex: 1, height: 46, borderRadius: 12, border: "1.5px dashed #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <ImagePlus size={16} /> Dari Galeri
            </button>
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple hidden
            onChange={(e) => { addPhotoFiles(e.target.files); e.target.value = ""; }} />
          <input ref={galleryInputRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { addPhotoFiles(e.target.files); e.target.value = ""; }} />

          {photos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: "#F0F0F3" }}>
                  <img src={p.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button onClick={() => removePhoto(i)}
                    style={{ position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X size={13} color="#fff" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MIN_PHOTOS && (
            <FieldError text={`Tambahkan ${MIN_PHOTOS - photos.length} foto lagi sebelum bisa mengirim laporan.`} />
          )}
          {uploadProgress && uploadProgress.done < uploadProgress.total && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>Mengunggah foto {uploadProgress.done}/{uploadProgress.total}…</div>
          )}
        </Card>
      </div>

      <div style={{ position: "sticky", bottom: 66, background: "linear-gradient(180deg,rgba(244,245,247,0) 0%,#F4F5F7 30%)", padding: "16px 20px 0" }}>
        <button onClick={submit} disabled={saving || photos.length < MIN_PHOTOS}
          style={{ width: "100%", height: 52, borderRadius: 14, border: "none", cursor: (saving || photos.length < MIN_PHOTOS) ? "default" : "pointer", background: (saving || photos.length < MIN_PHOTOS) ? "#D8D9E0" : BRAND, color: "#fff", fontSize: 14.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, boxShadow: (saving || photos.length < MIN_PHOTOS) ? "none" : "0 4px 14px rgba(17,17,20,0.11)" }}>
          {saving ? <Loader2 size={17} style={{ animation: "mspin .85s linear infinite" }} /> : <CheckCircle2 size={18} />}
          {saving ? (uploadProgress ? `Mengunggah foto ${uploadProgress.done}/${uploadProgress.total}…` : "Mengirim…") : photos.length < MIN_PHOTOS ? `Tambahkan ${MIN_PHOTOS - photos.length} foto lagi` : "Kirim Laporan"}
        </button>
      </div>

      {conflict && (
        <ConflictSheet conflict={conflict} onClose={() => setConflict(null)} onConfirm={resolveConflictTransfer} />
      )}
    </MobileShell>
  );
}

// ═══════════════════════════════ Sections ══════════════════════════════════
function SalesSection({ cat, label, types, selectedType, onSelectType, input, onInputChange, onAdd, entries, onRemove, pending, error, scanSupported, onScanResult }) {
  const [scanning, setScanning] = useState(false);
  const total = entries.length;
  const selectedTypeObj = types.find((t) => t.id === selectedType);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>{label}</div>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#ED1C24" }}>{total} nomor</span>
      </div>

      <FieldLabel text="Jenis" top />
      {types.length === 0 ? (
        <LockedField text="Belum ada jenis untuk brand Anda — hubungi admin" muted />
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {types.map((t) => (
            <Chip key={t.id} active={selectedType === t.id} onClick={() => onSelectType(t.id)} label={t.name} />
          ))}
        </div>
      )}
      {selectedTypeObj && <div style={{ marginTop: 6, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>Rp {Number(selectedTypeObj.unit_price || 0).toLocaleString("id-ID")} / unit</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={input} onChange={(e) => onInputChange(e.target.value)} inputMode="tel"
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="628123456789 / 08123456789"
          style={{ flex: 1, minWidth: 0, height: 46, padding: "0 14px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 13.5, fontFamily: FF, color: "#17181C", outline: "none" }} />
        {scanSupported && (
          <button onClick={() => setScanning(true)} style={{ width: 46, height: 46, borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <QrCode size={17} />
          </button>
        )}
        <button onClick={onAdd} style={{ width: 46, height: 46, borderRadius: 12, background: BRAND, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Plus size={18} color="#fff" />
        </button>
      </div>
      {error && <FieldError text={error} />}

      {total > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => (
            <MsisdnCard key={e.msisdn} entry={e} onRemove={() => onRemove(e.msisdn)} />
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#B45309" }}>Menunggu persetujuan pemindahan · {pending.length} nomor</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {pending.map((p) => (
              <span key={p.msisdn} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 999, background: "#FFF7ED", border: "1px solid #FDE1B8", fontSize: 12, fontWeight: 700, color: "#17181C" }}>{p.msisdn}</span>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "#8A8A96" }}>Belum dihitung ke SP/FWA — akan aktif otomatis setelah disetujui pemilik sebelumnya.</div>
        </div>
      )}

      {scanning && scanSupported && (
        <ScanSheet onClose={() => setScanning(false)} onResult={(text) => { setScanning(false); onScanResult(text); }} />
      )}
    </Card>
  );
}

function MsisdnCard({ entry, onRemove }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F6F7F9", border: "1px solid #ECEDF0", borderRadius: 14, padding: "10px 8px 10px 12px" }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <MapPin size={15} color="#ED1C24" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>{entry.msisdn}</div>
        <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>{entry.typeName || "—"}{entry.tagLat != null ? " · lokasi tercatat" : ""}</div>
      </div>
      <button onClick={onRemove} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "transparent", color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function ConflictSheet({ conflict, onClose, onConfirm }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF", borderRadius: "22px 22px 0 0", padding: "10px 22px calc(env(safe-area-inset-bottom,0px) + 22px)", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "6px auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={20} color="#B45309" />
          <div style={{ fontSize: 15.5, fontWeight: 800 }}>Nomor sudah ditag orang lain</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: "#5A5A68", lineHeight: 1.6 }}>
          Nomor <b>{conflict.msisdn}</b> sudah ditandai oleh <b>{conflict.owner.owner_name}</b> pada &ldquo;{conflict.owner.event_name}&rdquo;. Anda bisa mengajukan pemindahan kepemilikan ke event ini — akan aktif setelah disetujui pemilik sebelumnya.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, height: 48, borderRadius: 12, border: "1.5px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>Batal</button>
          <button onClick={onConfirm} style={{ flex: 1.2, height: 48, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>Ajukan Pemindahan</button>
        </div>
      </div>
    </div>
  );
}

function ScanSheet({ onClose, onResult }) {
  const videoRef = useRef(null);
  const [scanErr, setScanErr] = useState("");

  useEffect(() => {
    let stream, detector, raf, stopped = false;
    (async () => {
      try {
        detector = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) { onResult(codes[0].rawValue); return; }
          } catch { /* frame belum siap */ }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setScanErr("Tidak bisa mengakses kamera. Pastikan izin kamera diaktifkan.");
      }
    })();
    return () => { stopped = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [onResult]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "90%", maxWidth: 360, aspectRatio: "1", borderRadius: 20, overflow: "hidden", position: "relative", background: "#000" }}>
        <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 24, border: "2px solid rgba(255,255,255,0.8)", borderRadius: 16 }} />
      </div>
      {scanErr && <div style={{ marginTop: 16, color: "#F87171", fontSize: 12.5, fontWeight: 600, textAlign: "center", maxWidth: 280 }}>{scanErr}</div>}
      <button onClick={onClose} style={{ marginTop: 20, padding: "10px 22px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>Tutup</button>
    </div>
  );
}

// ═══════════════════════════════ Primitives ════════════════════════════════
function Card({ children }) { return <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 18, padding: 16 }}>{children}</div>; }
function FieldLabel({ text, required, hint, top }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginTop: top ? 16 : 0, marginBottom: 7 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96" }}>{text}</span>
      {required && <span style={{ color: "#ED1C24", fontWeight: 800, marginLeft: 3 }}>*</span>}
      {hint && <span style={{ marginLeft: "auto", fontSize: 10, color: "#B0B0BA", fontWeight: 500 }}>{hint}</span>}
    </div>
  );
}
function FieldError({ text }) { return <div style={{ marginTop: 6, fontSize: 11.5, color: "#DC2626", fontWeight: 600 }}>{text}</div>; }
const inputBase = { width: "100%", height: 48, padding: "0 14px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 14, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };
function TextInput({ value, onChange, placeholder, error, multiline }) {
  const Comp = multiline ? "textarea" : "input";
  return <Comp value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={multiline ? 3 : undefined}
    style={{ ...inputBase, height: multiline ? 84 : 48, paddingTop: multiline ? 12 : 0, resize: multiline ? "vertical" : undefined, border: `1.5px solid ${error ? "#DC2626" : "#ECEDF0"}` }} />;
}
function NumberInput({ value, onChange, prefix }) {
  const display = value === "" ? "" : Number(value).toLocaleString("id-ID");
  return (
    <div style={{ ...inputBase, display: "flex", alignItems: "center" }}>
      {prefix && <span style={{ fontSize: 13, fontWeight: 700, color: "#8A8A96", marginRight: 6 }}>{prefix}</span>}
      <input value={display} inputMode="numeric" onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 600, color: "#17181C", fontFamily: FF }} />
    </div>
  );
}
function Chip({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{ padding: "8px 13px", borderRadius: 999, border: `1.5px solid ${active ? "#ED1C24" : "#ECEDF0"}`, background: active ? "rgba(237,28,36,0.08)" : "#F6F7F9", color: active ? "#ED1C24" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
      {label}
    </button>
  );
}
function LockedField({ text, muted }) {
  return <div style={{ ...inputBase, display: "flex", alignItems: "center", background: muted ? "#F6F7F9" : "rgba(237,28,36,0.06)", color: muted ? "#B0B0BA" : "#5A5A68", border: "none" }}>{text}</div>;
}
