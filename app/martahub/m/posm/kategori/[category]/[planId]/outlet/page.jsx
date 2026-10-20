"use client";
/**
 * /martahub/m/posm/kategori/[category]/[planId]/outlet - Pencarian outlet
 * dari List Outlet POSM (whitelist master data khusus POSM, mh_posm_outlets -
 * diupload lewat CMS "Master Data > List Outlet POSM", BUKAN lagi dari
 * mapping Outlet-to-DSE bulanan lama). Satu outlet bisa punya ID IM3 & ID
 * 3ID sekaligus - keduanya ditampilkan di kartu hasil pencarian. Otomatis
 * dipersempit ke Branch pengguna dulu (mh_posm_outlets_search p_branch_id)
 * supaya daftar tidak kepanjangan.
 *
 * REBUILD 2026-10 dari 2 foto flowchart (alur baru Retailer Installment) -
 * menggantikan pencarian berbasis mh_outlet_mapping yang lama.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Search, Store, ChevronRight, ShieldCheck } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF } from "../../../../../_shared/MobileShell";
import { searchPosmOutlets } from "../../../../../_shared/posmData";

function useDebounced(value, delay) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

export default function OutletSearchPage() {
  const { category, planId } = useParams();
  const router = useRouter();
  const { loading: sessionLoading, scope } = useMartaSession();
  const [q, setQ] = useState("");
  const qd = useDebounced(q, 300);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const branchName = scope?.branchName || scope?.branch_name;

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    setLoading(true); setErr("");
    searchPosmOutlets(qd, scope?.branchId || null, 80)
      .then((r) => { if (alive) setRows(r || []); })
      .catch((e) => { if (alive) setErr(e.message || "Gagal mencari outlet"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sessionLoading, scope?.branchId, qd]);

  if (sessionLoading) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  function openOutlet(o) {
    const params = new URLSearchParams({
      name: o.outlet_name || "", branch: o.branch_name || "", mc: o.mc || "",
      im3: o.outlet_id_im3 || "", tid: o.outlet_id_3id || "",
    });
    router.push(`/martahub/m/posm/kategori/${category}/${planId}/outlet/${encodeURIComponent(o.outlet_code)}?${params.toString()}`);
  }

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push(`/martahub/m/posm/kategori/${category}/${planId}`)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> Retailer Instalment
        </button>
        <div style={{ marginTop: 12, fontSize: 17, fontWeight: 800 }}>Pilih ID Outlet</div>
        {branchName && <div style={{ marginTop: 2, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>{(scope?.brand || "").toUpperCase()} · {branchName}</div>}
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        <div style={{ position: "relative" }}>
          <Search size={15} color="#B0B0BA" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari ID IM3, ID 3ID, kode, atau nama outlet…" autoFocus
            style={{ width: "100%", height: 46, padding: "0 14px 0 38px", borderRadius: 13, border: "1.5px solid #ECEDF0", background: "#F6F7F9", fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "12px 20px 100px" }}>
        {loading && rows === null ? (
          <ShellSpinner minHeight="120px" />
        ) : (rows || []).length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px", color: "#8A8A96", fontSize: 12 }}>
            {qd ? "Outlet tidak ditemukan di List Outlet POSM." : "Belum ada outlet terdaftar untuk Branch ini - minta admin upload List Outlet POSM."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((o) => (
              <button key={o.id} onClick={() => openOutlet(o)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 13px", borderRadius: 13, border: "1px solid #E9EAEE", background: "#FFFFFF", cursor: "pointer", textAlign: "left", fontFamily: FF }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Store size={15} color="#8A8A96" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(o.outlet_name || o.outlet_code || "").toUpperCase()}</div>
                    <ShieldCheck size={11} color="#15803D" style={{ flexShrink: 0 }} />
                  </div>
                  <div style={{ marginTop: 2, fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>
                    {o.outlet_id_im3 ? `IM3 ${o.outlet_id_im3}` : ""}{o.outlet_id_im3 && o.outlet_id_3id ? " · " : ""}{o.outlet_id_3id ? `3ID ${o.outlet_id_3id}` : ""}
                    {!o.outlet_id_im3 && !o.outlet_id_3id ? `Kode ${o.outlet_code}` : ""}
                  </div>
                  <div style={{ marginTop: 1, fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>{o.mc || o.branch_name || "-"}{o.kecamatan ? ` · ${o.kecamatan}` : ""}</div>
                </div>
                <ChevronRight size={15} color="#C4C4CE" style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
