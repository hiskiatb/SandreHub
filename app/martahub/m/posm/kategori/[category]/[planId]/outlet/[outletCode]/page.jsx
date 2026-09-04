"use client";
/**
 * /martahub/m/posm/kategori/[category]/[planId]/outlet/[outletCode] -
 * Form pemasangan POSM Retailer Installment: info retailer (dari mapping
 * outlet), titik lokasi GPS (wajib - sama seperti Outdoor Installment),
 * pilih material + qty (sesuai alokasi Plan di Branch ini), dokumentasi
 * foto (kamera langsung ATAU kolase - tidak boleh unggah bebas dari galeri),
 * catatan opsional, lalu submit (dgn konfirmasi).
 *
 * Draft: kalau BME kembali (tombol back) sebelum submit dan sudah ada
 * perubahan (material/qty/catatan/foto), tawarkan "Simpan sebagai Draft"
 * (localStorage, per plan+outlet - dipulihkan otomatis kalau buka lagi)
 * atau "Hapus Perubahan". Foto TIDAK ikut tersimpan di draft (blob tidak
 * bisa disimpan ke localStorage) - hanya material/qty/catatan.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, X, CheckCircle2, Camera, Images, Loader2, Store, MapPin, Crosshair, Pencil, Plus, Send, FolderClock, AlertTriangle, Trash2 } from "lucide-react";
import LocationMapPreview from "../../../../../../_shared/LocationMapPreview";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../../../../../_shared/MobileShell";
import { fetchPlansForBranch, submitRetailerInstallation, addInstallationPhoto, posmPlanVisualUrl } from "../../../../../../_shared/posmData";
import { compressToMaxBytes } from "../../../../../../_shared/imageTools";
import PhotoCollageSheet from "../../../../../../_shared/PhotoCollageSheet";

export default function OutletInstallPage() {
  const { category, planId, outletCode } = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const { loading: sessionLoading, scope } = useMartaSession();

  const outletName = search.get("name") || "";
  const branchName = search.get("branch") || scope?.branchName || "";
  const mc = search.get("mc") || "";

  const draftKey = `mh_retailer_install_draft_${planId}_${outletCode}`;

  const [plan, setPlan] = useState(null);
  const [available, setAvailable] = useState([]);
  const [items, setItems] = useState([]);
  const [draftRestored, setDraftRestored] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [collageOpen, setCollageOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  // ── Titik lokasi GPS (wajib) - pola identik dgn Outdoor Installment/
  //    Customer Activation (lihat .../pasang/page.jsx), termasuk fallback
  //    isi koordinat manual kalau GPS gagal/tidak tersedia. ──
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [manualLoc, setManualLoc] = useState(false);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState("");

  useEffect(() => { useMyLocation(); /* auto-ambil lokasi saat halaman dibuka */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) { setLocErr("Browser ini tidak mendukung GPS."); return; }
    setLocating(true); setLocErr("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setManualLoc(false); setLocating(false); },
      () => { setLocErr("Gagal mengambil lokasi otomatis. Coba lagi atau isi koordinat manual."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  function applyManualLoc() {
    const la = Number(latInput), lo = Number(lngInput);
    if (!latInput || !lngInput || Number.isNaN(la) || Number.isNaN(lo)) { setLocErr("Isi latitude & longitude dengan angka yang valid."); return; }
    setLat(la); setLng(lo); setLocErr("");
  }

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    fetchPlansForBranch(scope?.branchId, scope?.brand)
      .then((rows) => {
        if (!alive) return;
        const p = (rows || []).find((r) => r.id === planId) || null;
        setPlan(p);
        setAvailable((p?.materials || []).filter((m) => (m.qty || 0) > (m.installed_qty || 0)).map((m) => ({ posmat_type_id: m.posmat_type_id, name: m.name, unit: m.unit, remaining: m.qty - (m.installed_qty || 0) })));
      })
      .catch((e) => { if (alive) setErr(e.message || "Gagal memuat material Plan"); });
    return () => { alive = false; };
  }, [sessionLoading, scope?.branchId, scope?.brand, planId]);

  // Pulihkan draft (kalau ada) SEKALI setelah daftar material selesai
  // dimuat - dicocokkan ulang ke `available` supaya material yang sudah
  // habis/berubah alokasinya sejak draft disimpan tidak dipulihkan mentah2.
  useEffect(() => {
    if (draftRestored || available.length === 0) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d?.note) setNote(d.note);
        if (Array.isArray(d?.items) && d.items.length > 0) {
          const restored = d.items
            .map((di) => {
              const m = available.find((a) => a.posmat_type_id === di.posmat_type_id);
              return m ? { posmat_type_id: m.posmat_type_id, name: m.name, unit: m.unit, remaining: m.remaining, qty: di.qty || "1" } : null;
            })
            .filter(Boolean);
          if (restored.length > 0) setItems(restored);
        }
      }
    } catch { /* draft rusak/kosong - abaikan */ }
    setDraftRestored(true);
  }, [available, draftRestored, draftKey]);

  // Tambah material satu per satu (bisa lebih dari satu jenis sekaligus di
  // retailer yang sama) - klik chip "+ Nama" utk menambahkan ke daftar yang
  // akan dipasang, mirip pola /posm/new. Qty tiap material dikurangi dari
  // sisa alokasi Plan begitu submit berhasil (dihitung server dari
  // mh_md_installation_items yang tertaut plan_allocation_id).
  function addItem(m) {
    if (items.some((i) => i.posmat_type_id === m.posmat_type_id)) return;
    setItems((prev) => [...prev, { posmat_type_id: m.posmat_type_id, name: m.name, unit: m.unit, remaining: m.remaining, qty: "1" }]);
  }
  function updateQty(id, qty) { setItems((prev) => prev.map((i) => i.posmat_type_id === id ? { ...i, qty } : i)); }
  function removeItem(id) { setItems((prev) => prev.filter((i) => i.posmat_type_id !== id)); }

  // Kamera LANGSUNG (capture="environment") - foto tunggal, bukan pilih dari
  // galeri. Galeri bebas SENGAJA tidak disediakan lagi di sini - kalau mau
  // gabung beberapa foto, harus lewat "Kolase" (PhotoCollageSheet, sama
  // persis dgn yg dipakai di Submit Actual Activity).
  function addPhotoFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setPhotos((prev) => [...prev, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }
  function removePhoto(i) { setPhotos((prev) => { URL.revokeObjectURL(prev[i].previewUrl); return prev.filter((_, idx) => idx !== i); }); }
  function addCollagePhoto(blob, previewUrl) {
    setPhotos((prev) => [...prev, { file: blob, previewUrl, isCollage: true }]);
    setCollageOpen(false);
  }

  const hasUnsaved = items.length > 0 || note.trim().length > 0 || photos.length > 0;

  function handleBack() {
    if (hasUnsaved) { setShowBackConfirm(true); return; }
    router.back();
  }
  function saveDraftAndLeave() {
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        note,
        items: items.map((i) => ({ posmat_type_id: i.posmat_type_id, qty: i.qty })),
        savedAt: Date.now(),
      }));
    } catch { /* localStorage penuh/diblokir - best-effort saja */ }
    setShowBackConfirm(false);
    router.back();
  }
  function discardAndLeave() {
    try { localStorage.removeItem(draftKey); } catch { /* best-effort */ }
    setShowBackConfirm(false);
    router.back();
  }

  function requestSubmit() {
    setErr("");
    if (items.length === 0) { setErr("Tambahkan minimal satu material yang dipasang."); return; }
    if (items.some((i) => !i.qty || Number(i.qty) <= 0)) { setErr("Jumlah tiap material harus lebih dari nol."); return; }
    if (items.some((i) => Number(i.qty) > i.remaining)) { setErr("Jumlah material tidak boleh melebihi sisa alokasi."); return; }
    if (lat == null || lng == null) { setErr("Titik lokasi (GPS atau koordinat manual) wajib diisi."); return; }
    setShowSubmitConfirm(true);
  }

  async function submit() {
    setBusy(true);
    try {
      const ins = await submitRetailerInstallation({
        planId, outletCode, outletName, branchName, mc, note: note.trim(), items, lat, lng,
      });
      for (let i = 0; i < photos.length; i++) {
        try { const blob = await compressToMaxBytes(photos[i].file); await addInstallationPhoto(ins.id, blob, i); } catch { /* best-effort */ }
      }
      try { localStorage.removeItem(draftKey); } catch { /* best-effort */ }
      setShowSubmitConfirm(false);
      setDone(true);
    } catch (e) {
      setShowSubmitConfirm(false);
      setErr(e.message || "Gagal menyimpan pemasangan"); setBusy(false);
    }
  }

  if (sessionLoading || plan === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  if (done) {
    return (
      <MobileShell active="home">
        <div style={{ padding: "80px 24px", textAlign: "center", fontFamily: FF }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(21,128,61,0.10)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <CheckCircle2 size={28} color="#15803D" />
          </div>
          <div style={{ marginTop: 16, fontSize: 16, fontWeight: 800 }}>POSM Berhasil Disubmit</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96", lineHeight: 1.6 }}>Pemasangan di outlet {outletName.toUpperCase()} tersimpan &amp; menunggu validasi.</div>
          <button onClick={() => router.replace("/martahub/m/posm")}
            style={{ marginTop: 22, width: "100%", height: 48, borderRadius: 13, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
            Kembali ke POSM
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell active="home">
      <style>{"@keyframes mspin { to { transform: rotate(360deg); } }"}</style>
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 16px) 20px 0", fontFamily: FF }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={handleBack} style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68", flexShrink: 0 }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ fontSize: 16, fontWeight: 800, flex: 1, minWidth: 0 }}>Retailer Instalment</div>
          {/* Tombol kirim di ujung kanan header, bukan bar bawah - selalu
              terlihat tanpa memakan ruang scroll, dgn ikon Send. */}
          <button onClick={requestSubmit} disabled={busy} type="button"
            style={{ width: 40, height: 40, borderRadius: 12, border: "none", cursor: busy ? "default" : "pointer", background: BRAND, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 3px 10px rgba(237,28,36,0.28)" }}>
            {busy ? <Loader2 size={16} style={{ animation: "mspin .85s linear infinite" }} /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
        {plan && (
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: "#F0F0F3", flexShrink: 0, overflow: "hidden" }}>
                {posmPlanVisualUrl(plan.visual_path) && <img src={posmPlanVisualUrl(plan.visual_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#B0B0BA" }}>Nama POSM</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan.name}</div>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <FieldLabel text="Retailer" />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Store size={15} color="#8A8A96" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C" }}>{outletName.toUpperCase()}</div>
              <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>ID {outletCode} · {branchName}{mc ? ` · ${mc}` : ""}</div>
            </div>
          </div>
        </Card>

        <Card>
          <FieldLabel text="Lokasi (wajib)" />
          {lat != null && lng != null && !manualLoc ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(21,128,61,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MapPin size={15} color="#15803D" />
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{lat.toFixed(6)}, {lng.toFixed(6)}</div>
              <button onClick={useMyLocation} type="button"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#5A5A68", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, fontFamily: FF }}>
                {locating ? <Loader2 size={13} style={{ animation: "mspin .85s linear infinite" }} /> : <Crosshair size={13} />} Ulangi
              </button>
            </div>
          ) : (
            <div>
              <button onClick={useMyLocation} type="button"
                style={{ width: "100%", height: 42, borderRadius: 11, border: "1.5px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {locating ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : <Crosshair size={14} />} {locating ? "Mengambil lokasi…" : "Ambil Lokasi GPS"}
              </button>
              {locErr && <div style={{ marginTop: 8, fontSize: 11, color: "#C62828", fontWeight: 600 }}>{locErr}</div>}
              {!manualLoc ? (
                <button onClick={() => setManualLoc(true)} type="button"
                  style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, fontFamily: FF, padding: 0 }}>
                  <Pencil size={11} /> Isi koordinat manual
                </button>
              ) : (
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <input value={latInput} onChange={(e) => setLatInput(e.target.value)} placeholder="Latitude" inputMode="decimal"
                    style={{ flex: 1, height: 40, padding: "0 11px", borderRadius: 10, border: "1.5px solid #ECEDF0", fontSize: 12.5, fontFamily: FF, outline: "none" }} />
                  <input value={lngInput} onChange={(e) => setLngInput(e.target.value)} placeholder="Longitude" inputMode="decimal"
                    style={{ flex: 1, height: 40, padding: "0 11px", borderRadius: 10, border: "1.5px solid #ECEDF0", fontSize: 12.5, fontFamily: FF, outline: "none" }} />
                  <button onClick={applyManualLoc} type="button"
                    style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "none", background: BRAND, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                    OK
                  </button>
                </div>
              )}
            </div>
          )}
          <LocationMapPreview lat={lat} lng={lng} />
        </Card>

        <Card>
          <FieldLabel text="Material yang Dipasang" />
          {/* Thumbnail POSM + chip "+ Nama" - tap utk menambah satu jenis
              material ke daftar yang akan dipasang. Bisa tambah lebih dari
              satu jenis sekaligus di retailer yang sama. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#F0F0F3", flexShrink: 0, overflow: "hidden" }}>
              {plan && posmPlanVisualUrl(plan.visual_path) && <img src={posmPlanVisualUrl(plan.visual_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600, lineHeight: 1.4 }}>Tap jenis material di bawah utk menambahkannya. Boleh lebih dari satu.</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {available.filter((m) => !items.some((i) => i.posmat_type_id === m.posmat_type_id)).map((m) => (
              <button key={m.posmat_type_id} onClick={() => addItem(m)} type="button"
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 999, border: "1.5px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                <Plus size={12} /> {m.name} <span style={{ color: "#B0B0BA", fontWeight: 600 }}>(sisa {m.remaining})</span>
              </button>
            ))}
            {available.length === 0 && <div style={{ fontSize: 11.5, color: "#B0B0BA" }}>Semua material Plan ini sudah terpasang penuh di Branch Anda.</div>}
            {available.length > 0 && available.every((m) => items.some((i) => i.posmat_type_id === m.posmat_type_id)) && (
              <div style={{ fontSize: 11.5, color: "#B0B0BA" }}>Semua jenis material sudah ditambahkan.</div>
            )}
          </div>
          {items.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((i) => (
                <div key={i.posmat_type_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 11, background: "rgba(237,28,36,0.05)", border: "1.5px solid #ED1C24" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "#F0F0F3", flexShrink: 0, overflow: "hidden" }}>
                    {plan && posmPlanVisualUrl(plan.visual_path) && <img src={posmPlanVisualUrl(plan.visual_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{i.name} <span style={{ color: "#B0B0BA", fontWeight: 600 }}>(sisa {i.remaining})</span></div>
                  <input type="number" min="1" max={i.remaining} value={i.qty} onChange={(e) => updateQty(i.posmat_type_id, e.target.value)}
                    style={{ width: 56, height: 34, borderRadius: 9, border: "1.5px solid #ECEDF0", textAlign: "center", fontSize: 13, fontFamily: FF, outline: "none" }} />
                  <button onClick={() => removeItem(i.posmat_type_id)} type="button"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#B0B0BA", display: "flex" }}>
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <FieldLabel text="Dokumentasi Foto" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 11, overflow: "hidden", background: "#F0F0F3" }}>
                <img src={p.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {p.isCollage && (
                  <span style={{ position: "absolute", bottom: 4, left: 4, display: "flex", alignItems: "center", gap: 2, fontSize: 8, fontWeight: 800, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 999, padding: "1px 5px" }}>
                    <Images size={8} /> Kolase
                  </span>
                )}
                <button onClick={() => removePhoto(i)} type="button"
                  style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <X size={11} color="#fff" />
                </button>
              </div>
            ))}
            <label style={{ width: 72, height: 72, borderRadius: 11, border: "1.5px dashed #D8D9E0", background: "#F6F7F9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8A96", gap: 3 }}>
              <Camera size={16} />
              <span style={{ fontSize: 9, fontWeight: 700 }}>Ambil</span>
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addPhotoFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <button onClick={() => setCollageOpen(true)} type="button"
              style={{ width: 72, height: 72, borderRadius: 11, border: "1.5px dashed #D8D9E0", background: "#F6F7F9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8A96", gap: 3 }}>
              <Images size={16} />
              <span style={{ fontSize: 9, fontWeight: 700 }}>Kolase</span>
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 10.5, color: "#B0B0BA" }}>Unggah bebas dari Galeri tidak tersedia - gabungkan beberapa foto lewat "Kolase".</div>
          {collageOpen && <PhotoCollageSheet onClose={() => setCollageOpen(false)} onDone={addCollagePhoto} />}
        </Card>

        <Card>
          <FieldLabel text="Feedback / Catatan (opsional)" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tuliskan catatan bila ada" rows={2}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 11, border: "1.5px solid #ECEDF0", fontSize: 12.5, fontFamily: FF, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
        </Card>
      </div>

      {showSubmitConfirm && (
        <SubmitConfirmSheet
          outletName={outletName.toUpperCase()}
          itemsCount={items.length}
          totalQty={items.reduce((s, i) => s + (Number(i.qty) || 0), 0)}
          photosCount={photos.length}
          busy={busy}
          onCancel={() => setShowSubmitConfirm(false)}
          onConfirm={submit}
        />
      )}

      {showBackConfirm && (
        <BackConfirmSheet
          onCancel={() => setShowBackConfirm(false)}
          onSaveDraft={saveDraftAndLeave}
          onDiscard={discardAndLeave}
        />
      )}
    </MobileShell>
  );
}

function SubmitConfirmSheet({ outletName, itemsCount, totalQty, photosCount, busy, onCancel, onConfirm }) {
  return (
    <div onClick={() => !busy && onCancel()}
      style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.5)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF", borderRadius: "24px 24px 0 0", padding: "10px 22px calc(env(safe-area-inset-bottom,0px) + 22px)", fontFamily: FF, boxShadow: "0 -14px 44px rgba(23,24,28,0.2)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "6px auto 18px" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(237,28,36,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Send size={18} color="#ED1C24" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>Kirim Pemasangan POSM?</div>
            <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{outletName}</div>
          </div>
        </div>

        <div style={{ marginTop: 14, padding: "12px 13px", borderRadius: 12, background: "#F7F7F9", fontSize: 12.5, color: "#3A3A44", lineHeight: 1.8, fontWeight: 600 }}>
          <b>{itemsCount}</b> jenis material · total <b>{totalQty}</b> unit akan dipasang{photosCount > 0 ? <> dengan <b>{photosCount}</b> foto dokumentasi</> : ""}.
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#5A5A68", lineHeight: 1.6 }}>
          Setelah dikirim, data akan masuk antrean validasi dan sisa alokasi material langsung berkurang. Pastikan jumlah sudah benar.
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, height: 48, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={busy}
            style={{ flex: 1.3, height: 48, borderRadius: 12, border: "none", cursor: busy ? "default" : "pointer", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {busy ? <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} /> : <Send size={15} />}
            {busy ? "Mengirim…" : "Ya, Kirim"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BackConfirmSheet({ onCancel, onSaveDraft, onDiscard }) {
  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.5)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF", borderRadius: "24px 24px 0 0", padding: "10px 22px calc(env(safe-area-inset-bottom,0px) + 22px)", fontFamily: FF, boxShadow: "0 -14px 44px rgba(23,24,28,0.2)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "6px auto 18px" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(184,134,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertTriangle size={19} color="#B8860B" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>Ada Perubahan Belum Disimpan</div>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 12.5, color: "#5A5A68", lineHeight: 1.6 }}>
          Material, jumlah, atau catatan yang sudah diisi belum dikirim. Simpan sebagai draft dulu supaya bisa dilanjutkan nanti, atau hapus perubahan ini.
        </div>

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 9 }}>
          <button onClick={onSaveDraft}
            style={{ width: "100%", height: 48, borderRadius: 12, border: "none", cursor: "pointer", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <FolderClock size={15} /> Simpan sebagai Draft
          </button>
          <button onClick={onDiscard}
            style={{ width: "100%", height: 48, borderRadius: 12, border: "1px solid #F3C6C6", background: "#FFFFFF", color: "#DC2626", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Trash2 size={15} /> Hapus Perubahan
          </button>
          <button onClick={onCancel}
            style={{ width: "100%", height: 44, borderRadius: 12, border: "none", background: "none", color: "#8A8A96", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ children }) { return <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 15, padding: 14 }}>{children}</div>; }
function FieldLabel({ text }) { return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96", marginBottom: 9 }}>{text}</div>; }
