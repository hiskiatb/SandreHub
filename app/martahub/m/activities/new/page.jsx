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
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, Check, X, Plus, Loader2, Crosshair, Map as MapIcon, Users, CalendarDays, Building2, Tag, CardSim, Router as RouterIcon, AlertTriangle, Save, QrCode, Receipt, MapPin, Wifi, TrendingUp, Send, Trash2, MoreVertical } from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import { slug } from "../../../../../lib/activityTarget";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { fmtInt } from "../../_shared/activityUi";
import { isValidMsisdn, normalizeMsisdn } from "../../_shared/msisdn";
import MapPickerSheet from "../../_shared/MapPickerSheet";
import CalendarPickerSheet from "../../_shared/CalendarPickerSheet";
import DeleteActivitySheet from "../../_shared/DeleteActivitySheet";
import QrScanSheet from "../../_shared/QrScanSheet";
import OrgIdBar from "../../_shared/OrgIdBar";
import SiteTowerIcon from "../../_shared/SiteTowerIcon";
import SitePickerSheet from "../../_shared/SitePickerSheet";
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
  // Target SP/FWA SEKARANG dipilih dari master data produk
  // (mh_product_types, sama dgn dipakai di Catat Rencana Penjualan di
  // bawah & Isi Laporan) + qty per produk - BUKAN lagi angka target polos.
  // targetSp/targetFwa (jumlah unit) & targetSpRevenue/targetFwaRevenue
  // (estimasi Rupiah) diturunkan otomatis dari sini (lihat const di bawah),
  // supaya Estimasi Total Revenue & Cost Ratio ikut ter-update live setiap
  // qty produk/rebuy/budget cost berubah - tidak perlu tombol "hitung".
  const [targetSpProducts, setTargetSpProducts] = useState([]); // [{productTypeId,name,unitPrice,qty}]
  const [targetFwaProducts, setTargetFwaProducts] = useState([]);
  const [targetRebuyPulsa, setTargetRebuyPulsa] = useState("0");
  const [targetRebuyData, setTargetRebuyData] = useState("0");
  const [costEstimate, setCostEstimate] = useState("0");
  const targetSp = targetSpProducts.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  const targetFwa = targetFwaProducts.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  const targetSpRevenue = targetSpProducts.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.unitPrice) || 0), 0);
  const targetFwaRevenue = targetFwaProducts.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.unitPrice) || 0), 0);
  const targetRebuyTotal = (Number(targetRebuyPulsa) || 0) + (Number(targetRebuyData) || 0);
  const targetEstRevenue = targetSpRevenue + targetFwaRevenue + targetRebuyTotal;
  const targetCostRatio = targetEstRevenue > 0 ? ((Number(costEstimate) || 0) / targetEstRevenue) * 100 : null;

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
  const [tagBulkBusy, setTagBulkBusy] = useState({ sp: false, fwa: false }); // lagi proses paste-banyak-nomor
  const [salesEntriesLoaded, setSalesEntriesLoaded] = useState(false);

  useEffect(() => {
    if (loading) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: sp }, { data: fwa }, { data: profile }] = await Promise.all([
          supabaseMarta.from("mh_product_types").select("id,name,unit_price,brand").eq("category", "sp").eq("active", true).order("name"),
          supabaseMarta.from("mh_product_types").select("id,name,unit_price,brand").eq("category", "fwa").eq("active", true).order("name"),
          email ? supabaseMarta.from("mh_profiles").select("dsf_org_id").eq("email", email.toLowerCase()).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (!alive) return;
        // Produk yg PUNYA brand hanya boleh muncul utk plan brand itu sendiri
        // (mis. "SP 3GB 3ID" tidak boleh kepilih di plan brand IM3) - produk
        // tanpa brand (generik) tetap muncul di semua brand. Sebelumnya
        // query ini sama sekali tidak difilter brand.
        const planBrand = (effectiveScope.brand || "").toLowerCase();
        const byBrand = (t) => !t.brand || t.brand.toLowerCase() === planBrand;
        setTagTypes({ sp: (sp || []).filter(byBrand), fwa: (fwa || []).filter(byBrand) });
        if (profile?.dsf_org_id) setTagOwnOrgId(profile.dsf_org_id);
      } catch { /* best-effort - tagging opsional, jangan blokir wizard kalau gagal */ }
    })();
    return () => { alive = false; };
  }, [loading, email, effectiveScope.brand]);

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

  /** Tempel banyak nomor sekaligus (mis. paste list dari Excel/WhatsApp,
   * satu nomor per baris) - dipicu otomatis begitu isi clipboard yg
   * ditempel ke field Nomor SP/FWA ternyata lebih dari satu baris (lihat
   * onPaste di TagCategorySection), jadi user tidak perlu tempel-Tambah
   * satu-satu. Tiap baris dirapikan sendiri jadi "62xxx" (boleh diawali
   * "628xxx", "08xxx", ATAU "8xxx" polos - baris lain dgn format apapun
   * selain itu dilewati sbg tidak valid), lalu di-dedupe thd nomor yg
   * sudah ada di daftar MAUPUN sesama baris yg dtempel.
   *
   * Beda dgn addTagMsisdn (satu nomor): kalau ternyata sudah ditag event
   * lain, bulk mode TIDAK membuka TagConflictSheet per nomor (tidak
   * praktis utk banyak nomor sekaligus) - nomor itu cuma dilewati & ikut
   * dihitung di ringkasan hasil (lihat pesan akhir). */
  async function addTagMsisdnBulk(cat, rawText) {
    if (!tagActiveOrgId.trim()) { setTagFieldErr((e) => ({ ...e, [cat]: "Pilih ORG ID Aktif dulu sebelum tagging nomor." })); return; }
    const activeOrgId = tagActiveOrgId.trim();
    const typeId = tagTypes[cat]?.[0]?.id || null;
    const typeObj = tagTypes[cat]?.find((t) => t.id === typeId);

    const rawLines = rawText.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
    const seen = new Set([...tagEntries[cat].map((e) => e.msisdn), ...tagPending[cat].map((p) => p.msisdn)]);
    const toAdd = [];
    let invalidCount = 0;
    for (const line of rawLines) {
      // KHUSUS mode tempel-banyak: boleh diawali "0" (0812...) ATAU "8"
      // polos (812...) - dikonversi otomatis jadi "62..." di sini - beda
      // dgn addTagMsisdn (ketik satu-satu) yg tetap wajib diketik "62..."
      // sendiri (lihat catatan di _shared/msisdn.js). Ini supaya list yg
      // dicopy dari Excel/WhatsApp (biasanya "0812..." atau campur) bisa
      // langsung ditempel apa adanya tanpa dirapikan manual dulu.
      let digits = line.replace(/\D/g, "");
      if (digits.startsWith("0")) digits = "62" + digits.slice(1);
      else if (digits.startsWith("8")) digits = "62" + digits;
      const norm = normalizeMsisdn(digits);
      if (!isValidMsisdn(norm)) { invalidCount++; continue; }
      if (seen.has(norm)) continue; // duplikat (thd daftar lama ATAU sesama baris ditempel) - senyap dilewati
      seen.add(norm);
      toAdd.push(norm);
    }

    if (toAdd.length === 0) {
      setTagFieldErr((e) => ({ ...e, [cat]: invalidCount > 0 ? "Tidak ada nomor valid yang bisa ditambahkan dari teks yang ditempel." : "Semua nomor di daftar tempelan sudah ada." }));
      return;
    }
    setTagFieldErr((e) => ({ ...e, [cat]: null }));
    setTagBulkBusy((b) => ({ ...b, [cat]: true }));

    let added = 0, conflicted = 0;
    for (const msisdn of toAdd) {
      try {
        const { data: ownerRows } = await supabaseMarta.rpc("mh_dsf_check_msisdn_owner", { p_msisdn: msisdn });
        const owner = ownerRows && ownerRows.length > 0 ? ownerRows[0] : null;
        if (owner) { conflicted++; continue; }
      } catch { /* best-effort - kalau cek gagal, tetap lanjut tambahkan nomor ini */ }
      setTagEntries((prev) => ({ ...prev, [cat]: [...prev[cat], { msisdn, typeId, typeName: typeObj?.name, taggedAt: new Date().toISOString(), orgId: activeOrgId }] }));
      added++;
    }

    setTagBulkBusy((b) => ({ ...b, [cat]: false }));
    setTagInput((prev) => ({ ...prev, [cat]: "" }));
    const notes = [];
    if (conflicted > 0) notes.push(`${conflicted} sudah ditag di event lain`);
    if (invalidCount > 0) notes.push(`${invalidCount} format tidak valid`);
    setTagFieldErr((e) => ({ ...e, [cat]: `${added} nomor ditambahkan${notes.length ? ` · ${notes.join(", ")}` : ""}.` }));
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
    setTargetSpProducts(Array.isArray(a.target_sp_products) ? a.target_sp_products : []);
    setTargetFwaProducts(Array.isArray(a.target_fwa_products) ? a.target_fwa_products : []);
    setTargetRebuyPulsa(String(a.target_rebuy_pulsa ?? 0));
    setTargetRebuyData(String(a.target_rebuy_data ?? 0));
    setCostEstimate(String(a.cost_estimate ?? 0));
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

  // Lacak "ada perubahan yang belum disimpan sbg draft" - dipakai utk (1)
  // status tombol Simpan Draft (Simpan Draft → Menyimpan… → Draft
  // Tersimpan) & (2) gerbang konfirmasi saat DSF menekan tombol Kembali:
  // kalau BELUM ada perubahan sejak draft terakhir tersimpan (atau memang
  // belum ada isian sama sekali), Kembali langsung keluar tanpa nanya;
  // begitu ada perubahan yg blm tersimpan, Kembali WAJIB konfirmasi dulu
  // (Simpan Draft & Kembali / Buang Perubahan / Lanjut Mengisi) - lihat
  // handleBackClick(). `readyRef` memastikan efek ini TIDAK menandai dirty
  // saat data awal masih di-prefill (mode edit) - baseline "belum ada
  // perubahan" baru dihitung SETELAH prefill selesai.
  const readyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [savedActivityId, setSavedActivityId] = useState(null); // id plan baru begitu draft pertama tersimpan (belum ada di URL ?edit=)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Menu titik-3 header (cuma muncul mode Edit Plan - `editId` ada) → satu
  // aksi: Hapus Plan, lewat DeleteActivitySheet yg SAMA PERSIS dipakai di
  // daftar Aktivitas/quick-view (satu alur konfirmasi, bukan reimplementasi
  // terpisah di sini).
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const wizardGateReady = !(loading || dataLoading || editLoading || (editId && !stepResumed));
  useEffect(() => {
    if (!wizardGateReady) return;
    if (!readyRef.current) { readyRef.current = true; return; }
    setDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardGateReady, categories, eventName, dates, timesByDate, mcSelectedKey, targetSpProducts, targetFwaProducts, targetRebuyPulsa, targetRebuyData, costEstimate, primarySite, extraSites, poiType, network, area, address, manualLat, manualLng]);

  // Tinggi bar aksi bawah (Lanjut/Submit Plan) DIUKUR LANGSUNG - SAMA
  // polanya dgn action bar di halaman Laporan Actual/Detail Aktivitas.
  // Wizard ini sekarang hideNav (navbar bawah disembunyikan spy fokus penuh
  // ke pengisian, konsisten dgn Laporan Actual & Check In) & tombol Lanjut
  // dipindah dari "menempel di bawah konten step" jadi bar fixed nempel ke
  // tepi bawah layar sungguhan - supaya selalu terlihat & bisa ditekan
  // tanpa perlu scroll ke bawah dulu tiap step, terutama step Review yang
  // kontennya panjang. Harus dideklarasikan SEBELUM early return di bawah
  // ini (gate loading/scope) supaya urutan Hooks selalu konsisten antar
  // render - lihat error "change in the order of Hooks" kalau sebuah Hook
  // diletakkan setelah return kondisional.
  const actionBarRef = useRef(null);
  const [actionBarH, setActionBarH] = useState(90);
  useEffect(() => {
    const el = actionBarRef.current;
    if (!el) { setActionBarH(0); return; }
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (h != null) setActionBarH(Math.ceil(h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Mode edit: tunggu `stepResumed` juga - supaya wizard TIDAK PERNAH sempat
  // ter-render dulu di step 1 (default) sebelum "lompat" ke step yang benar,
  // yang sebelumnya kelihatan seperti kedipan/glitch. Sekali lolos gate ini,
  // wizard langsung tampil di step akhir yang benar dari awal.
  if (loading || dataLoading || editLoading || (editId && !stepResumed)) return <MobileShell active="activities" hideNav><ShellSpinner /></MobileShell>;

  if (!scope?.found) {
    return (
      <MobileShell active="activities" hideNav>
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#3A3A44" }}>Belum bisa membuat plan</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96" }}>Email Anda belum terdaftar sebagai BME/RGE di MartaHub.</div>
        </div>
      </MobileShell>
    );
  }

  const toggleCategory = (c) => setCategories((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

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
    if (i === 1) {
      // Target WAJIB diisi minimal SATU dari 4 (SP/FWA/Rebuy SP/Rebuy FWA) -
      // bukan malah boleh dikosongkan semua spt sebelumnya (plan tanpa
      // target apa pun tidak ada gunanya utk dievaluasi nanti).
      const hasAnyTarget = targetSp > 0 || targetFwa > 0 || Number(targetRebuyPulsa) > 0 || Number(targetRebuyData) > 0;
      if (!hasAnyTarget) bad.add("target");
      // Estimasi Budget Cost SEKARANG wajib diisi (bukan default 500rb yg
      // gampang kelewat tanpa disadari lalu ke-submit apa adanya) - DSF
      // harus benar2 mengisi angka sendiri, walau nol tetap tidak valid.
      if (!costEstimate || Number(costEstimate) <= 0) bad.add("costEstimate");
    }
    if (i === 2) {
      if (!primarySite) bad.add("site");
      if (!poiType) bad.add("poiType");
      // Titik GPS (lat/lng) SEKARANG WAJIB juga - bukan cuma alamat teks -
      // supaya lokasi event benar2 presisi (bukan cuma deskripsi alamat yg
      // bisa ambigu), diisi via "Lokasi Saya" (posisi HP saat itu) ATAU
      // "Pilih di Peta" (bisa digeser manual ke titik yg tepat/berbeda dari
      // posisi HP - itu jalur utk "longlat manual").
      if (manualLat == null || manualLng == null) bad.add("geo");
      if (!address.trim()) bad.add("address");
      if (!network) bad.add("network");
      if (!area) bad.add("area");
    }
    setInvalid(bad);
    // Field pertama yg tidak valid (urutan insert `bad.add(...)` di atas
    // SAMA PERSIS dgn urutan tampil di layar) di-scroll-in-view otomatis -
    // sebelumnya cuma ditandai merah tanpa auto-scroll, jadi kalau field yg
    // salah ada di bagian bawah/atas yg lagi tidak terlihat, DSF klik
    // "Lanjut" berkali2 tanpa tau apa yg kurang.
    if (bad.size > 0) {
      const firstKey = bad.values().next().value;
      requestAnimationFrame(() => {
        setTimeout(() => {
          document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 30);
      });
    }
    return bad.size === 0;
  }

  const goNext = () => { if (validateStep(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  // Keluar dari wizard (step 0, tombol Kembali di header) SEKARANG minta
  // konfirmasi dulu kalau masih ada perubahan yg belum tersimpan sbg draft
  // (`dirty`) - dulu langsung router.back() begitu saja, risiko isian yg
  // sudah susah payah diketik hilang tanpa peringatan. Kalau tidak ada
  // perubahan (baru buka / semua sudah tersimpan), Kembali tetap langsung
  // keluar tanpa basa-basi.
  const goBack = () => {
    if (step > 0) { setStep((s) => s - 1); return; }
    if (dirty) { setShowLeaveConfirm(true); return; }
    router.back();
  };

  // Draft WAJIB bisa disimpan kapan saja - dari step mana pun, asal SUDAH
  // ada minimal satu bagian yang diisi (bukan form kosong sama sekali).
  // Sengaja TIDAK memakai validateStep() di sini - itu utk syarat "siap
  // diajukan" (Ajukan Plan), sedangkan draft memang cuma tempat menyimpan
  // pekerjaan yang belum selesai.
  function hasAnyDraftContent() {
    return !!(
      eventName.trim() || categories.length > 0 || validDates.length > 0 || mcSelected.size > 0 ||
      targetSpProducts.length > 0 || targetFwaProducts.length > 0 || Number(targetRebuyPulsa) || Number(targetRebuyData) || Number(costEstimate) ||
      primarySite || extraSites.length > 0 || address.trim() ||
      tagEntries.sp.length > 0 || tagEntries.fwa.length > 0
    );
  }

  async function save(finalStatus, { andLeave = false } = {}) {
    // Validasi penuh hanya utk submit - draft boleh field lokasi kosong
    // (default ke pilihan pertama), sama seperti perilaku app Flutter.
    if (finalStatus === "plan_submitted") {
      // Ketiga step (Info/Target/Lokasi) SEKARANG divalidasi semua sebelum
      // submit final - sebelumnya step Target (index 1) kelewat dicek di
      // sini, jadi plan bisa lolos submit walau Target/Budget Cost belum
      // pernah diisi asal DSF langsung lompat dari Review. Dicek SATU-SATU
      // & BERHENTI di kegagalan pertama (bukan panggil ketiganya lalu ambil
      // hasil terakhir) - validateStep() men-setInvalid() utk step yg lagi
      // dicek, jadi kalau ketiganya dipanggil berturutan, `invalid` state
      // akhirnya cuma berisi hasil step TERAKHIR yg dicek, salah kalau yg
      // gagal duluan itu step SEBELUMNYA (badge merah jadi tidak nyambung
      // dgn step yg ditampilkan). validateStep() juga sudah otomatis
      // scroll ke field pertama yg salah di step-nya masing2.
      for (const s of [0, 1, 2]) {
        if (!validateStep(s)) {
          setErr("Lengkapi field yang wajib diisi sebelum submit plan.");
          setStep(s);
          return;
        }
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
        target_sp_products: targetSpProducts.filter((p) => Number(p.qty) > 0),
        target_fwa_products: targetFwaProducts.filter((p) => Number(p.qty) > 0),
        target_rebuy_pulsa: Number(targetRebuyPulsa) || 0,
        target_rebuy_data: Number(targetRebuyData) || 0,
        cost_estimate: Number(costEstimate) || 0,
        // Estimasi Total Revenue (sum qty×harga produk SP+FWA + rebuy) -
        // dihitung otomatis di sisi klien (lihat targetEstRevenue di atas)
        // & disimpan ke kolom `target_rev_3m` yg sebelumnya sama sekali
        // tidak pernah diisi form manapun, tapi sudah ditampilkan di semua
        // layar detail sbg "Revenue 3 Bulan"/"Estimasi Total Revenue".
        target_rev_3m: targetEstRevenue,
      };

      // Setelah draft PERTAMA tersimpan (plan baru, belum ada di URL
      // ?edit=), simpan id-nya di state lokal `savedActivityId` supaya
      // "Simpan Draft" berikutnya UPDATE baris yg sama (bukan INSERT baris
      // baru tiap ditekan) - TANPA mengubah URL/`editId` (yg akan memicu
      // ulang seluruh effect prefill mode-edit & bisa menimpa isian lokal
      // yg belum tersimpan).
      const targetId = editId || savedActivityId;
      let activityId = targetId;
      if (targetId) {
        // Update - brand/branch/pemilik TIDAK diubah (sama spt updatePlan()
        // Flutter). "Simpan Draft" TIDAK menyentuh status (biarkan apa
        // adanya, draft/revision_needed); "Ajukan Plan" set plan_submitted.
        const payload = { ...commonFields, updated_at: new Date().toISOString() };
        if (finalStatus === "plan_submitted") payload.status = "plan_submitted";
        const { error } = await supabaseMarta.from("mh_activities").update(payload).eq("id", targetId);
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
        if (!resolvedBranchId) throw new Error(`Branch "${effectiveScope.branchName || effectiveScope.branchId}" tidak ditemukan di master data Branch.`);
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

      // Log Aktivitas (menu User Management) - best-effort, JANGAN sampai
      // menggagalkan penyimpanan plan kalau logging-nya sendiri error.
      // Aksinya dibedakan create/update/submit spy jejaknya jelas: plan
      // baru dibuat, plan lama diedit, atau plan diajukan (status →
      // plan_submitted) - ketiganya kini WAJIB tercatat krn plan tidak lagi
      // lewat approval TMV yang otomatis meninggalkan jejak sendiri.
      try {
        const action = finalStatus === "plan_submitted" ? "activity_plan_submit" : targetId ? "activity_plan_update" : "activity_plan_create";
        await supabaseMarta.rpc("mh_activity_log_event", {
          p_activity_id: activityId, p_action: action,
          p_detail: `${eventName.trim() || "(tanpa nama)"} · ${finalStatus === "plan_submitted" ? "diajukan" : "draft disimpan"}`,
        });
      } catch { /* best-effort - jangan blokir penyimpanan plan */ }

      if (finalStatus === "plan_submitted") {
        // Submit final - SELALU keluar dari wizard, tidak ada alasan utk
        // tetap tinggal setelah plan resmi diajukan.
        router.replace(`/martahub/m/activities?open=${activityId}`);
      } else {
        // Simpan Draft - TETAP TINGGAL di wizard (sesuai masukan: DSF
        // sering menyimpan draft sambil masih lanjut mengisi bagian lain,
        // dulu setiap "Simpan Draft" otomatis melempar keluar ke daftar
        // Aktivitas, jadi harus buka ulang plan-nya lagi cuma utk
        // melanjutkan isi). `savedActivityId` dicatat supaya draft
        // berikutnya UPDATE baris yg sama, `draftSavedAt`/`dirty` di-reset
        // supaya tombol berubah jadi "Draft Tersimpan" & Kembali tidak lagi
        // minta konfirmasi (sampai ada perubahan baru lagi) - KECUALI
        // dipanggil dari alur "Simpan Draft & Kembali" (andLeave), yg
        // langsung keluar setelah tersimpan.
        setSavedActivityId(activityId);
        setDraftSavedAt(new Date().toISOString());
        setDirty(false);
        if (andLeave) router.back();
      }
    } catch (e) {
      setErr(e.message || "Gagal menyimpan plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileShell active="activities" hideNav>
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
            {/* Subjudul nama langkah (mis. "Info") SENGAJA dihapus - sudah
                kebaca jelas dari label di bawah stepper-nya sendiri, jadi
                menampilkannya dua kali di sini cuma bikin header lebih
                penuh tanpa nambah informasi. */}
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {editId ? "Edit Plan" : "Buat Plan Baru"}
            </div>
          </div>
          {/* "Simpan Draft" gantikan badge angka langkah "1/4" yg sebelumnya
              di sini - progres langkah sudah kebaca jelas dari WizardStepper
              di bawahnya, jadi badge itu cuma duplikat info tanpa nambah
              guna, sementara Simpan Draft lebih sering dibutuhkan & kelihatan
              dari step manapun tanpa scroll ke bawah dulu. */}
          {/* Label berubah sesuai status simpan (Simpan Draft → Menyimpan…
              → Draft Tersimpan), SAMA polanya dgn tombol draft di Laporan
              Actual - supaya DSF tahu PASTI draft-nya sudah benar-benar
              masuk, bukan cuma menebak dari tombol yang tidak berubah. */}
          <button onClick={() => save("draft")} disabled={saving}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", borderRadius: 10,
              border: `1.5px solid ${draftSavedAt && !dirty ? "#15803D" : "#E4E5EA"}`,
              background: draftSavedAt && !dirty ? "rgba(21,128,61,0.06)" : "#FFFFFF",
              color: draftSavedAt && !dirty ? "#15803D" : "#5A5A68", fontSize: 11.5, fontWeight: 700,
              fontFamily: FF, cursor: saving ? "default" : "pointer",
            }}>
            {saving ? <Loader2 size={13} style={{ animation: "mspin .85s linear infinite" }} /> : draftSavedAt && !dirty ? <Check size={13} /> : <Save size={13} />}
            {saving ? "Menyimpan…" : draftSavedAt && !dirty ? "Draft Tersimpan" : "Simpan Draft"}
          </button>

          {/* Menu titik-3 - CUMA muncul mode Edit Plan (plan sudah ada
              baris-nya di DB, jadi memang bisa dihapus). Plan yg belum
              pernah tersimpan sama sekali (wizard "Buat Plan Baru" murni)
              tidak dikasih tombol ini - tidak ada apa pun utk dihapus,
              cukup tekan Kembali (sudah ada konfirmasi buang perubahan
              sendiri). */}
          {editId && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button onClick={() => setHeaderMenuOpen((v) => !v)} aria-label="Menu lainnya"
                style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
                <MoreVertical size={16} />
              </button>
              {headerMenuOpen && (
                <>
                  <div onClick={() => setHeaderMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 24 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 25, minWidth: 168, background: "#FFFFFF", borderRadius: 13, border: "1px solid #ECEDF0", boxShadow: "0 8px 24px rgba(23,24,28,0.14)", overflow: "hidden" }}>
                    <button onClick={() => { setHeaderMenuOpen(false); setShowDeleteSheet(true); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", border: "none", background: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#DC2626", fontFamily: FF }}>
                      <Trash2 size={15} /> Hapus Plan
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <WizardStepper steps={STEPS} current={step} onStepClick={(i) => setStep(i)} />
      </div>

      {err && (
        <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>
      )}

      <div style={{ padding: "18px 20px 24px", paddingBottom: `calc(env(safe-area-inset-bottom,0px) + ${actionBarH + 24}px)` }}>
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
            targetSpProducts, setTargetSpProducts, targetFwaProducts, setTargetFwaProducts,
            spProductOptions: tagTypes.sp, fwaProductOptions: tagTypes.fwa,
            targetSp, targetFwa, targetSpRevenue, targetFwaRevenue, targetRebuyTotal, targetEstRevenue, targetCostRatio,
            targetRebuyPulsa, setTargetRebuyPulsa, targetRebuyData, setTargetRebuyData, costEstimate, setCostEstimate,
            tagOwnOrgId, tagActiveOrgId, setTagActiveOrgId, tagInput, setTagInput, tagFieldErr, tagEntries, tagPending, addTagMsisdn, addTagMsisdnBulk, tagBulkBusy, removeTagEntry,
            tagConflict, setTagConflict, confirmTagConflict, ownLabel: scope?.fullName, invalid,
          }} />
        )}
        {step === 2 && (
          <StepLocation {...{
            hasMc: mcSelected.size > 0, sitesInMc, primarySite, setPrimarySite, extraSites, setExtraSites,
            poiType, setPoiType, poiTypes, network, setNetwork, area, setArea,
            address, setAddress, manualLat, manualLng, setManualLat, setManualLng, invalid,
          }} />
        )}
        {step === 3 && (
          <StepReview {...{
            categories, eventName, dates: validDates, timesByDate,
            mcSummary: Array.from(mcSelected).map((k) => k.split("::")[1]).join(", "),
            targetSpProducts, targetFwaProducts, targetSp, targetFwa, targetSpRevenue, targetFwaRevenue,
            targetRebuyPulsa, targetRebuyData, costEstimate, targetEstRevenue, targetCostRatio,
            primarySite, extraSites, poiType, network, area, address, manualLat, manualLng,
          }} />
        )}

      </div>

      {/* Tombol Lanjut/Submit Plan - SEKARANG bar fixed nempel ke tepi bawah
          layar sungguhan (bukan lagi menempel di bawah konten step),
          persis polanya dgn Laporan Actual/Detail Aktivitas - selalu
          terlihat & bisa ditekan dari mana pun posisi scroll-nya, terutama
          berguna di step Review yang kontennya panjang. "Simpan Draft"
          tetap di header kanan atas (aksi sekunder, terpisah dari alur
          linear Lanjut/Submit ini). */}
      <div ref={actionBarRef} style={{
        position: "fixed", left: 0, right: 0, bottom: "env(safe-area-inset-bottom,0px)", zIndex: 45,
        background: "rgba(244,245,247,0.92)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 -4px 16px rgba(23,24,28,0.05)",
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 20px 14px" }}>
          {step === 3 ? (
            <button onClick={() => save("plan_submitted")} disabled={saving}
              style={{ width: "100%", height: 52, borderRadius: 14, border: "none", background: BRAND, color: "#fff", fontSize: 14.5, fontWeight: 800, fontFamily: FF, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 14px rgba(17,17,20,0.11)" }}>
              {saving ? <Loader2 size={17} style={{ animation: "mspin .85s linear infinite" }} /> : <><Send size={17} /> Submit Plan</>}
            </button>
          ) : (
            <button onClick={goNext} disabled={saving}
              style={{ width: "100%", height: 52, borderRadius: 14, border: "none", background: BRAND, color: "#fff", fontSize: 14.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 14px rgba(17,17,20,0.11)" }}>
              Lanjut <ArrowRight size={17} />
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

      {showLeaveConfirm && (
        <LeaveConfirmSheet
          saving={saving}
          onCancel={() => setShowLeaveConfirm(false)}
          onDiscard={() => { setShowLeaveConfirm(false); router.back(); }}
          onSaveAndLeave={() => { setShowLeaveConfirm(false); save("draft", { andLeave: true }); }}
        />
      )}

      {showDeleteSheet && (
        <DeleteActivitySheet
          activityId={editId}
          activityName={eventName}
          onClose={() => setShowDeleteSheet(false)}
          onDeleted={() => router.replace("/martahub/m/activities")}
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
          <FieldLabel id="field-actingFor" text="Buat Untuk" required hint={actingForLoading ? "Memuat…" : "Orang atau branch·brand"} />
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

      <FieldLabel id="field-categories" text="Activity Category" required hint="Bisa lebih dari satu" top={isApprover} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {CATEGORIES.map((c) => {
          const active = categories.includes(c);
          return (
            <Chip key={c} active={active} onClick={() => toggleCategory(c)} label={c} />
          );
        })}
      </div>
      {invalid.has("categories") && <FieldError text="Pilih minimal satu kategori" />}

      <FieldLabel id="field-eventName" text="Event Name" required top />
      <TextInput value={eventName} onChange={setEventName} placeholder="Contoh: Open Booth FWA" error={invalid.has("eventName")} />
      {invalid.has("eventName") && <FieldError text="Nama event wajib diisi" />}

      <FieldLabel id="field-planDate" text="Plan Date & Waktu" required top hint="Ketuk utk atur - wajib per tanggal" />

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

      <FieldLabel id="field-mc" text="Micro Cluster" required top hint={mcGroups.length > 1 ? "Bisa lebih dari satu - wajib min. 1 per branch" : "Bisa lebih dari satu"} />
      <GroupedSelectPills groups={mcGroups} selected={mcSelected} onToggle={toggleMc} placeholder="Tidak ada MC di scope Anda" />
      {invalid.has("mc") && <FieldError text={mcGroups.length > 1 ? "Pilih minimal satu MC dari SETIAP branch" : "Micro cluster wajib dipilih"} />}
    </Card>
  );
}

// ═════════════════════════════════ Step 2 ═════════════════════════════════
function StepTarget({
  targetSpProducts, setTargetSpProducts, targetFwaProducts, setTargetFwaProducts, spProductOptions, fwaProductOptions,
  targetSp, targetFwa, targetSpRevenue, targetFwaRevenue, targetRebuyTotal, targetEstRevenue, targetCostRatio,
  targetRebuyPulsa, setTargetRebuyPulsa, targetRebuyData, setTargetRebuyData, costEstimate, setCostEstimate,
  tagOwnOrgId, tagActiveOrgId, setTagActiveOrgId, tagInput, setTagInput, tagFieldErr, tagEntries, tagPending, addTagMsisdn, addTagMsisdnBulk, tagBulkBusy, removeTagEntry,
  tagConflict, setTagConflict, confirmTagConflict, ownLabel, invalid,
}) {
  const taggedTotal = tagEntries.sp.length + tagEntries.fwa.length;

  function qtyOf(list, id) {
    const found = list.find((p) => p.productTypeId === id);
    return found ? String(found.qty) : "";
  }
  function setQty(setList, product, raw) {
    const digits = raw.replace(/\D/g, "");
    setList((prev) => {
      if (!digits || Number(digits) === 0) return prev.filter((p) => p.productTypeId !== product.id);
      const entry = { productTypeId: product.id, name: product.name, unitPrice: product.unit_price, qty: Number(digits) };
      const exists = prev.some((p) => p.productTypeId === product.id);
      return exists ? prev.map((p) => (p.productTypeId === product.id ? entry : p)) : [...prev, entry];
    });
  }

  return (
    <>
      {/* Kartu Target (SP/FWA/Rebuy) dipisah dari kartu Estimasi Budget Cost
          di bawahnya - dulu satu kartu panjang, sekarang dua kartu terpisah
          spy masing2 punya identitas & status validasi sendiri (Target
          minimal SATU dari 4 wajib diisi; Budget Cost wajib diisi terpisah
          - dua syarat yg beda, jangan terasa jadi satu form yg sama). */}
      <Card style={invalid?.has("target") ? { border: "1.5px solid #F3C6C6" } : undefined}>
        <FieldLabel id="field-target" text="Target" required hint="Minimal 1 dari 4 wajib diisi" />
        <ProductTargetGroup
          icon={CardSim} accent="#ED1C24" label="Target Penjualan SP"
          products={spProductOptions}
          getQty={(id) => qtyOf(targetSpProducts, id)}
          onQtyChange={(product, val) => setQty(setTargetSpProducts, product, val)}
          totalUnit={targetSp} totalRevenue={targetSpRevenue}
        />
        <div style={{ height: 1, background: "#F0F0F3", margin: "16px 0" }} />
        <ProductTargetGroup
          icon={RouterIcon} accent="#C6168D" label="Target Penjualan FWA"
          products={fwaProductOptions}
          getQty={(id) => qtyOf(targetFwaProducts, id)}
          onQtyChange={(product, val) => setQty(setTargetFwaProducts, product, val)}
          totalUnit={targetFwa} totalRevenue={targetFwaRevenue}
        />

        <div style={{ height: 1, background: "#F0F0F3", margin: "16px 0" }} />
        {/* Rebuy TETAP pakai amount langsung (bukan produk×qty) - sesuai
            permintaan, rebuy tidak dipecah per jenis produk - tapi headernya
            (ikon bulat + label) disamakan gayanya dgn Target Penjualan
            SP/FWA di atas supaya satu kartu ini terasa konsisten. */}
        <AmountTargetGroup icon={CardSim} accent="#B45309" label="Target Rebuy SP" value={targetRebuyPulsa} onChange={setTargetRebuyPulsa} />
        <div style={{ marginTop: 14 }}>
          <AmountTargetGroup icon={RouterIcon} accent="#0D9488" label="Target Rebuy FWA" value={targetRebuyData} onChange={setTargetRebuyData} />
        </div>
        {invalid?.has("target") && <FieldError text="Isi minimal satu target (SP, FWA, Rebuy SP, atau Rebuy FWA) - tidak boleh kosong semua." />}
      </Card>

      <Card id="field-costEstimate" style={{ marginTop: 12, ...(invalid?.has("costEstimate") ? { border: "1.5px solid #F3C6C6" } : {}) }}>
        <AmountTargetGroup icon={Receipt} accent="#7C3AED" label="Estimasi Budget Cost" value={costEstimate} onChange={setCostEstimate} required />
        {invalid?.has("costEstimate") && <FieldError text="Estimasi Budget Cost wajib diisi." />}
      </Card>

      {/* Estimasi Total Revenue & Cost Ratio - auto-generate, update LIVE
          setiap qty produk/rebuy/budget cost di atas berubah, tidak perlu
          tombol hitung terpisah. */}
      <TargetSummaryCard
        spRevenue={targetSpRevenue} fwaRevenue={targetFwaRevenue} rebuyTotal={targetRebuyTotal}
        estRevenue={targetEstRevenue} costEstimate={Number(costEstimate) || 0} costRatio={targetCostRatio}
      />

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
                <span style={{ fontSize: 13.5, fontWeight: 800, color: "#fff" }}>Catat Rencana Penjualan SP & FWA</span>
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

          <TagCategorySection cat="sp" label="Nomor SP" accent="#ED1C24"
            input={tagInput.sp} onInputChange={(v) => setTagInput((p) => ({ ...p, sp: v }))}
            onAdd={() => addTagMsisdn("sp", tagInput.sp)}
            onBulkAdd={(text) => addTagMsisdnBulk("sp", text)} busy={tagBulkBusy.sp}
            onScanResult={(msisdn) => addTagMsisdn("sp", msisdn)}
            entries={tagEntries.sp} onRemove={(m) => removeTagEntry("sp", m)}
            pending={tagPending.sp} error={tagFieldErr.sp} />
          <TagCategorySection cat="fwa" label="Nomor FWA" accent="#C6168D"
            input={tagInput.fwa} onInputChange={(v) => setTagInput((p) => ({ ...p, fwa: v }))}
            onAdd={() => addTagMsisdn("fwa", tagInput.fwa)}
            onBulkAdd={(text) => addTagMsisdnBulk("fwa", text)} busy={tagBulkBusy.fwa}
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

/** Satu blok produk (SP atau FWA) di kartu Target - daftar produk dari
 * master data (mh_product_types) apa adanya, tiap baris punya qty input
 * sendiri (kosong/0 = tidak ditarget). Subtotal per produk & total
 * unit+revenue kelompok ditampilkan live begitu qty diketik - tidak perlu
 * tombol "Tambah" terpisah spt di Catat Rencana Penjualan di bawahnya,
 * karena di sini cuma set qty per produk yg SUDAH ada di master data
 * (bukan mencatat MSISDN individual). */
function ProductTargetGroup({ icon: Icon, accent, label, products, getQty, onQtyChange, totalUnit, totalRevenue }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: `${accent}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={13} color={accent} />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{label}</span>
        </div>
        {totalUnit > 0 && (
          <span style={{ fontSize: 10.5, fontWeight: 800, color: accent, background: `${accent}14`, borderRadius: 999, padding: "3px 9px" }}>{totalUnit} unit</span>
        )}
      </div>

      {(!products || products.length === 0) ? (
        <div style={{ marginTop: 10, fontSize: 11.5, color: "#B0B0BA", fontStyle: "italic" }}>Belum ada produk aktif di master data.</div>
      ) : (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {products.map((product) => {
            const qty = getQty(product.id);
            const subtotal = (Number(qty) || 0) * (Number(product.unit_price) || 0);
            return (
              <div key={product.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 12, background: "#F6F7F9", border: "1px solid #ECEDF0" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</div>
                  <div style={{ marginTop: 2, fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>
                    Rp {Number(product.unit_price).toLocaleString("id-ID")}/unit
                    {Number(qty) > 0 && <span style={{ color: accent, fontWeight: 800 }}> · Rp {subtotal.toLocaleString("id-ID")}</span>}
                  </div>
                </div>
                <div style={{ width: 78, flexShrink: 0 }}>
                  <input value={qty} onChange={(e) => onQtyChange(product, e.target.value)} inputMode="numeric" placeholder="0"
                    style={{ width: "100%", height: 38, borderRadius: 10, background: "#FFFFFF", border: "1.5px solid #ECEDF0", textAlign: "center", fontSize: 13.5, fontWeight: 800, fontFamily: FF, color: "#17181C", outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalUnit > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: "#5A5A68" }}>
          Total {totalUnit} unit · Estimasi Rp {totalRevenue.toLocaleString("id-ID")}
        </div>
      )}
    </div>
  );
}

/** Satu field amount (Rebuy SP/FWA, Budget Cost) dgn header ikon bulat +
 * label - gaya SAMA PERSIS dgn header ProductTargetGroup (Target Penjualan
 * SP/FWA) di atas, supaya seluruh kartu Target kelihatan konsisten walau
 * field ini cuma satu angka Rupiah langsung (bukan qty×produk). */
function AmountTargetGroup({ icon: Icon, accent, label, value, onChange, required }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: `${accent}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={13} color={accent} />
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{label}</span>
        {required && <span style={{ color: "#ED1C24", fontWeight: 800, marginLeft: 1 }}>*</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <NumberInput value={value} onChange={onChange} prefix="Rp" />
      </div>
    </div>
  );
}

/** Kartu ringkasan Estimasi Total Revenue + Cost Ratio - SELALU auto
 * generate dari state di StepTarget (produk SP/FWA×qty, rebuy amount,
 * budget cost), jadi tidak pernah "basi"/perlu disegarkan manual begitu
 * salah satu inputnya berubah. Cost Ratio = Budget Cost ÷ Estimasi Total
 * Revenue - dibiarkan "-" (bukan 0% atau error) kalau revenue-nya masih 0
 * supaya tidak menyesatkan (pembagian oleh nol). */
function TargetSummaryCard({ spRevenue, fwaRevenue, rebuyTotal, estRevenue, costEstimate, costRatio }) {
  const ratioColor = costRatio == null ? "#8A8A96" : costRatio <= 30 ? "#22A85E" : costRatio <= 60 ? "#B45309" : "#DC2626";
  return (
    <div style={{ marginTop: 14, borderRadius: 18, overflow: "hidden", border: "1px solid #E4E5EA", background: "linear-gradient(160deg,#17181C,#2A2B33)", padding: "16px 16px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Tag size={13} color="#F5A3CB" />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>Ringkasan Estimasi</span>
      </div>

      <div style={{ marginTop: 10, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>Estimasi Total Revenue</div>
          <div style={{ marginTop: 3, fontSize: 21, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>Rp {estRevenue.toLocaleString("id-ID")}</div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>Cost Ratio</div>
          <div style={{ marginTop: 3, fontSize: 17, fontWeight: 800, color: ratioColor }}>{costRatio == null ? "-" : `${costRatio.toFixed(1)}%`}</div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
        <SummaryMini label="SP" value={spRevenue} />
        <SummaryMini label="FWA" value={fwaRevenue} />
        <SummaryMini label="Rebuy" value={rebuyTotal} />
      </div>
    </div>
  );
}

function SummaryMini({ label, value }) {
  return (
    <div style={{ borderRadius: 11, background: "rgba(255,255,255,0.08)", padding: "8px 9px", minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 12, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Rp {Number(value).toLocaleString("id-ID")}</div>
    </div>
  );
}

/** Satu kelompok (SP atau FWA) di dalam kartu Catat Penjualan - input MSISDN +
 * tombol tambah, lalu nomor yang sudah ditag ditampilkan sbg chip mungil yg
 * bisa dilepas satu-satu (bukan kartu besar spt di Isi Laporan - di sini
 * cuma satu dari beberapa field di step yg sama, jadi dipadatkan). */
function TagCategorySection({ cat, label, accent, input, onInputChange, onAdd, onBulkAdd, busy, onScanResult, entries, onRemove, pending, error }) {
  const Icon = cat === "sp" ? CardSim : RouterIcon;
  const [scanning, setScanning] = useState(false);
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: `${accent}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={12} color={accent} />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: "#3A3A44" }}>{label}</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#C6168D", background: "rgba(198,22,141,0.08)", padding: "2px 8px", borderRadius: 999 }}>{entries.length} nomor</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {/* Bisa TEMPEL banyak nomor sekaligus (satu nomor per baris, mis.
            hasil copy dari Excel/WhatsApp) - begitu isi clipboard ternyata
            lebih dari satu baris/dipisah koma, langsung diproses jadi
            banyak entri sekaligus (onBulkAdd) alih-alih ditaruh apa adanya
            di field ketik satu-nomor ini. Paste SATU nomor saja tetap jalan
            spt biasa (masuk ke field, ditambah lewat Enter/tombol +). */}
        {/* Cuma terima ANGKA saat diketik manual satu-satu - MSISDN tidak
            pernah punya huruf/simbol, jadi karakter non-digit langsung
            disaring di sini (bukan baru divalidasi/ditolak setelah tombol +
            ditekan). Tempel BANYAK baris (onPaste di bawah) TETAP dibiarkan
            lewat mentah dulu ke onBulkAdd - itu jalur terpisah yg parsing &
            validasi tiap nomornya sendiri, bukan field ketik ini. */}
        <input value={input} onChange={(e) => onInputChange(e.target.value.replace(/\D/g, ""))} inputMode="numeric" pattern="[0-9]*"
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[\n,;]/.test(text) && onBulkAdd) { e.preventDefault(); onBulkAdd(text); }
          }}
          placeholder="Contoh: 628123456789 (bisa tempel banyak baris)"
          disabled={busy}
          style={{ flex: 1, minWidth: 0, height: 44, padding: "0 13px", borderRadius: 11, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 13, fontFamily: FF, color: "#17181C", outline: "none", boxSizing: "border-box" }} />
        {/* Scan QR kartu SIM - SAMA PERSIS dgn Isi Laporan (_shared/QrScanSheet,
            jsQR lintas browser) supaya reservasi nomor prospek sebelum event
            juga bisa lewat scan, bukan cuma ketik manual. */}
        <button onClick={() => setScanning(true)} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 11, background: `${accent}14`, border: `1.5px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: accent }}>
          <QrCode size={17} />
        </button>
        <button onClick={onAdd} disabled={busy} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 11, background: "linear-gradient(135deg,#ED1C24,#C6168D)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? <Loader2 size={17} color="#fff" style={{ animation: "mspin .85s linear infinite" }} /> : <Plus size={17} color="#fff" />}
        </button>
      </div>
      {busy && <div style={{ marginTop: 6, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>Menambahkan nomor…</div>}
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
function StepLocation({ hasMc, sitesInMc, primarySite, setPrimarySite, extraSites, setExtraSites, poiType, setPoiType, poiTypes, network, setNetwork, area, setArea, address, setAddress, manualLat, manualLng, setManualLat, setManualLng, invalid }) {
  const [picking, setPicking] = useState(null); // 'primary' | 'extra' | null
  const [mapPicking, setMapPicking] = useState(false);
  const taken = new Set([primarySite?.site_id, ...extraSites.map((s) => s.site_id)].filter(Boolean));
  const available = sitesInMc.filter((s) => !taken.has(s.site_id));

  return (
    <>
      <Card>
        <FieldLabel id="field-site" text="Site" required hint={`${(primarySite ? 1 : 0) + extraSites.length} dipilih`} />
        {!hasMc ? (
          <LockedField text="Pilih micro cluster dulu di step 1" muted />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {primarySite ? (
              <SiteRow badge="Site 1" badgeColor="#EC008C" label={`${primarySite.site_id}${primarySite.site_name ? ` · ${primarySite.site_name}` : ""}`}
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

        <FieldLabel id="field-poiType" text="POI Type" required top />
        <SelectPills options={poiTypes} value={poiType} onChange={setPoiType} error={invalid.has("poiType")} />

        <FieldLabel id="field-network" text="Network Category" required top />
        <SegmentedControl options={NETWORK_OPTIONS} value={network} onChange={setNetwork} error={invalid.has("network")} />
        {invalid.has("network") && <FieldError text="Network Category wajib dipilih" />}

        <FieldLabel id="field-area" text="Area Potential" required top />
        <SegmentedControl options={AREA_OPTIONS} value={area} onChange={setArea} error={invalid.has("area")} />
        {invalid.has("area") && <FieldError text="Area Potential wajib dipilih" />}
      </Card>

      <Card style={{ marginTop: 12 }}>
        {/* Titik GPS WAJIB juga (bukan cuma Alamat teks) - lokasi event
            harus presisi, bukan cuma deskripsi alamat yg bisa ambigu.
            "Lokasi Saya" DIGABUNG ke dalam "Pilih di Peta" (bukan dua
            tombol terpisah lagi) - begitu sheet peta dibuka, ada tombol
            crosshair di situ yg langsung lompat ke posisi HP DSF saat itu,
            DAN peta-nya sendiri bisa digeser manual kalau titiknya beda dari
            posisi HP - satu pintu masuk utk dua cara pengisian. */}
        <FieldLabel id="field-geo" text="Lokasi Acara" required hint="Titik GPS presisi - bantu isi Alamat otomatis" />
        <button onClick={() => setMapPicking(true)}
          style={{ width: "100%", height: 46, borderRadius: 12, border: `1.5px solid ${manualLat ? "#15803D" : invalid.has("geo") ? "#F3C6C6" : "#ECEDF0"}`, background: manualLat ? "rgba(21,128,61,0.06)" : "#F6F7F9", color: manualLat ? "#15803D" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          {manualLat ? <Check size={15} /> : <MapIcon size={15} />} {manualLat ? "Titik Sudah Ditandai" : "Pilih di Peta"}
        </button>
        {manualLat != null ? (
          <div style={{ marginTop: 8, fontSize: 11, color: "#8A8A96", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            Titik ditandai · {manualLat.toFixed(5)}, {manualLng.toFixed(5)}
          </div>
        ) : invalid.has("geo") && (
          <FieldError text="Titik GPS wajib diisi - tap Lokasi Saya, atau Pilih di Peta kalau mau menandai titik manual." />
        )}
        <FieldLabel id="field-address" text="Alamat" required top hint="Boleh diedit manual" />
        <TextInput value={address} onChange={setAddress} placeholder="Alamat lengkap lokasi kegiatan" multiline error={invalid.has("address")} />
        {invalid.has("address") && <FieldError text="Alamat wajib diisi - pakai Lokasi Saya/Pilih di Peta utk auto-isi, atau ketik manual." />}
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
    <>
      <ReviewSection icon={CalendarDays} accent="#2563EB" title="Informasi Plan">
        <ReviewRow k="Kategori" v={p.categories.join(", ") || "-"} />
        <ReviewRow k="Event Name" v={p.eventName || "-"} />
        <ReviewRow k="Plan Date" v={planDateSummary} />
        {p.dates.length <= 1 ? (
          <ReviewRow k="Waktu" v={(() => { const t = p.timesByDate?.[p.dates[0]]; return !t || t.isAllDay ? "Seharian" : `${t.startTime} – ${t.endTime}`; })()} />
        ) : (
          <div style={{ marginTop: 4, marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8A8A96", margin: "6px 0" }}>Waktu per Tanggal</div>
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
        <ReviewRow k="Micro Cluster" v={p.mcSummary || "-"} last />
      </ReviewSection>

      <ReviewSection icon={Tag} accent="#C6168D" title="Target & Estimasi">
        <ReviewRow icon={CardSim} k="Target SP" v={`${fmtInt(p.targetSp)} unit · Rp ${fmtInt(p.targetSpRevenue)}`} />
        <ReviewRow icon={RouterIcon} k="Target FWA" v={`${fmtInt(p.targetFwa)} unit · Rp ${fmtInt(p.targetFwaRevenue)}`} />
        <ReviewRow icon={CardSim} k="Rebuy SP" v={`Rp ${fmtInt(p.targetRebuyPulsa)}`} />
        <ReviewRow icon={RouterIcon} k="Rebuy FWA" v={`Rp ${fmtInt(p.targetRebuyData)}`} />
        <ReviewRow icon={Receipt} k="Budget Cost" v={`Rp ${fmtInt(p.costEstimate)}`} last />

        {/* Ringkasan estimasi ditonjolkan - gaya SAMA dgn TargetSummaryCard
            di step Target, supaya angka paling penting (yg dipakai utk
            keputusan Ajukan Plan) langsung kelihatan tanpa harus baca satu-
            satu baris di atas. */}
        <div style={{ marginTop: 12, borderRadius: 14, background: "linear-gradient(160deg,#17181C,#2A2B33)", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 9, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <TrendingUp size={13} color="#F5A3CB" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Estimasi Total Revenue</div>
              <div style={{ marginTop: 2, fontSize: 15, fontWeight: 800, color: "#fff" }}>Rp {fmtInt(p.targetEstRevenue)}</div>
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Cost Ratio</div>
            <div style={{ marginTop: 2, fontSize: 15, fontWeight: 800, color: p.targetCostRatio == null ? "#fff" : p.targetCostRatio <= 30 ? "#4ADE80" : p.targetCostRatio <= 60 ? "#FBBF24" : "#F87171" }}>
              {p.targetCostRatio == null ? "-" : `${p.targetCostRatio.toFixed(1)}%`}
            </div>
          </div>
        </div>
      </ReviewSection>

      <ReviewSection icon={MapPin} accent="#7C3AED" title="Lokasi">
        <ReviewRow icon={SiteTowerIcon} k="Site Utama" v={p.primarySite ? p.primarySite.site_id : "-"} />
        {p.extraSites.length > 0 && <ReviewRow icon={SiteTowerIcon} k="Site Tambahan" v={p.extraSites.map((s) => s.site_id).join(", ")} />}
        <ReviewRow icon={Building2} k="POI Type" v={p.poiType || "-"} />
        <ReviewRow icon={Wifi} k="Network" v={p.network || "-"} />
        <ReviewRow icon={TrendingUp} k="Area Potential" v={p.area || "-"} />
        <ReviewRow icon={MapPin} k="Alamat" v={p.address || "-"} />
        <ReviewRow icon={Crosshair} k="Titik GPS" v={p.manualLat ? `${p.manualLat.toFixed(5)}, ${p.manualLng.toFixed(5)}` : "-"} last />
      </ReviewSection>
    </>
  );
}

/** Satu kartu section di halaman Review - header ikon bulat berwarna + judul
 * (gaya SAMA dgn SectionCard di halaman Detail Aktivitas), supaya Review
 * kelihatan terstruktur per kelompok info (Informasi Plan/Target &
 * Estimasi/Lokasi) alih-alih satu daftar rata panjang tanpa pembeda spt
 * sebelumnya. */
function ReviewSection({ icon: Icon, accent, title, children }) {
  return (
    <div style={{ borderRadius: 18, background: "#FFFFFF", border: "1px solid #EFEFF2", boxShadow: "0 2px 10px rgba(23,24,28,0.04)", padding: "14px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 9, background: `${accent}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={14} color={accent} />
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

// ═══════════════════════════════ Primitives ════════════════════════════════
const inputBase = { width: "100%", height: 48, padding: "0 14px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 14, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };

function Card({ children, style, id }) {
  return <div id={id} style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 18, padding: 16, scrollMarginTop: 140, ...style }}>{children}</div>;
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
function FieldLabel({ text, required, hint, top, icon: Icon, id }) {
  return (
    <div id={id} style={{ display: "flex", alignItems: "center", marginTop: top ? 16 : 0, marginBottom: 7, scrollMarginTop: 140 }}>
      {Icon && <Icon size={12} color="#8A8A96" style={{ marginRight: 5, flexShrink: 0 }} />}
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
function SegmentedControl({ options, value, onChange, error }) {
  return (
    <div style={{ display: "flex", background: error ? "#FDECEC" : "#F6F7F9", borderRadius: 12, padding: 3, border: error ? "1px solid #F3C6C6" : "1px solid transparent" }}>
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
      {/* Ikon site - SAMA PERSIS (SiteTowerIcon) dgn yg dipakai di mana pun
          site ditampilkan di app ini (Review step, Detail Aktivitas, dst) -
          bukan sekadar badge teks polos tanpa penanda visual jenisnya. */}
      <span style={{ flexShrink: 0, display: "flex" }}><SiteTowerIcon size={16} /></span>
      <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 8, color: badgeColor, background: `${badgeColor}20` }}>{badge}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#B0B0BA", display: "flex" }}>
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

function ReviewRow({ icon: Icon, k, v, last }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: last ? "none" : "1px solid #F5F5F7" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A8A96", fontWeight: 600, flexShrink: 0 }}>
        {Icon && <Icon size={12} color="#B0B0BA" />} {k}
      </span>
      <span style={{ fontSize: 12.5, color: "#17181C", fontWeight: 700, textAlign: "right" }}>{v}</span>
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
/** Sheet konfirmasi saat DSF menekan Kembali (step 0) padahal masih ada
 * perubahan yg belum tersimpan sbg draft (`dirty`) - tiga pilihan jelas:
 * simpan dulu baru keluar, buang perubahan & keluar apa adanya, atau batal
 * (lanjut mengisi). TIDAK ada tombol "X"/tap-backdrop-utk-tutup - sengaja,
 * DSF harus memilih salah satu scr eksplisit spy tidak ada yg kepencet
 * tanpa sadar & kehilangan isian. */
function LeaveConfirmSheet({ saving, onCancel, onDiscard, onSaveAndLeave }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 97, background: "rgba(23,24,28,0.42)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom,0px) + 18px)", fontFamily: FF, boxShadow: "0 -8px 30px rgba(23,24,28,0.16)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: "rgba(180,83,9,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={16} color="#B45309" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#17181C" }}>Ada perubahan belum tersimpan</div>
            <div style={{ marginTop: 3, fontSize: 12, color: "#8A8A96", fontWeight: 600, lineHeight: 1.4 }}>
              Simpan dulu sbg draft supaya isian ini tidak hilang, atau buang & keluar apa adanya.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onSaveAndLeave} disabled={saving}
            style={{ width: "100%", height: 48, borderRadius: 13, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {saving ? <Loader2 size={16} style={{ animation: "mspin .85s linear infinite" }} /> : <Save size={16} />}
            {saving ? "Menyimpan…" : "Simpan Draft & Kembali"}
          </button>
          <button onClick={onDiscard} disabled={saving}
            style={{ width: "100%", height: 46, borderRadius: 13, border: "1.5px solid #F3C6C6", background: "#FFFFFF", color: "#DC2626", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Trash2 size={15} /> Buang Perubahan
          </button>
          <button onClick={onCancel} disabled={saving}
            style={{ width: "100%", height: 44, borderRadius: 13, border: "none", background: "none", color: "#8A8A96", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: saving ? "default" : "pointer" }}>
            Lanjut Mengisi
          </button>
        </div>
      </div>
    </div>
  );
}

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
    <Suspense fallback={<MobileShell active="activities" hideNav><ShellSpinner /></MobileShell>}>
      <CreatePlanWizardInner />
    </Suspense>
  );
}
