"use client";
/**
 * /martahub/m/posm/kategori/[category]/[planId] - Detail satu Plan POSM
 * dari sisi BME/RGE lapangan: visual, periode, progress pemasangan per
 * material di Branch-nya. Khusus kategori Retailer Installment ada tombol
 * "Cari Outlet & Pasang" menuju alur pencarian outlet dari mapping DSE.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Image as ImageIcon, Calendar, Search, X, MapPin } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../../../_shared/MobileShell";
import { BRAND_DISPLAY } from "../../../../_shared/planData";
import { fetchPlansForBranch, posmPlanVisualUrl, PLAN_CATEGORIES } from "../../../../_shared/posmData";

const CATEGORY_LABEL = Object.fromEntries(PLAN_CATEGORIES.map((c) => [c.key, c.label]));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-");

export default function PosmCategoryPlanDetailPage() {
  const { category, planId } = useParams();
  const router = useRouter();
  const { loading: sessionLoading, scope } = useMartaSession();
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    fetchPlansForBranch(scope?.branchId, scope?.brand)
      .then((rows) => { if (alive) setPlan((rows || []).find((p) => p.id === planId) || false); })
      .catch((e) => { if (alive) setErr(e.message || "Gagal memuat Plan POSM"); });
    return () => { alive = false; };
  }, [sessionLoading, scope?.branchId, scope?.brand, planId]);

  if (sessionLoading || plan === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  const backHref = `/martahub/m/posm/kategori/${category}`;

  if (plan === false) {
    return (
      <MobileShell active="home">
        <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px", fontFamily: FF }}>
          <button onClick={() => router.push(backHref)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
            <ArrowLeft size={16} /> {CATEGORY_LABEL[category] || category}
          </button>
          <div style={{ marginTop: 30, textAlign: "center", color: "#8A8A96", fontSize: 12.5 }}>Plan POSM tidak ditemukan / belum dialokasikan ke Branch Anda.</div>
        </div>
      </MobileShell>
    );
  }

  const url = posmPlanVisualUrl(plan.visual_path);
  const totalQty = (plan.materials || []).reduce((s, m) => s + (Number(m.qty) || 0), 0);
  const totalInstalled = (plan.materials || []).reduce((s, m) => s + (Number(m.installed_qty) || 0), 0);
  const pct = totalQty > 0 ? Math.min(100, Math.round((totalInstalled / totalQty) * 100)) : 0;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push(backHref)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> {CATEGORY_LABEL[category] || category}
        </button>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "14px 20px 0" }}>
        <div onClick={() => url && setShowPreview(true)}
          style={{ width: "100%", height: 150, borderRadius: 16, background: "#F0F0F3", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: url ? "zoom-in" : "default" }}>
          {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageIcon size={26} color="#C4C4CE" />}
        </div>
        {showPreview && url && (
          <div onClick={() => setShowPreview(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
            <button onClick={() => setShowPreview(false)}
              style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 16px)", right: 20, width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
              <X size={17} />
            </button>
            <img src={url} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: 8, objectFit: "contain" }} />
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 17, fontWeight: 800 }}>{plan.name}</div>
        <div style={{ marginTop: 3, fontSize: 11.5, color: "#8A8A96", fontWeight: 700 }}>{BRAND_DISPLAY[plan.brand] || (plan.brand || "").toUpperCase()}</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5A5A68", fontWeight: 600 }}>
          <Calendar size={12} /> Periode {fmtDate(plan.period_from)} - {fmtDate(plan.period_to)}
        </div>
      </div>

      <div style={{ padding: "18px 20px 0" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Progress Pemasangan Branch</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(plan.materials || []).map((m) => {
            const mp = m.qty > 0 ? Math.min(100, Math.round(((m.installed_qty || 0) / m.qty) * 100)) : 0;
            return (
              <div key={m.posmat_type_id} style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 13, padding: "11px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{m.name}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#5A5A68" }}>{m.installed_qty || 0}/{m.qty}</div>
                </div>
                <div style={{ marginTop: 7, height: 6, borderRadius: 999, background: "#F0F0F3", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${mp}%`, background: "#ED1C24", borderRadius: 999 }} />
                </div>
              </div>
            );
          })}
          {(plan.materials || []).length === 0 && <div style={{ fontSize: 11.5, color: "#B0B0BA" }}>Belum ada material dialokasikan.</div>}
        </div>
        <div style={{ marginTop: 10, textAlign: "right", fontSize: 11, color: "#8A8A96", fontWeight: 700 }}>Total {totalInstalled}/{totalQty} ({pct}%)</div>
      </div>

      <div style={{ padding: "20px 20px 100px" }}>
        {category === "retailer_installment" ? (
          <button onClick={() => router.push(`/martahub/m/posm/kategori/${category}/${planId}/outlet`)}
            style={{ width: "100%", height: 50, borderRadius: 14, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Search size={16} /> Cari Outlet &amp; Pasang
          </button>
        ) : category === "outdoor_installment" || category === "customer_activation" ? (
          <button onClick={() => router.push(`/martahub/m/posm/kategori/${category}/${planId}/pasang`)}
            style={{ width: "100%", height: 50, borderRadius: 14, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <MapPin size={16} /> Pasang di Titik Ini
          </button>
        ) : (
          <button onClick={() => router.push("/martahub/m/posm/new")}
            style={{ width: "100%", height: 50, borderRadius: 14, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
            Catat Pemasangan
          </button>
        )}
      </div>
    </MobileShell>
  );
}
