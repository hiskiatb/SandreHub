"use client";
/**
 * OrgIdBar - "ORG ID Aktif" utk tagging/claim MSISDN. SATU sumber kebenaran,
 * dipakai di Tagging Nomor (Buat Plan) & Isi Laporan Actual.
 *
 * Konsep (dikonfirmasi lewat komentar mh_dsf_submit_sales_entries() di DB):
 * satu EVENT bisa melibatkan BEBERAPA org_id sekaligus - mis. seorang TL/Head
 * mencatatkan penjualan beberapa DSF di bawahnya dari satu device/sesi, bukan
 * cuma org_id miliknya sendiri. Fungsi `mh_dsf_org_ids_under_me()` sudah ada
 * di server persis utk kasus ini (kembalikan org_id siapa saja di bawah
 * hierarki user ybs) - sebelumnya web ini cuma pakai SATU field ORG ID teks
 * biasa (prefill dari profil sendiri), jadi kapabilitas multi-org_id di
 * backend itu belum kepakai sama sekali di web.
 *
 * User bisa menambahkan beberapa org_id ke daftar (dari saran hierarki ATAU
 * ketik manual bebas), lalu TAP salah satu chip utk menjadikannya "aktif" -
 * semua nomor yg discan/ditambahkan SESUDAHNYA otomatis distempel org_id yg
 * sedang aktif itu, sampai user pindah aktif ke chip lain. Komponen ini
 * "controlled" utk nilai aktifnya (value/onChange dari parent, krn parent
 * yg perlu tahu org_id aktif saat menyimpan entry baru) tapi mengelola
 * sendiri daftar chip & saran hierarkinya.
 *
 * @param {{ value: string, onChange: (orgId: string) => void, ownOrgId?: string, ownLabel?: string }} props
 */
import { useEffect, useState } from "react";
import { Plus, X, User } from "lucide-react";
import { FF } from "./MobileShell";
import supabaseMarta from "../../../../lib/supabaseMarta";

export default function OrgIdBar({ value, onChange, ownOrgId, ownLabel }) {
  const [chips, setChips] = useState([]); // {orgId, label}
  const [suggestions, setSuggestions] = useState([]); // dari mh_dsf_org_ids_under_me()
  const [adding, setAdding] = useState(false);
  const [manualVal, setManualVal] = useState("");

  // Seed chip pertama = org_id sendiri, begitu profil selesai dimuat -
  // otomatis jadi aktif juga (perilaku default SAMA seperti sebelumnya,
  // hanya sekarang bisa ditambah org_id lain di atasnya).
  useEffect(() => {
    if (!ownOrgId) return;
    setChips((prev) => (prev.some((c) => c.orgId === ownOrgId) ? prev : [{ orgId: ownOrgId, label: ownLabel || "Saya" }, ...prev]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownOrgId]);

  useEffect(() => {
    if (!value && ownOrgId) onChange(ownOrgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownOrgId]);

  // Saran org_id tim (subordinate di hierarki assignment) - tidak wajib
  // dipakai (manual entry tetap tersedia), cuma mempercepat supaya tidak
  // perlu ketik/ingat org_id orang lain satu-satu.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabaseMarta.rpc("mh_dsf_org_ids_under_me");
        if (alive) setSuggestions(data || []);
      } catch { /* best-effort - saran opsional, jangan blokir kalau gagal */ }
    })();
    return () => { alive = false; };
  }, []);

  function addChip(orgId, label) {
    const id = (orgId || "").trim();
    if (!id) return;
    setChips((prev) => (prev.some((c) => c.orgId === id) ? prev : [...prev, { orgId: id, label: label || id }]));
    onChange(id);
    setAdding(false);
    setManualVal("");
  }

  function removeChip(orgId) {
    const remaining = chips.filter((c) => c.orgId !== orgId);
    setChips(remaining);
    if (value === orgId) onChange(remaining[0]?.orgId || "");
  }

  const availableSuggestions = suggestions.filter((s) => !chips.some((c) => c.orgId === s.dsf_org_id));

  return (
    <div>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96" }}>ORG ID Aktif</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
        {chips.map((c) => {
          const active = c.orgId === value;
          return (
            <button key={c.orgId} type="button" onClick={() => onChange(c.orgId)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 8px 7px 12px", borderRadius: 999,
                border: `1.5px solid ${active ? "#ED1C24" : "#E4E5EA"}`, background: active ? "rgba(237,28,36,0.08)" : "#F6F7F9",
                cursor: "pointer", fontFamily: FF,
              }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: active ? "#C62828" : "#3A3A44" }}>{c.orgId}</span>
              {c.label && c.label !== c.orgId && (
                <span style={{ fontSize: 10, color: active ? "#C62828" : "#8A8A96", fontWeight: 600 }}>· {c.label}</span>
              )}
              {chips.length > 1 && (
                <span onClick={(e) => { e.stopPropagation(); removeChip(c.orgId); }}
                  style={{ width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: active ? "rgba(198,40,40,0.15)" : "rgba(23,24,28,0.08)", color: active ? "#C62828" : "#8A8A96" }}>
                  <X size={10} />
                </span>
              )}
            </button>
          );
        })}
        <button type="button" onClick={() => setAdding((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", borderRadius: 999, border: "1.5px dashed #D8D9E0", background: "#FFFFFF", color: "#5A5A68", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
          <Plus size={13} /> Tambah Org ID
        </button>
      </div>

      {chips.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#B0B0BA", fontWeight: 600 }}>Memuat ORG ID Anda…</div>
      )}

      {adding && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 13, background: "#F6F7F9", border: "1px solid #ECEDF0" }}>
          {availableSuggestions.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#8A8A96", marginBottom: 7 }}>Tim Anda</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {availableSuggestions.map((s) => (
                  <button key={s.dsf_org_id} type="button" onClick={() => addChip(s.dsf_org_id, s.full_name)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 999, border: "1px solid #E4E5EA", background: "#FFFFFF", fontSize: 11, fontWeight: 700, color: "#17181C", cursor: "pointer", fontFamily: FF }}>
                    <User size={11} color="#8A8A96" /> {s.dsf_org_id} <span style={{ color: "#8A8A96", fontWeight: 600 }}>· {s.full_name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <form onSubmit={(e) => { e.preventDefault(); addChip(manualVal); }} style={{ display: "flex", gap: 8 }}>
            <input value={manualVal} onChange={(e) => setManualVal(e.target.value)} placeholder="Ketik ORG ID lain…"
              style={{ flex: 1, minWidth: 0, height: 40, padding: "0 12px", borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", fontSize: 12.5, fontFamily: FF, color: "#17181C", outline: "none", boxSizing: "border-box" }} />
            <button type="submit"
              style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: "#17181C", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Plus size={16} color="#fff" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
