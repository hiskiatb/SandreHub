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
import { ArrowLeft, ArrowRight, ChevronRight, Check, X, Plus, Loader2, Crosshair, Map as MapIcon, Users, CalendarDays, Building2, Tag, CardSim, Router as RouterIcon, AlertTriangle, Save, QrCode } from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import { slug } from "../../../../../lib/activityTarget";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { fmtInt } from "../../_shared/activityUi";
import { isValidMsisdn, normalizeMsisdn } from "../../_shared/msisdn";
import MapPickerSheet from "../../_shared/MapPickerSheet";
import CalendarPickerSheet from "../../_shared/CalendarPickerSheet";
import QrScanSheet from "../../_shared/QrScanSheet";
import OrgIdBar from "../../_shared/OrgIdBar";
import {
  resolveBranchUuid, fetchScopeSites, mcGroupsFromSites, fetchPoiTypes, fetchActivityForEdit,
  CATEGORIES, NETWORK_OPTIONS, AREA_OPTIONS, snake, syncActivitySites, planDateFields,
  groupContiguousDates, syncTimesByDate, allDateTimesValid, planTimeFields, timesByDateFromActivity,
  APPROVER_ROLES, fetchAssignableGroups, resolveProfileIdByEmail,
  fetchSalesEntries, deleteSalesEntry,
} from "../../_shared/planData";

const STEPS = ["Info", "Target", "Lokasi", "Review"];

