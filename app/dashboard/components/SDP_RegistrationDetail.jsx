"use client";
/**
 * SDP_RegistrationDetail.jsx
 * Detail + edit SATU baris `sdp_registration` (data yang diisi CSE saat
 * registrasi SDP lewat SDP_QuickForm / SDP_BulkGrid). Dibuka dari
 * SDP_BatchMonitor (klik baris) — menampilkan semua field yang pernah
 * diisi, dan (bila diizinkan RLS) tombol "Ubah Data" untuk mengoreksi.
 *
 * Wewenang edit MENGIKUTI policy `sdp_registration_upd` (docs/sql/
 * sdp_approval_rls.sql): pemilik baris (submitted_by), SPM Sumatera,
 * BSM (branch+brand cocok), PIC Region (region cocok). Selain itu → view-only.
 * Mengedit TIDAK mengubah `status` secara otomatis (approval tetap terpisah,
 * lewat SDP_BatchMonitor "Tandai Validated" / alur BSM approve-reject).
 *
 * Props: { supabase, theme = "dark", profile, entry, onBack, onChanged }
 *   entry = baris ringkas dari SDP_BatchMonitor (minimal { id }) — detail
 *   lengkap di-fetch ulang di sini (select *) supaya selalu terbaru.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Loader2, AlertCircle, Check, Pencil, X, Save, MapPin, Home, Truck,
  Building2, Users, ClipboardCheck, FileText,
} from "lucide-react";
import {
  SDP_LISTS, validateRegistrationRow, applyDerived, fmtSubmissionMonth,
} from "../../../lib/sdp";
import SDP_MapPicker from "./SDP_MapPicker";
import SDP_AddressSearch from "./SDP_AddressSearch";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4", inp: d ? "#111114" : "#FFFFFF",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  mag: "#C6168D", acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.12)" : "rgba(22,163,74,.08)",
  amber: "#FFB020", blue: "#0A84FF",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md: d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const STATUS_TONE = { validated: "ok", approved: "blue", submitted: "amber", draft: "lo", rejected: "acc" };

// Kolom yang boleh diubah (samakan dengan DB_COLS di SDP_QuickForm — kecuali
// sdp_id_new & pairing_id, yang di-generate sistem dan tidak boleh diketik ulang).
const EDITABLE_FIELDS = [
  "brand", "submission_month", "submission_date", "cycle_month",
  "request_type", "registration_scope", "circle", "region", "branch", "sdp_name",
  "partner_company_name", "customer_legal_name", "company_type", "status_company",
  "ktp_number", "npwp_number", "pic_name_partner", "pic_phone_number", "msisdn_master_trx",
  "pic_email_partner", "email_pic_ioh", "kabupaten", "kecamatan_coverage", "partner_territory",
  "bill_to_address", "ship_to_address", "kode_pos",
  "hybrid_type", "cse_name", "cse_partner_id", "cse_number", "bank_name", "bank_branch_kcp",
  "bank_account_number", "bank_account_name", "commitment_fee_status", "main_document_folder_link",
  "branding_update_required", "branding_status", "remarks",
];

const FIELD_META = {
  brand: ["Brand", "enum:brand"], request_type: ["Request Type", "enum:request_type"],
  registration_scope: ["Registration Scope", "enum:registration_scope"], hybrid_type: ["Hybrid Type", "enum:hybrid_type"],
  submission_month: ["Submission Month", "month"], submission_date: ["Submission Date", "date"], cycle_month: ["Bulan Siklus", "month"],
  circle: ["Circle", "enum:circle"], region: ["Region", "text"], branch: ["Branch", "text"],
  kabupaten: ["Kab/Kota", "text"], kecamatan_coverage: ["Kecamatan Coverage", "text"], partner_territory: ["Partner Territory", "text"],
  sdp_name: ["SDP Name", "text"], partner_company_name: ["Partner / Company Name", "text"], customer_legal_name: ["Customer Legal Name", "text"],
  company_type: ["Company Type", "enum:company_type"], status_company: ["Status Company", "enum:status_company"],
  ktp_number: ["KTP / NIK", "text"], npwp_number: ["NPWP", "text"],
  bill_to_address: ["Alamat SDP (Bill To)", "area"], ship_to_address: ["Alamat Pengiriman (Ship To)", "area"], kode_pos: ["Kode Pos", "text"],
  pic_name_partner: ["PIC Name Partner", "text"], pic_phone_number: ["PIC Phone", "text"], msisdn_master_trx: ["MSISDN Master TRX", "text"],
  pic_email_partner: ["Email PIC Partner", "text"], email_pic_ioh: ["Email PIC IOH", "text"],
  cse_name: ["CSE Name", "text"], cse_partner_id: ["CSE Partner ID", "text"], cse_number: ["CSE Number", "text"],
  bank_name: ["Bank Name", "text"], bank_branch_kcp: ["Bank Branch / KCP", "text"],
  bank_account_number: ["No. Rekening", "text"], bank_account_name: ["Nama Rekening", "text"],
  commitment_fee_status: ["Commitment Fee Status", "enum:commitment_fee_status"],
  main_document_folder_link: ["Link Folder OneDrive", "link"],
  branding_update_required: ["Branding Update Required?", "enum:yes_no"], branding_status: ["Branding Status", "enum:branding_status"],
  remarks: ["Remarks", "area"],
};

const GROUPS = [
  { title: "Jenis & Status", icon: ClipboardCheck, fields: ["request_type", "registration_scope", "hybrid_type", "brand", "submission_month", "submission_date", "cycle_month"] },
  { title: "Wilayah", icon: MapPin, fields: ["circle", "region", "branch", "kabupaten", "kecamatan_coverage", "partner_territory", "sdp_name"] },
  { title: "Data Partner", icon: Building2, fields: ["partner_company_name", "customer_legal_name", "company_type", "status_company", "ktp_number", "npwp_number"] },
  { title: "Kontak & Bank", icon: Users, fields: ["pic_name_partner", "pic_phone_number", "msisdn_master_trx", "pic_email_partner", "email_pic_ioh", "cse_name", "cse_partner_id", "cse_number", "bank_name", "bank_branch_kcp", "bank_account_number", "bank_account_name", "commitment_fee_status"] },
  { title: "Dokumen & Catatan", icon: FileText, fields: ["main_document_folder_link", "branding_update_required", "branding_status", "remarks"] },
];

const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function DetailRow({ t, label, value }) {
  return (
    <div style={{ padding: "10px 0", borderTop: `1px solid ${t.line}` }}>
      <div style={{ fontSize: 11, color: t.mid, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontSize: 13.5, color: t.hi, fontWeight: 600, marginTop: 3, wordBreak: "break-word" }}>{value || <span style={{ color: t.lo, fontWeight: 500 }}>—</span>}</div>
    </div>
  );
}

// ── Satu input editable (mirror Field di SDP_QuickForm, versi ringkas) ────────
function EditField({ t, k, label, type, value, err, onChange }) {
  const base = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${err ? t.acc : t.line}`, background: t.inp, color: t.hi, fontSize: 13.5, fontFamily: FF, outline: "none" };
  let control;
  if (type && type.startsWith("enum:")) {
    const opts = SDP_LISTS[type.split(":")[1]] || [];
    control = (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...base, cursor: "pointer" }}>
        <option value="">— pilih —</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (type === "area") {
    control = <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={{ ...base, resize: "vertical" }} />;
  } else if (type === "date" || type === "month") {
    control = <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={base} />;
  } else {
    control = <input type={type === "link" ? "url" : "text"} value={value} onChange={(e) => onChange(e.target.value)} style={base} />;
  }
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: err ? t.acc : t.mid, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      {control}
      {err && <div style={{ fontSize: 11, color: t.acc, marginTop: 3 }}>{err}</div>}
    </label>
  );
}

export default function SDP_RegistrationDetail({ supabase, theme = "dark", profile, entry, onBack, onChanged }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";

  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [userId, setUserId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      const [{ data: u }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("sdp_registration").select("*").eq("id", entry.id).single(),
      ]);
      if (!alive) return;
      setUserId(u?.user?.id || null);
      if (error) setErr(error.message || String(error));
      else setRow(data);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [supabase, entry.id]);

  const canEdit = useMemo(() => {
    if (!row || !userId) return false;
    if (row.submitted_by === userId) return true;
    if (role === "spm_sumatera") return true;
    if (role === "bsm") return row.submitter_branch === profile?.bsm_branch && row.submitter_brand === profile?.bsm_brand;
    if (role === "pic_region") return row.submitter_region === profile?.region;
    return false;
  }, [row, userId, role, profile?.bsm_branch, profile?.bsm_brand, profile?.region]);

  const startEdit = () => {
    const v = {};
    for (const k of EDITABLE_FIELDS) v[k] = row[k] ?? "";
    v.latitude = row.latitude ?? null; v.longitude = row.longitude ?? null;
    v.latitude_gudang = row.latitude_gudang ?? null; v.longitude_gudang = row.longitude_gudang ?? null;
    setVal(v); setErrors({}); setMsg(null); setEditing(true);
  };
  const set = (k, v) => setVal((p) => ({ ...p, [k]: v }));

  const save = async () => {
    const { valid, errors: errs } = validateRegistrationRow({ ...row, ...val });
    setErrors(errs);
    if (!valid) { setMsg({ type: "err", text: "Ada kolom wajib yang belum benar — cek tanda merah." }); return; }
    setSaving(true); setMsg(null);
    try {
      const derived = applyDerived(val);
      const payload = {};
      for (const k of EDITABLE_FIELDS) payload[k] = val[k] === "" ? null : val[k];
      payload.need_sap_creation = derived.need_sap_creation;
      payload.need_oracle_creation = derived.need_oracle_creation;
      payload.latitude = val.latitude ?? null; payload.longitude = val.longitude ?? null;
      payload.latitude_gudang = val.latitude_gudang ?? null; payload.longitude_gudang = val.longitude_gudang ?? null;

      const { data, error } = await supabase.from("sdp_registration").update(payload).eq("id", row.id).select("*").single();
      if (error) throw error;
      setRow(data);
      setEditing(false);
      setMsg({ type: "ok", text: "Data registrasi berhasil diperbarui." });
      onChanged?.(data);
    } catch (e) {
      setMsg({ type: "err", text: "Gagal menyimpan: " + (e.message || e) });
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ fontFamily: FF, padding: 48, textAlign: "center", color: t.mid }}>
      <Loader2 size={22} className="spin" /><div style={{ marginTop: 8, fontSize: 13 }}>Memuat data registrasi…</div>
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (err || !row) return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 700, padding: 0, marginBottom: 14 }}><ArrowLeft size={15} /> Kembali</button>
      <div style={{ padding: "36px 22px", textAlign: "center", color: t.mid, background: t.card, borderRadius: 16, border: `1px solid ${t.line}` }}>
        <AlertCircle size={24} color={t.acc} style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13.5 }}>{err || "Data tidak ditemukan."}</div>
      </div>
    </div>
  );

  const s = row.status || "submitted";
  const col = ({ ok: t.ok, blue: t.blue, amber: t.amber, acc: t.acc, lo: t.lo }[STATUS_TONE[s]] || t.mid);
  const inStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13.5, fontFamily: FF, outline: "none" };

  return (
    <div style={{ fontFamily: FF, color: t.hi, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={editing ? () => setEditing(false) : onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 700, padding: 0 }}>
          <ArrowLeft size={15} /> {editing ? "Batal ubah" : "Kembali"}
        </button>
        {!editing && canEdit && (
          <button onClick={startEdit} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 11, border: "none", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)`, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: t.sm }}>
            <Pencil size={14} /> Ubah Data
          </button>
        )}
      </div>

      {/* Header kartu */}
      <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 18, boxShadow: t.sm, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{row.sdp_name || "—"}</div>
            <div style={{ fontSize: 12.5, fontFamily: "monospace", color: t.mid, marginTop: 3 }}>{row.sdp_id_new || "—"}{row.pairing_id ? ` · pasangan ${row.pairing_id}` : ""}</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, padding: "5px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 800, color: col, background: `${col}1A`, border: `1px solid ${col}33` }}>{s}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 12, fontSize: 12.5, color: t.mid }}>
          <span>{row.brand}</span>{row.branch && <span>· {row.branch}</span>}{row.region && <span>· {row.region}</span>}
          <span>· diajukan oleh {row.submitted_by_name || "—"}</span><span>· {fmtDateTime(row.created_at)}</span>
        </div>
        {!canEdit && (
          <div style={{ marginTop: 12, fontSize: 12, color: t.mid, display: "flex", alignItems: "center", gap: 7 }}>
            <AlertCircle size={13} /> Anda hanya bisa melihat — pengubahan data ini hanya untuk pengaju, BSM/PIC Region terkait, atau SPM Sumatera.
          </div>
        )}
      </div>

      {msg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600,
          background: msg.type === "ok" ? t.okBg : t.accBg, color: msg.type === "ok" ? t.ok : t.acc, border: `1px solid ${(msg.type === "ok" ? t.ok : t.acc)}44` }}>
          {msg.type === "ok" ? <Check size={15} /> : <AlertCircle size={15} />} {msg.text}
        </div>
      )}

      {!editing ? (
        <>
          {GROUPS.map((g) => (
            <div key={g.title} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: "6px 18px 14px", boxShadow: t.sm, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: t.lo, padding: "14px 0 2px" }}>
                <g.icon size={13} /> {g.title}
              </div>
              {g.fields.map((k) => <DetailRow key={k} t={t} label={FIELD_META[k]?.[0] || k} value={k === "submission_month" ? fmtSubmissionMonth(row[k]) : row[k]} />)}
            </div>
          ))}
          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: "6px 18px 14px", boxShadow: t.sm }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: t.lo, padding: "14px 0 2px" }}>
              <MapPin size={13} /> Lokasi
            </div>
            <DetailRow t={t} label="Titik Lokasi SDP" value={row.latitude != null ? `${row.latitude}, ${row.longitude}` : null} />
            <DetailRow t={t} label="Titik Lokasi Pengiriman" value={row.latitude_gudang != null ? `${row.latitude_gudang}, ${row.longitude_gudang}` : null} />
            {row.latitude != null && (
              <a href={`https://maps.google.com/?q=${row.latitude},${row.longitude}`} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, color: t.blue, textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
                <MapPin size={14} /> Buka di Google Maps
              </a>
            )}
          </div>
        </>
      ) : (
        <>
          {GROUPS.map((g) => (
            <div key={g.title} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 18, boxShadow: t.sm, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: t.lo, marginBottom: 14 }}>
                <g.icon size={13} /> {g.title}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" }} className="srd-grid">
                {g.fields.map((k) => {
                  const [label, type] = FIELD_META[k] || [k, "text"];
                  const full = type === "area" || type === "link";
                  return (
                    <div key={k} style={{ gridColumn: full ? "1 / -1" : "auto" }}>
                      <EditField t={t} k={k} label={label} type={type} value={val[k] ?? ""} err={errors[k]} onChange={(v) => set(k, v)} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Lokasi — peta */}
          <div className="srd-loc" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 18, boxShadow: t.sm }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: t.tealBg, border: `1px solid ${t.tealBd}`, color: t.tealD, display: "flex", alignItems: "center", justifyContent: "center" }}><Home size={15} /></span>
                <div style={{ fontSize: 13.5, fontWeight: 800 }}>Titik Lokasi SDP</div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <SDP_AddressSearch t={t} supabase={supabase} onSelect={(r) => { set("latitude", r.lat); set("longitude", r.lon); if (r.display && !val.bill_to_address) set("bill_to_address", r.display); }} />
              </div>
              <SDP_MapPicker t={t} supabase={supabase} lat={val.latitude ?? null} lng={val.longitude ?? null} height={200}
                onChange={(la, ln) => { set("latitude", la); set("longitude", ln); }} />
            </div>
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 18, boxShadow: t.sm }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: `${t.amber}1A`, border: `1px solid ${t.amber}44`, color: t.amber, display: "flex", alignItems: "center", justifyContent: "center" }}><Truck size={15} /></span>
                <div style={{ fontSize: 13.5, fontWeight: 800 }}>Titik Lokasi Pengiriman</div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <SDP_AddressSearch t={t} supabase={supabase} onSelect={(r) => { set("latitude_gudang", r.lat); set("longitude_gudang", r.lon); if (r.display && !val.ship_to_address) set("ship_to_address", r.display); }} />
              </div>
              <SDP_MapPicker t={t} supabase={supabase} lat={val.latitude_gudang ?? null} lng={val.longitude_gudang ?? null} height={200}
                onChange={(la, ln) => { set("latitude_gudang", la); set("longitude_gudang", ln); }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, position: "sticky", bottom: 14 }}>
            <button onClick={() => setEditing(false)} disabled={saving} style={{ flex: 1, height: 48, borderRadius: 12, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontFamily: FF, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", boxShadow: t.md }}>
              <X size={16} /> Batal
            </button>
            <button onClick={save} disabled={saving} style={{ flex: 1.4, height: 48, borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)`, color: "#fff", fontFamily: FF, fontSize: 14.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", boxShadow: t.md }}>
              {saving ? <Loader2 size={18} className="spin" /> : <Save size={17} />} {saving ? "Menyimpan…" : "Simpan Perubahan"}
            </button>
          </div>
        </>
      )}

      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
        @media(max-width:640px){.srd-grid{grid-template-columns:1fr !important}.srd-loc{grid-template-columns:1fr !important}}`}</style>
    </div>
  );
}
