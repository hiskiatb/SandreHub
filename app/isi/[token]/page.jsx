"use client";
/**
 * /isi/[token] — halaman PUBLIK pengisian SDP via link berbagi (expiring).
 * Membuka draft lewat RPC token (sdp_draft_open) yang mengecek kedaluwarsa;
 * penerima mengisi lalu "Kirim ke CSE" (sdp_draft_submit). Data TIDAK masuk
 * ke sdp_registration — CSE meninjau & memfinalkan dari inbox "Draft & Link".
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Check, MapPin, AlertTriangle, Clock, Building2, Send } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { SDP_LISTS } from "../../../lib/sdp";
import SDP_MapPicker from "../../dashboard/components/SDP_MapPicker";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const t = {
  bg: "#F2F4F7", card: "#FFFFFF", sub: "#F6F7F9", line: "#E4E7EC", inp: "#FFFFFF",
  hi: "#17181C", mid: "#5B5B66", lo: "#98A2B3", acc: "#ED1C24", accBg: "rgba(237,28,36,.07)",
  teal: "#1A9E90", tealBg: "rgba(26,158,144,.08)", tealBd: "rgba(26,158,144,.2)", tealD: "#1A9E90",
  mag: "#C6168D", ok: "#1A9E5A", okBg: "rgba(26,158,90,.08)", amber: "#B7791F", blue: "#2563EB",
  md: "0 10px 30px rgba(23,24,28,.10)", sm: "0 1px 3px rgba(23,24,28,.06)", brand: "#ED1C24",
};
const lbl = { fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };
const inp = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 14, fontFamily: FF, outline: "none" };

const remain = (exp) => {
  if (!exp) return "";
  const ms = new Date(exp).getTime() - Date.now();
  if (ms <= 0) return "kedaluwarsa";
  const h = Math.floor(ms / 3.6e6), d = Math.floor(h / 24), hh = h % 24, m = Math.floor((ms % 3.6e6) / 6e4);
  return d > 0 ? `${d} hari ${hh} jam lagi` : h > 0 ? `${h} jam ${m} mnt lagi` : `${m} menit lagi`;
};

function Field({ k, label, val, set, type }) {
  if (type && type.startsWith("enum:")) {
    const opts = SDP_LISTS[type.split(":")[1]] || [];
    return (
      <label style={{ display: "block" }}>
        <div style={lbl}>{label}</div>
        <div style={{ position: "relative" }}>
          <select value={val[k] ?? ""} onChange={(e) => set(k, e.target.value)} style={{ ...inp, appearance: "none", paddingRight: 30, cursor: "pointer" }}>
            <option value="">— pilih —</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </label>
    );
  }
  if (type === "area") return (
    <label style={{ display: "block", gridColumn: "1 / -1" }}>
      <div style={lbl}>{label}</div>
      <textarea value={val[k] ?? ""} onChange={(e) => set(k, e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} />
    </label>
  );
  return (
    <label style={{ display: "block" }}>
      <div style={lbl}>{label}</div>
      <input value={val[k] ?? ""} onChange={(e) => set(k, e.target.value)} style={inp} />
    </label>
  );
}

export default function PublicIsiPage() {
  const params = useParams();
  const token = params?.token;
  const [state, setState] = useState("loading"); // loading | error | form | done
  const [errCode, setErrCode] = useState("");
  const [meta, setMeta] = useState(null);
  const [val, setVal] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setVal((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      if (!token) { setState("error"); setErrCode("not_found"); return; }
      const { data, error } = await supabase.rpc("sdp_draft_open", { p_token: token });
      if (error) { setState("error"); setErrCode("network"); return; }
      if (data?.error) { setState("error"); setErrCode(data.error); setMeta({ expires_at: data.expires_at }); return; }
      setMeta({ label: data.label, expires_at: data.expires_at, scope: data.scope || {}, status: data.status });
      const p = { ...(data.payload || {}) };
      delete p.__existingSdpId; delete p.__sameGudang;
      setVal(p);
      setState("form");
    })();
  }, [token]);

  const scope = meta?.scope || {};
  const submit = async () => {
    setSaving(true);
    const payload = { ...val };
    if (!payload.ship_to_address) { payload.ship_to_address = payload.bill_to_address || null; }
    const { data, error } = await supabase.rpc("sdp_draft_submit", { p_token: token, p_payload: payload });
    setSaving(false);
    if (error || data?.error) { alert("Gagal mengirim: " + (data?.error || error?.message || "coba lagi")); return; }
    setState("done");
  };

  const wrap = (node) => (
    <div style={{ fontFamily: FF, minHeight: "100vh", background: t.bg, padding: "24px 16px", color: t.hi }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>{node}</div>
    </div>
  );

  if (state === "loading") return wrap(<Center><Loader2 size={26} className="pspin" /><div style={{ marginTop: 10, color: t.mid }}>Membuka formulir…</div></Center>);

  if (state === "error") {
    const map = {
      expired: { icon: <Clock size={30} color={t.amber} />, title: "Link kedaluwarsa", desc: "Masa berlaku link isian ini sudah habis. Minta CSE mengirim ulang link baru." },
      not_found: { icon: <AlertTriangle size={30} color={t.acc} />, title: "Link tidak ditemukan", desc: "Link tidak valid atau sudah dihapus." },
      closed: { icon: <Check size={30} color={t.ok} />, title: "Formulir sudah ditutup", desc: "Isian ini sudah diproses. Terima kasih." },
      network: { icon: <AlertTriangle size={30} color={t.acc} />, title: "Gagal memuat", desc: "Ada gangguan koneksi. Coba muat ulang halaman." },
    }[errCode] || { icon: <AlertTriangle size={30} color={t.acc} />, title: "Tidak dapat dibuka", desc: "" };
    return wrap(<Card><Center>{map.icon}<div style={{ fontSize: 18, fontWeight: 800, marginTop: 12 }}>{map.title}</div><div style={{ fontSize: 13.5, color: t.mid, marginTop: 6, textAlign: "center", maxWidth: 380 }}>{map.desc}</div></Center></Card>);
  }

  if (state === "done") return wrap(<Card><Center>
    <div style={{ width: 60, height: 60, borderRadius: 99, background: t.okBg, display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={30} color={t.ok} /></div>
    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 14 }}>Terkirim ke CSE</div>
    <div style={{ fontSize: 13.5, color: t.mid, marginTop: 6, textAlign: "center", maxWidth: 400 }}>Isian Anda sudah dikirim. CSE akan meninjau & memfinalkan. Anda boleh menutup halaman ini.</div>
  </Center></Card>);

  // ── FORM ──
  return wrap(
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Formulir Registrasi SDP</div>
        <div style={{ fontSize: 12.5, color: t.mid, marginTop: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>Isi data di bawah lalu kirim ke CSE.</span>
          {meta?.expires_at && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t.amber, fontWeight: 700 }}><Clock size={13} /> Berlaku {remain(meta.expires_at)}</span>}
        </div>
      </div>

      {/* Scope terkunci */}
      <Card>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Wilayah (dari CSE — terkunci)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["Brand", scope.brand || val.brand], ["Circle", val.circle], ["Region", scope.region || val.region], ["Branch", scope.branch || val.branch], ["Kab/Kota", val.kabupaten], ["Kecamatan", val.kecamatan_coverage]].filter(([, v]) => v).map(([k, v]) => (
            <span key={k} style={{ fontSize: 12, color: t.hi, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 8, padding: "5px 10px" }}><b style={{ color: t.mid, fontWeight: 700 }}>{k}:</b> {v}</span>
          ))}
        </div>
      </Card>

      <SectionCard icon={<Building2 size={15} />} title="Data Partner">
        <Field k="sdp_name" label="SDP Name" val={val} set={set} />
        <Field k="partner_company_name" label="Partner / Company Name" val={val} set={set} />
        <Field k="customer_legal_name" label="Customer Legal Name" val={val} set={set} />
        <Field k="company_type" label="Company Type" type="enum:company_type" val={val} set={set} />
        <Field k="status_company" label="Status Company" type="enum:status_company" val={val} set={set} />
        <Field k="ktp_number" label="KTP / NIK" val={val} set={set} />
        <Field k="npwp_number" label="NPWP" val={val} set={set} />
      </SectionCard>

      <SectionCard icon={<Send size={15} />} title="Kontak PIC">
        <Field k="pic_name_partner" label="PIC Name" val={val} set={set} />
        <Field k="pic_phone_number" label="PIC Phone / WhatsApp" val={val} set={set} />
        <Field k="pic_email_partner" label="PIC Email" val={val} set={set} />
        <Field k="msisdn_master_trx" label="MSISDN Master TRX" val={val} set={set} />
      </SectionCard>

      <SectionCard icon={<MapPin size={15} />} title="Alamat & Lokasi">
        <Field k="bill_to_address" label="Alamat SDP" type="area" val={val} set={set} />
        <Field k="kode_pos" label="Kode Pos" val={val} set={set} />
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={lbl}>Titik Lokasi SDP</div>
          <SDP_MapPicker t={t} supabase={supabase} lat={val.latitude ?? null} lng={val.longitude ?? null}
            onChange={(la, ln) => setVal((p) => ({ ...p, latitude: la, longitude: ln }))}
            onAddress={({ display }) => setVal((p) => ({ ...p, bill_to_address: p.bill_to_address || display }))} />
        </div>
        <Field k="ship_to_address" label="Alamat Pengiriman (opsional — bila beda)" type="area" val={val} set={set} />
        <Field k="remarks" label="Catatan" type="area" val={val} set={set} />
      </SectionCard>

      <button onClick={submit} disabled={saving}
        style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "15px 22px", borderRadius: 12, border: "none", cursor: saving ? "default" : "pointer", fontFamily: FF, fontSize: 15, fontWeight: 800, color: "#fff", background: t.brand, opacity: saving ? 0.7 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {saving ? <Loader2 size={17} className="pspin" /> : <Send size={17} />} Kirim ke CSE
      </button>
      <div style={{ textAlign: "center", fontSize: 11.5, color: t.lo, marginTop: 10, marginBottom: 20 }}>Data dikirim ke CSE untuk ditinjau — tidak langsung masuk sistem.</div>
      <style>{`.pspin{animation:psp 1s linear infinite}@keyframes psp{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

function Center({ children }) { return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>{children}</div>; }
function Card({ children }) { return <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.sm, padding: 18, marginBottom: 14 }}>{children}</div>; }
function SectionCard({ icon, title, children }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.sm, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: t.tealBg, border: `1px solid ${t.tealBd}`, color: t.tealD, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>{title}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>{children}</div>
    </div>
  );
}
