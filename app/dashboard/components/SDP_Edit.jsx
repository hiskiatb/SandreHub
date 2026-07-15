"use client";
// ============================================================
// SDP Edit (migrasi mobile SandraHub → web) — Stage 2
// Form data bulanan + map pin picker (Leaflet) + geolokasi +
// reverse-geocode (Edge Function locationiq) + submit RPC.
// RPC: sdp_submit_edit / sdp_save_draft  (mirror sdp_provider.dart)
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  ChevronLeft, MapPin, Crosshair, Loader2, CheckCircle2, AlertTriangle, Save, Send, X, Plus,
} from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const mk = (d) => ({
  card: d ? "#161618" : "#FFFFFF", sub: d ? "#1C1C20" : "#F3F4F6", line: d ? "#2A2A2F" : "#E9EAEE",
  hi: d ? "#F1F1F4" : "#17181C", mid: d ? "#8A8A96" : "#61616C", lo: d ? "#5A5A68" : "#A2A2AD",
  brand: "#ED1C24", green: d ? "#30D158" : "#1A9E5A", amber: d ? "#FFB020" : "#B7791F", blue: d ? "#0A84FF" : "#2563EB",
  inputBg: d ? "#131315" : "#FFFFFF",
  sm: d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06)",
  md: d ? "0 8px 24px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06), 0 10px 26px rgba(23,24,28,.05)",
});

const STATUS_USAHA = ["BADAN USAHA", "INDIVIDUAL"];
const TERMINATE = ["ACTIVE", "ACTIVE (S/D TGL 1 BULAN DEPAN)", "TERMINATED"];
const SUMATRA_FALLBACK = [0.5071, 101.4478];

// dd/MM/yy <-> yyyy-mm-dd
const toInputDate = (ddmmyy) => {
  if (!ddmmyy) return "";
  const m = String(ddmmyy).match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) { const d = new Date(ddmmyy); return isNaN(d) ? "" : d.toISOString().slice(0, 10); }
  return `20${m[3]}-${m[2]}-${m[1]}`;
};
const toStoreDate = (iso) => { if (!iso) return null; const [y, mo, da] = iso.split("-"); return `${da}/${mo}/${y.slice(2)}`; };
const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());

