"use client";
/**
 * /martahub/m/posm/kategori/[category]/[planId]/outlet - Pencarian outlet
 * dari mapping Outlet-to-DSE (diupload lewat CMS desktop tiap bulan).
 * Otomatis dipersempit ke Branch+Brand pengguna sejak awal supaya daftar
 * tidak kepanjangan, sesuai permintaan ("branch nya medan im3, list outlet
 * dipotong hanya utk im3 medan"). Kategori outlet bisa difilter tambahan.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Search, Store, ChevronRight, Info } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF } from "../../../../../_shared/MobileShell";
import { searchOutletMapping, fetchOutletCategories } from "../../../../../_shared/posmData";

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
  const [cat, setCat] = useState("");
  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState(null); // { period_month, fallback, rows }
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const branchName = scope?.branchName || scope?.branch_name;

  useEffect(() => {
    if (sessionLoading || !branchName || !scope?.brand) return;
    let alive = true;
    fetchOutletCategories({ brand: scope.brand, branchName }).then((rows) => { if (alive) setCategories(rows || []); }).catch(() => {});
    return () => { alive = false; };
  }, [sessionLoading, branchName, scope?.brand]);

  useEffect(() => {
    if (sessionLoading || !branchName || !scope?.brand) return;
    let alive = true;
    setLoading(true); setErr("");
    searchOutletMapping({ brand: scope.brand, branchName, q: qd, category: cat, limit: 80 })
      .then((r) => { if (alive) setResult(r); })
      .catch((e) => { if (alive) setErr(e.message || "Gagal mencari outlet"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sessionLoading, branchName, scope?.brand, qd, cat]);

  if (sessionLoading) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  function openOutlet(o) {
    const params = new URLSearchParams({ name: o.outlet_name || "", branch: o.branch_name || "", mc: o.mc || "" });
    router.push(`/martahub/m/posm/kategori/${category}/${planId}/outlet/${encodeURIComponent(o.outlet_code)}?${params.toString()}`);
  }

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push(`/martahub/m/posm/kategori/${category}/${planId}`)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> Retailer Instalment
        </button>
        <div style={{ marginTop: 12, fontSize: 17, fontWeight: 800 }}>Cari Outlet</div>
        {branchName && <div style={{ marginTop: 2, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>{(scope?.brand || "").toUpperCase()} · {branchName}</div>}
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        <div style={{ position: "relative" }}>
          <Search size={15} color="#B0B0BA" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau ID outlet…" autoFocus
            style={{ width: "100%", height: 46, padding: "0 14px 0 38px", borderRadius: 13, border: "1.5px solid #ECEDF0", background: "#F6F7F9", fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" }} />
        </div>

        {categories.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 }}>
            <button onClick={() => setCat("")}
              style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 999, border: cat === "" ? "none" : "1.5px solid #ECEDF0", background: cat === "" ? "#17181C" : "#FFFFFF", color: cat === "" ? "#fff" : "#5A5A68", fontSize: 11, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
              Semua
            </button>
            {categories.map((c) => (
              <button key={c} onClick={() => setCat(c)}
                style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 999, border: cat === c ? "none" : "1.5px solid #ECEDF0", background: cat === c ? "#17181C" : "#FFFFFF", color: cat === c ? "#fff" : "#5A5A68", fontSize: 11, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      {!branchName && (
        <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FFF7E6", color: "#B45309", fontSize: 12, fontWeight: 600 }}>
          Branch Anda belum terdeteksi, hubungi admin untuk melengkapi profil.
        </div>
      )}

      {result?.fallback && (
        <div style={{ margin: "12px 20px 0", padding: "9px 12px", borderRadius: 10, background: "rgba(29,111,224,0.08)", color: "#1D6FE0", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Info size={13} /> Mapping outlet bulan ini belum tersedia, menampilkan data {result.period_month}.
        </div>
      )}

      <div style={{ padding: "12px 20px 100px" }}>
        {loading && !result ? (
          <ShellSpinner minHeight="120px" />
        ) : (result?.rows || []).length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px", color: "#8A8A96", fontSize: 12 }}>
            {qd ? "Outlet tidak ditemukan." : "Belum ada mapping outlet untuk Branch ini."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(result.rows || []).map((o) => (
              <button key={o.outlet_code} onClick={() => openOutlet(o)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 13px", borderRadius: 13, border: "1px solid #E9EAEE", background: "#FFFFFF", cursor: "pointer", textAlign: "left", fontFamily: FF }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Store size={15} color="#8A8A96" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(o.outlet_name || "").toUpperCase()}</div>
                  <div style={{ marginTop: 2, fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>ID {o.outlet_code} · {o.mc || o.branch_name}{o.outlet_category ? ` · ${o.outlet_category}` : ""}</div>
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
