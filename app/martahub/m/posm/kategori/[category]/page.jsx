"use client";
/**
 * /martahub/m/posm/kategori/[category] - Daftar Plan POSM (sudah
 * dialokasikan ke Branch pengguna) per kategori (Retailer Installment/
 * Outdoor Installment/Customer Activation), padanan layar "Retailer
 * Instalment" (list program) pada konsep POSM Category.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Image as ImageIcon, Calendar, ChevronRight, X } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF } from "../../../_shared/MobileShell";
import { BRAND_DISPLAY } from "../../../_shared/planData";
import { fetchPlansForBranch, posmPlanVisualUrl, PLAN_CATEGORIES } from "../../../_shared/posmData";

const CATEGORY_LABEL = Object.fromEntries(PLAN_CATEGORIES.map((c) => [c.key, c.label]));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-");

export default function PosmCategoryPage() {
  const { category } = useParams();
  const router = useRouter();
  const { loading: sessionLoading, scope } = useMartaSession();
  const [plans, setPlans] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    fetchPlansForBranch(scope?.branchId, scope?.brand)
      .then((rows) => { if (alive) setPlans((rows || []).filter((p) => p.category === category)); })
      .catch((e) => { if (alive) setErr(e.message || "Gagal memuat Plan POSM"); });
    return () => { alive = false; };
  }, [sessionLoading, scope?.branchId, scope?.brand, category]);

  if (sessionLoading || plans === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  const label = CATEGORY_LABEL[category] || category;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push("/martahub/m/posm")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> POSM
        </button>
        <div style={{ marginTop: 12, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>{label}</div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>Program POSM yang sudah dialokasikan ke Branch Anda</div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 100px", display: "flex", flexDirection: "column", gap: 10 }}>
        {plans.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada Plan {label}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Belum ada Plan POSM kategori ini yang dialokasikan ke Branch Anda.</div>
          </div>
        ) : (
          plans.map((p) => <PlanCard key={p.id} plan={p} onClick={() => router.push(`/martahub/m/posm/kategori/${category}/${p.id}`)} />)
        )}
      </div>
    </MobileShell>
  );
}

function PlanCard({ plan, onClick }) {
  const url = posmPlanVisualUrl(plan.visual_path);
  const [showPreview, setShowPreview] = useState(false);
  const totalQty = (plan.materials || []).reduce((s, m) => s + (Number(m.qty) || 0), 0);
  const totalInstalled = (plan.materials || []).reduce((s, m) => s + (Number(m.installed_qty) || 0), 0);
  const pct = totalQty > 0 ? Math.min(100, Math.round((totalInstalled / totalQty) * 100)) : 0;
  return (
    <div style={{ width: "100%", display: "flex", gap: 12, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: 12, fontFamily: FF, boxSizing: "border-box" }}>
      <div onClick={(e) => { e.stopPropagation(); if (url) setShowPreview(true); }}
        style={{ width: 64, height: 64, borderRadius: 12, background: "#F0F0F3", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: url ? "zoom-in" : "default" }}>
        {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageIcon size={20} color="#C4C4CE" />}
        {plan.in_period && <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: "#15803D", border: "2px solid #fff" }} />}
      </div>
      <button onClick={onClick} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FF }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan.name}</div>
          <ChevronRight size={15} color="#C4C4CE" style={{ flexShrink: 0 }} />
        </div>
        <div style={{ marginTop: 4, fontSize: 10.5, color: "#8A8A96", fontWeight: 700 }}>{BRAND_DISPLAY[plan.brand] || (plan.brand || "").toUpperCase()}</div>
        {(plan.materials || []).slice(0, 3).map((m) => {
          const mp = m.qty > 0 ? Math.min(100, Math.round(((m.installed_qty || 0) / m.qty) * 100)) : 0;
          return (
            <div key={m.posmat_type_id} style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10.5, color: "#5A5A68", fontWeight: 600 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
              <span style={{ flexShrink: 0, marginLeft: 8, color: "#8A8A96" }}>{m.installed_qty || 0}/{m.qty} ({mp}%)</span>
            </div>
          );
        })}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#B0B0BA", fontWeight: 600 }}>
          <Calendar size={11} /> {fmtDate(plan.period_from)} - {fmtDate(plan.period_to)}
        </div>
        <div style={{ marginTop: 7, height: 5, borderRadius: 999, background: "#F0F0F3", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "#ED1C24", borderRadius: 999 }} />
        </div>
      </button>

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
    </div>
  );
}