function Field({ t, label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: t.hi, marginBottom: 6 }}>{label}{required && <span style={{ color: t.brand }}> *</span>}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: t.lo, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function SDP_Edit({ supabase, theme = "light", profile, entry, onBack, onSaved, finalizeDirect = false }) {
  const d = theme === "dark"; const t = mk(d);
  const m = entry.monthly || {};

  const [sdpLive, setSdpLive] = useState(toInputDate(m.sdp_live));
  const [statusUsaha, setStatusUsaha] = useState(m.status_usaha || "");
  const [namaOwner, setNamaOwner] = useState(m.nama_owner || "");
  const [nik, setNik] = useState(m.nik || "");
  const [noOttocash, setNoOttocash] = useState(m.no_ottocash || "");
  const [noWa, setNoWa] = useState(m.no_whatsapp || "");
  const [emailOwner, setEmailOwner] = useState(m.email_owner || "");
  const [emailPic, setEmailPic] = useState(Array.isArray(m.email_pic_list) ? m.email_pic_list : []);
  const [picInput, setPicInput] = useState("");
  const [alamat, setAlamat] = useState(m.alamat || "");
  const [lat, setLat] = useState(m.latitude ?? null);
  const [lng, setLng] = useState(m.longitude ?? null);
  const [sameGudang, setSameGudang] = useState(m.alamat_gudang == null || (m.alamat_gudang === m.alamat && m.latitude_gudang == null));
  const [alamatGudang, setAlamatGudang] = useState(m.alamat_gudang || "");
  const [latG, setLatG] = useState(m.latitude_gudang ?? null);
  const [lngG, setLngG] = useState(m.longitude_gudang ?? null);
  const [terminate, setTerminate] = useState(m.terminate_status || "ACTIVE");
  const [note, setNote] = useState("");

  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const addPic = () => {
    const v = picInput.trim();
    if (v && emailOk(v) && !emailPic.includes(v)) { setEmailPic([...emailPic, v]); setPicInput(""); }
    else if (v && !emailOk(v)) setErr("Format email PIC tidak valid.");
  };

  const validate = () => {
    if (!sdpLive) return "Tanggal SDP Live wajib diisi.";
    if (!STATUS_USAHA.includes(statusUsaha)) return "Pilih status usaha.";
    if (!namaOwner.trim()) return "Nama owner wajib diisi.";
    if (!/^\d{16}$/.test(nik.trim())) return "NIK harus 16 digit angka.";
    if (!noWa.trim()) return "No. WhatsApp wajib diisi.";
    if (!emailOk(emailOwner)) return "Email owner tidak valid.";
    if (lat == null || lng == null) return "Titik lokasi SDP wajib dipilih di peta.";
    return "";
  };

  const payload = () => ({
    sdp_live: toStoreDate(sdpLive),
    status_usaha: statusUsaha,
    nama_owner: namaOwner.trim().toUpperCase(),
    nik: nik.trim(),
    no_ottocash: noOttocash.trim() || null,
    alamat: alamat.trim() || null,
    email_owner: emailOwner.trim(),
    email_pic_list: emailPic,
    no_whatsapp: noWa.trim(),
    terminate_status: terminate,
    latitude: lat, longitude: lng,
    alamat_gudang: sameGudang ? (alamat.trim() || null) : (alamatGudang.trim() || null),
    latitude_gudang: sameGudang ? lat : latG,
    longitude_gudang: sameGudang ? lng : lngG,
  });

  // finalizeDirect = role tingkat approval (BSM/SPM Sumatera/PIC Region) — bisa
  // langsung mengisi & menyelesaikan data (RPC sdp_bsm_set) tanpa menunggu
  // persetujuan dirinya sendiri. CSE tetap mengajukan (sdp_submit_edit) →
  // menunggu approval BSM/SPM. Form & validasi (termasuk lat/long) tetap sama
  // untuk semua role — hanya jalur penyimpanan yang berbeda sesuai tingkatan.
  const run = async (kind) => {
    if (kind === "submit") { const v = validate(); if (v) { setErr(v); return; } }
    setBusy(true); setErr("");
    try {
      let fn, params;
      if (kind === "submit") {
        if (finalizeDirect) {
          fn = "sdp_bsm_set";
          params = { p_sdp_id: entry.sdp_id, p_period: entry.period, p_values: payload(), p_note: note.trim() || null };
        } else {
          fn = "sdp_submit_edit";
          params = { p_sdp_id: entry.sdp_id, p_period: entry.period, p_proposed: payload(), p_note: note.trim() || null };
        }
      } else {
        fn = "sdp_save_draft";
        params = { p_sdp_id: entry.sdp_id, p_period: entry.period, p_values: payload() };
      }
      const { error } = await supabase.rpc(fn, params);
      if (error) throw error;
      if (kind === "submit") { setDone(true); setTimeout(() => onSaved?.(), 1400); }
      else setErr("");
      if (kind === "draft") { setBusy(false); onSaved?.("draft"); }
    } catch (e) { setErr("Gagal menyimpan: " + (e?.message || e)); setBusy(false); }
  };

  if (done) return (
    <div style={{ fontFamily: FF, minHeight: 360, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: t.hi }}>
      <div style={{ width: 72, height: 72, borderRadius: 22, background: `${t.green}1A`, display: "flex", alignItems: "center", justifyContent: "center", color: t.green }}><CheckCircle2 size={38} /></div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{finalizeDirect ? "Data diselesaikan" : "Terkirim ke BSM"}</div>
      <div style={{ fontSize: 13.5, color: t.mid }}>{finalizeDirect ? `Data ${entry.sdp_id} sudah final.` : `Data ${entry.sdp_id} menunggu konfirmasi BSM.`}</div>
    </div>
  );

  const inStyle = { fontFamily: FF, fontSize: 14, color: t.hi, background: t.inputBg, border: `1px solid ${t.line}`, borderRadius: 11, padding: "11px 12px", outline: "none", width: "100%", boxSizing: "border-box" };

  const cardStyle = { background: t.card, borderRadius: 18, padding: 18, boxShadow: t.md };
  const sectionTitle = (label) => (
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.lo, marginBottom: 14 }}>{label}</div>
  );

  return (
    <div style={{ fontFamily: FF, color: t.hi, maxWidth: 1180, margin: "0 auto" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 700, padding: 0, marginBottom: 14 }}>
        <ChevronLeft size={16} /> Batal
      </button>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>Isi / Ubah Data SDP</div>
        <div style={{ fontSize: 12.5, fontFamily: "monospace", color: t.mid, marginTop: 3 }}>{entry.sdp_id} · {entry.period}</div>
      </div>

      {/* Dua kolom di layar lebar (identitas & kontak | lokasi), menumpuk di layar sempit */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
        <div style={cardStyle}>
          {sectionTitle("Identitas & Kontak")}
          <Field t={t} label="Tanggal SDP Live" required hint="Tanggal SDP ini mulai aktif">
            <input type="date" value={sdpLive} onChange={(e) => setSdpLive(e.target.value)} style={inStyle} />
          </Field>
          <Field t={t} label="Status usaha" required>
            <div style={{ display: "flex", gap: 8 }}>
              {STATUS_USAHA.map((o) => (
                <button key={o} onClick={() => setStatusUsaha(o)} style={{ flex: 1, padding: "11px 8px", borderRadius: 11, border: `1.5px solid ${statusUsaha === o ? t.brand : t.line}`, background: statusUsaha === o ? `${t.brand}12` : t.inputBg, color: statusUsaha === o ? t.brand : t.mid, fontFamily: FF, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{o}</button>
              ))}
            </div>
          </Field>
          <Field t={t} label="Nama perusahaan / owner" required hint="Otomatis huruf kapital">
            <input value={namaOwner} onChange={(e) => setNamaOwner(e.target.value)} style={{ ...inStyle, textTransform: "uppercase" }} />
          </Field>
          <Field t={t} label="NIK" required hint="Harus 16 digit angka">
            <input value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, "").slice(0, 16))} inputMode="numeric" style={inStyle} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field t={t} label="No. Ottocash"><input value={noOttocash} onChange={(e) => setNoOttocash(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={inStyle} /></Field>
            <Field t={t} label="No. WhatsApp" required><input value={noWa} onChange={(e) => setNoWa(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={inStyle} /></Field>
          </div>
          <Field t={t} label="Email owner" required>
            <input value={emailOwner} onChange={(e) => setEmailOwner(e.target.value)} inputMode="email" style={inStyle} />
          </Field>
          <Field t={t} label="Email PIC" hint="Tekan + untuk menambah beberapa email">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={picInput} onChange={(e) => setPicInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPic())} placeholder="email@domain.com" inputMode="email" style={inStyle} />
              <button onClick={addPic} style={{ width: 46, borderRadius: 11, border: "none", background: t.brand, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Plus size={18} /></button>
            </div>
            {emailPic.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
                {emailPic.map((e) => (
                  <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 99, background: t.sub, fontSize: 12.5, color: t.hi }}>
                    {e}<button onClick={() => setEmailPic(emailPic.filter((x) => x !== e))} style={{ background: "none", border: "none", cursor: "pointer", color: t.mid, display: "flex" }}><X size={13} /></button>
                  </span>
                ))}
              </div>
            )}
          </Field>
        </div>

        <div style={cardStyle}>
          {sectionTitle("Lokasi")}
          <Field t={t} label="Detail alamat SDP" hint="No. rumah, RT/RW, patokan (opsional)">
            <textarea value={alamat} onChange={(e) => setAlamat(e.target.value)} rows={2} style={{ ...inStyle, resize: "vertical" }} />
          </Field>

          <Field t={t} label="Titik lokasi SDP" required hint="Geser peta / seret pin, atau pakai lokasi Anda">
            <MapPicker t={t} supabase={supabase} lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
          </Field>

          {/* Gudang */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "4px 0 14px", cursor: "pointer" }} onClick={() => setSameGudang((s) => !s)}>
            <div style={{ width: 22, height: 22, borderRadius: 7, border: `1.5px solid ${sameGudang ? t.brand : t.line}`, background: sameGudang ? t.brand : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{sameGudang && <CheckCircle2 size={14} color="#fff" />}</div>
            <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 600 }}>Alamat gudang sama dengan alamat SDP</span>
          </div>
          {!sameGudang && (
            <>
              <Field t={t} label="Detail alamat gudang" hint="No. gudang, blok, patokan (opsional)">
                <textarea value={alamatGudang} onChange={(e) => setAlamatGudang(e.target.value)} rows={2} style={{ ...inStyle, resize: "vertical" }} />
              </Field>
              <Field t={t} label="Titik lokasi gudang">
                <MapPicker t={t} supabase={supabase} lat={latG} lng={lngG} onChange={(la, ln) => { setLatG(la); setLngG(ln); }} />
              </Field>
            </>
          )}
        </div>
      </div>

      {/* Status & catatan — lebar penuh di bawah dua kolom */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        {sectionTitle("Status & Catatan")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <Field t={t} label="Status terminate">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TERMINATE.map((o) => (
                <button key={o} onClick={() => setTerminate(o)} style={{ textAlign: "left", padding: "11px 12px", borderRadius: 11, border: `1.5px solid ${terminate === o ? t.brand : t.line}`, background: terminate === o ? `${t.brand}12` : t.inputBg, color: terminate === o ? t.brand : t.mid, fontFamily: FF, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{o}</button>
              ))}
            </div>
          </Field>
          <Field t={t} label="Catatan (opsional)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="Jelaskan bila perlu" style={{ ...inStyle, resize: "vertical", height: "100%" }} />
          </Field>
        </div>

        {err && (
          <div style={{ display: "flex", gap: 9, padding: "11px 13px", borderRadius: 11, background: `${t.brand}12`, border: `1px solid ${t.brand}33`, color: t.brand, fontSize: 13, fontWeight: 600, marginTop: 16 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />{err}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16, maxWidth: 480, marginLeft: "auto" }}>
          <button onClick={() => run("draft")} disabled={busy} style={{ flex: 1, height: 50, borderRadius: 13, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontFamily: FF, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}><Save size={17} /> Simpan Draft</button>
          <button onClick={() => run("submit")} disabled={busy} style={{ flex: 1.3, height: 50, borderRadius: 13, border: "none", background: t.brand, color: "#fff", fontFamily: FF, fontSize: 14.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", boxShadow: t.sm }}>
            {busy ? <Loader2 size={18} className="sdpspin" /> : finalizeDirect ? <CheckCircle2 size={17} /> : <Send size={17} />}
            {finalizeDirect ? " Simpan & Selesaikan" : " Kirim ke BSM"}
          </button>
        </div>
      </div>
      <style>{`.sdpspin{animation:sdpsp 1s linear infinite}@keyframes sdpsp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ══════════════════ Map pin picker (Leaflet) ══════════════════ */
function MapPicker({ t, supabase, lat, lng, onChange }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [addr, setAddr] = useState("");
  const [locating, setLocating] = useState(false);

  const reverse = useCallback(async (la, ln) => {
    try {
      const { data } = await supabase.functions.invoke("locationiq", { body: { action: "reverse", lat: la, lon: ln } });
      const name = data?.display_name || data?.address?.display_name || data?.place?.display_name || (Array.isArray(data) ? data[0]?.display_name : "");
      if (name) setAddr(name);
    } catch { /* opsional */ }
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const L = (await import("leaflet")).default;
      const el = elRef.current; if (!el || el._leaflet_id != null || !alive) return;
      const start = (lat != null && lng != null) ? [lat, lng] : SUMATRA_FALLBACK;
      const map = L.map(el, { center: start, zoom: (lat != null ? 16 : 6), zoomControl: true, attributionControl: false });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({ className: "", html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${t.brand};border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.4)"></div>`, iconSize: [26, 26], iconAnchor: [13, 26] });
      const marker = L.marker(start, { icon, draggable: true }).addTo(map);
      const set = (ll) => { const la = +ll.lat.toFixed(6), ln = +ll.lng.toFixed(6); onChange(la, ln); reverse(la, ln); };
      marker.on("dragend", () => set(marker.getLatLng()));
      map.on("click", (e) => { marker.setLatLng(e.latlng); set(e.latlng); });
      mapRef.current = map; markerRef.current = marker;
      if (lat != null && lng != null) reverse(lat, lng);
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => { alive = false; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useGps = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => {
      const la = +p.coords.latitude.toFixed(6), ln = +p.coords.longitude.toFixed(6);
      const map = mapRef.current, marker = markerRef.current;
      if (map && marker) { map.setView([la, ln], 16); marker.setLatLng([la, ln]); }
      onChange(la, ln); reverse(la, ln); setLocating(false);
    }, () => setLocating(false), { enableHighAccuracy: true, timeout: 12000 });
  };

  return (
    <div>
      <div ref={elRef} style={{ height: 240, borderRadius: 12, overflow: "hidden", border: `1px solid ${t.line}`, background: t.sub }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <button onClick={useGps} type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontFamily: FF, fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          {locating ? <Loader2 size={14} className="sdpspin" /> : <Crosshair size={14} />} Lokasi saya
        </button>
        <div style={{ fontSize: 11.5, color: t.mid, minWidth: 0 }}>
          {lat != null ? <span style={{ fontFamily: "monospace" }}>{lat}, {lng}</span> : <span style={{ color: t.lo }}>Ketuk peta untuk memilih titik</span>}
          {addr && <div style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{addr}</div>}
        </div>
      </div>
    </div>
  );
}
