"use client";
/**
 * /martahub/public/dtu/[token] - halaman PUBLIK (TANPA login ke MartaHub)
 * utk submit MSISDN penjualan DTU lewat link yang dibagikan DMO dari
 * Report DTU (lihat tombol "Bagikan" di app/martahub/m/dtu/page.jsx).
 *
 * Satu token = satu kombinasi persis (tanggal, branch, MC, kategori) -
 * TIDAK bisa pilih-pilih, supaya tidak disalahgunakan ke konteks lain.
 * Kedaluwarsa 7 hari dari TANGGAL AKTIVITASNYA (bukan dari waktu link
 * dibuat) - diatur server-side di RPC mh_dtu_share_link_get_or_create.
 *
 * IDENTITAS: WAJIB "Continue with Google" dulu (permintaan eksplisit user -
 * supaya identitas pengisi unik & bisa dipakai utk pencatatan historical
 * harian, bukan sekadar nama ketikan tangan yang gampang beda-beda tiap
 * kali). Role tetap diketik manual (field bebas, krn Google tidak tahu
 * peran lapangan orang itu). Alur OAuth PINJAM client Supabase yang sama
 * (`supabaseMarta`) krn provider Google-nya sudah dikonfigurasi di situ
 * (lihat app/martahub/m/login/page.jsx) - TAPI begitu email+nama berhasil
 * ditangkap dari sesinya, kita LANGSUNG signOut() lagi supaya sesi auth
 * penuh MartaHub (yang redirect ke /martahub/m, cek mh_profiles dsb) TIDAK
 * ikut tertinggal di browser orang yang cuma mau isi MSISDN sekali ini -
 * email+nama Google-nya sendiri disimpan di localStorage (bukan sesi auth)
 * supaya kunjungan berikutnya tidak perlu login ulang.
 *
 * Submit PER MSISDN - tiap submit langsung dapat popup hasil: SUKSES
 * (nomor berhasil dicatat) atau DUPLIKAT (nomor sudah pernah disubmit -
 * popup menunjukkan siapa & kapan).
 *
 * "Pencatatan Bulan Ini" / "Pencatatan Hari Ini" = jumlah SP/FWA yang
 * submitter INI (dicocokkan via email Google, unik) kirim - dihitung
 * server-side di mh_dtu_public_context(p_email).
 *
 * TIDAK pakai <MobileShell> (itu akan redirect ke login) - halaman ini
 * berdiri sendiri, cuma pinjam token desain (FF/BRAND) dari situ.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, QrCode, ArrowRight, Loader2, CardSim, Router, X } from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import { FF, BRAND } from "../../../m/_shared/MobileShell";
import QrScanSheet from "../../../m/_shared/QrScanSheet";
import { isValidMsisdn, normalizeMsisdn } from "../../../m/_shared/msisdn";

const SP_FWA = {
  sp: { icon: CardSim, color: "#ED1C24", bg: "rgba(237,28,36,0.08)", label: "SP" },
  fwa: { icon: Router, color: "#C6168D", bg: "rgba(236,0,140,0.08)", label: "FWA" },
};

const G_EMAIL_KEY = "mh_dtu_public_g_email";
const G_NAME_KEY = "mh_dtu_public_g_name";
const ROLE_KEY = "mh_dtu_public_role";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function DtuPublicPage() {
  const { token } = useParams();
  const [ctx, setCtx] = useState(null); // null = loading, {valid:false,...} | {valid:true,...}
  const [gEmail, setGEmail] = useState("");
  const [gName, setGName] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleChecking, setGoogleChecking] = useState(true); // true selama cek sesi OAuth balik
  const [role, setRole] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [kind, setKind] = useState("sp");
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]); // {msisdn, kind, dup, name, role, at}
  const [popup, setPopup] = useState(null); // {ok:true,msisdn,kind} | {ok:false,msisdn,kind,name,role,at}

  async function loadCtx(email) {
    const { data, error } = await supabaseMarta.rpc("mh_dtu_public_context", { p_token: token, p_email: email || null });
    if (error) setCtx({ valid: false, reason: "error" });
    else setCtx(data || { valid: false, reason: "error" });
  }

  // 1. Cek identitas Google yang sudah pernah disimpan (kunjungan ulang)
  //    DAN cek apakah kita baru saja balik dari redirect OAuth Google (sesi
  //    baru di supabaseMarta.auth) - kalau ada, tangkap email+nama lalu
  //    SEGERA signOut() supaya tidak ninggalin sesi auth MartaHub di browser
  //    publik ini.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let email = ""; let name = ""; let r = "";
      try {
        email = localStorage.getItem(G_EMAIL_KEY) || "";
        name = localStorage.getItem(G_NAME_KEY) || "";
        r = localStorage.getItem(ROLE_KEY) || "";
      } catch { /* best-effort */ }

      try {
        const { data: { session } } = await supabaseMarta.auth.getSession();
        if (session?.user?.email) {
          const u = session.user;
          email = (u.email || "").toLowerCase();
          name = u.user_metadata?.full_name || u.user_metadata?.name || email;
          try { localStorage.setItem(G_EMAIL_KEY, email); localStorage.setItem(G_NAME_KEY, name); } catch { /* best-effort */ }
          await supabaseMarta.auth.signOut(); // jangan tinggalkan sesi auth penuh di halaman publik ini
          // bersihkan hash/query OAuth dari URL biar rapi & gak ke-trigger lagi
          try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }
        }
      } catch { /* best-effort, lanjut pakai yang dari localStorage saja */ }

      if (cancelled) return;
      setGEmail(email); setGName(name); setRole(r); setRoleDraft(r);
      setGoogleChecking(false);
      loadCtx(email);
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function signInGoogle() {
    setGoogleBusy(true); setErr("");
    try {
      const { error } = await supabaseMarta.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href, queryParams: { prompt: "select_account" } },
      });
      if (error) throw error;
      // browser akan redirect keluar - tidak perlu setGoogleBusy(false) di jalur sukses
    } catch (e) {
      setErr("Login Google gagal atau dibatalkan. Coba lagi.");
      setGoogleBusy(false);
    }
  }

  function switchGoogleAccount() {
    try { localStorage.removeItem(G_EMAIL_KEY); localStorage.removeItem(G_NAME_KEY); } catch { /* best-effort */ }
    setGEmail(""); setGName("");
  }

  function confirmRole() {
    if (!roleDraft.trim()) { setErr("Role wajib diisi."); return; }
    try { localStorage.setItem(ROLE_KEY, roleDraft.trim()); } catch { /* best-effort */ }
    setErr("");
    setRole(roleDraft.trim());
  }

  async function submitMsisdn(raw) {
    const norm = normalizeMsisdn(raw);
    if (!isValidMsisdn(norm)) { setErr('Nomor belum valid - wajib diawali "62".'); return; }
    setErr(""); setSending(true);
    try {
      const { data, error } = await supabaseMarta.rpc("mh_dtu_public_msisdn_add", {
        p_token: token, p_sp_fwa: kind, p_msisdn: norm, p_name: gName.trim(), p_role: role.trim(), p_email: gEmail.trim(),
      });
      if (error) throw new Error(error.message);
      const added = !!data?.added;
      setSent((p) => [{ msisdn: norm, kind, dup: !added, name: data?.existing_name, role: data?.existing_role, at: data?.existing_at }, ...p]);
      setInput("");
      if (added) {
        setCtx((c) => (c ? { ...c, [kind === "sp" ? "count_sp" : "count_fwa"]: (c[kind === "sp" ? "count_sp" : "count_fwa"] || 0) + 1 } : c));
        setPopup({ ok: true, msisdn: norm, kind });
      } else {
        setPopup({ ok: false, msisdn: norm, kind, name: data?.existing_name, role: data?.existing_role, at: data?.existing_at });
      }
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSending(false); }
  }

  if (ctx === null || googleChecking) {
    return (
      <Shell>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <Loader2 size={24} className="mh-spin" color="#ED1C24" />
        </div>
      </Shell>
    );
  }

  if (!ctx.valid) {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <AlertTriangle size={30} color="#C62828" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C", marginBottom: 6 }}>
            {ctx.reason === "expired" ? "Link sudah kedaluwarsa" : "Link tidak ditemukan"}
          </div>
          <div style={{ fontSize: 12.5, color: "#9A9AA6", lineHeight: 1.6 }}>
            {ctx.reason === "expired"
              ? "Link ini hanya berlaku 7 hari sejak tanggal aktivitasnya. Minta DMO membuat link baru kalau masih perlu input."
              : "Pastikan link yang dibuka benar, atau minta DMO membagikan ulang."}
          </div>
        </div>
      </Shell>
    );
  }

  const identified = !!gEmail && !!role;

  return (
    <Shell>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9A9AA6", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 }}>Catat Penjualan DTU</div>
        <div style={{ fontSize: 21, fontWeight: 800, color: "#17181C", lineHeight: 1.2 }}>{ctx.category_name}</div>
        <div style={{ fontSize: 12, color: "#9A9AA6", marginTop: 4 }}>{fmtDate(ctx.actual_date)}</div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 16, padding: "13px 14px", marginBottom: 16 }}>
        <Row label="Branch" value={ctx.branch_name} />
        <Row label="MC" value={ctx.mc} />
      </div>

      {/* Pencatatan Anda - Bulan Ini & Hari Ini */}
      <div style={{ background: "linear-gradient(135deg,#17181C,#2A2B33)", borderRadius: 18, padding: "16px 16px", marginBottom: 16, boxShadow: "0 6px 18px rgba(23,24,28,0.18)" }}>
        <PencatatanBlock label="Pencatatan Bulan Ini" sp={ctx.count_sp_month} fwa={ctx.count_fwa_month} />
        <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "14px 0" }} />
        <PencatatanBlock label="Pencatatan Hari Ini" sp={ctx.count_sp} fwa={ctx.count_fwa} />
      </div>

      {err && <div style={{ background: "#FFF1F0", border: "1px solid #FFCCC7", color: "#C62828", borderRadius: 10, padding: "9px 12px", fontSize: 12, marginBottom: 12 }}>{err}</div>}

      {!gEmail ? (
        <div style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 16, padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", marginBottom: 5 }}>Verifikasi identitas dulu</div>
          <div style={{ fontSize: 12, color: "#9A9AA6", lineHeight: 1.6, marginBottom: 18 }}>
            Wajib login dengan akun Google supaya pencatatan penjualanmu tersimpan rapi per hari & tidak tertukar dengan orang lain.
          </div>
          <button onClick={signInGoogle} disabled={googleBusy}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "13px", borderRadius: 14, border: "1.5px solid #D5D6DC", background: "#fff", fontSize: 14, fontWeight: 700, color: "#17181C", opacity: googleBusy ? 0.6 : 1 }}>
            {googleBusy ? <Loader2 size={17} className="mh-spin" color="#5A5A68" /> : <GoogleLogo size={17} />}
            {googleBusy ? "Membuka Google…" : "Continue with Google"}
          </button>
        </div>
      ) : !role ? (
        <div style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 16, padding: "16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "9px 11px", background: "#F6F7F9", borderRadius: 12 }}>
            <GoogleLogo size={16} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gName}</div>
              <div style={{ fontSize: 10.5, color: "#9A9AA6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gEmail}</div>
            </div>
            <button onClick={switchGoogleAccount} style={{ background: "none", border: "none", color: "#ED1C24", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Ganti</button>
          </div>
          <label style={{ display: "block", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9A9AA6", marginBottom: 5 }}>Role kamu di lapangan</div>
            <input value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} placeholder="mis. Promotor, DSE, DSF"
              onKeyDown={(e) => e.key === "Enter" && confirmRole()}
              style={{ width: "100%", padding: "11px 13px", borderRadius: 12, border: "1px solid #ECEDF0", fontSize: 13.5, boxSizing: "border-box" }} />
          </label>
          <button onClick={confirmRole} style={{ width: "100%", padding: "13px", borderRadius: 14, border: "none", background: BRAND, color: "#fff", fontSize: 14, fontWeight: 800 }}>
            Lanjut
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: "1px solid #ECEDF0", borderRadius: 14, padding: "9px 13px", marginBottom: 12 }}>
            <GoogleLogo size={15} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#17181C", marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gName} · {role}</div>
            <button onClick={() => { setRole(""); setRoleDraft(""); }} style={{ background: "none", border: "none", color: "#ED1C24", fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>Ganti role</button>
          </div>

          {/* Toggle SP/FWA - besar, mudah ditap */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            {["sp", "fwa"].map((k) => {
              const meta = SP_FWA[k]; const Icon = meta.icon; const active = kind === k;
              return (
                <button key={k} onClick={() => setKind(k)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px", borderRadius: 14,
                    border: active ? `2px solid ${meta.color}` : "1px solid #ECEDF0", background: active ? meta.bg : "#fff" }}>
                  <Icon size={18} color={meta.color} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: active ? meta.color : "#17181C" }}>{meta.label}</span>
                </button>
              );
            })}
          </div>

          {/* Input MSISDN + tombol Submit */}
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9AA6", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>Nomor MSISDN</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
              onKeyDown={(e) => e.key === "Enter" && input.trim() && submitMsisdn(input)}
              placeholder="mis. 628123456789"
              style={{ flex: 1, minWidth: 0, padding: "13px 14px", borderRadius: 14, border: "1.5px solid #D5D6DC", background: "#fff", color: "#17181C", fontSize: 14.5, fontWeight: 700, boxSizing: "border-box" }} />
            <button onClick={() => input.trim() && submitMsisdn(input)} disabled={sending || !input.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 14, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, opacity: sending || !input.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}>
              {sending ? <Loader2 size={16} color="#fff" className="mh-spin" /> : <>Submit <ArrowRight size={15} /></>}
            </button>
          </div>
          <button onClick={() => setScanning(true)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 14, border: "1px dashed #D5D6DC", background: "#F6F7F9", color: "#5A5A68", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            <QrCode size={16} color="#5A5A68" /> Scan QR Kartu SIM
          </button>

          {sent.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#9A9AA6", marginBottom: 8 }}>Riwayat Submit Anda</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sent.map((s, i) => {
                  const meta = SP_FWA[s.kind]; const Icon = meta.icon;
                  return (
                    <div key={`${s.msisdn}-${i}`} style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: "1px solid #ECEDF0", borderRadius: 12, padding: "9px 12px" }}>
                      <Icon size={14} color={meta.color} />
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#17181C" }}>{s.msisdn}</div>
                      {s.dup
                        ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "#B45309" }}>sudah pernah tercatat</span>
                        : <CheckCircle2 size={15} color="#2E7D32" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {scanning && (
        <QrScanSheet title={`Scan QR Kartu SIM · ${SP_FWA[kind].label}`}
          onClose={() => setScanning(false)}
          onDetect={(msisdn) => { setScanning(false); submitMsisdn(msisdn); }} />
      )}

      {popup && <ResultPopup data={popup} onClose={() => setPopup(null)} />}
    </Shell>
  );
}

function GoogleLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.6 34.7 27 35.6 24 35.6c-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C40.6 36.6 44 31.1 44 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  );
}

