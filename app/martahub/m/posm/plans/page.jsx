"use client";
/**
 * /martahub/m/posm/plans - Kelola Plan POSM (Register Installment Plan),
 * menggantikan total menu Stok/Target lama. Khusus approver (Head/Brand
 * TMV/SPM Sumatera/Admin) - server-enforced di tiap RPC mh_posm_*.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, PackageCheck, Image as ImageIcon, Calendar, Layers, ChevronRight, X, Loader2, CheckCircle2 } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { compressToMaxBytes } from "../../_shared/imageTools";
import { listPlans, upsertPlan, uploadPosmPlanVisual, posmPlanVisualUrl, PLAN_CATEGORIES } from "../../_shared/posmData";
import { BRAND_DISPLAY } from "../../_shared/planData";

const CATEGORY_LABEL = Object.fromEntries(PLAN_CATEGORIES.map((c) => [c.key, c.label]));
const STATUS_META = {
  draft: { label: "Draft", color: "#8A8A96", bg: "#F0F0F3" },
  active: { label: "Aktif", color: "#15803D", bg: "rgba(21,128,61,0.10)" },
  closed: { label: "Selesai", color: "#5A5A68", bg: "#F0F0F3" },
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-";

export default function PosmPlansPage() {
  const router = useRouter();
  const { loading: sessionLoading, email } = useMartaSession();
  const [plans, setPlans] = useState(null);
  const [err, setErr] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    try {
      setPlans(await listPlans());
    } catch (e) {
      setErr(e.message || "Gagal memuat Plan POSM");
    }
  }

  useEffect(() => {
    if (sessionLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  if (sessionLoading || plans === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push("/martahub/m/posm")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> POSM
        </button>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <PackageCheck size={19} color="#ED1C24" />
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Plan POSM</div>
        </div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>Register Installment Plan - target, visual &amp; alokasi per branch</div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 100px" }}>
        <button onClick={() => setFormOpen(true)}
          style={{ width: "100%", height: 46, borderRadius: 13, border: "1.5px dashed #D8D9E0", background: "#F6F7F9", color: "#ED1C24", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Plus size={15} /> Plan Baru
        </button>

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {plans.length === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada Plan POSM</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Buat Plan pertama untuk mulai mengatur target &amp; alokasi.</div>
            </div>
          ) : (
            plans.map((p) => <PlanCard key={p.id} plan={p} onClick={() => router.push(`/martahub/m/posm/plans/${p.id}`)} />)
          )}
        </div>
      </div>

      {formOpen && (
        <PlanFormSheet callerEmail={email} onClose={() => setFormOpen(false)}
          onSaved={(plan) => { setFormOpen(false); load(); router.push(`/martahub/m/posm/plans/${plan.id}`); }} />
      )}
    </MobileShell>
  );
}

function PlanCard({ plan, onClick }) {
  const st = STATUS_META[plan.status] || STATUS_META.draft;
  const url = posmPlanVisualUrl(plan.visual_path);
  const pct = plan.total_qty > 0 ? Math.min(100, Math.round((plan.total_installed / plan.total_qty) * 100)) : 0;
  return (
    <button onClick={onClick}
      style={{ textAlign: "left", width: "100%", display: "flex", gap: 12, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: 12, cursor: "pointer", fontFamily: FF }}>
      <div style={{ width: 64, height: 64, borderRadius: 12, background: "#F0F0F3", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageIcon size={20} color="#C4C4CE" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan.name}</div>
        </div>
        <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Badge color="#B32E85" bg="rgba(179,46,133,0.10)">{CATEGORY_LABEL[plan.category] || plan.category}</Badge>
          <Badge color="#17181C" bg="#F0F0F3">{BRAND_DISPLAY[plan.brand] || (plan.brand || "").toUpperCase()}</Badge>
          <Badge color={st.color} bg={st.bg}>{st.label}</Badge>
        </div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>
          <Calendar size={11} /> {fmtDate(plan.period_from)} - {fmtDate(plan.period_to)}
        </div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "#8A8A96", fontWeight: 700 }}>
          <span>{plan.material_count} material</span><span>·</span><span>{plan.branch_count} branch</span>
          <span>·</span><span>{plan.total_installed}/{plan.total_qty} ({pct}%)</span>
        </div>
      </div>
      <ChevronRight size={16} color="#C4C4CE" style={{ flexShrink: 0, alignSelf: "center" }} />
    </button>
  );
}

function Badge({ children, color, bg }) {
  return <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, color, background: bg }}>{children}</span>;
}

function PlanFormSheet({ callerEmail, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(PLAN_CATEGORIES[0].key);
  const [brand, setBrand] = useState("im3");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [photo, setPhoto] = useState(null); // { file, previewUrl }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function pickPhoto(file) {
    if (!file) return;
    setPhoto((prev) => { if (prev) URL.revokeObjectURL(prev.previewUrl); return { file, previewUrl: URL.createObjectURL(file) }; });
  }

  async function submit() {
    if (!name.trim()) { setErr("Nama Plan wajib diisi."); return; }
    if (!periodFrom || !periodTo) { setErr("Period From &amp; To wajib diisi."); return; }
    if (periodTo < periodFrom) { setErr("Period To harus setelah Period From."); return; }
    setBusy(true); setErr("");
    try {
      let visualPath = null;
      if (photo) {
        const blob = await compressToMaxBytes(photo.file);
        visualPath = await uploadPosmPlanVisual(blob);
      }
      const plan = await upsertPlan({ name: name.trim(), category, brand, visualPath, periodFrom, periodTo, status: "active", callerEmail });
      onSaved(plan);
    } catch (e) {
      setErr(e.message || "Gagal menyimpan Plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "22px 22px 0 0", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 0" }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Plan POSM Baru</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8A96" }}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px" }}>
          {err && <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

          <Label text="Visual" />
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 140, borderRadius: 14, border: "1.5px dashed #D8D9E0", background: "#F6F7F9", cursor: "pointer", overflow: "hidden" }}>
            {photo ? <img src={photo.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : (
              <div style={{ textAlign: "center", color: "#8A8A96" }}>
                <ImageIcon size={22} />
                <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700 }}>Ketuk untuk unggah visual</div>
                <div style={{ fontSize: 10, marginTop: 2 }}>Ukuran bebas - ditampilkan menyesuaikan</div>
              </div>
            )}
            <input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
          </label>

          <Label text="Nama Plan" top />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Outdoor Q3 Sumatera Utara" style={selectBase} />

          <Label text="Category" top />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PLAN_CATEGORIES.map((c) => (
              <button key={c.key} onClick={() => setCategory(c.key)}
                style={{ textAlign: "left", height: 42, padding: "0 12px", borderRadius: 11, border: category === c.key ? "none" : "1.5px solid #ECEDF0", background: category === c.key ? BRAND : "#F6F7F9", color: category === c.key ? "#fff" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                {c.label}
              </button>
            ))}
          </div>

          <Label text="Brand" top />
          <div style={{ display: "flex", gap: 8 }}>
            {[{ key: "im3", label: "IM3" }, { key: "tri", label: "3ID" }].map((b) => (
              <button key={b.key} onClick={() => setBrand(b.key)}
                style={{ flex: 1, height: 40, borderRadius: 10, border: brand === b.key ? "none" : "1.5px solid #ECEDF0", background: brand === b.key ? BRAND : "#F6F7F9", color: brand === b.key ? "#fff" : "#5A5A68", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
                {b.label}
              </button>
            ))}
          </div>

          <Label text="Period From" top />
          <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} style={selectBase} />
          <Label text="Period To" top />
          <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} style={selectBase} />
        </div>
        <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom,0px) + 16px)", borderTop: "1px solid #F0F0F3" }}>
          <button onClick={submit} disabled={busy}
            style={{ width: "100%", height: 48, borderRadius: 13, border: "none", cursor: busy ? "default" : "pointer", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {busy ? <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} /> : <CheckCircle2 size={16} />}
            {busy ? "Menyimpan…" : "Simpan Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

const selectBase = { width: "100%", height: 46, padding: "0 12px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 13, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };
function Label({ text, top }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96", marginTop: top ? 14 : 0, marginBottom: 7 }}>{text}</div>;
}