const unsnake = (s) => (s || "").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// Key komposit "branchId::mc" - dipakai konsisten di mana pun MC terpilih
// perlu diketahui juga branch asalnya (mcSelected Set, filter sitesInMc,
// validasi per-branch) supaya nama MC yg kebetulan sama di dua branch
// berbeda tidak tertukar/dianggap satu.
const mcKey = (branchId, mc) => `${branchId}::${mc}`;

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

  // Branch×brand ASLI dari ACTIVITY yang diedit - BUKAN scope akun yang lagi
  // login. Sebelumnya effectiveScope mode edit (di bawah) salah pakai scope
  // login sendiri: kalau yang mengedit admin/approver (tidak punya branch
  // sendiri) atau BME/RGE yang scope-nya sudah beda dari saat plan ini
  // dibuat (mis. dipindah branch, atau assignment sempat direset), daftar
  // site jadi kosong total - lalu effect prefill field lain (nama, kategori,
  // tanggal, target, POI, dst.) IKUT GAGAL semua krn dulu menunggu daftar
  // site itu. Plan yang sudah lengkap jadi kelihatan kosong lagi, dan kalau
  // "Simpan Draft" ditekan dari keadaan kosong itu, data asli di DB tertimpa
  // kosong/default. Resolusi via mh_branches.id (primary key, selalu ada)
  // jauh lebih andal drpd bergantung scope login yang bisa tidak match.
  const [editBranchSlug, setEditBranchSlug] = useState(null);
  const [editBranchName, setEditBranchName] = useState(null);
  useEffect(() => {
    if (!editId || !editData?.activity?.branch_id) return;
    let alive = true;
    (async () => {
      const { data } = await supabaseMarta.from("mh_branches").select("name").eq("id", editData.activity.branch_id).maybeSingle();
      if (alive && data?.name) { setEditBranchName(data.name); setEditBranchSlug(slug(data.name)); }
    })();
    return () => { alive = false; };
  }, [editId, editData]);

  // ── "Buat Untuk" (acting-for) - hanya utk approver, mode buat baru ──
  // Sekarang MULTI-SELECT (satu BME/RGE bisa punya lebih dari satu baris
  // assignment kalau dia pegang beberapa branch - dulu cuma bisa pilih satu
  // baris/branch sekaligus, sekarang bisa dicentang semuanya sekaligus).
  const isApprover = !editId && APPROVER_ROLES.includes(scope?.role);
  const [actingForList, setActingForList] = useState([]); // rows dari fetchAssignableTargets
  const actingFor = actingForList[0] || null; // representatif (utk resolve owner/branch utama)
  const [actingForGroups, setActingForGroups] = useState([]); // grid branch×brand PENUH, termasuk yg belum ada orangnya
  const [actingForLoading, setActingForLoading] = useState(false);
  const [actingForSheet, setActingForSheet] = useState(false);
  const actingForKey = actingForList.map((a) => a.id).join(",");

  // Scope efektif utk site/branch - punya sendiri (BME/RGE) atau scope orang
  // yg diwakilkan (approver via "Buat Untuk"). Kalau beberapa branch
  // dipilih sekaligus, `branchIds` dipakai utk gabungkan daftar site dari
  // SEMUA branch terpilih, `branchName` (primer, tunggal) tetap dipakai
  // utk resolve UUID branch saat simpan, `branchNameDisplay` (gabungan,
  // dipisah koma) utk ditampilkan ke pengguna.
  const effectiveBranchIds = editId
    ? (editBranchSlug ? [editBranchSlug] : [])
    : isApprover && actingForList.length
      ? Array.from(new Set(actingForList.map((a) => a.branch_id).filter(Boolean)))
      : (scope?.branchId ? [scope.branchId] : []);
  const effectiveScope = editId
    ? {
        // Mode edit: branch/brand TIDAK BOLEH ikut scope akun yang login
        // (lihat catatan editBranchSlug di atas) - selalu dari activity-nya
        // sendiri, apapun peran/scope orang yang sedang mengedit.
        branchId: editBranchSlug, branchIds: effectiveBranchIds, brand: editData?.activity?.brand,
        branchName: editBranchName, branchNameDisplay: editBranchName,
      }
    : isApprover && actingFor
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
  // Micro Cluster sekarang MULTI-SELECT (Set berisi key "branchId::mc",
  // bukan cuma satu string) - begitu "Buat Untuk" mencakup lebih dari satu
  // branch, tiap branch WAJIB punya minimal satu MC terpilih (lihat
  // validateStep), supaya pool site yg dicari step Lokasi benar-benar
  // mencakup semua branch yg diikutkan, bukan cuma satu MC dari satu branch
  // saja. Kolom `mc` di DB tetap satu nilai text - saat simpan diisi dari MC
  // milik site utama yg akhirnya benar-benar dipilih (lihat save()).
  const [mcSelected, setMcSelected] = useState(() => new Set());

  // ── Step 2: Target ──
  const [targetSp, setTargetSp] = useState("25");
  const [targetFwa, setTargetFwa] = useState("2");
  const [targetRebuyPulsa, setTargetRebuyPulsa] = useState("0");
  const [targetRebuyData, setTargetRebuyData] = useState("0");
  const [costEstimate, setCostEstimate] = useState("500000");

  // ── Step 2: Catat Penjualan (opsional, dulu disebut "Tagging Nomor") ──
  // Reservasi MSISDN SEBELUM event berlangsung, supaya nomor prospek tidak
  // keburu ditag tim lain lebih dulu - konsep SAMA PERSIS dgn tagging di
  // Isi Laporan (activities/[id]/submit/page.jsx): validasi format "62",
  // cek kepemilikan lintas event (mh_dsf_check_msisdn_owner), tawarkan
  // pemindahan kalau bentrok (mh_dsf_request_msisdn_transfer). BEDANYA: di
  // sini activity BELUM TENTU ADA (plan baru belum tersimpan) - jadi
  // entries ditahan di state lokal dulu, baru benar-benar ditulis ke DB
  // SETELAH activityId didapat di save(). Begitu plan ini nanti dibuka di
  // Isi Laporan, nomor-nomor ini sudah otomatis muncul lagi - tidak perlu
  // diketik ulang. Longlat SENGAJA tidak direkam (tidak divalidasi apa pun).
  //
  // Satu event bisa melibatkan BEBERAPA org_id sekaligus (lihat OrgIdBar) -
  // jadi org_id sekarang distempel PER ENTRY (tagActiveOrgId dibaca saat
  // entry ditambahkan), bukan satu field global spt sebelumnya.
  const [tagOwnOrgId, setTagOwnOrgId] = useState("");
  const [tagActiveOrgId, setTagActiveOrgId] = useState("");
  const [tagTypes, setTagTypes] = useState({ sp: [], fwa: [] });
  const [tagInput, setTagInput] = useState({ sp: "", fwa: "" });
  const [tagFieldErr, setTagFieldErr] = useState({ sp: null, fwa: null });
  const [tagEntries, setTagEntries] = useState({ sp: [], fwa: [] }); // {msisdn, typeId, typeName, taggedAt, orgId, id?, persisted?}
  const [tagPending, setTagPending] = useState({ sp: [], fwa: [] }); // {msisdn, entryId, typeId, category, orgId}
  const [tagConflict, setTagConflict] = useState(null); // {category, typeId, typeName, msisdn, owner, orgId}
  const [salesEntriesLoaded, setSalesEntriesLoaded] = useState(false);

  useEffect(() => {
    if (loading) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: sp }, { data: fwa }, { data: profile }] = await Promise.all([
          supabaseMarta.from("mh_product_types").select("id,name,unit_price").eq("category", "sp").eq("active", true).order("name"),
          supabaseMarta.from("mh_product_types").select("id,name,unit_price").eq("category", "fwa").eq("active", true).order("name"),
          email ? supabaseMarta.from("mh_profiles").select("dsf_org_id").eq("email", email.toLowerCase()).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (!alive) return;
        setTagTypes({ sp: sp || [], fwa: fwa || [] });
        if (profile?.dsf_org_id) setTagOwnOrgId(profile.dsf_org_id);
      } catch { /* best-effort - tagging opsional, jangan blokir wizard kalau gagal */ }
    })();
    return () => { alive = false; };
  }, [loading, email]);

  // Mode edit: nomor yang SUDAH tercatat di DB (mis. di-booking sebelumnya
  // lewat langkah ini, atau dilanjutkan dari Isi Laporan) harus muncul lagi
  // di sini juga - sebelumnya section ini SELALU mulai kosong walau
  // activity-nya sudah punya nomor tercatat, jadi tidak bisa dilihat/dihapus
  // sama sekali dari wizard. Ditandai `persisted:true` supaya hapusnya lewat
  // deleteSalesEntry() (RPC) bukan cuma dibuang dari state lokal, dan supaya
  // save() tidak mengirim ulang nomor yang sudah ada.
  useEffect(() => {
    if (!editId || salesEntriesLoaded || (tagTypes.sp.length === 0 && tagTypes.fwa.length === 0)) return;
    let alive = true;
    (async () => {
      try {
        const rows = await fetchSalesEntries(editId);
        if (!alive) return;
        const byCat = { sp: [], fwa: [] };
        for (const r of rows) {
          if (r.category !== "sp" && r.category !== "fwa") continue;
          const typeObj = tagTypes[r.category].find((t) => t.id === r.product_type_id);
          byCat[r.category].push({
            id: r.id, msisdn: r.msisdn, typeId: r.product_type_id, typeName: typeObj?.name,
            taggedAt: r.tagged_at, orgId: r.org_id, persisted: true,
          });
        }
        setTagEntries((prev) => ({
          sp: [...byCat.sp, ...prev.sp.filter((e) => !e.persisted)],
          fwa: [...byCat.fwa, ...prev.fwa.filter((e) => !e.persisted)],
        }));
      } catch { /* best-effort - jangan blokir wizard kalau gagal muat */ }
      finally { if (alive) setSalesEntriesLoaded(true); }
    })();
    return () => { alive = false; };
  }, [editId, salesEntriesLoaded, tagTypes]);

  function isTagDuplicate(cat, msisdn) {
    return tagEntries[cat].some((e) => e.msisdn === msisdn) || tagPending[cat].some((p) => p.msisdn === msisdn);
  }

  // Hapus HARUS mudah walau nomornya sudah diclaim/tersimpan di DB (bukan
  // cuma yg belum disimpan) - msisdn UNIQUE global di tabel, jadi menghapus
  // adalah satu-satunya cara membebaskan nomor yg salah catat. Optimistic:
  // langsung hilang dari layar, di-rollback (+ pesan error) kalau RPC-nya
  // ternyata gagal (mis. bukan pencatat/pemilik plan-nya).
  async function removeTagEntry(cat, msisdn) {
    const entry = tagEntries[cat].find((e) => e.msisdn === msisdn);
    if (!entry) return;
    setTagEntries((prev) => ({ ...prev, [cat]: prev[cat].filter((e) => e.msisdn !== msisdn) }));
    if (entry.persisted && entry.id) {
      try {
        await deleteSalesEntry(entry.id);
      } catch (e) {
        setTagEntries((prev) => ({ ...prev, [cat]: [...prev[cat], entry] }));
        setErr(e.message || "Gagal menghapus nomor");
      }
    }
  }

  async function addTagMsisdn(cat, rawMsisdn) {
    if (!tagActiveOrgId.trim()) { setTagFieldErr((e) => ({ ...e, [cat]: "Pilih ORG ID Aktif dulu sebelum tagging nomor." })); return; }
    const norm = normalizeMsisdn(rawMsisdn);
    if (!isValidMsisdn(norm)) { setTagFieldErr((e) => ({ ...e, [cat]: 'Format MSISDN tidak valid - wajib diawali "62".' })); return; }
    if (isTagDuplicate(cat, norm)) { setTagFieldErr((e) => ({ ...e, [cat]: "Nomor ini sudah ditambahkan." })); return; }
    setTagFieldErr((e) => ({ ...e, [cat]: null }));

    const typeId = tagTypes[cat]?.[0]?.id || null;
    const typeObj = tagTypes[cat]?.find((t) => t.id === typeId);
    const activeOrgId = tagActiveOrgId.trim();

    // Cek kepemilikan - kalau nomor sudah ditag di event lain (siapa pun
    // pemiliknya), JANGAN langsung ditambahkan - tawarkan pemindahan dulu,
    // supaya tidak ada nomor yang kehitung dobel di dua event.
    try {
      const { data: ownerRows } = await supabaseMarta.rpc("mh_dsf_check_msisdn_owner", { p_msisdn: norm });
      const owner = ownerRows && ownerRows.length > 0 ? ownerRows[0] : null;
      if (owner) { setTagConflict({ category: cat, typeId, typeName: typeObj?.name, msisdn: norm, owner, orgId: activeOrgId }); return; }
    } catch { /* best-effort - kalau cek gagal, tetap lanjut tambahkan */ }

    setTagEntries((prev) => ({ ...prev, [cat]: [...prev[cat], { msisdn: norm, typeId, typeName: typeObj?.name, taggedAt: new Date().toISOString(), orgId: activeOrgId }] }));
    setTagInput((prev) => ({ ...prev, [cat]: "" }));
  }

  function confirmTagConflict() {
    if (!tagConflict) return;
    // Belum ada activityId - permintaan pemindahan BENERAN baru diajukan
    // (mh_dsf_request_msisdn_transfer) begitu plan ini tersimpan, lihat save().
    setTagPending((prev) => ({
      ...prev,
      [tagConflict.category]: [...prev[tagConflict.category], { msisdn: tagConflict.msisdn, entryId: tagConflict.owner.entry_id, typeId: tagConflict.typeId, category: tagConflict.category, orgId: tagConflict.orgId }],
    }));
    setTagConflict(null);
  }

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
    // Mode edit: JANGAN fetch dulu sebelum editBranchSlug (branch ASLI
    // activity) selesai di-resolve - kalau tidak, effect ini langsung jalan
    // dgn branchIds KOSONG (fetch 0 site, selesai seketika, dataLoading jadi
    // false sebentar), lalu begitu editBranchSlug datang effect ini jalan
    // LAGI dgn data asli - dataLoading balik true lalu false lagi. Dua
    // putaran loading→siap→loading→siap itulah yang kelihatan "ngeglitch"
    // (layar sempat kosong/berkedip sebelum akhirnya stabil).
    if (loading || !scope?.found || (editId && !editBranchSlug)) return;
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
        // Tandai tiap site dgn branch_id ASAL-nya (slug, dari indeks
        // effectiveScope.branchIds yg sama dipakai memanggilnya) - mh_sites
        // tidak mengembalikan branch_id di select-nya, jadi ini satu-satunya
        // cara tahu site mana dari branch mana setelah digabung. Dipakai utk
        // mengelompokkan pilihan Micro Cluster per branch di StepInfo.
        const merged = []; const seen = new Set();
        siteLists.forEach((list, i) => {
          const branchId = effectiveScope.branchIds[i];
          for (const s of list) { if (!seen.has(s.site_id)) { seen.add(s.site_id); merged.push({ ...s, branch_id: branchId }); } }
        });
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
  }, [loading, scope, effectiveScope.branchIds.join(","), effectiveScope.brand, editId, editBranchSlug]);

  // Muat daftar orang yang bisa diwakilkan ("Buat Untuk") - hanya utk
  // approver, sekali saat scope siap.
  useEffect(() => {
    if (loading || !isApprover) return;
    let alive = true;
    (async () => {
      setActingForLoading(true);
      try {
        const { groups } = await fetchAssignableGroups(scope);
        if (alive) setActingForGroups(groups);
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
    setMcSelected(new Set()); setPrimarySite(null); setExtraSites([]);
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

  // Nama branch per slug - dipakai utk header kelompok Micro Cluster begitu
  // sitenya digabung dari lebih dari satu branch (multi "Buat Untuk").
  // Non-approver/single-branch cukup dari scope sendiri.
  const branchNameBySlug = useMemo(() => {
    const m = {};
    if (isApprover) { for (const a of actingForList) if (a.branch_id) m[a.branch_id] = a.branch_name || a.branch_id; }
    else if (scope?.branchId) { m[scope.branchId] = scope.branchName || scope.branchId; }
    return m;
  }, [isApprover, actingForList, scope]);
  const mcGroups = useMemo(() => mcGroupsFromSites(sites, branchNameBySlug), [sites, branchNameBySlug]);
  const sitesInMc = useMemo(() => sites.filter((s) => mcSelected.has(mcKey(s.branch_id, s.mc))), [sites, mcSelected]);
  // Kunci stabil dari isi mcSelected (Set baru tiap render tidak bisa
  // dipakai langsung sbg dependency effect) - dipakai supaya effect reset di
  // bawah cuma jalan saat ISI-nya benar-benar berubah.
  const mcSelectedKey = useMemo(() => Array.from(mcSelected).sort().join(","), [mcSelected]);

  const toggleMc = (branchId, mc) => {
    setMcSelected((prev) => {
      const next = new Set(prev);
      const key = mcKey(branchId, mc);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Reset pilihan site saat MC diganti MANUAL oleh user - TIDAK dipicu saat
  // prefill mode edit mengisi `mcSelected` (guard `prefilled`/`editId` di
  // bawah), supaya site utama/tambahan hasil prefill tidak langsung
  // terhapus lagi.
  useEffect(() => {
    if (editId && !prefilled) return;
    setPrimarySite(null); setExtraSites([]);
  }, [mcSelectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill field DASAR mode edit - begitu editData & branch/brand ASLI
  // activity (editBranchSlug) siap. SENGAJA TIDAK MENUNGGU `sites` lagi
  // (lihat catatan besar di editBranchSlug/effectiveScope di atas) - site/MC
  // dicocokkan di effect TERPISAH di bawah, supaya field lain (nama,
  // kategori, tanggal, waktu, target, POI, dst.) tetap terisi walau daftar
  // site gagal/lambat termuat, bukan ikut kosong semua.
  useEffect(() => {
    if (!editId || prefilled || !editData || !editBranchSlug) return;
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
    // Mode edit selalu single-branch (isApprover otomatis false saat
    // editId ada - lihat definisinya di atas), jadi branch-nya pasti
    // editBranchSlug (branch ASLI activity, BUKAN scope login).
    if (a.mc) setMcSelected(new Set([mcKey(editBranchSlug, a.mc)]));
    setTargetSp(String(a.target_sp ?? 25));
    setTargetFwa(String(a.target_fwa ?? 2));
    setTargetRebuyPulsa(String(a.target_rebuy_pulsa ?? 0));
    setTargetRebuyData(String(a.target_rebuy_data ?? 0));
    setCostEstimate(String(a.cost_estimate ?? 500000));
    setPoiType(unsnake(a.poi_type));
    setNetwork(unsnake(a.network_category));
    setArea(unsnake(a.area_potential));
    setAddress(a.address || "");
    setManualLat(a.latitude != null ? Number(a.latitude) : null);
    setManualLng(a.longitude != null ? Number(a.longitude) : null);
    setPrefilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, editData, editBranchSlug, prefilled]);

  // Cocokkan site_id tersimpan → objek site, LALU langsung tentukan step
  // resume dari situ DALAM SATU EFFECT YANG SAMA (sebelumnya dua effect
  // terpisah) - digabung supaya keputusan step tidak pernah baca `primarySite`
  // yang "lagi di jalan" dari effect lain (kalau dipisah, dua effect di
  // commit yang sama bisa jalan berurutan dgn effect kedua masih membaca
  // state LAMA sebelum effect pertama sempat menerapkan setPrimarySite -
  // menghasilkan lompatan step yang salah/berkedip). Nunggu `!dataLoading`
  // (percobaan fetch site sudah tuntas, bukan cuma `sites.length>0`) supaya
  // tidak menyimpulkan terlalu dini sebelum fetch beneran selesai.
  const [stepResumed, setStepResumed] = useState(false);
  useEffect(() => {
    if (!editId || stepResumed || !prefilled) return;
    const hasSiteId = !!editData?.activity?.site_id;
    if (hasSiteId && dataLoading) return; // masih menunggu fetch site selesai
    let matchedPrimary = null;
    if (hasSiteId) {
      const allSiteIds = [editData.activity.site_id, ...editData.extraSiteIds].filter(Boolean);
      const matched = allSiteIds.map((id) => sites.find((s) => s.site_id === id)).filter(Boolean);
      matchedPrimary = matched[0] || null;
      if (matchedPrimary) setPrimarySite(matchedPrimary);
      if (matched.length > 1) setExtraSites(matched.slice(1));
    }
    const vd = dates.filter(Boolean);
    const infoOk = categories.length > 0 && !!eventName.trim() && vd.length > 0 && allDateTimesValid(vd, timesByDate) && mcSelected.size > 0;
    const locOk = !!matchedPrimary && !!poiType;
    setStep(!infoOk ? 0 : !locOk ? 2 : 3);
    setStepResumed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, stepResumed, prefilled, dataLoading, editData, sites]);

  // Bersihkan flag invalid SATU-PER-SATU begitu field yg bersangkutan sudah
  // benar diisi. Sebelumnya `invalid` cuma snapshot dari saat terakhir kali
  // "Lanjut"/"Simpan Draft" ditekan - jadi pesan "wajib diisi" tetap nempel
  // di layar walau penggunanya SUDAH mengisinya dgn benar, sampai tombol itu
  // ditekan ulang (bikin bingung: kategori sudah dipilih, tanggal sudah
  // diisi, tapi errornya masih kelihatan). Effect ini TIDAK PERNAH menambah
  // flag baru (itu tetap tugas validateStep() saat tombol ditekan) - cuma
  // mencabut yg sudah tidak relevan lagi, reaktif tiap field berubah.
  // Diletakkan SEBELUM early return di bawah (bukan dekat validateStep) -
  // wajib, hooks tidak boleh dipanggil kondisional (rules-of-hooks).
  useEffect(() => {
    const vd = dates.filter(Boolean);
    setInvalid((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      if (isApprover && actingForList.length > 0) next.delete("actingFor");
      if (categories.length > 0) next.delete("categories");
      if (eventName.trim()) next.delete("eventName");
      if (vd.length > 0) next.delete("planDate");
      if (vd.length === 0 || allDateTimesValid(vd, timesByDate)) next.delete("timeRange");
      const branchesWithMc = mcGroups.filter((g) => g.mcList.length > 0);
      const mcOk = mcSelected.size > 0 && !(branchesWithMc.length > 1 && branchesWithMc.some((g) => !Array.from(mcSelected).some((k) => k.startsWith(`${g.branchId}::`))));
      if (mcOk) next.delete("mc");
      if (primarySite) next.delete("site");
      if (poiType) next.delete("poiType");
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApprover, actingForList.length, categories.length, eventName, dates, timesByDate, mcSelectedKey, mcGroups, primarySite, poiType]);

  // Mode edit: tunggu `stepResumed` juga - supaya wizard TIDAK PERNAH sempat
  // ter-render dulu di step 1 (default) sebelum "lompat" ke step yang benar,
  // yang sebelumnya kelihatan seperti kedipan/glitch. Sekali lolos gate ini,
  // wizard langsung tampil di step akhir yang benar dari awal.
  if (loading || dataLoading || editLoading || (editId && !stepResumed)) return <MobileShell active="activities"><ShellSpinner /></MobileShell>;

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
      // MC wajib minimal satu SECARA KESELURUHAN, dan kalau "Buat Untuk"
      // mencakup lebih dari satu branch, WAJIB minimal satu per branch yg
      // memang punya MC (branch tanpa MC sama sekali dikecualikan - tidak
      // ada apa pun yg bisa dipilih di sana).
      const branchesWithMc = mcGroups.filter((g) => g.mcList.length > 0);
      if (mcSelected.size === 0) bad.add("mc");
      else if (branchesWithMc.length > 1 && branchesWithMc.some((g) => !Array.from(mcSelected).some((k) => k.startsWith(`${g.branchId}::`)))) {
        bad.add("mc");
      }
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

  // Draft WAJIB bisa disimpan kapan saja - dari step mana pun, asal SUDAH
  // ada minimal satu bagian yang diisi (bukan form kosong sama sekali).
  // Sengaja TIDAK memakai validateStep() di sini - itu utk syarat "siap
  // diajukan" (Ajukan Plan), sedangkan draft memang cuma tempat menyimpan
  // pekerjaan yang belum selesai.
  function hasAnyDraftContent() {
    return !!(
      eventName.trim() || categories.length > 0 || validDates.length > 0 || mcSelected.size > 0 ||
      Number(targetSp) || Number(targetFwa) || Number(targetRebuyPulsa) || Number(targetRebuyData) || Number(costEstimate) ||
      primarySite || extraSites.length > 0 || address.trim() ||
      tagEntries.sp.length > 0 || tagEntries.fwa.length > 0
    );
  }

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
    } else {
      // "Buat Untuk" (approver) tetap wajib dipilih dulu WALAU draft - branch
      // & pemilik plan tidak bisa ditentukan tanpa itu (bukan gating step,
      // ini keterbatasan data: draft harus tetap terikat ke branch/brand
      // tertentu). Selain itu, cukup pastikan tidak menyimpan form kosong.
      if (isApprover && actingForList.length === 0) {
        setErr("Pilih \"Buat Untuk\" dulu sebelum menyimpan draft.");
        setInvalid(new Set(["actingFor"]));
        setStep(0);
        return;
      }
      if (!hasAnyDraftContent()) {
        setErr("Isi minimal satu bagian dulu sebelum menyimpan draft.");
        return;
      }
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
        // Kolom `mc` di DB cuma satu nilai - ambil dari MC site UTAMA yang
        // benar-benar dipakai (bukan dari daftar mcSelected yg bisa lebih
        // dari satu), sama seperti perilaku lama saat mc masih single-select.
        mc: primarySite?.mc || null,
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
        //
        // Target boleh "slot kosong" (branch×brand yg belum ada BME/RGE-nya
        // sama sekali) - actingFor tidak punya email utk kasus ini.
        // bme_user_id disimpan NULL (kolom sudah dibuat nullable di DB),
        // created_by dicatat sbg approver sendiri (bukan null, supaya tetap
        // ada jejak siapa yang membuat). Baris ini otomatis "diklaim"
        // (bme_user_id terisi) oleh RPC mh_rebind_email begitu ada BME/RGE
        // yang di-assign & login ke branch×brand yg sama.
        const isPlaceholderTarget = isApprover && actingFor && !actingFor.email;
        const ownerId = isApprover && actingFor && actingFor.email ? await resolveProfileIdByEmail(actingFor.email) : (isPlaceholderTarget ? null : userId);
        if (isApprover && actingFor && actingFor.email && !ownerId) throw new Error("Profil target tidak ditemukan. Coba pilih ulang.");
        const resolvedBranchId = await resolveBranchUuid(effectiveScope.branchId, effectiveScope.branchName);
        if (!resolvedBranchId) throw new Error(`Cabang "${effectiveScope.branchName || effectiveScope.branchId}" tidak ditemukan di master data cabang.`);
        const { data: inserted, error } = await supabaseMarta.from("mh_activities").insert({
          bme_user_id: ownerId,
          created_by: isPlaceholderTarget ? userId : ownerId,
          branch_id: resolvedBranchId,
          brand: (effectiveScope.brand || "").toUpperCase(),
          status: finalStatus,
          ...commonFields,
        }).select("id").single();
        if (error) throw error;
        activityId = inserted.id;
      }

      if (siteIds.length > 0) await syncActivitySites(activityId, siteIds);

      // Tagging nomor (opsional) - baru BENAR-BENAR ditulis ke DB sekarang,
      // setelah activityId pasti ada. Best-effort per kelompok (sama spt
      // Isi Laporan) supaya plan pokok TETAP tersimpan walau sebagian
      // tagging gagal.
      // Dikelompokkan per typeId+orgId (bukan typeId saja) - satu event bisa
      // punya beberapa org_id sekaligus (lihat OrgIdBar), jadi tiap kelompok
      // org_id-nya harus dikirim terpisah krn mh_dsf_submit_sales_entries
      // cuma menerima SATU p_org_id per panggilan.
      for (const cat of ["sp", "fwa"]) {
        const byGroup = new Map();
        // `persisted` = sudah tercatat di DB sebelumnya (dimuat lewat
        // fetchSalesEntries di mode edit) - JANGAN dikirim ulang, cuma
        // entry baru yang belum tersimpan yang perlu di-submit di sini.
        for (const e of tagEntries[cat].filter((e) => !e.persisted)) {
          const key = `${e.typeId}|${e.orgId}`;
          if (!byGroup.has(key)) byGroup.set(key, { typeId: e.typeId, orgId: e.orgId, list: [] });
          byGroup.get(key).list.push(e);
        }
        for (const { typeId, orgId, list } of byGroup.values()) {
          try {
            await supabaseMarta.rpc("mh_dsf_submit_sales_entries", {
              p_activity_id: activityId, p_org_id: orgId, p_category: cat, p_product_type_id: typeId,
              p_entries: list.map((e) => ({ msisdn: e.msisdn, imei: null, tagged_at: e.taggedAt })),
            });
          } catch { /* best-effort - lanjut kelompok berikutnya */ }
        }
        for (const p of tagPending[cat]) {
          try {
            await supabaseMarta.rpc("mh_dsf_request_msisdn_transfer", {
              p_entry_id: p.entryId, p_to_activity_id: activityId, p_category: p.category, p_product_type_id: p.typeId, p_org_id: p.orgId,
            });
          } catch { /* best-effort - lanjut nomor berikutnya */ }
        }
      }

      router.replace(`/martahub/m/activities?open=${activityId}`);
    } catch (e) {
      setErr(e.message || "Gagal menyimpan plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileShell active="activities">
      {/* Header wizard STICKY dgn glass blur - pola & nilai warna/blur SAMA
          PERSIS dgn header Beranda (app/martahub/m/page.jsx) supaya bahasa
          desainnya konsisten antar layar. Sebelumnya cuma div biasa, jadi
          judul + stepper ikut tergulung hilang begitu form-nya panjang -
          padahal justru progress langkah yang paling perlu selalu terlihat
          saat mengisi. Baris judul & stepper dijadikan satu blok tempel
          supaya tidak ada "celah" abu di antara keduanya saat digulung.
          Badge "1/4" di kanan (bukan subteks kiri seperti sebelumnya) supaya
          progres langkah langsung kebaca sekilas tanpa harus baca teks. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 16px) 20px 14px",
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={goBack} style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68", flexShrink: 0 }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {editId ? "Edit Plan" : "Buat Plan Baru"}
            </div>
            <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {STEPS[step]}
            </div>
          </div>
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "baseline", gap: 1, padding: "5px 10px", borderRadius: 999,
            background: "rgba(237,28,36,0.08)",
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#ED1C24", fontVariantNumeric: "tabular-nums" }}>{step + 1}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#ED1C24", opacity: 0.55 }}>/{STEPS.length}</span>
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
            mcSelected, toggleMc, mcGroups, invalid,
            branchName: effectiveScope.branchNameDisplay,
            isApprover, actingFor, actingForList, actingForLoading, onPickActingFor: () => setActingForSheet(true),
          }} />
        )}
        {step === 1 && (
          <StepTarget {...{
            targetSp, setTargetSp, targetFwa, setTargetFwa, targetRebuyPulsa, setTargetRebuyPulsa, targetRebuyData, setTargetRebuyData, costEstimate, setCostEstimate,
            tagOwnOrgId, tagActiveOrgId, setTagActiveOrgId, tagInput, setTagInput, tagFieldErr, tagEntries, tagPending, addTagMsisdn, removeTagEntry,
            tagConflict, setTagConflict, confirmTagConflict, ownLabel: scope?.fullName,
          }} />
        )}
        {step === 2 && (
          <StepLocation {...{
            hasMc: mcSelected.size > 0, sitesInMc, primarySite, setPrimarySite, extraSites, setExtraSites,
            poiType, setPoiType, poiTypes, network, setNetwork, area, setArea,
            address, setAddress, manualLat, manualLng, setManualLat, setManualLng, locating, useMyLocation, invalid,
          }} />
        )}
        {step === 3 && (
          <StepReview {...{
            categories, eventName, dates: validDates, timesByDate,
            mcSummary: Array.from(mcSelected).map((k) => k.split("::")[1]).join(", "),
            targetSp, targetFwa, targetRebuyPulsa, targetRebuyData, costEstimate,
            primarySite, extraSites, poiType, network, area, address, manualLat, manualLng,
          }} />
        )}
      </div>

      {/* Bottom action bar - "Simpan Draft" SEKARANG tersedia di SEMUA step
          (bukan cuma step terakhir/Review) supaya pengguna bisa berhenti
          & menyimpan progres kapan pun, tanpa dipaksa mengisi step
          Lokasi/Review dulu hanya demi menyimpan draft. */}
      <div style={{ position: "sticky", bottom: 66, background: "linear-gradient(180deg,rgba(244,245,247,0) 0%,#F4F5F7 30%)", padding: "16px 20px 0" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => save("draft")} disabled={saving}
            style={{ flex: 1, height: 50, borderRadius: 12, border: "1.5px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Save size={15} /> Simpan Draft
          </button>
          {step === 3 ? (
            <button onClick={() => save("plan_submitted")} disabled={saving}
              style={{ flex: 1.3, height: 50, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(17,17,20,0.1)" }}>
              {saving ? <Loader2 size={16} style={{ animation: "mspin .85s linear infinite" }} /> : <><Check size={16} /> Ajukan Plan</>}
            </button>
          ) : (
            <button onClick={goNext} disabled={saving}
              style={{ flex: 1.3, height: 50, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(17,17,20,0.1)" }}>
              Lanjut <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {actingForSheet && (
        <ActingForSheet
          groups={actingForGroups}
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
function StepInfo({ categories, toggleCategory, eventName, setEventName, dates, setDates, timesByDate, setTimesByDate, mcSelected, toggleMc, mcGroups, invalid, branchName, isApprover, actingFor, actingForList, actingForLoading, onPickActingFor }) {
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
          <FieldLabel text="Buat Untuk" required hint={actingForLoading ? "Memuat…" : "Orang atau branch·brand"} />
          <button onClick={onPickActingFor}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 13px", borderRadius: 12, background: "#F6F7F9", border: `1.5px solid ${invalid.has("actingFor") ? "#DC2626" : "#ECEDF0"}`, cursor: "pointer", fontFamily: FF }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: actingFor ? (actingFor.email ? "rgba(237,28,36,0.10)" : "#FDF2E3") : "#E9EAEE", color: actingFor ? (actingFor.email ? "#ED1C24" : "#B45309") : "#9A9AA6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {actingFor && !actingFor.email ? <Building2 size={14} /> : <Users size={14} />}
            </div>
            <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
              {actingFor ? actingFor.email ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{actingFor.full_name || actingFor.email}</div>
                  {/* Lebih dari satu branch dipilih (BME/RGE yg sama, beberapa
                      branch sekaligus) - digabung koma di sini. */}
                  <div style={{ fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>
                    {(actingFor.role || "").toUpperCase()} · {actingForList.map((a) => a.branch_name).filter(Boolean).join(", ") || "-"}
                  </div>
                </>
              ) : (
                // Slot kosong (branch×brand belum ada BME/RGE) - plan tetap
                // tersimpan, tinggal menunggu diklaim otomatis begitu ada
                // yang di-assign.
                <>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {actingForList.map((a) => a.branch_name).filter(Boolean).join(", ") || actingFor.branch_name}
                  </div>
                  <div style={{ fontSize: 11, color: "#B45309", fontWeight: 600 }}>Belum ada BME/RGE - plan menunggu di-assign</div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: "#8A8A96", fontWeight: 600 }}>Pilih BME/RGE yang diwakilkan</div>
              )}
            </div>
            <ChevronRight size={16} color="#B0B0BA" style={{ flexShrink: 0 }} />
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

      {/* Field "Branch" cuma perlu ditampilkan sendiri kalau CUMA satu branch
          - begitu lebih dari satu (multi "Buat Untuk"), nama tiap branch
          sudah jadi header section di picker MC di bawah, jadi baris ini
          tinggal duplikat tanpa info baru. */}
      {mcGroups.length <= 1 && (
        <>
          <FieldLabel text="Branch" required top />
          <LockedField text={branchName || "-"} muted />
        </>
      )}

      <FieldLabel text="Micro Cluster" required top hint={mcGroups.length > 1 ? "Bisa lebih dari satu - wajib min. 1 per branch" : "Bisa lebih dari satu"} />
      <GroupedSelectPills groups={mcGroups} selected={mcSelected} onToggle={toggleMc} placeholder="Tidak ada MC di scope Anda" />
      {invalid.has("mc") && <FieldError text={mcGroups.length > 1 ? "Pilih minimal satu MC dari SETIAP branch" : "Micro cluster wajib dipilih"} />}
    </Card>
  );
}

// ═════════════════════════════════ Step 2 ═════════════════════════════════
function StepTarget({
  targetSp, setTargetSp, targetFwa, setTargetFwa, targetRebuyPulsa, setTargetRebuyPulsa, targetRebuyData, setTargetRebuyData, costEstimate, setCostEstimate,
  tagOwnOrgId, tagActiveOrgId, setTagActiveOrgId, tagInput, setTagInput, tagFieldErr, tagEntries, tagPending, addTagMsisdn, removeTagEntry,
  tagConflict, setTagConflict, confirmTagConflict, ownLabel,
}) {
  // Dua kolom pakai CSS GRID dgn minmax(0,1fr), BUKAN flex:1 biasa - flex:1
  // tanpa minWidth:0 bisa "menolak" mengecil di bawah lebar konten intrinsik
  // (mis. angka Rupiah panjang + prefix "Rp"), jadi kolom kanan (Rebuy Data)
  // kepotong/keluar dari layar di layar sempit. minmax(0,1fr) memaksa tiap
  // kolom BOLEH mengecil sampai 0 dulu baru bagi rata sisanya - dijamin tidak
  // pernah overflow horizontal seberapa pun sempit layarnya.
  const twoCol = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 };
  const taggedTotal = tagEntries.sp.length + tagEntries.fwa.length;
  return (
    <>
      <Card>
        <div style={twoCol}>
          <div style={{ minWidth: 0 }}>
            <FieldLabel text="Target SP" />
            <NumberInput value={targetSp} onChange={setTargetSp} />
          </div>
          <div style={{ minWidth: 0 }}>
            <FieldLabel text="Target FWA" />
            <NumberInput value={targetFwa} onChange={setTargetFwa} />
          </div>
        </div>
        <div style={{ ...twoCol, marginTop: 12 }}>
          <div style={{ minWidth: 0 }}>
            <FieldLabel text="Rebuy Pulsa" />
            <NumberInput value={targetRebuyPulsa} onChange={setTargetRebuyPulsa} prefix="Rp" />
          </div>
          <div style={{ minWidth: 0 }}>
            <FieldLabel text="Rebuy Data" />
            <NumberInput value={targetRebuyData} onChange={setTargetRebuyData} prefix="Rp" />
          </div>
        </div>
        <FieldLabel text="Budget Cost" top />
        <NumberInput value={costEstimate} onChange={setCostEstimate} prefix="Rp" />
      </Card>

      {/* Catat Penjualan (dulu "Tagging Nomor") - kartu terpisah & sengaja
          ditonjolkan (header gradasi pink-merah, senada aksen brand) supaya
          kelihatan sbg kapabilitas baru, bukan field tambahan yg tenggelam.
          Nomor bisa dicatat/di-BOOKING di sini SEBELUM event berlangsung,
          lalu otomatis muncul lagi & bisa dilanjutkan di Isi Laporan saat
          hari-H (tidak hilang, tidak perlu diketik ulang) - dan kalau
          nomornya sudah diclaim tim lain, langsung ketahuan di sini juga,
          bukan baru ketahuan pas lapor actual setelah event selesai. */}
      <div style={{ marginTop: 14, borderRadius: 18, overflow: "hidden", border: "1px solid #F3D2E4", boxShadow: "0 4px 14px rgba(198,22,141,0.06)" }}>
        <div style={{ padding: "14px 16px", background: "linear-gradient(135deg,#ED1C24,#C6168D)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Tag size={17} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: "#fff" }}>Catat Penjualan</span>
                <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, color: "#fff", background: "rgba(255,255,255,0.22)", borderRadius: 999, padding: "2px 7px" }}>OPSIONAL</span>
              </div>
              <div style={{ marginTop: 2, fontSize: 10.5, color: "rgba(255,255,255,0.85)", fontWeight: 600, lineHeight: 1.4 }}>
                Bisa dicatat (booking) sebelum event, lalu dilanjutkan lagi saat hari-H di Isi Laporan
              </div>
            </div>
            {taggedTotal > 0 && (
              <div style={{ flexShrink: 0, textAlign: "center" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{taggedTotal}</div>
                <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>NOMOR</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "14px 16px 16px", background: "#FFFFFF" }}>
          <OrgIdBar value={tagActiveOrgId} onChange={setTagActiveOrgId} ownOrgId={tagOwnOrgId} ownLabel={ownLabel} />

          <TagCategorySection cat="sp" label="Nomor SP"
            input={tagInput.sp} onInputChange={(v) => setTagInput((p) => ({ ...p, sp: v }))}
            onAdd={() => addTagMsisdn("sp", tagInput.sp)}
            onScanResult={(msisdn) => addTagMsisdn("sp", msisdn)}
            entries={tagEntries.sp} onRemove={(m) => removeTagEntry("sp", m)}
            pending={tagPending.sp} error={tagFieldErr.sp} />
          <TagCategorySection cat="fwa" label="Nomor FWA"
            input={tagInput.fwa} onInputChange={(v) => setTagInput((p) => ({ ...p, fwa: v }))}
            onAdd={() => addTagMsisdn("fwa", tagInput.fwa)}
            onScanResult={(msisdn) => addTagMsisdn("fwa", msisdn)}
            entries={tagEntries.fwa} onRemove={(m) => removeTagEntry("fwa", m)}
            pending={tagPending.fwa} error={tagFieldErr.fwa} />
        </div>
      </div>

      {tagConflict && (
        <TagConflictSheet conflict={tagConflict} onClose={() => setTagConflict(null)} onConfirm={confirmTagConflict} />
      )}
    </>
  );
}

/** Satu kelompok (SP atau FWA) di dalam kartu Catat Penjualan - input MSISDN +
 * tombol tambah, lalu nomor yang sudah ditag ditampilkan sbg chip mungil yg
 * bisa dilepas satu-satu (bukan kartu besar spt di Isi Laporan - di sini
 * cuma satu dari beberapa field di step yg sama, jadi dipadatkan). */
function TagCategorySection({ cat, label, input, onInputChange, onAdd, onScanResult, entries, onRemove, pending, error }) {
  const Icon = cat === "sp" ? CardSim : RouterIcon;
  const [scanning, setScanning] = useState(false);
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon size={13} color="#8A8A96" />
          <span style={{ fontSize: 11.5, fontWeight: 800, color: "#3A3A44" }}>{label}</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#C6168D", background: "rgba(198,22,141,0.08)", padding: "2px 8px", borderRadius: 999 }}>{entries.length} nomor</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input value={input} onChange={(e) => onInputChange(e.target.value)} inputMode="tel"
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="Contoh: 628123456789"
          style={{ flex: 1, minWidth: 0, height: 44, padding: "0 13px", borderRadius: 11, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 13, fontFamily: FF, color: "#17181C", outline: "none", boxSizing: "border-box" }} />
        {/* Scan QR kartu SIM - SAMA PERSIS dgn Isi Laporan (_shared/QrScanSheet,
            jsQR lintas browser) supaya reservasi nomor prospek sebelum event
            juga bisa lewat scan, bukan cuma ketik manual. */}
        <button onClick={() => setScanning(true)} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 11, background: "#F6F7F9", border: "1.5px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
          <QrCode size={17} />
        </button>
        <button onClick={onAdd} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 11, background: "linear-gradient(135deg,#ED1C24,#C6168D)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Plus size={17} color="#fff" />
        </button>
      </div>
      {error && <FieldError text={error} />}
      {scanning && (
        <QrScanSheet
          title={`Scan QR Kartu SIM · ${label}`}
          onClose={() => setScanning(false)}
          onDetect={(msisdn) => { setScanning(false); onScanResult(msisdn); }}
        />
      )}
      {entries.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {entries.map((e) => (
            <span key={e.msisdn} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 6px 6px 12px", borderRadius: 999, background: "#F6F7F9", border: "1px solid #ECEDF0", fontSize: 12, fontWeight: 700, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>
              {e.msisdn}
              {/* Badge org_id - penting begitu satu event bisa dicatat oleh
                  beberapa org_id sekaligus, supaya tetap jelas nomor mana
                  milik org_id mana. */}
              {e.orgId && (
                <span style={{ fontSize: 9.5, fontWeight: 800, color: "#C6168D", background: "rgba(198,22,141,0.09)", borderRadius: 999, padding: "2px 6px" }}>{e.orgId}</span>
              )}
              <button onClick={() => onRemove(e.msisdn)} style={{ width: 18, height: 18, borderRadius: "50%", border: "none", background: "rgba(220,38,38,0.1)", color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {pending.map((p) => (
            <span key={p.msisdn} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999, background: "#FFF7ED", border: "1px solid #FDE1B8", fontSize: 11, fontWeight: 700, color: "#B45309" }}>
              {p.msisdn} · menunggu pemindahan
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Muncul begitu nomor yang mau ditag ternyata sudah ditag di event lain
 * (siapa pun pemiliknya) - sama persis konsepnya dgn ConflictSheet di Isi
 * Laporan, tapi permintaan pemindahannya baru BENAR-BENAR dikirim setelah
 * plan ini disimpan (activity belum tentu ada saat kartu ini muncul). */
function TagConflictSheet({ conflict, onClose, onConfirm }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 400, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF", borderRadius: "22px 22px 0 0", padding: "10px 22px calc(env(safe-area-inset-bottom,0px) + 22px)", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "6px auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={20} color="#B45309" />
          <div style={{ fontSize: 15.5, fontWeight: 800 }}>Nomor sudah ditag orang lain</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: "#5A5A68", lineHeight: 1.6 }}>
          Nomor <b>{conflict.msisdn}</b> sudah ditandai oleh <b>{conflict.owner.owner_name}</b> pada &ldquo;{conflict.owner.event_name}&rdquo;. Anda bisa mengajukan pemindahan kepemilikan ke plan ini - permintaan baru benar-benar dikirim setelah plan disimpan, dan aktif setelah disetujui pemilik sebelumnya.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, height: 48, borderRadius: 12, border: "1.5px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>Batal</button>
          <button onClick={onConfirm} style={{ flex: 1.2, height: 48, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>Ajukan Pemindahan</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════ Step 3 ═════════════════════════════════
function StepLocation({ hasMc, sitesInMc, primarySite, setPrimarySite, extraSites, setExtraSites, poiType, setPoiType, poiTypes, network, setNetwork, area, setArea, address, setAddress, manualLat, manualLng, setManualLat, setManualLng, locating, useMyLocation, invalid }) {
  const [picking, setPicking] = useState(null); // 'primary' | 'extra' | null
  const [mapPicking, setMapPicking] = useState(false);
  const taken = new Set([primarySite?.site_id, ...extraSites.map((s) => s.site_id)].filter(Boolean));
  const available = sitesInMc.filter((s) => !taken.has(s.site_id));

  return (
    <>
      <Card>
        <FieldLabel text="Site" required hint={`${(primarySite ? 1 : 0) + extraSites.length} dipilih`} />
        {!hasMc ? (
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
      <ReviewRow k="Micro Cluster" v={p.mcSummary || "-"} />
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

/** Stepper wizard - bulatan bernomor + garis penghubung yang terisi mengikuti
 * kemajuan, tanda centang utk langkah yang sudah dilewati, dan langkah yang
 * sudah dilewati BISA diketuk utk kembali langsung (skip-forward tetap tidak
 * boleh - harus lewat tombol Lanjut supaya validasi tiap langkah jalan).
 *
 * Catatan proporsi (versi sebelumnya terlihat "miring"/tidak rata):
 *   1. Bulatan langkah aktif dulu DIBESARKAN lewat width/height (24→28px).
 *      Karena tiap kolom menengahkan isinya secara vertikal, sumbu tengah
 *      kolom aktif jadi turun ~2px dibanding kolom lain - garis penghubung
 *      kiri/kanannya ikut bergeser, jadi rantainya patah/berundak. Sekarang
 *      ukuran kotak bulatan KONSTAN (26px) di dalam baris ber-tinggi tetap,
 *      penekanan langkah aktif dipindah ke `transform: scale` + cincin
 *      (box-shadow) yang keduanya TIDAK memakan ruang layout.
 *   2. Garis kiri/kanan tiap kolom dulu `margin: 0 3px` di kedua sisi,
 *      sehingga jarak bulatan→garis (3px) tidak sama dgn jarak antar dua
 *      potongan garis di batas kolom (6px). Sekarang tiap garis cuma diberi
 *      jarak di sisi yang menghadap bulatan, jadi sambungan antar kolom
 *      benar-benar menyatu jadi satu garis lurus.
 *   3. Label diberi lebar penuh + ellipsis (bukan `nowrap` yang bisa meluber
 *      keluar kolom), tinggi baris label dikunci supaya bobot font aktif
 *      (800) tidak menggeser apa pun. */
const STEP_DOT = 26;      // kotak bulatan - KONSTAN di semua state
const STEP_ROW_H = 32;    // tinggi baris bulatan+garis - dikunci supaya rata

function WizardStepper({ steps, current, onStepClick }) {
  return (
    <div style={{ marginTop: 14, display: "flex", alignItems: "flex-start" }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = done;
        const leftFilled = i > 0 && i <= current;
        const rightFilled = i < steps.length - 1 && i < current;
        return (
          <div key={label} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", width: "100%", height: STEP_ROW_H }}>
              <StepLine visible={i > 0} filled={leftFilled} side="left" />
              <button
                onClick={() => clickable && onStepClick(i)}
                disabled={!clickable}
                aria-label={label}
                aria-current={active ? "step" : undefined}
                style={{
                  width: STEP_DOT, height: STEP_DOT, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 0, border: "none",
                  cursor: clickable ? "pointer" : "default",
                  background: done || active ? BRAND : "#FFFFFF",
                  boxShadow: active
                    ? "0 0 0 4px rgba(237,28,36,0.14), 0 2px 6px rgba(237,28,36,0.28)"
                    : done ? "0 1px 3px rgba(237,28,36,0.18)" : "inset 0 0 0 1.5px #E4E5EA",
                  transform: active ? "scale(1.08)" : "scale(1)",
                  transition: "transform .22s cubic-bezier(.34,1.56,.64,1), background .2s, box-shadow .2s",
                }}>
                {done ? <Check size={13} color="#fff" strokeWidth={3.2} />
                      : <span style={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1, color: active ? "#fff" : "#C4C4CE", fontFamily: FF }}>{i + 1}</span>}
              </button>
              <StepLine visible={i < steps.length - 1} filled={rightFilled} side="right" />
            </div>
            <span style={{
              marginTop: 5, width: "100%", textAlign: "center", fontSize: 10.5, lineHeight: "14px",
              fontWeight: active ? 800 : 700, letterSpacing: 0.1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              color: active ? "#17181C" : done ? "#6B6B76" : "#B7B7C2", transition: "color .2s",
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
function StepLine({ visible, filled, side }) {
  return (
    <div style={{
      flex: 1, height: 2.5, borderRadius: 2, background: "#E9EAEE", position: "relative", overflow: "hidden",
      // hanya sisi yang menghadap bulatan yang diberi jarak - sisi yang
      // bertemu kolom sebelahnya rapat, jadi garisnya nyambung mulus.
      marginRight: side === "left" ? 6 : 0, marginLeft: side === "right" ? 6 : 0,
      visibility: visible ? "visible" : "hidden",
    }}>
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
/** Sama seperti SelectPills, tapi MULTI-SELECT dan opsinya dikelompokkan per
 * branch (dari `mcGroupsFromSites`) - begitu "Buat Untuk" mencakup lebih
 * dari satu branch, MC dari branch berbeda jadi gampang tercampur & susah
 * dicari kalau ditampilkan rata semua, PLUS tiap branch wajib punya minimal
 * satu MC terpilih (lihat validateStep di komponen induk) - jadi section
 * yang belum ada pilihannya ditandai merah di sini juga, bukan cuma lewat
 * satu pesan error umum di bawah. Kalau cuma satu branch (kasus paling
 * umum), header section & penanda per-branch disembunyikan supaya tidak
 * menambah tinggi tanpa guna. */
function GroupedSelectPills({ groups, selected, onToggle, placeholder }) {
  const total = (groups || []).reduce((s, g) => s + g.mcList.length, 0);
  if (total === 0) return <LockedField text={placeholder || "Tidak ada opsi"} muted />;
  if (groups.length <= 1) {
    const g = groups[0];
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {g.mcList.map((o) => <Chip key={o} active={selected.has(mcKey(g.branchId, o))} onClick={() => onToggle(g.branchId, o)} label={o} />)}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {groups.map((g) => {
        const branchSelectedCount = g.mcList.filter((o) => selected.has(mcKey(g.branchId, o))).length;
        const needsPick = g.mcList.length > 0 && branchSelectedCount === 0;
        return (
          <div key={g.branchId}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: needsPick ? "#DC2626" : "#B0B0BA", letterSpacing: 0.3, textTransform: "uppercase" }}>{g.branchName}</span>
              {needsPick && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#DC2626" }}>· pilih minimal 1</span>}
              {branchSelectedCount > 0 && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#B0B0BA" }}>· {branchSelectedCount} dipilih</span>}
            </div>
            {g.mcList.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "#C4C4CE" }}>Tidak ada MC di branch ini</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.mcList.map((o) => <Chip key={o} active={selected.has(mcKey(g.branchId, o))} onClick={() => onToggle(g.branchId, o)} label={o} />)}
              </div>
            )}
          </div>
        );
      })}
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

// Tag brand kecil - IM3 pakai kuning + teks hitam (identitas brand yg
// diminta), TRI tetap pink + teks putih. Warna & teks SELALU dipasangkan
// lewat dua map ini (bukan cuma warna) supaya kontrasnya benar di semua
// pemakaian (tag, dot, tombol brand di callout, chip kombinasi terpilih).
const ACT_BRAND_COLOR = { im3: "#F5CD46", tri: "#E23B86" };
const ACT_BRAND_TEXT = { im3: "#17181C", tri: "#FFFFFF" };
// Label tampilan brand - nilai DB tetap "tri" (jangan diubah, dipakai utk
// query/filter di banyak tempat), cuma teks yang ditampilkan ke pengguna
// yang jadi "3ID" (bukan "TRI").
const ACT_BRAND_LABEL = { im3: "IM3", tri: "3ID" };

/** "Buat Untuk" - ketuk branch → callout brand muncul PERSIS di bawahnya
 * (inline, ikut alur dokumen biasa - bukan popover melayang, supaya tidak
 * pernah menutupi atau kepotong elemen lain) → ketuk brand → kombinasi itu
 * langsung pindah ke daftar "Sudah dipilih" di bawah pemisah DAN callout-nya
 * langsung tertutup. Ketuk brand yang SAMA lagi (lewat buka ulang callout-nya
 * - ketuk chip branch-nya) → jadi TOGGLE, kombinasi itu dilepas lagi
 * (unselect). Mau nambah brand kedua utk branch yang sama (mis. IM3 & 3ID
 * sekaligus), ketuk lagi chip branch-nya - callout kebuka ulang, brand yang
 * sudah masuk kelihatan tercentang di situ. Callout HANYA SATU yang terbuka
 * di satu waktu.
 *
 * Daftar "Sudah dipilih" PURE INFORMASI, tidak ada checklist lagi - tiap
 * baris cuma menandai apakah branch×brand itu sudah ada BME/RGE-nya atau
 * belum (bukan sesuatu yang perlu dipilih ulang, karena pemilihannya sudah
 * selesai begitu kombinasinya ditambahkan). Kombinasi PERTAMA yang
 * ditambahkan jadi branch×brand utama (pemilik plan ini); kombinasi lain
 * cuma memperluas pilihan lokasi/site yang bisa dicari di langkah
 * berikutnya - makanya diberi label "Utama" supaya jelas bedanya. */
function ActingForSheet({ groups, loading, initialSelected, onClose, onConfirm }) {
  const [branchQ, setBranchQ] = useState("");
  const [expandedBranch, setExpandedBranch] = useState(null);
  // Kombinasi branch×brand yang sudah "masuk daftar", urut sesuai kapan
  // ditambahkan (bukan Set biasa) - urutan ini menentukan mana yang jadi
  // kombinasi utama (index 0).
  const [combos, setCombos] = useState(() => {
    const seen = new Set(); const list = [];
    for (const o of initialSelected || []) {
      if (!o.branch_name || !o.brand) continue;
      const key = `${o.branch_name}|||${o.brand}`;
      if (seen.has(key)) continue;
      seen.add(key); list.push({ branchName: o.branch_name, brand: o.brand });
    }
    return list;
  });

  // Kombinasi branch×brand yang belum punya BME/RGE SAMA SEKALI kini bisa
  // ikut dipilih - direpresentasikan sbg target "placeholder" (id
  // `empty:<branchId>:<brand>`, tanpa email/nama). Datanya tetap tersimpan
  // di branch×brand tsb (bme_user_id NULL di DB) & otomatis "diklaim" begitu
  // ada BME/RGE yang benar-benar di-assign & login ke situ - lihat migrasi
  // mh_rebind_email(). branch_id di sini WAJIB slug (g.branchSlug), bukan
  // uuid mh_branches.id - supaya bentuknya SAMA PERSIS dgn baris orang
  // sungguhan (dari mh_list_assignments) yg dikonsumsi effectiveScope/
  // fetchScopeSites di komponen induk (mh_sites.branch_id itu sendiri jg
  // pakai slug).
  const placeholders = useMemo(() => (groups || [])
    .filter((g) => g.people.length === 0)
    .map((g) => ({ id: `empty:${g.key}`, full_name: null, email: null, role: null, branch_id: g.branchSlug, branch_name: g.branchName, brand: g.brand })),
  [groups]);

  // Region → daftar nama branch unik, chip dikelompokkan per region
  // (memudahkan cari di antara 23 branch) + disaring teks pencarian.
  const branchNorm = branchQ.trim().toLowerCase();
  const regionGroups = useMemo(() => {
    const byRegion = new Map();
    for (const g of groups || []) {
      if (!byRegion.has(g.region)) byRegion.set(g.region, new Set());
      byRegion.get(g.region).add(g.branchName);
    }
    return Array.from(byRegion.entries())
      .map(([region, set]) => ({ region, branches: Array.from(set).sort() }))
      .sort((a, b) => (a.region || "").localeCompare(b.region || ""));
  }, [groups]);
  const visibleRegionGroups = regionGroups
    .map((r) => ({ ...r, branches: r.branches.filter((n) => !branchNorm || n.toLowerCase().includes(branchNorm)) }))
    .filter((r) => r.branches.length > 0);

  const comboKey = (branchName, brand) => `${branchName}|||${brand}`;
  const comboSet = useMemo(() => new Set(combos.map((c) => comboKey(c.branchName, c.brand))), [combos]);
  const brandsForBranch = (branchName) => Array.from(new Set((groups || []).filter((g) => g.branchName === branchName).map((g) => g.brand)));

  // Ketuk brand di callout: TOGGLE - belum ada di daftar → ditambahkan,
  // sudah ada → dilepas lagi (unselect). Callout LANGSUNG TERTUTUP setelah
  // ketukan (baik nambah maupun lepas) - mau ubah lagi utk branch yang sama,
  // ketuk lagi chip branch-nya (callout kebuka ulang, brand yg sudah masuk
  // kelihatan tercentang di sana).
  const toggleCombo = (branchName, brand) => {
    setCombos((prev) => comboSet.has(comboKey(branchName, brand))
      ? prev.filter((c) => !(c.branchName === branchName && c.brand === brand))
      : [...prev, { branchName, brand }]);
    setExpandedBranch(null);
  };
  const removeCombo = (branchName, brand) => setCombos((prev) => prev.filter((c) => !(c.branchName === branchName && c.brand === brand)));
  const clearCombos = () => setCombos([]);

  // Info per kombinasi (SUDAH ada BME/RGE atau belum) - urut persis sesuai
  // `combos`, satu-satunya sumber kebenaran, tidak ada seleksi terpisah lagi.
  const comboInfos = useMemo(() => combos.map((c, i) => {
    const g = (groups || []).find((gr) => gr.branchName === c.branchName && gr.brand === c.brand);
    return { ...c, isPrimary: i === 0, people: g?.people || [] };
  }), [combos, groups]);

  const confirm = () => {
    // Target akhir diturunkan LANGSUNG dari `combos` (bukan seleksi manual
    // lagi) - kombinasi dgn orang sungguhan ikut sertakan orangnya, kombinasi
    // kosong ikut sertakan placeholder-nya. Yang benar-benar tersimpan
    // sbg plan tetap cuma kombinasi PERTAMA (lihat catatan di save());
    // sisanya di komponen induk cuma dipakai memperluas pilihan lokasi.
    const targets = combos.flatMap((c) => {
      const g = (groups || []).find((gr) => gr.branchName === c.branchName && gr.brand === c.brand);
      if (!g) return [];
      if (g.people.length > 0) return g.people;
      const ph = placeholders.find((p) => p.id === `empty:${g.key}`);
      return ph ? [ph] : [];
    });
    onConfirm(targets);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "85vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "22px 22px 0 0", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px", flexShrink: 0 }} />
        <div style={{ padding: "10px 20px 4px", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Buat Untuk</div>
          <div style={{ fontSize: 11.5, color: "#8A8A96", marginTop: 2, lineHeight: 1.5 }}>
            Ketuk branch, lalu brand-nya - langsung masuk daftar di bawah. Kombinasi pertama jadi branch×brand utama plan ini.
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "4px 20px 12px", flex: 1 }}>
          {loading ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "#8A8A96", fontSize: 12.5 }}>Memuat…</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>Pilih branch &amp; brand</div>
                <div style={{ flex: 1 }} />
                {combos.length > 0 && (
                  <button onClick={clearCombos} style={{ background: "none", border: "none", cursor: "pointer", color: "#ED1C24", fontSize: 11, fontWeight: 800, fontFamily: FF, padding: 0 }}>
                    Bersihkan semua
                  </button>
                )}
              </div>
              <input value={branchQ} onChange={(e) => setBranchQ(e.target.value)} placeholder="Cari branch…"
                style={{ ...inputBase, height: 38, fontSize: 12.5, marginBottom: 8 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {visibleRegionGroups.length === 0 && (
                  <div style={{ fontSize: 12, color: "#B0B0BA", padding: "4px 2px" }}>Tidak ada branch yang cocok.</div>
                )}
                {visibleRegionGroups.map((r) => (
                  <div key={r.region || "-"}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: "#B0B0BA", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 5 }}>{r.region || "Lainnya"}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {r.branches.map((name) => {
                        const branchCombos = combos.filter((c) => c.branchName === name);
                        const isOpen = expandedBranch === name;
                        const hasCombos = branchCombos.length > 0;
                        return (
                          <button key={name} onClick={() => setExpandedBranch(isOpen ? null : name)}
                            style={{
                              display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer",
                              background: hasCombos ? "#17181C" : "#F6F7F9",
                              border: isOpen ? "1.5px solid #ED1C24" : `1px solid ${hasCombos ? "#17181C" : "#E9EAEE"}`,
                              color: hasCombos ? "#FFFFFF" : "#5A5A68",
                            }}>
                            {name}
                            {hasCombos && (
                              <span style={{ display: "inline-flex", gap: 3 }}>
                                {branchCombos.map((c) => (
                                  <span key={c.brand} style={{ width: 6, height: 6, borderRadius: 99, background: ACT_BRAND_COLOR[c.brand] || "#8A8A96", flexShrink: 0 }} />
                                ))}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Callout brand - inline, PERSIS di bawah cluster region yang
                        sedang berisi branch terbuka, mengikuti alur dokumen biasa
                        (bukan absolute/popover) supaya TIDAK PERNAH menutupi atau
                        kepotong elemen lain di sheet. Hanya satu yang terbuka. */}
                    {r.branches.includes(expandedBranch) && (
                      <div style={{ marginTop: 8, padding: 12, borderRadius: 12, background: "#FFF6F6", border: "1.5px solid #ED1C24" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#17181C" }}>Pilih brand · {expandedBranch}</div>
                          <button onClick={() => setExpandedBranch(null)} aria-label="Tutup"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8A96", display: "flex", padding: 2 }}>
                            <X size={14} />
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {brandsForBranch(expandedBranch).map((b) => {
                            const already = comboSet.has(comboKey(expandedBranch, b));
                            const bg = ACT_BRAND_COLOR[b] || "#8A8A96";
                            const fg = ACT_BRAND_TEXT[b] || "#FFFFFF";
                            return (
                              <button key={b} onClick={() => toggleCombo(expandedBranch, b)}
                                style={{
                                  flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer",
                                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6, letterSpacing: 0.3,
                                  background: already ? bg : "#FFFFFF", border: `1.5px solid ${bg}`, color: already ? fg : "#5A5A68",
                                }}>
                                {already && <Check size={12} color={fg} strokeWidth={3} />}
                                {ACT_BRAND_LABEL[b] || b.toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pemisah menuju daftar "Sudah dipilih" - garis + label di
                  tengah (pola pemisah standar, langsung kebaca sbg "di atas
                  = tempat MEMILIH, di bawah = HASIL yang sudah dipilih"),
                  cuma muncul begitu ada isinya supaya tidak menggantung
                  kosong sebelum pengguna mulai memilih apa pun. */}
              {combos.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 10px" }}>
                    <div style={{ flex: 1, height: 1, background: "#EDEDF0" }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#B0B0BA", letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      Sudah dipilih · {combos.length}
                    </span>
                    <div style={{ flex: 1, height: 1, background: "#EDEDF0" }} />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {comboInfos.map((c) => {
                      const hasOwner = c.people.length > 0;
                      const owner = c.people[0];
                      const extra = c.people.length - 1;
                      return (
                        <div key={comboKey(c.branchName, c.brand)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 10px 12px", borderRadius: 12,
                            background: hasOwner ? "rgba(21,128,61,0.05)" : "#FAFAFB",
                            border: `1px solid ${hasOwner ? "rgba(21,128,61,0.16)" : "#EFEFF2"}`,
                          }}>
                          <span style={{
                            flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, padding: "2px 6px", borderRadius: 5,
                            color: ACT_BRAND_TEXT[c.brand] || "#FFFFFF", background: ACT_BRAND_COLOR[c.brand] || "#8A8A96",
                          }}>
                            {ACT_BRAND_LABEL[c.brand] || c.brand.toUpperCase()}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.branchName}</span>
                              {c.isPrimary && (
                                <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, color: "#5A5A68", background: "#EEEEF1", padding: "1.5px 5px", borderRadius: 4 }}>UTAMA</span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                              {hasOwner ? <Check size={11} color="#15803D" strokeWidth={3} /> : <Building2 size={11} color="#B45309" />}
                              <span style={{ fontSize: 11, fontWeight: 700, color: hasOwner ? "#15803D" : "#B45309", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {hasOwner ? `${owner.full_name || owner.email}${extra > 0 ? ` +${extra} lainnya` : ""}` : "Belum ada BME/RGE - menunggu di-assign"}
                              </span>
                            </div>
                          </div>
                          <button onClick={() => removeCombo(c.branchName, c.brand)} aria-label={`Hapus ${c.branchName} ${c.brand}`}
                            style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", border: "none", background: "#F0F0F3", color: "#8A8A96", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #F0F0F3", flexShrink: 0 }}>
          <button onClick={confirm} disabled={combos.length === 0}
            style={{ width: "100%", height: 46, borderRadius: 12, border: "none", fontFamily: FF, fontSize: 14, fontWeight: 800, color: "#FFFFFF",
              background: combos.length === 0 ? "#D8D9E0" : BRAND, cursor: combos.length === 0 ? "not-allowed" : "pointer" }}>
            {combos.length === 0 ? "Pilih branch & brand dulu" : `Gunakan ${combos.length} kombinasi`}
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
