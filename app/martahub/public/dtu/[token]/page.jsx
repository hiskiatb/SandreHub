"use client";
/**
 * /martahub/public/dtu/[token] - halaman PUBLIK (TANPA login ke MartaHub)
 * utk submit MSISDN penjualan DTU lewat link yang dibagikan DMO dari
 * Report DTU (tombol "Bagikan" di app/martahub/m/dtu/page.jsx).
 *
 * PENTING: token SEKARANG cuma mengunci SCOPE BRANCH (+ kedaluwarsa 7 hari
 * dari waktu dibuat). MC, tanggal, dan jenis kegiatan BISA dipilih bebas
 * oleh pengisi di halaman ini sendiri (mh_dtu_public_mc_list utk daftar MC
 * se-branch, mh_dtu_public_categories utk 4 kegiatan DTU aktif) - desain
 * lama yang mengunci satu kombinasi persis per token diubah atas permintaan
 * eksplisit user ("bisa pilih mc, tanggal, jenis activity juga").
 *
 * Banner "danger" di atas WAJIB ada - menegaskan ini CUMA pencatatan
 * penjualan, BUKAN klaim pencapaian/achievement (permintaan eksplisit user,
 * supaya tidak disalahartikan sbg laporan performa resmi).
 *
 * IDENTITAS: WAJIB "Continue with Google" dulu - identitas unik (email)
 * dipakai utk pencatatan historical harian & deteksi duplikat submit,
 * TAPI nama tampilan boleh diketik manual (override nama dari Google).
 * Begitu email+nama Google ditangkap dari sesi OAuth, kita SEGERA
 * signOut() lagi dari supabaseMarta.auth supaya sesi auth penuh MartaHub
 * tidak ikut tertinggal di halaman publik ini - identitas Google-nya
 * sendiri disimpan terpisah di localStorage. Avatar bulat (huruf pertama
 * nama) + tanggal hari ini ditampilkan ringkas di pojok kanan atas; tap
 * utk buka menu Edit profil / Logout.
 *
 * Submit PER MSISDN - tiap submit langsung dapat popup hasil: SUKSES atau
 * DUPLIKAT (menunjukkan siapa & kapan sudah submit nomor yg sama).
 *
 * TIDAK pakai <MobileShell> (itu akan redirect ke login) - halaman ini
 * berdiri sendiri, cuma pinjam token desain (FF/BRAND) dari situ.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, QrCode, ArrowRight, Loader2, CardSim, Router, X, LogOut, Pencil, ChevronDown } from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import { FF, BRAND } from "../../../m/_shared/MobileShell";
import QrScanSheet from "../../../m/_shared/QrScanSheet";
import { isValidMsisdn, normalizeMsisdn } from "../../../m/_shared/msisdn";

const SP_FWA = {
  sp: { icon: CardSim, color: "#ED1C24", bg: "rgba(237,28,36,0.08)", label: "SP" },
  fwa: { icon: Router, color: "#C6168D", bg: "rgba(236,0,140,0.08)", label: "FWA" },
};

const LAST_MC_PREFIX = "mh_dtu_public_last_mc_";
const LAST_CAT_PREFIX = "mh_dtu_public_last_cat_";
const G_EMAIL_KEY = "mh_dtu_public_g_email";
const G_NAME_KEY = "mh_dtu_public_g_name";
const DISPLAY_NAME_KEY = "mh_dtu_public_display_name";
const ROLE_KEY = "mh_dtu_public_role";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtDateShort(iso) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function initialOf(name) {
  const n = (name || "").trim();
  return n ? n[0].toUpperCase() : "?";
}

const fieldSelStyle = { width: "100%", padding: "10px 36px 10px 12px", borderRadius: 12, border: "1.5px solid #D5D6DC", background: "#fff", fontSize: 13, fontWeight: 700, color: "#17181C", appearance: "none" };
const fieldWrapStyle = { position: "relative" };
const fieldChevronStyle = { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9A9AA6" };

export default function DtuPublicPage() {
  const { token } = useParams();
  const [linkInfo, setLinkInfo] = useState(null); // null = loading, {valid:false,...} | {valid:true,...}

  // identitas
  const [gEmail, setGEmail] = useState("");
  const [gName, setGName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [role, setRole] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleChecking, setGoogleChecking] = useState(true);
  const [avatarMenu, setAvatarMenu] = useState(false);

  // scope yang bisa dipilih bebas: MC, tanggal, kegiatan
  const [mcList, setMcList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [mc, setMc] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayStr());

  const [ctx, setCtx] = useState(null);
  const [kind, setKind] = useState("sp");
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [sendPct, setSendPct] = useState(0);
  const [sent, setSent] = useState([]);
  const [popup, setPopup] = useState(null);

  // 1. Identitas Google tersimpan + tangkap balikan OAuth
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let email = ""; let name = ""; let r = ""; let dn = "";
      try {
        email = localStorage.getItem(G_EMAIL_KEY) || "";
        name = localStorage.getItem(G_NAME_KEY) || "";
        r = localStorage.getItem(ROLE_KEY) || "";
        dn = localStorage.getItem(DISPLAY_NAME_KEY) || "";
      } catch { /* best-effort */ }

      try {
        const { data: { session } } = await supabaseMarta.auth.getSession();
        if (session?.user?.email) {
          const u = session.user;
          email = (u.email || "").toLowerCase();
          name = u.user_metadata?.full_name || u.user_metadata?.name || email;
          try { localStorage.setItem(G_EMAIL_KEY, email); localStorage.setItem(G_NAME_KEY, name); } catch { /* best-effort */ }
          await supabaseMarta.auth.signOut();
          try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }
        }
      } catch { /* best-effort */ }

      // Profil (nama+role) TERSIMPAN DI SERVER per akun Google (email) - jadi
      // kalau orang yg sama login dari device/browser lain, tidak perlu isi
      // ulang nama/role lagi (localStorage cuma percepat di device yg sama).
      if (email && (!r || !dn)) {
        try {
          const { data } = await supabaseMarta.rpc("mh_dtu_public_profile_get", { p_email: email });
          if (data?.found) {
            dn = dn || data.display_name;
            r = r || data.role;
            try { localStorage.setItem(DISPLAY_NAME_KEY, dn); localStorage.setItem(ROLE_KEY, r); } catch { /* best-effort */ }
          }
        } catch { /* best-effort, lanjut minta isi manual */ }
      }

      if (cancelled) return;
      const dnFinal = dn || name;
      setGEmail(email); setGName(name); setRole(r); setRoleDraft(r);
      setDisplayName(dnFinal); setDisplayNameDraft(dnFinal);
      setGoogleChecking(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // 2. Validasi token + scope branch. MC & Kegiatan dipakai dari pilihan
  //    TERAKHIR kali (localStorage, per-token) kalau ada, baru fallback ke
  //    default bawaan link - tanggal SELALU default hari ini (tidak ikut
  //    diingat, krn pencatatan biasanya utk hari berjalan).
  useEffect(() => {
    let cancelled = false;
    supabaseMarta.rpc("mh_dtu_public_link_info", { p_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) { setLinkInfo({ valid: false, reason: "error" }); return; }
      setLinkInfo(data);
      if (data.valid) {
        let lastMc = ""; let lastCat = "";
        try {
          lastMc = localStorage.getItem(LAST_MC_PREFIX + token) || "";
          lastCat = localStorage.getItem(LAST_CAT_PREFIX + token) || "";
        } catch { /* best-effort */ }
        setMc(lastMc || data.default_mc || "");
        setCategoryId(lastCat || data.default_category_id || "");
        setDate(todayStr());
      }
    });
    return () => { cancelled = true; };
  }, [token]);

  // 3. Daftar MC (ikut bulan dari tanggal yang dipilih) + daftar kegiatan
  useEffect(() => {
    if (!linkInfo?.valid) return;
    const month = date.replace(/-/g, "").slice(0, 6);
    supabaseMarta.rpc("mh_dtu_public_mc_list", { p_token: token, p_month: month }).then(({ data }) => setMcList(data || []));
  }, [linkInfo?.valid, token, date]);

  useEffect(() => {
    if (!linkInfo?.valid) return;
    supabaseMarta.rpc("mh_dtu_public_categories", { p_token: token }).then(({ data }) => setCategories(data || []));
  }, [linkInfo?.valid, token]);

  // 4. Muat ringkasan pencatatan tiap kali scope/identitas berubah
  useEffect(() => {
    if (!linkInfo?.valid || !mc || !categoryId || !date) return;
    let cancelled = false;
    supabaseMarta.rpc("mh_dtu_public_context", {
      p_token: token, p_mc: mc, p_category_id: categoryId, p_date: date,
      p_email: gEmail || null,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) { setCtx({ valid: false, reason: "error" }); return; }
      setCtx(data);
    });
    return () => { cancelled = true; };
  }, [linkInfo?.valid, token, mc, categoryId, date, gEmail]);

  async function signInGoogle() {
    setGoogleBusy(true); setErr("");
    try {
      const { error } = await supabaseMarta.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href, queryParams: { prompt: "select_account" } },
      });
      if (error) throw error;
    } catch (e) {
      setErr("Login Google gagal atau dibatalkan. Coba lagi.");
      setGoogleBusy(false);
    }
  }

  function logoutGoogle() {
    try {
      localStorage.removeItem(G_EMAIL_KEY); localStorage.removeItem(G_NAME_KEY);
      localStorage.removeItem(DISPLAY_NAME_KEY); localStorage.removeItem(ROLE_KEY);
    } catch { /* best-effort */ }
    setGEmail(""); setGName(""); setDisplayName(""); setDisplayNameDraft(""); setRole(""); setRoleDraft("");
    setAvatarMenu(false);
  }

  async function confirmProfile() {
    if (!displayNameDraft.trim()) { setErr("Nama wajib diisi."); return; }
    if (!roleDraft.trim()) { setErr("Role wajib diisi."); return; }
    const n = displayNameDraft.trim(); const r = roleDraft.trim();
    try {
      localStorage.setItem(DISPLAY_NAME_KEY, n);
      localStorage.setItem(ROLE_KEY, r);
    } catch { /* best-effort */ }
    setErr("");
    setDisplayName(n);
    setRole(r);
    setAvatarMenu(false);
    // simpan ke server (per akun Google) supaya login dari device lain tidak perlu isi ulang
    try { await supabaseMarta.rpc("mh_dtu_public_profile_set", { p_email: gEmail, p_name: n, p_role: r }); } catch { /* best-effort */ }
  }

  async function submitMsisdn(raw) {
    const norm = normalizeMsisdn(raw);
    if (!isValidMsisdn(norm)) { setErr('Nomor belum valid - wajib diawali "62".'); return; }
    if (!mc || !categoryId || !date) { setErr("Pilih MC, Tanggal, dan Kegiatan dulu."); return; }
    setErr(""); setSending(true); setSendPct(6);
    const progressTimer = setInterval(() => {
      setSendPct((p) => (p < 88 ? p + (88 - p) * 0.22 + 1.5 : p));
    }, 110);
    const myName = (displayName || gName).trim();
    const myRole = role.trim();
    try {
      const { data, error } = await supabaseMarta.rpc("mh_dtu_public_msisdn_add", {
        p_token: token, p_sp_fwa: kind, p_msisdn: norm, p_name: myName, p_role: myRole,
        p_mc: mc, p_category_id: categoryId, p_date: date, p_email: gEmail.trim(),
      });
      if (error) throw new Error(error.message);
      clearInterval(progressTimer);
      setSendPct(100);
      const added = !!data?.added;
      setSent((p) => [{ msisdn: norm, kind, dup: !added, name: data?.existing_name, role: data?.existing_role, at: data?.existing_at }, ...p]);
      setInput("");
      const commonDetail = { mc, categoryName, branchName: linkInfo?.branch_name, date };
      if (added) {
        setCtx((c) => (c ? { ...c, [kind === "sp" ? "count_sp" : "count_fwa"]: (c[kind === "sp" ? "count_sp" : "count_fwa"] || 0) + 1 } : c));
        setPopup({ ok: true, msisdn: norm, kind, name: myName, role: myRole, email: gEmail, ...commonDetail });
      } else {
        setPopup({
          ok: false, msisdn: norm, kind, ...commonDetail,
          name: data?.existing_name, role: data?.existing_role, email: data?.existing_email, at: data?.existing_at,
        });
      }
    } catch (e) {
      clearInterval(progressTimer);
      setErr(e.message || "Gagal menyimpan");
    }
    finally {
      setSending(false);
      setTimeout(() => setSendPct(0), 350);
    }
  }

  const categoryName = useMemo(() => categories.find((c) => c.category_id === categoryId)?.category_name || "", [categories, categoryId]);
  const identified = !!gEmail && !!role && !!displayName;

  if (linkInfo === null || googleChecking) {
    return (
      <Shell>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <Loader2 size={24} className="mh-spin" color="#ED1C24" />
        </div>
      </Shell>
    );
  }

  if (!linkInfo.valid) {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <AlertTriangle size={30} color="#C62828" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C", marginBottom: 6 }}>
            {linkInfo.reason === "expired" ? "Link sudah kedaluwarsa" : "Link tidak ditemukan"}
          </div>
          <div style={{ fontSize: 12.5, color: "#9A9AA6", lineHeight: 1.6 }}>
            {linkInfo.reason === "expired"
              ? "Link ini hanya berlaku 7 hari sejak dibuat. Minta DMO membuat link baru kalau masih perlu input."
              : "Pastikan link yang dibuka benar, atau minta DMO membagikan ulang."}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Topbar: judul + branch di kiri, avatar+tanggal di kanan, satu kesatuan flat (tanpa glow) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9AA6", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>Catat Penjualan DTU</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#17181C", lineHeight: 1.15, letterSpacing: -0.3 }}>{linkInfo.branch_name}</div>
        </div>
        {identified && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button onClick={() => setAvatarMenu((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #ECEDF0", borderRadius: 999, padding: "5px 12px 5px 5px" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#17181C", color: "#fff", fontSize: 12.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {initialOf(displayName)}
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#5A5A68" }}>{(displayName || "").trim().split(/\s+/)[0] || "-"}</div>
              <ChevronDown size={13} color="#9A9AA6" />
            </button>
            {avatarMenu && (
              <>
                <div onClick={() => setAvatarMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 190 }} />
                <div style={{ position: "absolute", top: 42, right: 0, background: "#fff", border: "1px solid #ECEDF0", borderRadius: 14, padding: 6, zIndex: 200, minWidth: 190 }}>
                  <div style={{ padding: "8px 10px", borderBottom: "1px solid #F0F0F3", marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
                    <div style={{ fontSize: 10, color: "#9A9AA6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gEmail}</div>
                  </div>
                  <button onClick={() => { setAvatarMenu(false); setRole(""); setRoleDraft(role); setDisplayNameDraft(displayName); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "none", border: "none", borderRadius: 9, fontSize: 12.5, fontWeight: 700, color: "#17181C", textAlign: "left" }}>
                    <Pencil size={13} /> Edit nama/role
                  </button>
                  <button onClick={logoutGoogle}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "none", border: "none", borderRadius: 9, fontSize: 12.5, fontWeight: 700, color: "#ED1C24", textAlign: "left" }}>
                    <LogOut size={13} /> Logout
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Banner danger - flat, aksen garis kiri (bukan pill penuh warna) */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", borderLeft: "3px solid #ED1C24", borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
        <AlertTriangle size={14} color="#ED1C24" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 11.5, color: "#5A5A68", fontWeight: 600, lineHeight: 1.3 }}>
          Sekadar pencatatan penjualan - <b style={{ color: "#17181C" }}>bukan klaim pencapaian</b>.
        </div>
      </div>

      {err && <div style={{ background: "#FFF1F0", border: "1px solid #FFCCC7", color: "#C62828", borderRadius: 10, padding: "9px 12px", fontSize: 12, marginBottom: 12 }}>{err}</div>}

      {!gEmail ? (
        <div style={{ minHeight: "calc(100svh - 300px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "100%", background: "#fff", border: "1px solid #ECEDF0", borderRadius: 20, padding: "32px 22px", textAlign: "center" }}>
            <div style={{ width: 68, height: 68, borderRadius: "50%", margin: "0 auto 18px", background: "#F6F7F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <GoogleLogo size={32} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C", marginBottom: 7 }}>Verifikasi identitas dulu</div>
            <div style={{ fontSize: 12.5, color: "#9A9AA6", lineHeight: 1.65, marginBottom: 24, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>
              Wajib login dengan akun Google supaya pencatatan penjualanmu tersimpan rapi per hari & tidak tertukar dengan orang lain.
            </div>
            <button onClick={signInGoogle} disabled={googleBusy}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px", borderRadius: 14, border: "1.5px solid #D5D6DC", background: "#fff", fontSize: 14, fontWeight: 700, color: "#17181C", opacity: googleBusy ? 0.6 : 1 }}>
              {googleBusy ? <Loader2 size={17} className="mh-spin" color="#5A5A68" /> : <GoogleLogo size={17} />}
              {googleBusy ? "Membuka Google…" : "Continue with Google"}
            </button>
            <div style={{ fontSize: 10.5, color: "#C6C7CE", marginTop: 16 }}>Data MSISDN kamu aman & hanya dipakai utk pencatatan DTU.</div>
          </div>
        </div>
      ) : (!role || !displayName) ? (
        <div style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 18, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", background: "#FAFAFB", borderBottom: "1px solid #ECEDF0" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#fff", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <GoogleLogo size={17} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9A9AA6", textTransform: "uppercase", letterSpacing: 0.3 }}>Masuk sebagai</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gEmail}</div>
            </div>
            <button onClick={logoutGoogle}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff", border: "1px solid #E7E8ED", borderRadius: 10, padding: "7px 11px", color: "#5A5A68", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              <LogOut size={12} /> Logout
            </button>
          </div>

          <div style={{ padding: "18px 16px 16px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", marginBottom: 2 }}>Lengkapi profil</div>
            <div style={{ fontSize: 11.5, color: "#9A9AA6", marginBottom: 18 }}>Dipakai utk mencatat siapa yang submit penjualan.</div>

            <label style={{ display: "block", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#17181C", marginBottom: 6 }}>Nama</div>
              <input value={displayNameDraft} onChange={(e) => setDisplayNameDraft(e.target.value)} placeholder="Nama lengkap"
                style={{ width: "100%", padding: "12px 13px", borderRadius: 12, border: "1.5px solid #E7E8ED", background: "#FAFAFB", fontSize: 13.5, fontWeight: 600, color: "#17181C", boxSizing: "border-box" }} />
              <div style={{ fontSize: 10, color: "#C6C7CE", marginTop: 5 }}>Default diambil dari akun Google, boleh diganti manual.</div>
            </label>
            <label style={{ display: "block", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#17181C", marginBottom: 6 }}>Role di lapangan</div>
              <input value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} placeholder="mis. Promotor, DSE, DSF"
                onKeyDown={(e) => e.key === "Enter" && confirmProfile()}
                style={{ width: "100%", padding: "12px 13px", borderRadius: 12, border: "1.5px solid #E7E8ED", background: "#FAFAFB", fontSize: 13.5, fontWeight: 600, color: "#17181C", boxSizing: "border-box" }} />
            </label>
            <button onClick={confirmProfile} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: BRAND, color: "#fff", fontSize: 14, fontWeight: 800 }}>
              Lanjut
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Pilih MC / Tanggal / Kegiatan - bebas, scope branch sesuai link */}
          <div style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 16, padding: "14px", marginBottom: 14 }}>
            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9A9AA6", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 }}>MC</div>
              <div style={fieldWrapStyle}>
                <select value={mc} onChange={(e) => {
                  const v = e.target.value;
                  setMc(v);
                  try { localStorage.setItem(LAST_MC_PREFIX + token, v); } catch { /* best-effort */ }
                }} style={fieldSelStyle}>
                  {!mcList.includes(mc) && mc && <option value={mc}>{mc}</option>}
                  {mcList.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown size={16} style={fieldChevronStyle} />
              </div>
            </label>
            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9A9AA6", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 }}>Kegiatan</div>
              <div style={fieldWrapStyle}>
                <select value={categoryId} onChange={(e) => {
                    const v = e.target.value;
                    setCategoryId(v);
                    try { localStorage.setItem(LAST_CAT_PREFIX + token, v); } catch { /* best-effort */ }
                  }} style={fieldSelStyle}>
                  {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
                </select>
                <ChevronDown size={16} style={fieldChevronStyle} />
              </div>
            </label>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9A9AA6", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 }}>Tanggal</div>
              <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} style={{ ...fieldSelStyle, padding: "10px 12px" }} />
            </label>
          </div>

          {/* Pencatatan Anda - Bulan Ini & Hari Ini, utk kombinasi mc/tanggal/kegiatan yg sedang dipilih */}
          <div style={{ background: "linear-gradient(135deg,#17181C,#2A2B33)", borderRadius: 18, padding: "16px 16px", marginBottom: 16, boxShadow: "0 6px 18px rgba(23,24,28,0.18)" }}>
            <PencatatanBlock label="Pencatatan Bulan Ini" sp={ctx?.count_sp_month} fwa={ctx?.count_fwa_month} />
            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "14px 0" }} />
            <PencatatanBlock label={`Pencatatan ${fmtDate(date)}`} sp={ctx?.count_sp} fwa={ctx?.count_fwa} />
          </div>

          {/* Catat MSISDN - toggle SP/FWA + input, dibungkus satu kartu supaya konsisten dgn kartu MC/Kegiatan/Tanggal.
              Judul, label input, & tombol scan ikut berubah otomatis sesuai SP/FWA yg dipilih. */}
          <div style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 18, padding: "16px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>Catat MSISDN {SP_FWA[kind].label}</div>
              {categoryName && <div style={{ fontSize: 11, fontWeight: 600, color: "#9A9AA6" }}>{categoryName}</div>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {["sp", "fwa"].map((k) => {
                const meta = SP_FWA[k]; const Icon = meta.icon; const active = kind === k;
                return (
                  <button key={k} onClick={() => setKind(k)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 13,
                      border: active ? `1.5px solid ${meta.color}` : "1.5px solid #ECEDF0", background: active ? meta.bg : "#FAFAFB", transition: "all 0.15s ease" }}>
                    <Icon size={17} color={active ? meta.color : "#9A9AA6"} />
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: active ? meta.color : "#5A5A68" }}>{meta.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: "#9A9AA6", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>Nomor MSISDN {SP_FWA[kind].label}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                onKeyDown={(e) => e.key === "Enter" && input.trim() && !sending && submitMsisdn(input)}
                placeholder="mis. 628123456789"
                disabled={sending}
                style={{ flex: 1, minWidth: 0, padding: "13px 14px", borderRadius: 13, border: "1.5px solid #E7E8ED", background: "#FAFAFB", color: "#17181C", fontSize: 14.5, fontWeight: 700, boxSizing: "border-box" }} />
              <button onClick={() => input.trim() && submitMsisdn(input)} disabled={sending || !input.trim()}
                style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 6, padding: "0 16px", minWidth: sending ? 84 : undefined, borderRadius: 13, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, opacity: !sending && !input.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}>
                {sending && (
                  <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(sendPct, 100)}%`, background: "rgba(255,255,255,0.22)", transition: "width 0.15s ease" }} />
                )}
                <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
                  {sending ? (
                    <>
                      <Loader2 size={14} color="#fff" className="mh-spin" />
                      {Math.min(Math.round(sendPct), 99)}%
                    </>
                  ) : (
                    <>Submit <ArrowRight size={15} /></>
                  )}
                </span>
              </button>
            </div>
            <button onClick={() => setScanning(true)} disabled={sending}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px", borderRadius: 13, border: "1px dashed #D5D6DC", background: "#FAFAFB", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, opacity: sending ? 0.6 : 1 }}>
              <QrCode size={15} color="#5A5A68" /> Scan QR Kartu {SP_FWA[kind].label}
            </button>
          </div>

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

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid #F0F1F4" }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9AA6", textTransform: "uppercase", letterSpacing: 0.3, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function ResultPopup({ data, onClose }) {
  const meta = SP_FWA[data.kind]; const Icon = meta.icon;
  return (
    <div onClick={onClose} className="mh-pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="mh-pop-card" style={{ width: "100%", maxWidth: 380, maxHeight: "86vh", overflowY: "auto", background: "#fff", borderRadius: 24, padding: "28px 22px 22px", textAlign: "center", position: "relative", fontFamily: FF, boxShadow: "0 24px 60px rgba(23,24,28,0.28)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, borderRadius: 9, border: "none", background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X size={14} color="#5A5A68" />
        </button>

        <div className={data.ok ? "mh-pop-icon-ok" : "mh-pop-icon-bad"} style={{ width: 58, height: 58, borderRadius: "50%", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center",
          background: data.ok ? "rgba(46,125,50,0.1)" : "rgba(180,83,9,0.1)" }}>
          {data.ok
            ? <CheckCircle2 size={30} color="#2E7D32" className="mh-pop-check" />
            : <AlertTriangle size={27} color="#B45309" className="mh-pop-shake" />}
        </div>

        <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C", marginBottom: 4 }}>
          {data.ok ? "Nomor berhasil dicatat" : "Nomor sudah pernah dicatat"}
        </div>
        <div style={{ fontSize: 12, color: "#9A9AA6", marginBottom: 12 }}>
          {data.ok ? "Terima kasih, data tersimpan." : "Nomor ini sudah lebih dulu disubmit - lihat detailnya di bawah."}
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: meta.bg, border: `1px solid ${meta.color}22`, borderRadius: 10, padding: "6px 11px", margin: "0 0 14px" }}>
          <Icon size={13} color={meta.color} />
          <span style={{ fontSize: 13, fontWeight: 800, color: "#17181C" }}>{data.msisdn}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: meta.color }}>{meta.label}</span>
        </div>

        <div style={{ textAlign: "left", background: "#FAFAFB", border: "1px solid #ECEDF0", borderRadius: 14, padding: "4px 14px" }}>
          <DetailRow label="Nama" value={data.name} />
          <DetailRow label="Role" value={data.role} />
          <DetailRow label="Akun Google" value={data.email} />
          <DetailRow label="Kegiatan" value={data.categoryName} />
          <DetailRow label="Branch" value={data.branchName} />
          <DetailRow label="MC" value={data.mc} />
          <DetailRow label="Tanggal Kegiatan" value={fmtDate(data.date)} />
          {!data.ok && <DetailRow label="Waktu Submit" value={data.at ? fmtTime(data.at) : null} />}
        </div>

        <button onClick={onClose} style={{ width: "100%", marginTop: 14, padding: "13px", borderRadius: 13, border: "none",
          background: data.ok ? BRAND : "#17181C", color: "#fff", fontSize: 13.5, fontWeight: 800 }}>
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
        @keyframes mhPopFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mhPopScale { from { opacity: 0; transform: scale(0.88) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes mhPopCheck { 0% { transform: scale(0.4) rotate(-20deg); opacity: 0; } 55% { transform: scale(1.15) rotate(4deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes mhPopShake { 0%, 100% { transform: translateX(0) rotate(0); } 20% { transform: translateX(-3px) rotate(-6deg); } 40% { transform: translateX(3px) rotate(6deg); } 60% { transform: translateX(-2px) rotate(-3deg); } 80% { transform: translateX(2px) rotate(3deg); } }
        .mh-pop-overlay { animation: mhPopFade 0.18s ease both; }
        .mh-pop-card { animation: mhPopScale 0.28s cubic-bezier(0.22,1,0.36,1) both; }
        .mh-pop-check { animation: mhPopCheck 0.5s cubic-bezier(0.22,1,0.36,1) 0.08s both; }
        .mh-pop-shake { animation: mhPopShake 0.5s ease 0.08s both; }
      `}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "calc(env(safe-area-inset-top,0px) + 24px) 18px 40px" }}>
        {children}
      </div>
    </div>
  );
}
