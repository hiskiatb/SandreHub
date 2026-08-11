"use client";
/**
 * /martahub/m/activities/new - Wizard Buat Plan (web mobile), 4 langkah:
 * Info → Target → Lokasi → Review. Mengikuti struktur & field yang SAMA
 * dengan create_plan_screen.dart (Flutter), diverifikasi terhadap skema
 * live mh_activities/mh_sites/mh_branches lewat MCP Supabase sebelum
 * ditulis (lihat _shared/planData.js utk resolusi branch_id & field enum).
 *
 * Mendukung MODE EDIT lewat `?edit=<id>` (draft/revision_needed yang sudah
 * ada, sama seperti `/activities/new?edit=...` di Flutter) - prefill semua
 * field + site tambahan, lalu UPDATE (bukan INSERT baris baru).
 *
 * Plan Date mendukung 3 mode (tunggal/rentang/multi), SAMA PERSIS dgn
 * `_planDateFields()` Flutter - lihat _shared/planData.js.
 *
 * Lokasi peta: GPS browser ("Lokasi Saya") ATAU picker peta interaktif
 * ("Pilih di Peta" → MapPickerSheet, Leaflet+OSM, padanan
 * location_picker_screen.dart Flutter).
 */
import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X, Plus, Loader2, Crosshair, Map as MapIcon, Users, CalendarDays } from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { fmtInt } from "../../_shared/activityUi";
import MapPickerSheet from "../../_shared/MapPickerSheet";
import CalendarPickerSheet from "../../_shared/CalendarPickerSheet";
import {
  resolveBranchUuid, fetchScopeSites, mcListFromSites, fetchPoiTypes, fetchActivityForEdit,
  CATEGORIES, NETWORK_OPTIONS, AREA_OPTIONS, snake, syncActivitySites, planDateFields,
  groupContiguousDates, syncTimesByDate, allDateTimesValid, planTimeFields, timesByDateFromActivity,
  APPROVER_ROLES, fetchAssignableTargets, resolveProfileIdByEmail,
} from "../../_shared/planData";

const STEPS = ["Info", "Target", "Lokasi", "Review"];

