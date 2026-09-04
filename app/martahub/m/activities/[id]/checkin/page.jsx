"use client";
/**
 * /martahub/m/activities/[id]/checkin - Check-In GPS (web mobile), setara
 * checkin_screen.dart. Pakai browser Geolocation API (bukan plugin native),
 * radius validasi dibaca dari `mh_get_settings` (checkin_radius_meters,
 * default 100m - SAMA dgn app Flutter), dan menulis lewat RPC
 * `mh_activity_checkin` yang SAMA PERSIS dipakai Flutter (satu sumber
 * kebenaran validasi di server).
 */
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, LocateFixed, RefreshCw } from "lucide-react";
import supabaseMarta from "../../../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../../_shared/MobileShell";

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CheckinPage() {
  const { id: activityId } = useParams();
  const router = useRouter();
  const { loading } = useMartaSession();

  const [activity, setActivity] = useState(null);
  const [radius, setRadius] = useState(100);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [locating, setLocating] = useState(true);
  const [pos, setPos] = useState(null);
  const [locError, setLocError] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (loading) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: a, error: e1 }, { data: settings }] = await Promise.all([
          supabaseMarta.from("mh_activities").select("id,event_name,site_id,address,poi_type,latitude,longitude,status").eq("id", activityId).single(),
          supabaseMarta.rpc("mh_get_settings"),
        ]);
        if (e1) throw e1;
        if (!alive) return;
        setActivity(a);
        const r = settings && typeof settings === "object" ? settings.checkin_radius_meters : null;
        if (typeof r === "number") setRadius(r);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat aktivitas");
      } finally {
        if (alive) setLoadingDetail(false);
      }
    })();
    return () => { alive = false; };
  }, [loading, activityId]);

  const locate = () => {
    if (!navigator.geolocation) { setLocError("Browser ini tidak mendukung geolocation."); setLocating(false); return; }
    setLocating(true); setLocError("");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos(p.coords); setLocating(false); },
      (e) => { setLocError(e.message || "Izin lokasi ditolak. Aktifkan di pengaturan browser."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };
  useEffect(() => { if (!loadingDetail) locate(); }, [loadingDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || loadingDetail) return <MobileShell active="activities"><ShellSpinner /></MobileShell>;
  if (err && !activity) return <MobileShell active="activities"><div style={{ padding: 40, textAlign: "center", color: "#C62828", fontSize: 13 }}>{err}</div></MobileShell>;

  // Guard sisi klien - halaman ini bisa dibuka langsung lewat URL, jadi
  // sembunyikan Check In dari daftar/detail saja TIDAK CUKUP.
  //
  // Plan SEKARANG TIDAK PERLU approval TMV lagi sebelum check-in/isi
  // laporan actual - begitu plan sudah DIAJUKAN ("plan_submitted", atau
  // status lanjutan apapun setelah itu, termasuk "approved" utk plan lama
  // dari sebelum perubahan ini), check-in langsung boleh begitu tanggal
  // event tiba. Yang TETAP diblokir cuma draft/revisi (plan belum lengkap/
  // belum diajukan) - itu bukan soal approval, tapi plan-nya sendiri belum
  // final/blm boleh dieksekusi.
  const BLOCKED_STATUSES = new Set(["draft", "revision_needed"]);
  if (activity && BLOCKED_STATUSES.has(activity.status)) {
    return (
      <MobileShell active="activities">
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#17181C" }}>Belum bisa Check In</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96", lineHeight: 1.5 }}>
            Plan ini belum diajukan - lengkapi & ajukan dulu sebelum check-in.
          </div>
          <button onClick={() => router.push(`/martahub/m/activities/new?edit=${activityId}`)}
            style={{ marginTop: 18, padding: "10px 20px", borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
            Lanjutkan Plan
          </button>
        </div>
      </MobileShell>
    );
  }

  const planLat = activity?.latitude != null ? Number(activity.latitude) : null;
  const planLng = activity?.longitude != null ? Number(activity.longitude) : null;
  const dist = pos && planLat != null && planLng != null ? haversineMeters(pos.latitude, pos.longitude, planLat, planLng) : null;
  const valid = pos != null && (planLat == null || (dist ?? 0) <= radius);

  async function doCheckin() {
    if (!pos) return;
    setSaving(true); setErr("");
    try {
      const distance = dist ?? 0;
      const { error } = await supabaseMarta.rpc("mh_activity_checkin", {
        p_activity_id: activityId,
        p_lat: pos.latitude,
        p_lng: pos.longitude,
        p_distance: distance,
        p_valid: valid,
      });
      if (error) throw error;
      router.replace(`/martahub/m/activities/${activityId}/submit`);
    } catch (e) {
      setErr(e.message || "Gagal menyimpan check-in");
      setSaving(false);
    }
  }

  return (
    <MobileShell active="activities">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 16px) 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.back()} style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>Check In Lokasi</div>
            <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>{activity?.event_name}</div>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(237,28,36,0.06)", color: "#C6168D", fontSize: 12, fontWeight: 700, textAlign: "center" }}>
          Pastikan Anda berada di lokasi kegiatan
        </div>
      </div>

      <div style={{ padding: "16px 20px 24px" }}>
        {err && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

        {/* Radar illustration */}
        <div style={{ height: 160, borderRadius: 18, background: "linear-gradient(160deg,#EEF1F6,#E4E8F0)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, position: "relative", overflow: "hidden" }}>
          <div style={{ width: 120, height: 120, borderRadius: "50%", background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: valid ? "#15803D" : locating ? "#8A8A96" : "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(0,0,0,0.18)" }}>
              <LocateFixed size={20} color="#fff" />
            </div>
          </div>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 18, padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 12 }}>Status Lokasi</div>

          {locating ? (
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: "#8A8A96", fontSize: 12.5, fontWeight: 600 }}>
              <Loader2 size={16} style={{ animation: "mspin .85s linear infinite", color: "#ED1C24" }} /> Mencari lokasi…
            </div>
          ) : locError ? (
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <XCircle size={17} color="#DC2626" />
              <span style={{ flex: 1, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{locError}</span>
              <button onClick={locate} style={{ background: "none", border: "none", color: "#ED1C24", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FF }}>Ulangi</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <StatusCell valid={valid} />
              <VDivider />
              <MiniKV k="Akurasi" v={pos?.accuracy != null ? `${Math.round(pos.accuracy)} m` : "-"} />
              <VDivider />
              <MiniKV k="Radius" v={`${radius} m`} />
            </div>
          )}

          <div style={{ height: 1, background: "#F0F0F3", margin: "16px 0" }} />

          <RowKV k="Latitude" v={pos ? pos.latitude.toFixed(6) : "-"} />
          <RowKV k="Longitude" v={pos ? pos.longitude.toFixed(6) : "-"} />
          {dist != null && <RowKV k="Jarak dari plan" v={`${dist.toFixed(0)} m`} />}
          <RowKV k="Site" v={activity?.site_id || "-"} />
          <RowKV k="Alamat" v={activity?.address || "-"} />

          {!locating && (
            <button onClick={locate}
              style={{ marginTop: 14, width: "100%", height: 42, borderRadius: 11, border: "1.5px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <RefreshCw size={13} /> Perbarui Lokasi
            </button>
          )}
        </div>
      </div>

      <div style={{ position: "sticky", bottom: 66, background: "linear-gradient(180deg,rgba(244,245,247,0) 0%,#F4F5F7 30%)", padding: "16px 20px 0" }}>
        <button onClick={doCheckin} disabled={!pos || saving}
          style={{
            width: "100%", height: 52, borderRadius: 14, border: "none", cursor: !pos || saving ? "default" : "pointer",
            background: !pos ? "#D8D9E0" : BRAND, color: "#fff", fontSize: 14.5, fontWeight: 800, fontFamily: FF,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
            boxShadow: !pos ? "none" : "0 4px 14px rgba(17,17,20,0.11)",
          }}>
          {saving ? <Loader2 size={17} style={{ animation: "mspin .85s linear infinite" }} /> : <CheckCircle2 size={18} />}
          {saving ? "Menyimpan…" : "Check In Sekarang"}
        </button>
      </div>
    </MobileShell>
  );
}

function StatusCell({ valid }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      {valid ? <CheckCircle2 size={19} color="#15803D" style={{ margin: "0 auto" }} /> : <XCircle size={19} color="#DC2626" style={{ margin: "0 auto" }} />}
      <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 700, color: valid ? "#15803D" : "#DC2626" }}>{valid ? "Valid" : "Di Luar Radius"}</div>
    </div>
  );
}
function VDivider() { return <div style={{ width: 1, height: 36, background: "#F0F0F3", alignSelf: "center" }} />; }
function MiniKV({ k, v }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>{k}</div>
      <div style={{ marginTop: 3, fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{v}</div>
    </div>
  );
}
function RowKV({ k, v }) {
  return (
    <div style={{ display: "flex", padding: "5px 0" }}>
      <span style={{ width: 120, flexShrink: 0, fontSize: 12.5, color: "#8A8A96", fontWeight: 600 }}>{k}</span>
      <span style={{ flex: 1, fontSize: 12.5, color: "#17181C", fontWeight: 700 }}>{v}</span>
    </div>
  );
}
