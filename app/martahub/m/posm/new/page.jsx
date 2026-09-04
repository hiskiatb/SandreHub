"use client";
/**
 * /martahub/m/posm/new - Catat instalasi materi POSM (web mobile), padanan
 * `md_activity_create_screen.dart` Flutter: 3 mode (Terikat Activity/Outlet/
 * Street Branding), GPS wajib, daftar item (jenis + qty), foto bukti.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Crosshair, Loader2, Plus, X, Camera, ImagePlus, Images, CheckCircle2 } from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { fetchScopeSites, APPROVER_ROLES, BRAND_DISPLAY } from "../../_shared/planData";
import { INSTALL_MODES, fetchBranchOptions, fetchPlansForBranch, submitInstallation, addInstallationPhoto, posmPlanVisualUrl } from "../../_shared/posmData";
import { compressToMaxBytes } from "../../_shared/imageTools";
import PhotoCollageSheet from "../../_shared/PhotoCollageSheet";

const BRAND_CHOICES = [{ key: "im3", label: "IM3" }, { key: "tri", label: "3ID" }];

export default function PosmNewPage() {
  const router = useRouter();
  const { loading: sessionLoading, scope } = useMartaSession();
  // Head TMV/Brand TMV/SPM Sumatera/Admin tidak punya branch tetap sendiri -
  // sama seperti Create Plan wizard, mereka dapat picker branch tujuan
  // sendiri (+ brand kalau scope mereka juga tidak fixed ke satu brand).
  const isApprover = APPROVER_ROLES.includes(scope?.role);

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

  const [targetBranchId, setTargetBranchId] = useState("");
  const [targetBrand, setTargetBrand] = useState("");
  const [branchOptions, setBranchOptions] = useState([]);

  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState("");
  const [items, setItems] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [collageOpen, setCollageOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(new Set());

  // Menandai SATU field yg gagal validasi (merah di kartunya) + auto-scroll
  // ke situ - sebelumnya submit() cuma nampilin pesan error di atas tanpa
  // menandai ATAU menggulung ke field yg dimaksud, jadi kalau field-nya lagi
  // tidak terlihat di layar (di bawah/di atas), DSF harus nebak sendiri
  // bagian mana yg kurang.
  function fail(key, message) {
    setErr(message);
    setInvalid(new Set([key]));
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.getElementById(`field-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 30);
    });
  }

  // Branch & brand yang SEBENARNYA dipakai utk site list + stok tersedia:
  // approver pakai pilihan manual mereka, BME/RGE dkk pakai scope sendiri
  // (perilaku lama, tidak berubah).
  const effBranchId = isApprover ? targetBranchId : scope?.branchId;
  const effBrand = isApprover ? (scope?.brand || targetBrand) : scope?.brand;

  // Daftar activity (tidak tergantung branch - dari mh_activities_for_me).
  useEffect(() => {
    if (sessionLoading || !scope?.found) return;
    let alive = true;
    (async () => {
      try {
        const { data: acts } = await supabaseMarta.rpc("mh_activities_for_me").select("id,event_name,plan_date,status").order("created_at", { ascending: false }).limit(100);
        if (!alive) return;
        setActivities(acts || []);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat data referensi");
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, scope]);

  // Pilihan branch utk approver - dibatasi ke region mereka sendiri (kecuali
  // scope unscoped spt admin/SPM Sumatera → semua cabang nasional).
  useEffect(() => {
    if (sessionLoading || !isApprover) return;
    let alive = true;
    fetchBranchOptions(scope?.unscoped ? undefined : (scope?.region || undefined))
      .then((rows) => { if (alive) setBranchOptions(rows || []); })
      .catch((e) => { if (alive) setErr(e.message || "Gagal memuat daftar branch"); });
    return () => { alive = false; };
  }, [sessionLoading, isApprover, scope]);

  // Site + Plan POSM aktif yang punya alokasi di branch+brand EFEKTIF - baru
  // jalan setelah approver selesai memilih branch (& brand kalau perlu).
  // Material yang bisa dipilih SEKARANG mengikuti Plan yang dipilih user
  // (bukan lagi katalog global per branch), sesuai rombak total POSM.
  useEffect(() => {
    if (sessionLoading || !scope?.found) return;
    if (!effBranchId || !effBrand) { setSites([]); setPlans([]); setPlanId(""); return; }
    let alive = true;
    (async () => {
      try {
        const [siteRows, planRows] = await Promise.all([
          fetchScopeSites(effBranchId, effBrand),
          fetchPlansForBranch(effBranchId, effBrand),
        ]);
        if (!alive) return;
        setSites(siteRows || []);
        setPlans(planRows || []);
        setPlanId("");
        setItems([]);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat data referensi");
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, scope, isApprover, effBranchId, effBrand]);

  const selectedPlan = (plans || []).find((p) => p.id === planId) || null;
  const available = selectedPlan ? selectedPlan.materials.filter((m) => m.qty > (m.installed_qty || 0)) : [];

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
  function addCollagePhoto(blob, previewUrl) {
    setPhotos((prev) => [...prev, { file: blob, previewUrl, isCollage: true }]);
    setCollageOpen(false);
  }

  async function submit() {
    setErr("");
    setInvalid(new Set());
    if (isApprover && !targetBranchId) { fail("targetBranchId", "Pilih branch tujuan pemasangan dulu."); return; }
    if (isApprover && !effBrand) { fail("targetBrand", "Pilih brand dulu."); return; }
    if (mode === "activity" && !activityId) { fail("activityId", "Pilih activity terlebih dulu."); return; }
    if (mode === "outlet" && !siteId) { fail("siteId", "Pilih outlet/site terlebih dulu."); return; }
    if (mode === "street" && !streetDesc.trim()) { fail("streetDesc", "Isi deskripsi lokasi street branding."); return; }
    if (lat == null || lng == null) { fail("geo", "Titik GPS wajib diambil sebelum submit."); return; }
    if (!planId) { fail("planId", "Pilih Plan POSM terlebih dulu."); return; }
    if (items.length === 0) { fail("items", "Tambahkan minimal satu jenis material."); return; }
    if (items.some((i) => !i.qty || Number(i.qty) <= 0)) { fail("items", "Jumlah tiap item harus lebih dari nol."); return; }

    setSaving(true);
    try {
      const ins = await submitInstallation({
        mode, activityId, siteId, streetDescription: streetDesc.trim(), lat, lng, note: note.trim(), items,
        branchId: isApprover ? effBranchId : undefined,
        brand: isApprover ? effBrand : undefined,
        planId,
      });
      for (let i = 0; i < photos.length; i++) {
        try {
          const blob = await compressToMaxBytes(photos[i].file);
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

  if (sessionLoading || plans === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

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
        {/* Branch tujuan - HANYA utk approver (Head/Brand TMV/SPM Sumatera/
            Admin) yg tidak punya branch tetap sendiri. Stok yang dipakai akan
            mengurangi alokasi branch yang dipilih di sini. */}
        {isApprover && (
          <Card id="field-targetBranchId" error={invalid.has("targetBranchId")}>
            <FieldLabel text="Pasang di Branch" required hint="Stok ikut branch ini" />
            <select value={targetBranchId} onChange={(e) => { setTargetBranchId(e.target.value); setSiteId(""); setItems([]); }} style={selectBase}>
              <option value="">Pilih branch tujuan…</option>
              {branchOptions.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
            </select>
            {!scope?.brand && (
              <div id="field-targetBrand">
                <FieldLabel text="Brand" required top />
                <div style={{ display: "flex", gap: 8 }}>
                  {BRAND_CHOICES.map((b) => (
                    <button key={b.key} onClick={() => { setTargetBrand(b.key); setSiteId(""); setItems([]); }}
                      style={{ flex: 1, height: 40, borderRadius: 10, border: targetBrand === b.key ? "none" : "1.5px solid #ECEDF0", background: targetBrand === b.key ? BRAND : "#F6F7F9", color: targetBrand === b.key ? "#fff" : "#5A5A68", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Mode */}
        <Card id={mode === "activity" ? "field-activityId" : mode === "outlet" ? "field-siteId" : "field-streetDesc"} error={invalid.has("activityId") || invalid.has("siteId") || invalid.has("streetDesc")}>
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
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={isApprover && !effBranchId} style={selectBase}>
                <option value="">{isApprover && !effBranchId ? "Pilih branch dulu…" : "Pilih site…"}</option>
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
        <Card id="field-geo" error={invalid.has("geo")}>
          <FieldLabel text="Titik GPS" required hint="Wajib diambil di lokasi" />
          <button onClick={useMyLocation} disabled={locating}
            style={{ width: "100%", height: 46, borderRadius: 12, border: `1.5px solid ${lat ? "#15803D" : "#ECEDF0"}`, background: lat ? "rgba(21,128,61,0.06)" : "#F6F7F9", color: lat ? "#15803D" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {locating ? <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} /> : <Crosshair size={15} />}
            {locating ? "Mencari lokasi…" : lat ? `Titik ditandai · ${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Ambil Titik GPS"}
          </button>
        </Card>

        {/* Plan POSM */}
        <Card id="field-planId" error={invalid.has("planId")}>
          <FieldLabel text="Plan POSM" required hint={plans.length === 0 ? "Tidak ada Plan aktif" : `${plans.length} tersedia`} />
          {plans.length === 0 ? (
            <div style={{ fontSize: 11.5, color: "#B0B0BA" }}>
              {!effBranchId || !effBrand ? "Pilih branch tujuan dulu di atas." : "Belum ada Plan POSM aktif dengan alokasi di branch ini."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {plans.map((p) => (
                <button key={p.id} onClick={() => { setPlanId(p.id); setItems([]); }}
                  style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", padding: "10px 12px", borderRadius: 12, border: planId === p.id ? "1.5px solid #ED1C24" : "1.5px solid #ECEDF0", background: planId === p.id ? "rgba(237,28,36,0.05)" : "#FFFFFF", cursor: "pointer", fontFamily: FF }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: "#F0F0F3", flexShrink: 0, overflow: "hidden" }}>
                    {posmPlanVisualUrl(p.visual_path) && <img src={posmPlanVisualUrl(p.visual_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: p.in_period ? "#8A8A96" : "#B8860B", fontWeight: 700 }}>
                      {p.period_from} - {p.period_to}{!p.in_period && " · Di luar periode"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Items */}
        <Card id="field-items" error={invalid.has("items")}>
          <FieldLabel text="Jenis Material" required hint={`${items.length} dipilih`} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {available.filter((t) => !items.some((i) => i.posmat_type_id === t.posmat_type_id)).map((t) => (
              <button key={t.posmat_type_id} onClick={() => addItem(t)}
                style={{ padding: "7px 12px", borderRadius: 999, border: "1.5px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                + {t.name}
              </button>
            ))}
            {available.length === 0 && (
              <div style={{ fontSize: 11.5, color: "#B0B0BA" }}>
                {!planId ? "Pilih Plan POSM dulu di atas." : "Semua material di Plan ini sudah mencapai alokasi."}
              </div>
            )}
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
          <PhotoPicker photos={photos} onAdd={addPhotoFiles} onRemove={removePhoto} onCollage={() => setCollageOpen(true)} />
        </Card>
        {collageOpen && <PhotoCollageSheet onClose={() => setCollageOpen(false)} onDone={addCollagePhoto} />}

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

function PhotoPicker({ photos, onAdd, onRemove, onCollage }) {
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
      {/* Kolase - gabung beberapa foto jadi satu, konsep dari app Flutter
          yang dikembalikan lagi di sini. */}
      <button onClick={onCollage}
        style={{ width: "100%", height: 40, marginTop: 8, borderRadius: 11, border: "none", background: "linear-gradient(135deg, rgba(237,28,36,0.10), rgba(236,0,140,0.10))", color: "#C6168D", fontSize: 12, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
        <Images size={15} /> Buat Kolase Foto
      </button>
      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: "#F0F0F3" }}>
              <img src={p.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {p.isCollage && (
                <span style={{ position: "absolute", bottom: 5, left: 5, display: "flex", alignItems: "center", gap: 3, fontSize: 8.5, fontWeight: 800, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 999, padding: "2px 6px" }}>
                  <Images size={9} /> Kolase
                </span>
              )}
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

function Card({ children, id, error }) {
  return <div id={id} style={{ background: "#FFFFFF", border: `1px solid ${error ? "#F3C6C6" : "#E9EAEE"}`, borderRadius: 16, padding: 15, scrollMarginTop: 100 }}>{children}</div>;
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