function ResultPopup({ data, onClose }) {
  const meta = SP_FWA[data.kind]; const Icon = meta.icon;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 22, padding: "26px 22px 22px", textAlign: "center", position: "relative", fontFamily: FF }}>
        <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 9, border: "none", background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X size={14} color="#5A5A68" />
        </button>

        <div style={{ width: 54, height: 54, borderRadius: "50%", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center",
          background: data.ok ? "rgba(46,125,50,0.1)" : "rgba(180,83,9,0.1)" }}>
          {data.ok ? <CheckCircle2 size={28} color="#2E7D32" /> : <AlertTriangle size={26} color="#B45309" />}
        </div>

        <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C", marginBottom: 4 }}>
          {data.ok ? "Nomor berhasil dicatat" : "Nomor sudah pernah dicatat"}
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#F4F5F7", borderRadius: 10, padding: "6px 11px", margin: "6px 0 10px" }}>
          <Icon size={13} color={meta.color} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#17181C" }}>{data.msisdn}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: meta.color }}>{meta.label}</span>
        </div>

        {!data.ok && (
          <div style={{ fontSize: 12.5, color: "#5A5A68", lineHeight: 1.6, marginBottom: 6 }}>
            Sudah disubmit oleh <b style={{ color: "#17181C" }}>{data.name || "-"}</b>
            {data.role ? <> (<b style={{ color: "#17181C" }}>{data.role}</b>)</> : null}
            {data.at ? <> pada <b style={{ color: "#17181C" }}>{fmtTime(data.at)}</b></> : null}.
          </div>
        )}

        <button onClick={onClose} style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 13, border: "none",
          background: data.ok ? BRAND : "#F4F5F7", color: data.ok ? "#fff" : "#17181C", fontSize: 13.5, fontWeight: 800 }}>
          Oke, mengerti
        </button>
      </div>
    </div>
  );
}

function PencatatanBlock({ label, sp, fwa }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {["sp", "fwa"].map((k) => {
          const meta = SP_FWA[k]; const Icon = meta.icon;
          const v = k === "sp" ? sp : fwa;
          return (
            <div key={k} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 13, padding: "11px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={16} color="#fff" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{v || 0}</div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", fontWeight: 600, marginTop: 2 }}>{meta.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F5F7", fontFamily: FF }}>
      <style>{`
        html, body { background: #F4F5F7; }
        @keyframes mspin { to { transform: rotate(360deg); } }
        .mh-spin { animation: mspin 0.8s linear infinite; }
      `}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "calc(env(safe-area-inset-top,0px) + 24px) 18px 40px" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <div style={{ fontSize: 12, color: "#9A9AA6" }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{value}</div>
    </div>
  );
}
