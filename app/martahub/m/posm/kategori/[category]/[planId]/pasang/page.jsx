"use client";
/**
 * /martahub/m/posm/kategori/[category]/[planId]/pasang - Catat pemasangan
 * Outdoor Installment di SATU titik lokasi: bisa sekaligus beberapa jenis
 * material dari Plan yang sama (beda dgn Retailer Installment yang lewat
 * pencarian outlet - di sini pakai titik GPS, WAJIB diisi tapi ada opsi
 * input koordinat manual kalau GPS device gagal/ditolak).
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, X, CheckCircle2, Camera, ImagePlus, Loader2, MapPin, Crosshair, Pencil, ChevronDown, Plus, QrCode, TrendingUp } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../../../../_shared/MobileShell";
import { fetchPlansForBranch, submitInstallation, addInstallationPhoto, addCustomerActivationSales, CUSTOMER_ACTIVATION_SALES_CATEGORIES } from "../../../../../_shared/posmData";
import { compressToMaxBytes } from "../../../../../_shared/imageTools";
import QrScanSheet from "../../../../../_shared/QrScanSheet";

export default function OutdoorPasangPage() {
  const { category, planId } = useParams();
  const router = useRouter();
  const { loading: sessionLoading, scope } = useMartaSession();

  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [manualLoc, setManualLoc] = useState(false);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState("");
  const [photos, setPhotos] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [visitorCount, setVisitorCount] = useState("");
  const [salesEntries, setSalesEntries] = useState([]); // [{id, category, msisdn, qty, amount}]
  const [openCategory, setOpenCategory] = useState("");
  const [scanFor, setScanFor] = useState(null); // id baris yang lagi minta scan QR

  const isActivation = category === "customer_activation";
  const [activityName, setActivityName] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    fetchPlansForBranch(scope?.branchId, scope?.brand)
      .then((rows) => {
        if (!alive) return;
        const p = (rows || []).find((r) => r.id === planId) || null;
        setPlan(p);
        setItems((p?.materials || []).filter((m) => (m.qty || 0) > (m.installed_qty || 0)).map((m) => ({ posmat_type_id: m.posmat_type_id, name: m.name, unit: m.unit, remaining: m.qty - (m.installed_qty || 0), qty: "1", checked: false })));
      })
      .catch((e) => { if (alive) setErr(e.message || "Gagal memuat material Plan"); });
    return () => { alive = false; };
  }, [sessionLoading, scope?.branchId, scope?.brand, planId]);

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

  function toggleItem(id) { setItems((prev) => prev.map((i) => i.posmat_type_id === id ? { ...i, checked: !i.checked } : i)); }
  function updateQty(id, qty) { setItems((prev) => prev.map((i) => i.posmat_type_id === id ? { ...i, qty } : i)); }

  function addSalesRow(catKey) {
    setSalesEntries((prev) => [...prev, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, category: catKey, msisdn: "", qty: "1", amount: "" }]);
  }
  function updateSalesRow(id, patch) { setSalesEntries((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r)); }
  function removeSalesRow(id) { setSalesEntries((prev) => prev.filter((r) => r.id !== id)); }

  function addPhotoFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setPhotos((prev) => [...prev, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }
  function removePhoto(i) { setPhotos((prev) => { URL.revokeObjectURL(prev[i].previewUrl); return prev.filter((_, idx) => idx !== i); }); }

  async function submit() {
    setErr("");
    const chosen = items.filter((i) => i.checked);
    if (isActivation && !activityName.trim()) { setErr("Nama Aktivitas wajib diisi."); return; }
    if (chosen.length === 0) { setErr("Pilih minimal satu material yang dipasang."); return; }
    if (chosen.some((i) => !i.qty || Number(i.qty) <= 0)) { setErr("Jumlah tiap material harus lebih dari nol."); return; }
    if (lat == null || lng == null) { setErr("Lokasi (GPS atau koordinat manual) wajib diisi."); return; }
    if (isActivation && salesEntries.some((r) => !r.qty || Number(r.qty) <= 0)) { setErr("Jumlah tiap baris Laporan Penjualan harus lebih dari nol."); return; }
    setBusy(true);
    try {
      const noteFinal = isActivation && visitorCount ? [note.trim(), `Jumlah Pengunjung: ${visitorCount}`].filter(Boolean).join(" | ") : note.trim();
      const ins = await submitInstallation({
        mode: "street", activityId: null, siteId: null,
        streetDescription: isActivation ? activityName.trim() : plan.name,
        lat, lng, note: noteFinal, items: chosen, planId,
      });
      for (let i = 0; i < photos.length; i++) {
        try { const blob = await compressToMaxBytes(photos[i].file); await addInstallationPhoto(ins.id, blob, i); } catch { /* best-effort */ }
      }
      if (isActivation && salesEntries.length > 0) {
        try {
          await addCustomerActivationSales(ins.id, salesEntries.map((r) => ({ category: r.category, msisdn: r.msisdn.trim() || null, qty: Number(r.qty), amount: Number(r.amount) || 0 })));
        } catch { /* best-effort - pemasangan sudah tersimpan, laporan penjualan boleh gagal tanpa membatalkan submit */ }
      }
      setDone(true);
    } catch (e) {
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
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96", lineHeight: 1.6 }}>Pemasangan di titik ini tersimpan &amp; menunggu validasi.</div>
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
          <div style={{ fontSize: 16, fontWeight: 800 }}>{isActivation ? "Consumer Activation" : "Outdoor Instalment"}</div>
        </div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 130px", display: "flex", flexDirection: "column", gap: 12 }}>
        {plan && <div style={{ fontSize: 12, color: "#5A5A68", fontWeight: 600 }}>Nama POSM: <b style={{ color: "#17181C" }}>{plan.name}</b></div>}

        {isActivation && (
          <Card>
            <FieldLabel text="Nama Aktivitas" />
            <input value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder="Mis. Event, Open Booth, 7 Steps"
              style={{ width: "100%", height: 42, padding: "0 12px", borderRadius: 11, border: "1.5px solid #ECEDF0", fontSize: 12.5, fontFamily: FF, outline: "none", boxSizing: "border-box" }} />
          </Card>
        )}

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
        </Card>

        <Card>
          <FieldLabel text="Material yang Dipasang di Titik Ini" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((i) => (
              <div key={i.posmat_type_id} onClick={() => toggleItem(i.posmat_type_id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 11, background: i.checked ? "rgba(237,28,36,0.05)" : "#F7F7F9", border: i.checked ? "1.5px solid #ED1C24" : "1.5px solid transparent", cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{i.name} <span style={{ color: "#B0B0BA", fontWeight: 600 }}>(sisa {i.remaining})</span></div>
                {i.checked && (
                  <input type="number" min="1" value={i.qty} onClick={(e) => e.stopPropagation()} onChange={(e) => updateQty(i.posmat_type_id, e.target.value)}
                    style={{ width: 56, height: 34, borderRadius: 9, border: "1.5px solid #ECEDF0", textAlign: "center", fontSize: 13, fontFamily: FF, outline: "none" }} />
                )}
              </div>
            ))}
            {items.length === 0 && <div style={{ fontSize: 11.5, color: "#B0B0BA" }}>Semua material Plan ini sudah terpasang penuh di Branch Anda.</div>}
          </div>
        </Card>

        <Card>
          <FieldLabel text="Dokumentasi Foto" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 11, overflow: "hidden", background: "#F0F0F3" }}>
                <img src={p.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
            <label style={{ width: 72, height: 72, borderRadius: 11, border: "1.5px dashed #D8D9E0", background: "#F6F7F9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8A96", gap: 3 }}>
              <ImagePlus size={16} />
              <span style={{ fontSize: 9, fontWeight: 700 }}>Galeri</span>
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotoFiles(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        </Card>

        {isActivation && (
          <Card>
            <FieldLabel text="Laporan Penjualan" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CUSTOMER_ACTIVATION_SALES_CATEGORIES.map((cat) => {
                const rows = salesEntries.filter((r) => r.category === cat.key);
                const open = openCategory === cat.key;
                return (
                  <div key={cat.key} style={{ borderRadius: 12, border: "1.5px solid #ECEDF0", overflow: "hidden" }}>
                    <button type="button" onClick={() => setOpenCategory(open ? "" : cat.key)}
                      style={{ width: "100%", height: 42, padding: "0 12px", display: "flex", alignItems: "center", gap: 8, background: "#F7F7F9", border: "none", cursor: "pointer", fontFamily: FF }}>
                      <TrendingUp size={14} color="#5A5A68" />
                      <span style={{ flex: 1, textAlign: "left", fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{cat.label}</span>
                      {rows.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#ED1C24", background: "rgba(237,28,36,0.08)", padding: "2px 8px", borderRadius: 999 }}>{rows.length}</span>}
                      <ChevronDown size={15} color="#B0B0BA" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                    </button>
                    {open && (
                      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                        {rows.map((r) => (
                          <div key={r.id} style={{ padding: 9, borderRadius: 10, background: "#F7F7F9", display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input value={r.msisdn} onChange={(e) => updateSalesRow(r.id, { msisdn: e.target.value })} placeholder="MSISDN (opsional)"
                                style={{ flex: 1, minWidth: 0, height: 36, padding: "0 10px", borderRadius: 9, border: "1.5px solid #ECEDF0", fontSize: 12, fontFamily: FF, outline: "none" }} />
                              <button type="button" onClick={() => setScanFor(r.id)}
                                style={{ width: 36, height: 36, borderRadius: 9, border: "1.5px solid #ECEDF0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68", flexShrink: 0 }}>
                                <QrCode size={15} />
                              </button>
                              <button type="button" onClick={() => removeSalesRow(r.id)}
                                style={{ width: 36, height: 36, borderRadius: 9, border: "none", background: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#C4C4CE", flexShrink: 0 }}>
                                <X size={15} />
                              </button>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input type="number" min="1" value={r.qty} onChange={(e) => updateSalesRow(r.id, { qty: e.target.value })} placeholder="Qty"
                                style={{ flex: 1, height: 36, padding: "0 10px", borderRadius: 9, border: "1.5px solid #ECEDF0", fontSize: 12, fontFamily: FF, outline: "none" }} />
                              <input type="number" min="0" value={r.amount} onChange={(e) => updateSalesRow(r.id, { amount: e.target.value })} placeholder="Nominal (Rp)"
                                style={{ flex: 1.4, height: 36, padding: "0 10px", borderRadius: 9, border: "1.5px solid #ECEDF0", fontSize: 12, fontFamily: FF, outline: "none" }} />
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={() => addSalesRow(cat.key)}
                          style={{ height: 36, borderRadius: 9, border: "1.5px dashed #D8D9E0", background: "#fff", color: "#5A5A68", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <Plus size={13} /> Tambah {cat.label}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {isActivation && (
          <Card>
            <FieldLabel text="Jumlah Pengunjung" />
            <input type="number" min="0" value={visitorCount} onChange={(e) => setVisitorCount(e.target.value)} placeholder="0"
              style={{ width: "100%", height: 42, padding: "0 12px", borderRadius: 11, border: "1.5px solid #ECEDF0", fontSize: 12.5, fontFamily: FF, outline: "none", boxSizing: "border-box" }} />
          </Card>
        )}

        <Card>
          <FieldLabel text="Feedback / Catatan (opsional)" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tuliskan catatan bila ada" rows={2}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 11, border: "1.5px solid #ECEDF0", fontSize: 12.5, fontFamily: FF, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
        </Card>
      </div>

      {scanFor && (
        <QrScanSheet
          title="Scan QR Kartu SIM"
          onClose={() => setScanFor(null)}
          onDetect={(msisdn) => { updateSalesRow(scanFor, { msisdn }); setScanFor(null); }}
        />
      )}

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "10px 20px calc(env(safe-area-inset-bottom,0px) + 16px)", background: "#FFFFFF", borderTop: "1px solid #F0F0F3" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <button onClick={submit} disabled={busy}
            style={{ width: "100%", height: 48, borderRadius: 13, border: "none", cursor: busy ? "default" : "pointer", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {busy && <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} />}
            {busy ? "Menyimpan…" : "Submit POSM"}
          </button>
        </div>
      </div>
    </MobileShell>
  );
}

function Card({ children }) { return <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 15, padding: 14 }}>{children}</div>; }
function FieldLabel({ text }) { return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96", marginBottom: 9 }}>{text}</div>; }