const unsnake = (s) => (s || "").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function CreatePlanWizardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  // Tanggal awal dari Kalender (?date=yyyy-mm-dd) - hanya dipakai saat BUAT
  // baru (bukan mode edit, yang prefill-nya datang dari activity tersimpan).
  const prefillDate = !editId ? searchParams.get("date") : null;
  const { loading, email, userId, scope } = useMartaSession();

  const [step, setStep] = useState(0);
  const [sites, setSites] = useState([]);
  const [poiTypes, setPoiTypes] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [invalid, setInvalid] = useState(new Set());

  // ── Mode edit ──
  const [editData, setEditData] = useState(null); // {activity, extraSiteIds} mentah dari DB
  const [editLoading, setEditLoading] = useState(!!editId);
  const [prefilled, setPrefilled] = useState(false);

  // ── "Buat Untuk" (acting-for) - hanya utk approver, mode buat baru ──
  // Sekarang MULTI-SELECT (satu BME/RGE bisa punya lebih dari satu baris
  // assignment kalau dia pegang beberapa branch - dulu cuma bisa pilih satu
  // baris/branch sekaligus, sekarang bisa dicentang semuanya sekaligus).
  const isApprover = !editId && APPROVER_ROLES.includes(scope?.role);
  const [actingForList, setActingForList] = useState([]); // rows dari fetchAssignableTargets
  const actingFor = actingForList[0] || null; // representatif (utk resolve owner/branch utama)
  const [actingForOptions, setActingForOptions] = useState([]);
  const [actingForLoading, setActingForLoading] = useState(false);
  const [actingForSheet, setActingForSheet] = useState(false);
  const actingForKey = actingForList.map((a) => a.id).join(",");

  // Scope efektif utk site/branch - punya sendiri (BME/RGE) atau scope orang
  // yg diwakilkan (approver via "Buat Untuk"). Kalau beberapa branch
  // dipilih sekaligus, `branchIds` dipakai utk gabungkan daftar site dari
  // SEMUA branch terpilih, `branchName` (primer, tunggal) tetap dipakai
  // utk resolve UUID branch saat simpan, `branchNameDisplay` (gabungan,
  // dipisah koma) utk ditampilkan ke pengguna.
  const effectiveBranchIds = isApprover && actingForList.length
    ? Array.from(new Set(actingForList.map((a) => a.branch_id).filter(Boolean)))
    : (scope?.branchId ? [scope.branchId] : []);
  const effectiveScope = isApprover && actingFor
    ? {
        branchId: actingFor.branch_id, branchIds: effectiveBranchIds, brand: actingFor.brand,
        branchName: actingFor.branch_name,
        branchNameDisplay: Array.from(new Set(actingForList.map((a) => a.branch_name).filter(Boolean))).join(", "),
      }
    : {
        branchId: scope?.branchId, branchIds: effectiveBranchIds, brand: scope?.brand,
        branchName: scope?.branchName, branchNameDisplay: scope?.branchName,
      };

  // ── Step 1: Info ──
  const [categories, setCategories] = useState([]);
  const [eventName, setEventName] = useState("");
  const [dates, setDates] = useState(prefillDate ? [prefillDate] : [""]); // tanggal terpilih, apa adanya - rentang/berpencar dideteksi otomatis
  // Waktu WAJIB per tanggal (bukan satu waktu global) - key "yyyy-mm-dd" →
  // {isAllDay,startTime,endTime}. Disinkron otomatis tiap `dates` berubah,
  // supaya tiap tanggal SELALU punya entri (default Seharian) - dipakai TMV
  // utk mengurutkan activity kalau ada beberapa di tanggal yang sama.
  const [timesByDate, setTimesByDate] = useState(() => syncTimesByDate((prefillDate ? [prefillDate] : []).filter(Boolean), {}));
  const [multiInput, setMultiInput] = useState("");
  const [mc, setMc] = useState("");

  // ── Step 2: Target ──
  const [targetSp, setTargetSp] = useState("25");
  const [targetFwa, setTargetFwa] = useState("2");
  const [targetRebuyPulsa, setTargetRebuyPulsa] = useState("0");
  const [targetRebuyData, setTargetRebuyData] = useState("0");
  const [costEstimate, setCostEstimate] = useState("500000");

  // ── Step 3: Lokasi ──
  const [primarySite, setPrimarySite] = useState(null);
  const [extraSites, setExtraSites] = useState([]);
  const [poiType, setPoiType] = useState("");
  const [network, setNetwork] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [manualLat, setManualLat] = useState(null);
  const [manualLng, setManualLng] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (loading || !scope?.found) return;
    let alive = true;
    (async () => {
      setDataLoading(true);
      try {
        // Kalau beberapa branch dipilih sekaligus (multi "Buat Untuk"),
        // ambil site dari SEMUA branch itu lalu gabung (dedup by site_id) -
        // supaya step Lokasi bisa pilih site dari branch manapun yg dipilih.
        const [siteLists, poi] = await Promise.all([
          Promise.all(effectiveScope.branchIds.map((id) => fetchScopeSites(id, effectiveScope.brand))),
          fetchPoiTypes(),
        ]);
        if (!alive) return;
        const merged = []; const seen = new Set();
        for (const list of siteLists) for (const s of list) { if (!seen.has(s.site_id)) { seen.add(s.site_id); merged.push(s); } }
        setSites(merged);
        setPoiTypes(poi);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat data referensi");
      } finally {
        if (alive) setDataLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, scope, effectiveScope.branchIds.join(","), effectiveScope.brand]);

  // Muat daftar orang yang bisa diwakilkan ("Buat Untuk") - hanya utk
  // approver, sekali saat scope siap.
  useEffect(() => {
    if (loading || !isApprover) return;
    let alive = true;
    (async () => {
      setActingForLoading(true);
      try {
        const list = await fetchAssignableTargets(scope);
        if (alive) setActingForOptions(list);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat daftar delegasi");
      } finally {
        if (alive) setActingForLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loading, isApprover, scope]);

  // Ganti target "Buat Untuk" → site/MC yg sebelumnya dipilih sudah tidak
  // relevan (beda branch), reset - sama seperti ganti MC manual.
  useEffect(() => {
    if (!isApprover) return;
    setMc(""); setPrimarySite(null); setExtraSites([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actingForKey]);

  // Muat data edit (kalau ?edit=<id>) - PARALEL dgn sites/poi di atas.
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    (async () => {
      try {
        const d = await fetchActivityForEdit(editId);
        if (alive) setEditData(d);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat plan untuk diedit");
      } finally {
        if (alive) setEditLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [editId]);

  const mcList = useMemo(() => mcListFromSites(sites), [sites]);
  const sitesInMc = useMemo(() => sites.filter((s) => s.mc === mc), [sites, mc]);

  // Reset pilihan site saat MC diganti MANUAL oleh user - TIDAK dipicu saat
  // prefill mode edit mengisi `mc` (guard `prefilled`/`editId` di bawah),
  // supaya site utama/tambahan hasil prefill tidak langsung terhapus lagi.
  useEffect(() => {
    if (editId && !prefilled) return;
    setPrimarySite(null); setExtraSites([]);
  }, [mc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill semua field mode edit - sekali saja, begitu activity + daftar
  // site (utk mencocokkan site_id → objek site lengkap) sudah sama-sama siap.
  useEffect(() => {
    if (!editId || prefilled || !editData || sites.length === 0) return;
    const a = editData.activity;
    setCategories((a.event_categories || []).map(unsnake));
    setEventName(a.event_name || "");
    let editDates;
    if (a.plan_dates_multi) { editDates = a.plan_dates_multi.split(","); }
    else if (a.plan_date_start && a.plan_date_end && a.plan_date_start !== a.plan_date_end) {
      // Rentang tersimpan (start/end) → kembangkan jadi tiap tanggal supaya
      // kalender bisa menampilkannya sebagai tanggal-tanggal terpilih.
      const keys = [];
      let d = new Date(a.plan_date_start + "T00:00:00");
      const end = new Date(a.plan_date_end + "T00:00:00");
      while (d <= end) { keys.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
      editDates = keys;
    }
    else { editDates = [a.plan_date || ""]; }
    setDates(editDates);
    // Waktu per tanggal: baca `plan_date_times` (record baru) kalau ada,
    // fallback ke is_all_day/start_time/end_time lama diterapkan ke semua
    // tanggal (record lama, dibuat sebelum fitur per-tanggal ada).
    setTimesByDate(timesByDateFromActivity(a, editDates.filter(Boolean)));
    setMc(a.mc || "");
    setTargetSp(String(a.target_sp ?? 25));
    setTargetFwa(String(a.target_fwa ?? 2));
    setTargetRebuyPulsa(String(a.target_rebuy_pulsa ?? 0));
    setTargetRebuyData(String(a.target_rebuy_data ?? 0));
    setCostEstimate(String(a.cost_estimate ?? 500000));
    const allSiteIds = [a.site_id, ...editData.extraSiteIds].filter(Boolean);
    const matched = allSiteIds.map((id) => sites.find((s) => s.site_id === id)).filter(Boolean);
    if (matched[0]) setPrimarySite(matched[0]);
    setExtraSites(matched.slice(1));
    setPoiType(unsnake(a.poi_type));
    setNetwork(unsnake(a.network_category));
    setArea(unsnake(a.area_potential));
    setAddress(a.address || "");
    setManualLat(a.latitude != null ? Number(a.latitude) : null);
    setManualLng(a.longitude != null ? Number(a.longitude) : null);
    setPrefilled(true);
  }, [editId, editData, sites, prefilled]);

  if (loading || dataLoading || editLoading) return <MobileShell active="activities"><ShellSpinner /></MobileShell>;

  if (!scope?.found) {
    return (
      <MobileShell active="activities">
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#3A3A44" }}>Belum bisa membuat plan</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96" }}>Email Anda belum terdaftar sebagai BME/RGE di MartaHub.</div>
        </div>
      </MobileShell>
    );
  }

  const toggleCategory = (c) => setCategories((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setErr("Browser ini tidak mendukung geolocation."); return; }
    setLocating(true); setErr("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setManualLat(pos.coords.latitude); setManualLng(pos.coords.longitude); setLocating(false); },
      () => { setErr("Gagal mengambil lokasi. Pastikan izin lokasi diaktifkan."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const validDates = dates.filter(Boolean);

  function validateStep(i) {
    const bad = new Set();
    if (i === 0) {
      if (isApprover && actingForList.length === 0) bad.add("actingFor");
      if (categories.length === 0) bad.add("categories");
      if (!eventName.trim()) bad.add("eventName");
      if (validDates.length === 0) bad.add("planDate");
      // Waktu WAJIB valid utk SETIAP tanggal terpilih (bukan satu waktu
      // global) - dipakai TMV utk urutkan activity di tanggal yang sama.
      if (validDates.length > 0 && !allDateTimesValid(validDates, timesByDate)) bad.add("timeRange");
      if (!mc) bad.add("mc");
    }
    if (i === 2) {
      if (!primarySite) bad.add("site");
      if (!poiType) bad.add("poiType");
    }
    setInvalid(bad);
    return bad.size === 0;
  }

  const goNext = () => { if (validateStep(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  const goBack = () => step === 0 ? router.back() : setStep((s) => s - 1);

  async function save(finalStatus) {
    // Validasi penuh hanya utk submit - draft boleh field lokasi kosong
    // (default ke pilihan pertama), sama seperti perilaku app Flutter.
    if (finalStatus === "plan_submitted") {
      const okInfo = validateStep(0);
      const okLoc = validateStep(2);
      if (!okInfo || !okLoc) {
        setErr("Lengkapi field yang wajib diisi sebelum mengajukan plan.");
        setStep(!okInfo ? 0 : 2);
        return;
      }
    } else if (!validateStep(0)) {
      setStep(0);
      return;
    }

    setSaving(true); setErr("");
    try {
      const categoryCodes = categories.map(snake);
      const siteIds = [primarySite?.site_id, ...extraSites.map((s) => s.site_id)].filter(Boolean);
      const effectivePoi = poiType || poiTypes[0] || "Market";
      const effectiveNetwork = network || NETWORK_OPTIONS[0];
      const effectiveArea = area || AREA_OPTIONS[0];
      const effectiveDates = validDates.length ? validDates : [new Date().toISOString().slice(0, 10)];
      const dateFields = planDateFields(effectiveDates);
      const timeFields = planTimeFields(effectiveDates, timesByDate);

      const commonFields = {
        event_category: categoryCodes.join(","),
        event_categories: categoryCodes,
        event_name: eventName.trim(),
        site_id: siteIds[0] || null,
        mc: mc || null,
        latitude: manualLat,
        longitude: manualLng,
        address: address.trim() || null,
        ...dateFields,
        ...timeFields,
        poi_type: snake(effectivePoi),
        network_category: snake(effectiveNetwork),
        area_potential: snake(effectiveArea),
        target_sp: Number(targetSp) || 0,
        target_fwa: Number(targetFwa) || 0,
        target_rebuy_pulsa: Number(targetRebuyPulsa) || 0,
        target_rebuy_data: Number(targetRebuyData) || 0,
        cost_estimate: Number(costEstimate) || 0,
      };

      let activityId = editId;
      if (editId) {
        // Update - brand/branch/pemilik TIDAK diubah (sama spt updatePlan()
        // Flutter). "Simpan Draft" TIDAK menyentuh status (biarkan apa
        // adanya, draft/revision_needed); "Ajukan Plan" set plan_submitted.
        const payload = { ...commonFields, updated_at: new Date().toISOString() };
        if (finalStatus === "plan_submitted") payload.status = "plan_submitted";
        const { error } = await supabaseMarta.from("mh_activities").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        // "Buat Untuk": kedua kolom bme_user_id & created_by diisi id TARGET,
        // bukan id approver yang membuatkannya - SAMA PERSIS dgn
        // `_effectiveOwnerId()`/createPlan() Flutter (tidak ada kolom
        // "true creator" terpisah).
        const ownerId = isApprover && actingFor ? await resolveProfileIdByEmail(actingFor.email) : userId;
        if (isApprover && actingFor && !ownerId) throw new Error("Profil target tidak ditemukan. Coba pilih ulang.");
        const resolvedBranchId = await resolveBranchUuid(effectiveScope.branchId, effectiveScope.branchName);
        if (!resolvedBranchId) throw new Error(`Cabang "${effectiveScope.branchName || effectiveScope.branchId}" tidak ditemukan di master data cabang.`);
        const { data: inserted, error } = await supabaseMarta.from("mh_activities").insert({
          bme_user_id: ownerId,
          created_by: ownerId,
          branch_id: resolvedBranchId,
          brand: (effectiveScope.brand || "").toUpperCase(),
          status: finalStatus,
          ...commonFields,
        }).select("id").single();
        if (error) throw error;
        activityId = inserted.id;
      }

      if (siteIds.length > 0) await syncActivitySites(activityId, siteIds);

      router.replace(`/martahub/m/activities?open=${activityId}`);
    } catch (e) {
      setErr(e.message || "Gagal menyimpan plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileShell active="activities">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 16px) 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={goBack} style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>{editId ? "Edit Plan" : "Buat Plan Baru"}</div>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#B0B0BA", letterSpacing: 0.3, flexShrink: 0 }}>
            LANGKAH {step + 1}/{STEPS.length}
          </div>
        </div>

        <WizardStepper steps={STEPS} current={step} onStepClick={(i) => setStep(i)} />
      </div>

      {err && (
        <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>
      )}

      <div style={{ padding: "18px 20px 24px" }}>
        {step === 0 && (
          <StepInfo {...{
            categories, toggleCategory, eventName, setEventName, dates, setDates,
            timesByDate, setTimesByDate,
            mc, setMc, mcList, invalid,
            branchName: effectiveScope.branchNameDisplay,
            isApprover, actingFor, actingForList, actingForOptions, actingForLoading, onPickActingFor: () => setActingForSheet(true),
          }} />
        )}
        {step === 1 && (
          <StepTarget {...{ targetSp, setTargetSp, targetFwa, setTargetFwa, targetRebuyPulsa, setTargetRebuyPulsa, targetRebuyData, setTargetRebuyData, costEstimate, setCostEstimate }} />
        )}
        {step === 2 && (
          <StepLocation {...{
            mc, sitesInMc, primarySite, setPrimarySite, extraSites, setExtraSites,
            poiType, setPoiType, poiTypes, network, setNetwork, area, setArea,
            address, setAddress, manualLat, manualLng, setManualLat, setManualLng, locating, useMyLocation, invalid,
          }} />
        )}
        {step === 3 && (
          <StepReview {...{
            categories, eventName, dates: validDates, timesByDate, mc, targetSp, targetFwa, targetRebuyPulsa, targetRebuyData, costEstimate,
            primarySite, extraSites, poiType, network, area, address, manualLat, manualLng,
          }} />
        )}
      </div>

      {/* Bottom action bar */}
      <div style={{ position: "sticky", bottom: 66, background: "linear-gradient(180deg,rgba(244,245,247,0) 0%,#F4F5F7 30%)", padding: "16px 20px 0" }}>
        <div style={{ display: "flex", gap: 10 }}>
          {step === 3 ? (
            <>
              <button onClick={() => save("draft")} disabled={saving}
                style={{ flex: 1, height: 50, borderRadius: 12, border: "1.5px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: saving ? "default" : "pointer" }}>
                Simpan Draft
              </button>
              <button onClick={() => save("plan_submitted")} disabled={saving}
                style={{ flex: 1.3, height: 50, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(17,17,20,0.1)" }}>
                {saving ? <Loader2 size={16} style={{ animation: "mspin .85s linear infinite" }} /> : <><Check size={16} /> Ajukan Plan</>}
              </button>
            </>
          ) : (
            <button onClick={goNext}
              style={{ flex: 1, height: 50, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(17,17,20,0.1)" }}>
              Lanjut <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {actingForSheet && (
        <ActingForSheet
          options={actingForOptions}
          loading={actingForLoading}
          initialSelected={actingForList}
          onClose={() => setActingForSheet(false)}
          onConfirm={(list) => { setActingForList(list); setActingForSheet(false); }}
        />
      )}
    </MobileShell>
  );
}

// ═════════════════════════════════ Step 1 ═════════════════════════════════
function StepInfo({ categories, toggleCategory, eventName, setEventName, dates, setDates, timesByDate, setTimesByDate, mc, setMc, mcList, invalid, branchName, isApprover, actingFor, actingForList, actingForOptions, actingForLoading, onPickActingFor }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const validDates = dates.filter(Boolean);
  // Tidak ada mode manual - ringkasan dihitung otomatis dari keterdekatan
  // tanggal (SAMA dgn logika penyimpanan di planDateFields).
  const dateGroups = groupContiguousDates(validDates);
  const dateSummary =
    validDates.length === 0 ? null
    : dateGroups.length === 1
      ? (dateGroups[0].length === 1 ? dateGroups[0][0] : `${dateGroups[0][0]} s/d ${dateGroups[0][dateGroups[0].length - 1]}`)
      : `${dateGroups.length} rentang · ${validDates.length} tanggal`;
  // Ringkasan waktu: kalau semua tanggal Seharian → "Seharian"; kalau semua
  // sama persis (1 tanggal, atau semua tanggal punya jam identik) → tampilkan
  // jam itu; kalau beda-beda per tanggal → tampilkan jumlah yg sudah diatur.
  const timeSummary = (() => {
    if (validDates.length === 0) return null;
    const entries = validDates.map((d) => timesByDate?.[d]).filter(Boolean);
    if (entries.length < validDates.length) return `${entries.length}/${validDates.length} tanggal diatur`;
    if (entries.every((t) => t.isAllDay)) return "Seharian - semua tanggal";
    const first = entries[0];
    const allSame = entries.every((t) => t.isAllDay === first.isAllDay && t.startTime === first.startTime && t.endTime === first.endTime);
    if (allSame) return first.isAllDay ? "Seharian" : `${first.startTime}–${first.endTime} - semua tanggal`;
    return `Waktu berbeda per tanggal · ${validDates.length} tanggal`;
  })();

  return (
    <Card>
      {isApprover && (
        <>
          <FieldLabel text="Buat Untuk" required hint={actingForLoading ? "Memuat…" : `${actingForOptions.length} orang tersedia`} />
          <button onClick={onPickActingFor}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 13px", borderRadius: 12, background: "#F6F7F9", border: `1.5px solid ${invalid.has("actingFor") ? "#DC2626" : "#ECEDF0"}`, cursor: "pointer", fontFamily: FF }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: actingFor ? "rgba(237,28,36,0.10)" : "#E9EAEE", color: actingFor ? "#ED1C24" : "#9A9AA6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Users size={14} />
            </div>
            <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
              {actingFor ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{actingFor.full_name || actingFor.email}</div>
                  {/* Lebih dari satu branch dipilih (BME/RGE yg sama, beberapa
                      branch sekaligus) - digabung koma di sini. */}
                  <div style={{ fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>
                    {(actingFor.role || "").toUpperCase()} · {actingForList.map((a) => a.branch_name).filter(Boolean).join(", ") || "-"}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: "#8A8A96", fontWeight: 600 }}>Pilih BME/RGE yang diwakilkan (bisa lebih dari satu branch)</div>
              )}
            </div>
          </button>
          {invalid.has("actingFor") && <FieldError text="Pilih orang yang diwakilkan terlebih dulu" />}
        </>
      )}

      <FieldLabel text="Activity Category" required hint="Bisa lebih dari satu" top={isApprover} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {CATEGORIES.map((c) => {
          const active = categories.includes(c);
          return (
            <Chip key={c} active={active} onClick={() => toggleCategory(c)} label={c} />
          );
        })}
      </div>
      {invalid.has("categories") && <FieldError text="Pilih minimal satu kategori" />}

      <FieldLabel text="Event Name" required top />
      <TextInput value={eventName} onChange={setEventName} placeholder="Contoh: Open Booth FWA" error={invalid.has("eventName")} />
      {invalid.has("eventName") && <FieldError text="Nama event wajib diisi" />}

      <FieldLabel text="Plan Date & Waktu" required top hint="Ketuk utk atur - wajib per tanggal" />

      {/* Kalender bulanan - padanan activity_calendar_sheet.dart (Flutter):
          titik status di tanggal yg SUDAH punya plan, supaya BME/RGE bisa
          lihat aktivitas yg sudah di-planning sebelum menambah tanggal baru.
          Tidak ada lagi mode Tunggal/Rentang/Beberapa - tinggal tap tanggal,
          rentang/berpencar terbentuk otomatis dari keterdekatan tanggal.
          Begitu >1 tanggal dipilih, waktu WAJIB diatur PER TANGGAL (list ke
          bawah di dalam sheet yg sama) - dipakai TMV utk urutkan activity
          kalau ada beberapa di tanggal yang sama. */}
      <button onClick={() => setCalendarOpen(true)}
        style={{ width: "100%", marginTop: 10, display: "flex", alignItems: "center", gap: 10, padding: "12px 13px", borderRadius: 12, background: "#F6F7F9", border: `1.5px solid ${invalid.has("planDate") || invalid.has("timeRange") ? "#DC2626" : "#ECEDF0"}`, cursor: "pointer", fontFamily: FF }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: dateSummary ? "rgba(237,28,36,0.10)" : "#E9EAEE", color: dateSummary ? "#ED1C24" : "#9A9AA6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CalendarDays size={16} />
        </div>
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          {dateSummary ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C" }}>{dateSummary}</div>
              <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{timeSummary}</div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: "#8A8A96", fontWeight: 600 }}>Pilih tanggal & waktu dari kalender</div>
          )}
        </div>
        <ArrowRight size={15} color="#B0B0BA" />
      </button>
      {dateGroups.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {dateGroups.map((g) => (
            <span key={g[0]} style={{ fontSize: 10.5, fontWeight: 700, color: "#5A5A68", background: "#F0F0F3", borderRadius: 999, padding: "4px 9px" }}>
              {g.length === 1 ? g[0] : `${g[0]} s/d ${g[g.length - 1]}`}
            </span>
          ))}
        </div>
      )}
      {invalid.has("planDate") && <FieldError text="Tanggal wajib diisi" />}
      {invalid.has("timeRange") && <FieldError text="Waktu setiap tanggal wajib diatur & valid (jam mulai < jam selesai)" />}

      {calendarOpen && (
        <CalendarPickerSheet
          initialDates={validDates}
          initialTimesByDate={timesByDate}
          onClose={() => setCalendarOpen(false)}
          onConfirm={(picked, times) => {
            setDates(picked);
            setTimesByDate(times);
            setCalendarOpen(false);
          }}
        />
      )}

      <FieldLabel text="Branch" required top />
      <LockedField text={branchName || "-"} muted />

      <FieldLabel text="Micro Cluster" required top />
      <SelectPills options={mcList} value={mc} onChange={setMc} error={invalid.has("mc")} placeholder={mcList.length === 0 ? "Tidak ada MC di scope Anda" : "Pilih micro cluster"} />
      {invalid.has("mc") && <FieldError text="Micro cluster wajib dipilih" />}
    </Card>
  );
}

// ═════════════════════════════════ Step 2 ═════════════════════════════════
function StepTarget({ targetSp, setTargetSp, targetFwa, setTargetFwa, targetRebuyPulsa, setTargetRebuyPulsa, targetRebuyData, setTargetRebuyData, costEstimate, setCostEstimate }) {
  return (
    <Card>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel text="Target SP" />
          <NumberInput value={targetSp} onChange={setTargetSp} />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel text="Target FWA" />
          <NumberInput value={targetFwa} onChange={setTargetFwa} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel text="Rebuy Pulsa" />
          <NumberInput value={targetRebuyPulsa} onChange={setTargetRebuyPulsa} prefix="Rp" />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel text="Rebuy Data" />
          <NumberInput value={targetRebuyData} onChange={setTargetRebuyData} prefix="Rp" />
        </div>
      </div>
      <FieldLabel text="Budget Cost" top />
      <NumberInput value={costEstimate} onChange={setCostEstimate} prefix="Rp" />
    </Card>
  );
}

// ═════════════════════════════════ Step 3 ═════════════════════════════════
function StepLocation({ mc, sitesInMc, primarySite, setPrimarySite, extraSites, setExtraSites, poiType, setPoiType, poiTypes, network, setNetwork, area, setArea, address, setAddress, manualLat, manualLng, setManualLat, setManualLng, locating, useMyLocation, invalid }) {
  const [picking, setPicking] = useState(null); // 'primary' | 'extra' | null
  const [mapPicking, setMapPicking] = useState(false);
  const taken = new Set([primarySite?.site_id, ...extraSites.map((s) => s.site_id)].filter(Boolean));
  const available = sitesInMc.filter((s) => !taken.has(s.site_id));

  return (
    <>
      <Card>
        <FieldLabel text="Site" required hint={`${(primarySite ? 1 : 0) + extraSites.length} dipilih`} />
        {!mc ? (
          <LockedField text="Pilih micro cluster dulu di step 1" muted />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {primarySite ? (
              <SiteRow badge="Utama" badgeColor="#EC008C" label={`${primarySite.site_id}${primarySite.site_name ? ` · ${primarySite.site_name}` : ""}`}
                onTap={() => setPicking("primary")} onRemove={extraSites.length ? () => { setPrimarySite(extraSites[0]); setExtraSites(extraSites.slice(1)); } : null} />
            ) : (
              <AddSiteRow label={sitesInMc.length ? "Pilih site utama" : "Tidak ada site di MC ini"} enabled={sitesInMc.length > 0} error={invalid.has("site")} onClick={() => setPicking("primary")} />
            )}
            {extraSites.map((s, i) => (
              <SiteRow key={s.site_id} badge={`Site ${i + 2}`} badgeColor="#8A8A96" label={`${s.site_id}${s.site_name ? ` · ${s.site_name}` : ""}`}
                onRemove={() => setExtraSites(extraSites.filter((x) => x.site_id !== s.site_id))} />
            ))}
            {primarySite && (
              <AddSiteRow label="Tambah site lain" compact enabled={available.length > 0} onClick={() => setPicking("extra")} />
            )}
          </div>
        )}
        {invalid.has("site") && <FieldError text="Site wajib dipilih" />}

        <FieldLabel text="POI Type" required top />
        <SelectPills options={poiTypes} value={poiType} onChange={setPoiType} error={invalid.has("poiType")} />

        <FieldLabel text="Network Category" top />
        <SegmentedControl options={NETWORK_OPTIONS} value={network} onChange={setNetwork} />

        <FieldLabel text="Area Potential" top />
        <SegmentedControl options={AREA_OPTIONS} value={area} onChange={setArea} />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <FieldLabel text="Lokasi Acara" hint="Opsional - titik GPS event" />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={useMyLocation} disabled={locating}
            style={{ flex: 1, height: 46, borderRadius: 12, border: `1.5px solid ${manualLat ? "#15803D" : "#ECEDF0"}`, background: manualLat ? "rgba(21,128,61,0.06)" : "#F6F7F9", color: manualLat ? "#15803D" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {locating ? <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} /> : <Crosshair size={15} />}
            {locating ? "Mencari…" : "Lokasi Saya"}
          </button>
          <button onClick={() => setMapPicking(true)}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "1.5px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <MapIcon size={15} /> Pilih di Peta
          </button>
        </div>
        {manualLat != null && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#8A8A96", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            Titik ditandai · {manualLat.toFixed(5)}, {manualLng.toFixed(5)}
          </div>
        )}
        <FieldLabel text="Alamat" top hint="Bisa diedit manual" />
        <TextInput value={address} onChange={setAddress} placeholder="Alamat lengkap lokasi kegiatan" multiline />
      </Card>

      {picking && (
        <SitePickerSheet
          items={picking === "primary" ? sitesInMc : available}
          onClose={() => setPicking(null)}
          onSelect={(s) => {
            if (picking === "primary") setPrimarySite(s); else setExtraSites([...extraSites, s]);
            setPicking(null);
          }}
        />
      )}

      {mapPicking && (
        <MapPickerSheet
          initialLat={manualLat}
          initialLng={manualLng}
          onClose={() => setMapPicking(false)}
          onConfirm={({ lat, lng, address: addr }) => {
            setManualLat(lat); setManualLng(lng);
            if (addr && !address.trim()) setAddress(addr);
            setMapPicking(false);
          }}
        />
      )}
    </>
  );
}

// ═════════════════════════════════ Step 4 ═════════════════════════════════
function StepReview(p) {
  const dateGroups = groupContiguousDates(p.dates);
  const planDateSummary = p.dates.length === 0 ? "-"
    : dateGroups.map((g) => (g.length === 1 ? g[0] : `${g[0]} s/d ${g[g.length - 1]}`)).join(", ");
  return (
    <Card>
      <ReviewRow k="Kategori" v={p.categories.join(", ") || "-"} />
      <ReviewRow k="Event Name" v={p.eventName || "-"} />
      <ReviewRow k="Plan Date" v={planDateSummary} />
      {p.dates.length <= 1 ? (
        <ReviewRow k="Waktu" v={(() => { const t = p.timesByDate?.[p.dates[0]]; return !t || t.isAllDay ? "Seharian" : `${t.startTime} – ${t.endTime}`; })()} />
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#8A8A96", marginBottom: 6 }}>Waktu per Tanggal</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {p.dates.map((d) => {
              const t = p.timesByDate?.[d];
              return (
                <div key={d} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
                  <span style={{ color: "#5A5A68" }}>{d}</span>
                  <span style={{ color: "#17181C", fontWeight: 800 }}>{!t || t.isAllDay ? "Seharian" : `${t.startTime} – ${t.endTime}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ReviewRow k="Micro Cluster" v={p.mc || "-"} />
      <Divider />
      <ReviewRow k="Target SP/FWA" v={`${fmtInt(p.targetSp)}/${fmtInt(p.targetFwa)}`} />
      <ReviewRow k="Rebuy Pulsa" v={`Rp ${fmtInt(p.targetRebuyPulsa)}`} />
      <ReviewRow k="Rebuy Data" v={`Rp ${fmtInt(p.targetRebuyData)}`} />
      <ReviewRow k="Budget Cost" v={`Rp ${fmtInt(p.costEstimate)}`} />
      <Divider />
      <ReviewRow k="Site Utama" v={p.primarySite ? p.primarySite.site_id : "-"} />
      {p.extraSites.length > 0 && <ReviewRow k="Site Tambahan" v={p.extraSites.map((s) => s.site_id).join(", ")} />}
      <ReviewRow k="POI Type" v={p.poiType || "-"} />
      <ReviewRow k="Network" v={p.network || "-"} />
      <ReviewRow k="Area Potential" v={p.area || "-"} />
      <ReviewRow k="Alamat" v={p.address || "-"} />
      <ReviewRow k="Titik GPS" v={p.manualLat ? `${p.manualLat.toFixed(5)}, ${p.manualLng.toFixed(5)}` : "-"} />
    </Card>
  );
}

// ═══════════════════════════════ Primitives ════════════════════════════════
const inputBase = { width: "100%", height: 48, padding: "0 14px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 14, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };

function Card({ children, style }) {
  return <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 18, padding: 16, ...style }}>{children}</div>;
}
function Divider() { return <div style={{ height: 1, background: "#F0F0F3", margin: "12px 0" }} />; }

/** Stepper wizard - pengganti progress bar polos lama. Bulatan bernomor +
 * garis penghubung yang terisi mengikuti kemajuan, tanda centang utk langkah
 * yang sudah dilewati, dan langkah yang sudah dilewati BISA diketuk utk
 * kembali langsung (skip-forward tetap tidak boleh - harus lewat tombol
 * Lanjut supaya validasi tiap langkah tetap jalan). Setiap kolom "mandiri"
 * (garis-kiri + bulatan + garis-kanan + label ada dalam satu flex:1 yang
 * sama) supaya label selalu presisi di tengah bulatannya sendiri, tidak
 * meleset walau lebar kolom antar langkah berbeda-beda.  */
function WizardStepper({ steps, current, onStepClick }) {
  return (
    <div style={{ marginTop: 16, display: "flex" }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = done;
        const leftFilled = i > 0 && i <= current;
        const rightFilled = i < steps.length - 1 && i < current;
        return (
          <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
              <StepLine visible={i > 0} filled={leftFilled} />
              <button
                onClick={() => clickable && onStepClick(i)}
                disabled={!clickable}
                aria-label={label}
                style={{
                  width: active ? 28 : 24, height: active ? 28 : 24, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 0, border: "none",
                  cursor: clickable ? "pointer" : "default",
                  background: done || active ? BRAND : "#FFFFFF",
                  boxShadow: active ? "0 0 0 4px rgba(237,28,36,0.14)" : done ? "none" : "inset 0 0 0 1.5px #E4E5EA",
                  transition: "width .22s cubic-bezier(.34,1.56,.64,1), height .22s cubic-bezier(.34,1.56,.64,1), background .2s, box-shadow .2s",
                }}>
                {done ? <Check size={12} color="#fff" strokeWidth={3.2} />
                      : <span style={{ fontSize: active ? 12.5 : 11, fontWeight: 800, color: active ? "#fff" : "#C4C4CE", fontFamily: FF }}>{i + 1}</span>}
              </button>
              <StepLine visible={i < steps.length - 1} filled={rightFilled} />
            </div>
            <span style={{
              marginTop: 7, fontSize: 10, fontWeight: active ? 800 : 700, letterSpacing: 0.1, whiteSpace: "nowrap",
              color: active ? "#17181C" : done ? "#6B6B76" : "#C4C4CE", transition: "color .2s",
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
function StepLine({ visible, filled }) {
  return (
    <div style={{ flex: 1, height: 2.5, margin: "0 3px", borderRadius: 2, background: "#E9EAEE", position: "relative", overflow: "hidden", visibility: visible ? "visible" : "hidden" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 2, background: BRAND, transform: `scaleX(${filled ? 1 : 0})`, transformOrigin: "left", transition: "transform .35s cubic-bezier(.4,0,.2,1)" }} />
    </div>
  );
}
function FieldLabel({ text, required, hint, top }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginTop: top ? 16 : 0, marginBottom: 7 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96" }}>{text}</span>
      {required && <span style={{ color: "#ED1C24", fontWeight: 800, marginLeft: 3 }}>*</span>}
      {hint && <span style={{ marginLeft: "auto", fontSize: 10.5, color: "#B0B0BA", fontWeight: 500 }}>{hint}</span>}
    </div>
  );
}
function FieldError({ text }) {
  return <div style={{ marginTop: 6, fontSize: 11.5, color: "#DC2626", fontWeight: 600 }}>{text}</div>;
}
function TextInput({ value, onChange, placeholder, error, multiline }) {
  const Comp = multiline ? "textarea" : "input";
  return (
    <Comp value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={multiline ? 3 : undefined}
      style={{ ...inputBase, height: multiline ? 84 : 48, paddingTop: multiline ? 12 : 0, resize: multiline ? "vertical" : undefined, border: `1.5px solid ${error ? "#DC2626" : "#ECEDF0"}` }} />
  );
}
function NumberInput({ value, onChange, prefix }) {
  const display = value === "" ? "" : Number(value).toLocaleString("id-ID");
  return (
    <div style={{ ...inputBase, display: "flex", alignItems: "center", padding: "0 14px" }}>
      {prefix && <span style={{ fontSize: 13, fontWeight: 700, color: "#8A8A96", marginRight: 6 }}>{prefix}</span>}
      <input value={display} inputMode="numeric"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 600, color: "#17181C", fontFamily: FF }} />
    </div>
  );
}
function Chip({ active, onClick, label }) {
  return (
    <button onClick={onClick}
      style={{ padding: "8px 13px", borderRadius: 999, border: `1.5px solid ${active ? "#ED1C24" : "#ECEDF0"}`, background: active ? "rgba(237,28,36,0.08)" : "#F6F7F9", color: active ? "#ED1C24" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
      {label}
    </button>
  );
}
function SelectPills({ options, value, onChange, error, placeholder }) {
  if (!options || options.length === 0) return <LockedField text={placeholder || "Tidak ada opsi"} muted />;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => <Chip key={o} active={value === o} onClick={() => onChange(o)} label={o} />)}
      {error && <FieldError text="Wajib dipilih" />}
    </div>
  );
}
function SegmentedControl({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", background: "#F6F7F9", borderRadius: 12, padding: 3 }}>
      {options.map((o) => {
        const active = value === o;
        return (
          <button key={o} onClick={() => onChange(o)}
            style={{ flex: 1, height: 38, borderRadius: 9, border: "none", background: active ? "#17181C" : "transparent", color: active ? "#fff" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
            {o}
          </button>
        );
      })}
    </div>
  );
}
function LockedField({ text, muted }) {
  return (
    <div style={{ ...inputBase, display: "flex", alignItems: "center", background: muted ? "#F6F7F9" : "rgba(237,28,36,0.06)", color: muted ? "#B0B0BA" : "#5A5A68", border: "none" }}>
      {text}
    </div>
  );
}
function SiteRow({ badge, badgeColor, label, onTap, onRemove }) {
  return (
    <div onClick={onTap} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 12, background: "#F6F7F9", cursor: onTap ? "pointer" : "default" }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 8, color: badgeColor, background: `${badgeColor}20` }}>{badge}</span>
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#B0B0BA", display: "flex" }}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
function AddSiteRow({ label, enabled, error, compact, onClick }) {
  return (
    <button onClick={enabled ? onClick : undefined} disabled={!enabled}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: compact ? "9px 12px" : "12px", borderRadius: 12, background: compact ? "transparent" : (enabled ? "#F6F7F9" : "#F0F0F3"), border: compact ? `1px dashed ${error ? "#DC2626" : "#D8D9E0"}` : "none", color: enabled ? "#ED1C24" : "#B0B0BA", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: enabled ? "pointer" : "default" }}>
      <Plus size={16} /> {label}
    </button>
  );
}
function ReviewRow({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0" }}>
      <span style={{ fontSize: 12.5, color: "#8A8A96", fontWeight: 600 }}>{k}</span>
      <span style={{ fontSize: 13, color: "#17181C", fontWeight: 700, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function SitePickerSheet({ items, onClose, onSelect }) {
  const [q, setQ] = useState("");
  const filtered = items.filter((s) => !q.trim() || s.site_id.toLowerCase().includes(q.toLowerCase()) || (s.site_name || "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "75vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "22px 22px 0 0", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px" }} />
        <div style={{ padding: "10px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Pilih Site</div>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari site…"
            style={{ ...inputBase, marginTop: 10, height: 42 }} />
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 20px" }}>
          {filtered.length === 0 && <div style={{ padding: "24px 0", textAlign: "center", color: "#8A8A96", fontSize: 12.5 }}>Tidak ada site cocok.</div>}
          {filtered.map((s) => (
            <button key={s.site_id} onClick={() => onSelect(s)}
              style={{ width: "100%", textAlign: "left", padding: "12px 10px", borderRadius: 10, border: "none", background: "none", borderBottom: "1px solid #F0F0F3", cursor: "pointer" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#17181C" }}>{s.site_id}</div>
              {s.site_name && <div style={{ fontSize: 11.5, color: "#8A8A96", marginTop: 2 }}>{s.site_name}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActingForSheet({ options, loading, initialSelected, onClose, onConfirm }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(() => new Set((initialSelected || []).map((o) => o.id)));
  const filtered = options.filter((o) => !q.trim() || (o.full_name || "").toLowerCase().includes(q.toLowerCase()) || (o.email || "").toLowerCase().includes(q.toLowerCase()));

  // Sekali satu baris dipilih, kunci ke email yang sama saja - beberapa
  // branch dari ORANG yang sama boleh dipilih sekaligus, tapi tidak boleh
  // mencampur dua orang berbeda dalam satu "Buat Untuk".
  const firstSelected = options.find((o) => selected.has(o.id));
  const lockedEmail = firstSelected?.email || null;

  const toggle = (o) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(o.id)) {
        next.delete(o.id);
      } else {
        if (lockedEmail && o.email !== lockedEmail) return prev; // beda orang, abaikan
        next.add(o.id);
      }
      return next;
    });
  };

  const confirm = () => {
    const list = options.filter((o) => selected.has(o.id));
    onConfirm(list);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "80vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "22px 22px 0 0", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px" }} />
        <div style={{ padding: "10px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Buat Untuk</div>
          <div style={{ fontSize: 11.5, color: "#8A8A96", marginTop: 2 }}>Bisa pilih lebih dari satu branch untuk orang yang sama.</div>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau email…"
            style={{ ...inputBase, marginTop: 10, height: 42 }} />
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 12px", flex: 1 }}>
          {loading && <div style={{ padding: "24px 0", textAlign: "center", color: "#8A8A96", fontSize: 12.5 }}>Memuat…</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: "24px 0", textAlign: "center", color: "#8A8A96", fontSize: 12.5 }}>Tidak ada orang yang cocok.</div>}
          {filtered.map((o) => {
            const isSel = selected.has(o.id);
            const disabled = !isSel && lockedEmail && o.email !== lockedEmail;
            return (
              <button key={o.id} onClick={() => !disabled && toggle(o)} disabled={disabled}
                style={{ width: "100%", textAlign: "left", padding: "12px 10px", borderRadius: 10, border: "none",
                  background: isSel ? "rgba(237,28,36,0.06)" : "none",
                  borderBottom: "1px solid #F0F0F3", cursor: disabled ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 10, opacity: disabled ? 0.4 : 1 }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: isSel ? BRAND : "#FFFFFF", border: isSel ? "none" : "1.5px solid #D8D9E0" }}>
                  {isSel && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#17181C" }}>{o.full_name || o.email}</div>
                  <div style={{ fontSize: 11.5, color: "#8A8A96", marginTop: 2 }}>{(o.role || "").toUpperCase()} · {o.branch_name || "-"}{o.brand ? ` · ${o.brand.toUpperCase()}` : ""}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #F0F0F3" }}>
          <button onClick={confirm} disabled={selected.size === 0}
            style={{ width: "100%", height: 46, borderRadius: 12, border: "none", fontFamily: FF, fontSize: 14, fontWeight: 800, color: "#FFFFFF",
              background: selected.size === 0 ? "#D8D9E0" : BRAND, cursor: selected.size === 0 ? "not-allowed" : "pointer" }}>
            Pilih {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreatePlanWizard() {
  return (
    <Suspense fallback={<MobileShell active="activities"><ShellSpinner /></MobileShell>}>
      <CreatePlanWizardInner />
    </Suspense>
  );
}
