"use client";
/**
 * /martahub/m/posm/new - Catat instalasi materi POSM (web mobile), padanan
 * `md_activity_create_screen.dart` Flutter: 3 mode (Terikat Activity/Outlet/
 * Street Branding), GPS wajib, daftar item (jenis + qty), foto bukti.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Crosshair, Loader2, Plus, X, Camera, ImagePlus, CheckCircle2 } from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { fetchScopeSites } from "../../_shared/planData";
import { INSTALL_MODES, fetchMyAvailableTypes, submitInstallation, addInstallationPhoto } from "../../_shared/posmData";

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

export default function PosmNewPage() {
  const router = useRouter();
  const { loading: sessionLoading, scope } = useMartaSession();

  const [mode, setMode] = useState("activity");
  const [activities, setActivities] = useState([]);
  const [activityId, setActivityId] = useState("");
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const [streetDesc, setStreetDesc] = useState("");
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");

  const [available, setAvailable] = useState(null);
  const [items, setItems] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (sessionLoading || !scope?.found) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: acts }, siteRows, avail] = await Promise.all([
          supabaseMarta.rpc("mh_activities_for_me").select("id,event_name,plan_date,status").order("created_at", { ascending: false }).limit(100),
          fetchScopeSites(scope.branchId, scope.brand),
          fetchMyAvailableTypes(),
        ]);
        if (!alive) return;
        setActivities(acts || []);
        setSites(siteRows || []);
        setAvailable(avail || []);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat data referensi");
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, scope]);

  function useMyLocation() {
    if (!navigator.geolocation) { setErr("Browser ini tidak mendukung geolocation."); return; }
    setLocating(true); setErr("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setLocating(false); },
      () => { setErr("Gagal mengambil lokasi. Pastikan izin lokasi diaktifkan."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  function addItem(t) {
    if (items.some((i) => i.posmat_type_id === t.posmat_type_id)) return;
    setItems((prev) => [...prev, { posmat_type_id: t.posmat_type_id, name: t.name, unit: t.unit, qty: "1" }]);
  }
  function updateQty(id, qty) { setItems((prev) => prev.map((i) => i.posmat_type_id === id ? { ...i, qty } : i)); }
  function removeItem(id) { setItems((prev) => prev.filter((i) => i.posmat_type_id !== id)); }

  function addPhotoFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setPhotos((prev) => [...prev, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }
  function removePhoto(i) {
    setPhotos((prev) => { URL.revokeObjectURL(prev[i].previewUrl); return prev.filter((_, idx) => idx !== i); });
  }

  async function submit() {
    setErr("");
    if (mode === "activity" && !activityId) { setErr("Pilih activity terlebih dulu."); return; }
    if (mode === "outlet" && !siteId) { setErr("Pilih outlet/site terlebih dulu."); return; }
    if (mode === "street" && !streetDesc.trim()) { setErr("Isi deskripsi lokasi street branding."); return; }
    if (lat == null || lng == null) { setErr("Titik GPS wajib diambil sebelum submit."); return; }
    if (items.length === 0) { setErr("Tambahkan minimal satu jenis material."); return; }
    if (items.some((i) => !i.qty || Number(i.qty) <= 0)) { setErr("Jumlah tiap item harus lebih dari nol."); return; }

    setSaving(true);
    try {
      const ins = await submitInstallation({
        mode, activityId, siteId, streetDescription: streetDesc.trim(), lat, lng, note: note.trim(), items,
      });
      for (let i = 0; i < photos.length; i++) {
        try {
          const blob = await compressImage(photos[i].file);
          await addInstallationPhoto(ins.id, blob, i);
        } catch { /* best-effort per foto */ }
      }
      setDone(true);
    } catch (e) {
      setErr(e.message || "Gagal menyimpan instalasi");
    } finally {
      setSaving(false);
    }
  }

  if (sessionLoading || available === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  if (done) {
    return (
      <MobileShell active="home">
        <div style={{ padding: "80px 24px", textAlign: "center", fontFamily: FF }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(21,128,61,0.10)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <CheckCircle2 size={28} color="#15803D" />
          </div>
          <div style={{ marginTop: 16, fontSize: 16, fontWeight: 800 }}>Instalasi Tercatat</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96", lineHeight: 1.6 }}>Instalasi materi POSM berhasil disimpan &amp; menunggu validasi lokasi.</div>
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
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 16px) 20px 0", fontFamily: FF }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.back()} style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Catat Instalasi POSM</div>
        </div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 120px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Mode */}
        <Card>
          <FieldLabel text="Mode Instalasi" required />
          <div style={{ display: "flex", background: "#F6F7F9", borderRadius: 12, padding: 3 }}>
            {INSTALL_MODES.map((m) => (
              <button key={m.key} onClick={() => setMode(m.key)}
                style={{ flex: 1, height: 38, borderRadius: 9, border: "none", background: mode === m.key ? "#17181C" : "transparent", color: mode === m.key ? "#fff" : "#5A5A68", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                {m.label}
              </button>
            ))}
          </div>

          {mode === "activity" && (
            <>
              <FieldLabel text="Activity" required top />
              <select value={activityId} onChange={(e) => setActivityId(e.target.value)} style={selectBase}>
                <option value="">Pilih activity…</option>
                {activities.map((a) => <option key={a.id} value={a.id}>{a.event_name || "-"} · {a.plan_date}</option>)}
              </select>
            </>
          )}
          {mode === "outlet" && (
            <>
              <FieldLabel text="Outlet / Site" required top />
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={selectBase}>
                <option value="">Pilih site…</option>
                {sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.site_id}{s.site_name ? ` · ${s.site_name}` : ""}</option>)}
              </select>
            </>
          )}
          {mode === "street" && (
            <>
              <FieldLabel text="Deskripsi Lokasi" required top />
              <textarea value={streetDesc} onChange={(e) => setStreetDesc(e.target.value)} placeholder="Contoh: Jl. Sudirman depan Indomaret, dekat perempatan…" rows={3}
                style={{ ...selectBase, height: 84, paddingTop: 10, resize: "vertical" }} />
            </>
          )}
        </Card>

        {/* GPS */}
        <Card>
          <FieldLabel text="Titik GPS" required hint="Wajib diambil di lokasi" />
          <button onClick={useMyLocation} disabled={locating}
            style={{ width: "100%", height: 46, borderRadius: 12, border: `1.5px solid ${lat ? "#15803D" : "#ECEDF0"}`, background: lat ? "rgba(21,128,61,0.06)" : "#F6F7F9", color: lat ? "#15803D" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {locating ? <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} /> : <Crosshair size={15} />}
            {locating ? "Mencari lokasi…" : lat ? `Titik ditandai · ${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Ambil Titik GPS"}
          </button>
        </Card>

        {/* Items */}
        <Card>
          <FieldLabel text="Jenis Material" required hint={`${items.length} dipilih`} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {available.filter((t) => !items.some((i) => i.posmat_type_id === t.posmat_type_id)).map((t) => (
              <button key={t.posmat_type_id} onClick={() => addItem(t)}
                style={{ padding: "7px 12px", borderRadius: 999, border: "1.5px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                + {t.name}
              </button>
            ))}
            {available.length === 0 && <div style={{ fontSize: 11.5, color: "#B0B0BA" }}>Belum ada jenis material terdaftar di cabang Anda.</div>}
          </div>
          {items.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((i) => (
                <div key={i.posmat_type_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 11, background: "#F7F7F9" }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{i.name} <span style={{ color: "#B0B0BA", fontWeight: 600 }}>({i.unit})</span></div>
                  <input type="number" min="1" value={i.qty} onChange={(e) => updateQty(i.posmat_type_id, e.target.value)}
                    style={{ width: 60, height: 34, borderRadius: 9, border: "1.5px solid #ECEDF0", textAlign: "center", fontSize: 13, fontFamily: FF, outline: "none" }} />
                  <button onClick={() => removeItem(i.posmat_type_id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B0B0BA" }}>
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Photos */}
        <Card>
          <FieldLabel text="Foto Bukti" hint={`${photos.length} foto`} />
          <PhotoPicker photos={photos} onAdd={addPhotoFiles} onRemove={removePhoto} />
        </Card>

        {/* Note */}
        <Card>
          <FieldLabel text="Catatan" hint="Opsional" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            style={{ ...selectBase, height: 64, paddingTop: 10, resize: "vertical" }} />
        </Card>
      </div>

      <div style={{ position: "sticky", bottom: 66, background: "linear-gradient(180deg,rgba(244,245,247,0) 0%,#F4F5F7 30%)", padding: "16px 20px 0" }}>
        <button onClick={submit} disabled={saving}
          style={{ width: "100%", height: 52, borderRadius: 14, border: "none", cursor: saving ? "default" : "pointer", background: BRAND, color: "#fff", fontSize: 14.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, boxShadow: "0 4px 14px rgba(17,17,20,0.11)" }}>
          {saving ? <Loader2 size={17} style={{ animation: "mspin .85s linear infinite" }} /> : <CheckCircle2 size={18} />}
          {saving ? "Menyimpan…" : "Simpan Instalasi"}
        </button>
      </div>
    </MobileShell>
  );
}

function PhotoPicker({ photos, onAdd, onRemove }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ flex: 1, height: 42, borderRadius: 11, border: "1.5px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          <Camera size={15} /> Ambil Foto
          <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
        </label>
        <label style={{ flex: 1, height: 42, borderRadius: 11, border: "1.5px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          <ImagePlus size={15} /> Dari Galeri
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: "#F0F0F3" }}>
              <img src={p.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={() => onRemove(i)} style={{ position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={13} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const selectBase = { width: "100%", height: 46, padding: "0 12px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 13, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };

function Card({ children }) {
  return <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: 15 }}>{children}</div>;
}
function FieldLabel({ text, required, hint, top }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginTop: top ? 14 : 0, marginBottom: 7 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96" }}>{text}</span>
      {required && <span style={{ color: "#ED1C24", fontWeight: 800, marginLeft: 3 }}>*</span>}
      {hint && <span style={{ marginLeft: "auto", fontSize: 10, color: "#B0B0BA", fontWeight: 500 }}>{hint}</span>}
    </div>
  );
}
