"use client";
/**
 * /martahub/m/approval - Approval Center versi mobile-web, khusus utk
 * approver (TMV/Head/Admin/SPM Sumatera) yang login lewat sesi MartaHub
 * (`supabaseMarta`), BUKAN sesi SandraHub.
 *
 * KENAPA HALAMAN INI ADA (bug fix): tombol "Approval" di Home tadinya
 * mengarah ke /martahub/approval - itu halaman DESKTOP yang di-gate oleh
 * `guardMarta()` (lib/martaAccess.js), yang mensyaratkan SESI SandraHub +
 * baris `profiles` dgn role `spm_sumatera`. Approver mobile (role tmv/head
 * di mh_profiles, autentikasi via supabaseMarta storageKey "marta-auth-
 * token") TIDAK PUNYA sesi SandraHub sama sekali → guardMarta() selalu
 * gagal → redirect ke /marta/login → tampak seperti "error". Halaman ini
 * memakai jalur auth yang SAMA dgn seluruh /martahub/m/* (useMartaSession),
 * jadi approver mobile bisa langsung memutuskan tanpa nyasar ke sesi lain.
 *
 * Cakupan (RPC sama persis dgn app/martahub/approval/page.jsx desktop,
 * versi mobile-nya cuma UI-nya yg disederhanakan jadi kartu, bukan tabel):
 *   - mh_web_decide_plan          → antrean Plan (status plan_submitted)
 *   - mh_activity_manual_override → katup pengaman Actual gagal validasi
 *   - mh_web_decide_md_installation → antrean Street Branding (POSM)
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, MapPin, ImageOff, MessageSquareWarning } from "lucide-react";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../../lib/supabaseMarta";
import { applyMartaScope, regionLabel } from "../../../../lib/martaScope";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { BRAND_DISPLAY } from "../_shared/planData";

const ROLE_LABEL = { admin: "Admin", head: "Head TMV", tmv: "Brand TMV", bme_rge: "BME/RGE", spm_sumatera: "SPM Sumatera" };
const CAN_APPROVE_ROLES = ["admin", "head", "tmv", "spm_sumatera"];

const PENDING_COLS = "id, event_name, brand, mc, site_id, plan_date_start, plan_date, target_sp, target_fwa, created_at";
const REVISION_COLS = "id, event_name, brand, mc, site_id, actual_sp, actual_fwa, target_sp, target_fwa, validation_note, validated_at";

const fmtDate = (s) => {
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};

const MD_PHOTO_BUCKET = "mh-photos";
function mdPhotoUrl(path) {
  return supabaseMarta.storage.from(MD_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export default function MobileApprovalPage() {
  const router = useRouter();
  // scope diambil LANGSUNG dari useMartaSession() (sudah di-resolve sekali di
  // sana, dan sekarang di-cache lintas navigasi - lihat MobileShell.jsx) -
  // sebelumnya halaman ini query ulang getMartaScope(email) sendiri di load(),
  // duplikasi round-trip mh_profiles yang sama persis dgn yang MobileShell
  // baru saja lakukan.
  const { loading: sessionLoading, email, scope } = useMartaSession();
  const [tab, setTab] = useState("plan");
  const [planRows, setPlanRows] = useState([]);
  const [revisionRows, setRevisionRows] = useState([]);
  const [streetRows, setStreetRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [dialog, setDialog] = useState(null); // { row, kind, type }
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [busyRowId, setBusyRowId] = useState(null);

  const load = useCallback(async () => {
    if (!email || !scope) return;
    setLoading(true); setErr("");
    try {
      let planQ = supabaseMarta.from("mh_activities").select(PENDING_COLS).eq("status", "plan_submitted").order("created_at", { ascending: true }).limit(300);
      planQ = await applyMartaScope(planQ, scope);
      let revisionQ = supabaseMarta.from("mh_activities").select(REVISION_COLS).eq("status", "revision_actual").order("validated_at", { ascending: true }).limit(300);
      revisionQ = await applyMartaScope(revisionQ, scope);

      const [{ data: plans, error: e0 }, { data: revisions, error: e1 }, { data: street, error: e2 }] = await Promise.all([
        planQ, revisionQ, supabaseMarta.rpc("mh_md_list_street_pending"),
      ]);
      if (e0) throw new Error(e0.message);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      setPlanRows(plans || []);
      setRevisionRows(revisions || []);
      setStreetRows(street || []);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email, scope]);

  useEffect(() => { if (!sessionLoading) load(); }, [sessionLoading, load]);

  const canApprove = !!(scope && scope.found && CAN_APPROVE_ROLES.includes(scope.role));

  function openDialog(row, kind, type) {
    setDialog({ row, kind, type });
    setNotes("");
    setActionErr("");
  }

  async function quickApprove(row, kind) {
    // Setuju TANPA catatan bisa langsung dari kartu - cuma jalur Revisi/Tolak
    // yang wajib lewat dialog (perlu alasan utk BME/RGE).
    setBusyRowId(row.id);
    try {
      let error;
      if (kind === "override") {
        ({ error } = await supabaseMarta.rpc("mh_activity_manual_override", { p_activity_id: row.id, p_final_status: "approved", p_note: null, p_caller_email: email }));
      } else {
        ({ error } = await supabaseMarta.rpc("mh_web_decide_md_installation", { p_id: row.id, p_decision: "approved", p_notes: null, p_caller_email: email }));
      }
      if (error) throw new Error(error.message);
      await load();
    } catch (e) { setErr(e.message || "Gagal memproses"); }
    finally { setBusyRowId(null); }
  }

  async function confirmDecision() {
    if (!dialog) return;
    // RPC mh_web_decide_plan mewajibkan komentar saat minta revisi plan -
    // divalidasi di sini juga spy user langsung tahu tanpa nunggu round-trip.
    if (dialog.kind === "plan" && !notes.trim()) {
      setActionErr("Komentar wajib diisi - jelaskan apa yang perlu diperbaiki.");
      return;
    }
    setSubmitting(true); setActionErr("");
    try {
      let error;
      if (dialog.kind === "md_street") {
        ({ error } = await supabaseMarta.rpc("mh_web_decide_md_installation", { p_id: dialog.row.id, p_decision: dialog.type, p_notes: notes.trim() || null, p_caller_email: email }));
      } else if (dialog.kind === "override") {
        ({ error } = await supabaseMarta.rpc("mh_activity_manual_override", { p_activity_id: dialog.row.id, p_final_status: dialog.type === "approved" ? "approved" : "revision_actual", p_note: notes.trim() || null, p_caller_email: email }));
      } else {
        ({ error } = await supabaseMarta.rpc("mh_web_decide_plan", { p_activity_id: dialog.row.id, p_email: email, p_decision: dialog.type, p_notes: notes.trim() || null }));
      }
      if (error) throw new Error(error.message);
      setDialog(null);
      await load();
    } catch (e) { setActionErr(e.message || "Gagal memproses"); }
    finally { setSubmitting(false); }
  }

  if (sessionLoading || loading) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  const TABS = [
    { key: "plan", label: "Tinjau Plan", count: planRows.length },
    { key: "revision", label: "Perlu Ditinjau", count: revisionRows.length },
    { key: "street", label: "Street Branding", count: streetRows.length },
  ];

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push("/martahub/m")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> Beranda
        </button>
        <div style={{ marginTop: 14, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Approval Center</div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96" }}>
          {scope?.found
            ? `${ROLE_LABEL[scope.role] || scope.role}${scope.unscoped ? " · semua region & brand" : ` · ${regionLabel(scope.region)} · ${BRAND_DISPLAY[scope.brand] || (scope.brand ? scope.brand.toUpperCase() : "-")}`}`
            : "Memuat scope…"}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, overflowX: "auto" }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 999,
                  background: active ? "#17181C" : "#FFFFFF", border: `1px solid ${active ? "#17181C" : "#E9EAEE"}`,
                  color: active ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer",
                }}>
                {t.label}
                <span style={{ fontSize: 10.5, fontWeight: 800, opacity: active ? 0.85 : 0.6 }}>{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "16px 20px 40px" }}>
        {!MARTA_CONFIGURED && <Notice color="#B45309" bg="rgba(180,83,9,0.08)">Supabase MartaHub belum dikonfigurasi.</Notice>}
        {err && <Notice color="#C62828" bg="#FDECEC">{err}</Notice>}
        {!canApprove && scope?.found && (
          <Notice color="#5A5A68" bg="#F6F7F9">
            Role Anda ({ROLE_LABEL[scope.role] || scope.role || "-"}) tidak memiliki izin approval - Anda tetap bisa memantau daftar di bawah.
          </Notice>
        )}

        {tab === "plan" && (
          <>
            {/* Plan TIDAK PERLU disetujui lagi utk bisa dieksekusi - begitu
                tanggal event tiba, BME/RGE langsung bisa Check In/Isi
                Laporan Actual tanpa menunggu keputusan siapa pun di sini.
                Tab ini murni utk PENGAWASAN: atasan bisa meninjau plan yang
                baru disubmit, dan kalau memang dirasa kurang sesuai, beri
                komentar lewat "Perlu Revisi" - pemilik plan langsung dapat
                notifikasi & diarahkan ke wizard editnya. */}
            <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 12, background: "#F0F7FF", border: "1px solid #D6E8FF", fontSize: 11.5, color: "#1D4ED8", fontWeight: 600, lineHeight: 1.5 }}>
              Plan di sini SUDAH BISA langsung dijalankan pemiliknya begitu tanggal event tiba - tidak menunggu persetujuan siapa pun. Beri &ldquo;Perlu Revisi&rdquo; hanya kalau memang ada yang perlu dikoreksi.
            </div>
            {planRows.length === 0 ? <EmptyState text="Tidak ada plan yang perlu ditinjau" /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {planRows.map((r) => (
                  <PlanCard key={r.id} r={r} canApprove={canApprove} busy={busyRowId === r.id}
                    onRevise={() => openDialog(r, "plan", "revision_needed")} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "revision" && (
          revisionRows.length === 0 ? <EmptyState text="Tidak ada laporan yang perlu ditinjau manual 🎉" /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {revisionRows.map((r) => (
                <RevisionCard key={r.id} r={r} canApprove={canApprove} busy={busyRowId === r.id}
                  onApprove={() => quickApprove(r, "override")} onKeepRevision={() => openDialog(r, "override", "revision_actual")} />
              ))}
            </div>
          )
        )}

        {tab === "street" && (
          streetRows.length === 0 ? <EmptyState text="Tidak ada Street Branding yang perlu ditinjau" /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {streetRows.map((r) => (
                <StreetCard key={r.id} r={r} canApprove={canApprove} busy={busyRowId === r.id}
                  onApprove={() => quickApprove(r, "md_street")} onReject={() => openDialog(r, "md_street", "rejected")} />
              ))}
            </div>
          )
        )}
      </div>

      {dialog && (
        <div onClick={() => !submitting && setDialog(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.45)", zIndex: 400, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom,0px) + 20px)", width: "100%", fontFamily: FF, boxShadow: "0 -10px 30px rgba(0,0,0,0.12)" }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C" }}>
              {dialog.kind === "md_street" ? "Tolak Street Branding ini?"
                : dialog.kind === "override" ? "Tetap tandai perlu revisi?"
                  : "Minta revisi plan ini?"}
            </div>
            <div style={{ marginTop: 4, fontSize: 12.5, color: "#8A8A96" }}>
              {dialog.kind === "md_street" ? (dialog.row.md_full_name || dialog.row.md_email || "-") : `${dialog.row.event_name || "-"} · ${dialog.row.mc || "-"}`}
            </div>
            <label style={{ display: "block", marginTop: 16, fontSize: 11, fontWeight: 700, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Catatan {dialog.kind === "plan" ? "(wajib)" : "(opsional)"}
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder={dialog.kind === "plan" ? "Apa yang perlu diperbaiki… (wajib diisi)" : "Apa yang perlu diperbaiki…"}
              style={{ width: "100%", marginTop: 7, padding: "11px 13px", borderRadius: 12, border: "1.5px solid #ECEDF0", background: "#F6F7F9", fontSize: 13, fontFamily: FF, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            {actionErr && <div style={{ marginTop: 10, fontSize: 12, color: "#C62828" }}>{actionErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setDialog(null)}
                style={{ flex: 1, height: 46, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={confirmDecision} disabled={submitting}
                style={{ flex: 1, height: 46, borderRadius: 12, border: "none", background: "#C62828", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {submitting ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : "Ya, Lanjutkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </MobileShell>
  );
}

function Notice({ color, bg, children }) {
  return <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: bg, color, fontSize: 12, fontWeight: 600 }}>{children}</div>;
}

function EmptyState({ text }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>{text}</div>
    </div>
  );
}

function BrandTag({ brand }) {
  if (!brand) return null;
  // mh_activities.brand disimpan "IM3"/"TRI" (huruf besar - beda dari
  // mh_assignments/mh_profiles.brand yg "im3"/"tri" huruf kecil), jadi
  // perbandingan HARUS case-insensitive di sini supaya 3ID tidak salah
  // tampil sbg "IM3".
  const isTri = String(brand).toLowerCase() === "tri";
  return <span style={{ fontSize: 10, fontWeight: 800, color: isTri ? "#E23B86" : "#E53935" }}>{isTri ? "3ID" : "IM3"}</span>;
}

function ApproveRejectRow({ canApprove, busy, onApprove, approveLabel = "Setujui", onReject, rejectLabel = "Perlu Revisi" }) {
  if (!canApprove) return null;
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
      <button onClick={onReject} disabled={busy}
        style={{ flex: 1, height: 42, borderRadius: 11, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: busy ? "default" : "pointer" }}>
        {rejectLabel}
      </button>
      <button onClick={onApprove} disabled={busy}
        style={{ flex: 1.3, height: 42, borderRadius: 11, border: "none", background: BRAND, color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        {busy ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : <CheckCircle2 size={14} />}
        {approveLabel}
      </button>
    </div>
  );
}

// Cuma SATU aksi (bukan lagi ApproveRejectRow dua tombol) - plan tidak
// perlu "disetujui" lagi, jadi tombolnya murni "Perlu Revisi" utk atasan
// yg mau kasih komentar/koreksi, TIDAK ADA tombol "Setuju" lagi di sini.
function PlanCard({ r, canApprove, busy, onRevise }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "14px 15px", fontFamily: FF }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.event_name || "-"}</div>
        <BrandTag brand={r.brand} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>
        {r.mc || "-"} · {r.site_id || "-"} · {fmtDate(r.plan_date_start || r.plan_date)}
      </div>
      <div style={{ marginTop: 4, fontSize: 11.5, color: "#8A8A96" }}>Target {r.target_sp ?? 0}/{r.target_fwa ?? 0} SP/FWA</div>
      {canApprove && (
        <button onClick={onRevise} disabled={busy}
          style={{ width: "100%", marginTop: 12, height: 40, borderRadius: 11, border: "1px solid #FBD9B4", background: "#FFF7ED", color: "#C2410C", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          {busy ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : <MessageSquareWarning size={14} />}
          Perlu Revisi
        </button>
      )}
    </div>
  );
}

function RevisionCard({ r, canApprove, busy, onApprove, onKeepRevision }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "14px 15px", fontFamily: FF }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.event_name || "-"}</div>
        <BrandTag brand={r.brand} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>
        {r.mc || "-"} · {r.site_id || "-"} · Actual {r.actual_sp ?? 0}/{r.actual_fwa ?? 0} (target {r.target_sp ?? 0}/{r.target_fwa ?? 0})
      </div>
      {r.validation_note && <div style={{ marginTop: 6, fontSize: 11.5, color: "#B45309", fontStyle: "italic" }}>&ldquo;{r.validation_note}&rdquo;</div>}
      <ApproveRejectRow canApprove={canApprove} busy={busy} onApprove={onApprove} approveLabel="Setujui (Override)" onReject={onKeepRevision} rejectLabel="Tetap Revisi" />
    </div>
  );
}

function StreetCard({ r, canApprove, busy, onApprove, onReject }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "14px 15px", fontFamily: FF }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C" }}>{r.md_full_name || r.md_email || "-"}</div>
      <div style={{ marginTop: 4, display: "flex", alignItems: "flex-start", gap: 5, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>
        <MapPin size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {r.street_description || "(tanpa deskripsi lokasi)"}
      </div>
      {Array.isArray(r.items) && r.items.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {r.items.map((it, i) => (
            <span key={i} style={{ fontSize: 10.5, fontWeight: 700, color: "#5A5A68", background: "#F6F7F9", borderRadius: 8, padding: "3px 8px" }}>
              {it.type_name} · {it.qty} {it.unit}
            </span>
          ))}
        </div>
      )}
      {Array.isArray(r.photos) && r.photos.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {r.photos.map((p, i) => (
            <a key={i} href={mdPhotoUrl(p.storage_path)} target="_blank" rel="noreferrer">
              <img src={mdPhotoUrl(p.storage_path)} alt={p.caption || "dokumentasi"} style={{ width: 58, height: 58, objectFit: "cover", borderRadius: 10, border: "1px solid #E9EAEE" }} />
            </a>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#B0B0BA" }}><ImageOff size={12} /> Tanpa foto</div>
      )}
      {r.note && <div style={{ marginTop: 6, fontSize: 11.5, color: "#8A8A96", fontStyle: "italic" }}>&ldquo;{r.note}&rdquo;</div>}
      <ApproveRejectRow canApprove={canApprove} busy={busy} onApprove={onApprove} onReject={onReject} rejectLabel="Tolak" />
    </div>
  );
}
