"use client";
/**
 * /martahub/m/posm/revisi/[id] - "Perbaiki" Retailer Installment yang
 * ditandai CMS perlu revisi (mis. jumlah material mencurigakan, salah
 * outlet, dll - lihat tab "Instalasi" di POSMAT CMS, tombol "Minta
 * Revisi"). Titik GPS TIDAK diminta ulang - itulah intinya, BME bisa
 * membetulkan salah input TANPA harus kembali ke lokasi. Yang bisa diubah
 * hanya: jenis/qty material, catatan, dan foto (hapus yang salah, tambah
 * yang baru). Hanya bisa dibuka pemiliknya & selama masih berstatus
 * 'revision_needed' (ditegakkan di RPC mh_md_update_retailer_installation).
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, X, CheckCircle2, Camera, Images, Loader2, Store, MapPin, Plus, Send, AlertTriangle } from "lucide-react";
import LocationMapPreview from "../../../_shared/LocationMapPreview";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../../_shared/MobileShell";
import { fetchPlansForBranch, getInstallationForEdit, updateRetailerInstallation, addInstallationPhoto, deleteInstallationPhoto, installPhotoUrl, posmPlanVisualUrl } from "../../../_shared/posmData";
import { compressToMaxBytes } from "../../../_shared/imageTools";
import PhotoCollageSheet from "../../../_shared/PhotoCollageSheet";

export default function RevisiInstallPage() {
  const { id } = useParams();
  const router = useRouter();
  const { loading: sessionLoading, scope } = useMartaSession();

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [ins, setIns] = useState(null);
  const [plan, setPlan] = useState(null);
  const [available, setAvailable] = useState([]);
  const [items, setItems] = useState([]);
  const [existingPhotos, setExistingPhotos] = useState([]); // [{id, storage_path}]
  const [newPhotos, setNewPhotos] = useState([]); // [{file, previewUrl, isCollage}]
  const [collageOpen, setCollageOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);

  useEffect(() => {
    if (sessionLoading || !id) return;
    let alive = true;
    (async () => {
      setLoading(true); setLoadErr("");
      try {
        const data = await getInstallationForEdit(id);
        if (!alive) return;
        if (!data) { setLoadErr("Instalasi tidak ditemukan, atau bukan milik Anda."); setLoading(false); return; }
        if (data.review_status !== "revision_needed") {
          setLoadErr("Instalasi ini tidak (lagi) diminta revisi oleh CMS.");
          setLoading(false); return;
        }
        setIns(data);
        setNote(data.note || "");
        setExistingPhotos(data.photos || []);

        const plans = await fetchPlansForBranch(scope?.branchId, scope?.brand);
        const p = (plans || []).find((r) => r.id === data.plan_id) || null;
        setPlan(p);
        const materials = (p?.materials || []).map((m) => ({
          posmat_type_id: m.posmat_type_id, name: m.name, unit: m.unit,
          remaining: m.qty - (m.installed_qty || 0),
        }));
        // Qty milik instalasi ini SENDIRI sudah ikut kehitung di installed_qty
        // (belum diganti) - tambahkan balik ke remaining supaya tidak salah
        // membatasi qty yang memang sudah jadi miliknya sebelum direvisi.
        for (const it of data.items || []) {
          const m = materials.find((x) => x.posmat_type_id === it.posmat_type_id);
          if (m) m.remaining += Number(it.qty) || 0;
        }
        setAvailable(materials);
        setItems((data.items || []).map((it) => {
          const m = materials.find((x) => x.posmat_type_id === it.posmat_type_id);
          return { posmat_type_id: it.posmat_type_id, name: it.name, unit: it.unit, qty: String(it.qty), remaining: m ? m.remaining : Number(it.qty) };
        }));
      } catch (e) {
        setLoadErr(e.message || "Gagal memuat instalasi");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, id, scope?.branchId, scope?.brand]);

  function addItem(m) {
    if (items.some((i) => i.posmat_type_id === m.posmat_type_id)) return;
    setItems((prev) => [...prev, { posmat_type_id: m.posmat_type_id, name: m.name, unit: m.unit, remaining: m.remaining, qty: "1" }]);
  }
  function updateQty(id2, qty) { setItems((prev) => prev.map((i) => i.posmat_type_id === id2 ? { ...i, qty } : i)); }
  function removeItem(id2) { setItems((prev) => prev.filter((i) => i.posmat_type_id !== id2)); }

  function addPhotoFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setNewPhotos((prev) => [...prev, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }
  function removeNewPhoto(i) { setNewPhotos((prev) => { URL.revokeObjectURL(prev[i].previewUrl); return prev.filter((_, idx) => idx !== i); }); }
  function addCollagePhoto(blob, previewUrl) {
    setNewPhotos((prev) => [...prev, { file: blob, previewUrl, isCollage: true }]);
    setCollageOpen(false);
  }

  // Foto lama dihapus LANGSUNG (bukan ditunda sampai submit) - server hanya
  // mengizinkan hapus selama status masih 'revision_needed', jadi harus
  // dilakukan sebelum update final mengubah status jadi 'revised'.
  async function removeExistingPhoto(photoId) {
    setDeletingPhotoId(photoId); setErr("");
    try {
      await deleteInstallationPhoto(photoId);
      setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (e) {
      setErr(e.message || "Gagal menghapus foto");
    } finally {
      setDeletingPhotoId(null);
    }
  }

  function requestSubmit() {
    setErr("");
    if (items.length === 0) { setErr("Tambahkan minimal satu material yang dipasang."); return; }
    if (items.some((i) => !i.qty || Number(i.qty) <= 0)) { setErr("Jumlah tiap material harus lebih dari nol."); return; }
    if (items.some((i) => Number(i.qty) > i.remaining)) { setErr("Jumlah material tidak boleh melebihi sisa alokasi."); return; }
    setShowConfirm(true);
  }

  async function submit() {
    setBusy(true);
    try {
      await updateRetailerInstallation({ id, items, note: note.trim() });
      for (let i = 0; i < newPhotos.length; i++) {
        try { const blob = await compressToMaxBytes(newPhotos[i].file); await addInstallationPhoto(id, blob, i); } catch { /* best-effort */ }
      }
      setShowConfirm(false);
      setDone(true);
    } catch (e) {
      setShowConfirm(false);
      setErr(e.message || "Gagal menyimpan perbaikan"); setBusy(false);
    }
  }

  if (sessionLoading || loading) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  if (loadErr) {
    return (
      <MobileShell active="home">
        <div style={{ padding: "60px 24px", textAlign: "center", fontFamily: FF }}>
          <AlertTriangle size={32} color="#B8860B" style={{ margin: "0 auto" }} />
          <div style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: "#17181C" }}>{loadErr}</div>
          <button onClick={() => router.push("/martahub/m/posm")}
            style={{ marginTop: 20, width: "100%", height: 46, borderRadius: 13, border: "none", background: BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
            Kembali ke POSM
          </button>
        </div>
      </MobileShell>
    );
  }

  if (done) {
    return (
      <MobileShell active="home">
        <div style={{ padding: "80px 24px", textAlign: "center", fontFamily: FF }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(21,128,61,0.10)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <CheckCircle2 size={28} color="#15803D" />
          </div>
          <div style={{ marginTop: 16, fontSize: 16, fontWeight: 800 }}>Perbaikan Tersimpan</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96", lineHeight: 1.6 }}>Perubahan sudah dikirim, tidak perlu kembali ke lokasi outlet.</div>
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
          <button onClick={() => router.back()} style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68", flexShrink: 0 }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ fontSize: 16, fontWeight: 800, flex: 1, minWidth: 0 }}>Perbaiki Pemasangan</div>
          <button onClick={requestSubmit} disabled={busy} type="button"
            style={{ width: 40, height: 40, borderRadius: 12, border: "none", cursor: busy ? "default" : "pointer", background: BRAND, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 3px 10px rgba(237,28,36,0.28)" }}>
            {busy ? <Loader2 size={16} style={{ animation: "mspin .85s linear infinite" }} /> : <Send size={16} />}
          </button>
        </div>
      </div>

      <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FFF7ED", border: "1px solid #FED7AA", fontSize: 11.5, color: "#7C2D12", lineHeight: 1.6, fontWeight: 600 }}>
        <b>Alasan revisi dari CMS:</b> {ins?.review_notes || "-"}
      </div>

      {err && <div style={{ margin: "10px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <FieldLabel text="Retailer" />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Store size={15} color="#8A8A96" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C" }}>{(ins?.retailer_outlet_name || "-").toUpperCase()}</div>
              <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>ID {ins?.retailer_outlet_code} · {ins?.retailer_branch_name}{ins?.retailer_mc ? ` · ${ins.retailer_mc}` : ""}</div>
            </div>
          </div>
        </Card>

        <Card>
          <FieldLabel text="Lokasi (dari pemasangan pertama - tidak diubah)" />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(21,128,61,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MapPin size={15} color="#15803D" />
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>
              {ins ? `${Number(ins.latitude).toFixed(6)}, ${Number(ins.longitude).toFixed(6)}` : "-"}
            </div>
          </div>
          {ins && <LocationMapPreview lat={Number(ins.latitude)} lng={Number(ins.longitude)} />}
        </Card>

        <Card>
          <FieldLabel text="Material yang Dipasang" />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#F0F0F3", flexShrink: 0, overflow: "hidden" }}>
              {plan && posmPlanVisualUrl(plan.visual_path) && <img src={posmPlanVisualUrl(plan.visual_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600, lineHeight: 1.4 }}>Betulkan jenis/jumlah material yang tercatat salah.</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {available.filter((m) => !items.some((i) => i.posmat_type_id === m.posmat_type_id)).map((m) => (
              <button key={m.posmat_type_id} onClick={() => addItem(m)} type="button"
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 999, border: "1.5px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                <Plus size={12} /> {m.name} <span style={{ color: "#B0B0BA", fontWeight: 600 }}>(sisa {m.remaining})</span>
              </button>
            ))}
          </div>
          {items.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((i) => (
                <div key={i.posmat_type_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 11, background: "rgba(237,28,36,0.05)", border: "1.5px solid #ED1C24" }}>
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
            {existingPhotos.map((p) => (
              <div key={p.id} style={{ position: "relative", width: 72, height: 72, borderRadius: 11, overflow: "hidden", background: "#F0F0F3" }}>
                <img src={installPhotoUrl(p.storage_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button onClick={() => removeExistingPhoto(p.id)} disabled={deletingPhotoId === p.id} type="button"
                  style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  {deletingPhotoId === p.id ? <Loader2 size={11} color="#fff" style={{ animation: "mspin .85s linear infinite" }} /> : <X size={11} color="#fff" />}
                </button>
              </div>
            ))}
            {newPhotos.map((p, i) => (
              <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 11, overflow: "hidden", background: "#F0F0F3" }}>
                <img src={p.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {p.isCollage && (
                  <span style={{ position: "absolute", bottom: 4, left: 4, display: "flex", alignItems: "center", gap: 2, fontSize: 8, fontWeight: 800, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 999, padding: "1px 5px" }}>
                    <Images size={8} /> Kolase
                  </span>
                )}
                <button onClick={() => removeNewPhoto(i)} type="button"
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
          {collageOpen && <PhotoCollageSheet onClose={() => setCollageOpen(false)} onDone={addCollagePhoto} />}
        </Card>

        <Card>
          <FieldLabel text="Feedback / Catatan (opsional)" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tuliskan catatan bila ada" rows={2}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 11, border: "1.5px solid #ECEDF0", fontSize: 12.5, fontFamily: FF, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
        </Card>
      </div>

      {showConfirm && (
        <div onClick={() => !busy && setShowConfirm(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.5)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF", borderRadius: "24px 24px 0 0", padding: "10px 22px calc(env(safe-area-inset-bottom,0px) + 22px)", fontFamily: FF, boxShadow: "0 -14px 44px rgba(23,24,28,0.2)" }}>
            <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "6px auto 18px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(237,28,36,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Send size={18} color="#ED1C24" />
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>Kirim Perbaikan?</div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12.5, color: "#5A5A68", lineHeight: 1.6 }}>
              <b>{items.length}</b> jenis material · total <b>{items.reduce((s, i) => s + (Number(i.qty) || 0), 0)}</b> unit. Titik lokasi tidak berubah.
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ flex: 1, height: 48, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={submit} disabled={busy}
                style={{ flex: 1.3, height: 48, borderRadius: 12, border: "none", cursor: busy ? "default" : "pointer", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                {busy ? <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} /> : <Send size={15} />}
                {busy ? "Mengirim…" : "Ya, Kirim"}
              </button>
            </div>
          </div>
        </div>
      )}
    </MobileShell>
  );
}

function Card({ children }) { return <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 15, padding: 14 }}>{children}</div>; }
function FieldLabel({ text }) { return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96", marginBottom: 9 }}>{text}</div>; }
