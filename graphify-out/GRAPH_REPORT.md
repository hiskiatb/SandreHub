# Graph Report - .  (2026-07-29)

## Corpus Check
- 174 files · ~496,371 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1589 nodes · 2776 edges · 119 communities (102 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.76)
- Token cost: 275,280 input · 6,000 output

## Community Hubs (Navigation)
- Promotor Tracking System (Admin) + PNL Import Wizard
- SandraHub Promotor Registration Flow
- Promotor Field App (PWA) — Tagging & Client Logic
- MartaHub Sumatra Map Visualization
- MartaHub Main Dashboard Page
- MartaHub Master Data Page
- SandraHub Payout Tracker
- SandraHub PNL Form Pendapatan (Revenue)
- SandraHub PNL Form Pengeluaran (Expense)
- MartaHub POSM/Material Tracking
- SandraHub MFTS Manpower Module
- SandraHub SDP Field/Edit Forms
- TypeScript Config
- SandraHub Dashboard Shell/Routing
- SandraHub MFTS Allocation
- MartaHub Activities/Submission
- SandraHub SDP Home
- SandraHub SDP Status Form
- MartaHub Spec & Dev Progress Docs
- Package Manifest
- SandraHub SDP Quick Form
- SandraHub PNL Pivot Summary
- MartaHub Assignments Page
- SandraHub SDP Summary
- SDP Validation/ID-Format Lib
- Agency Portal Page
- SandraHub PNL Admin Panel
- SandraHub MFTS Manpower/Progress
- SandraHub Payout Tracker (cont.)
- Geo Import Utilities
- Marta Site Import Lib
- MartaHub Validasi Page
- SandraHub PNL MPX Summary
- SandraHub SDP Dashboard BU
- Hub Login & Branding (Sandra/Promotor/Marta)
- PNL Attachments Lib
- SandraHub SDP Submission Forms
- Token-based Form Fill / SDP Lists
- Site Import Lib
- MartaHub Geo Compliance/Leaderboard
- SDP Bulk Form Spec Docs
- MartaHub Spec Docs (cont.)
- SandraHub PNL Control Center
- SandraHub MFTS Territory
- SandraHub SDP Bulk Grid
- SDP HQ Export
- SandraHub SDP Upload Territory
- MartaHub Spec Docs (cont. 2)
- MartaHub Spec Docs (cont. 3)
- SandraHub SDP Approval
- SandraHub SDP Rekap CSE
- MFTS Plan Docs
- Package Manifest (cont.)
- SandraHub Kode Otoritas / MC-Cluster Mapping
- MFTS Alur/Plan Docs
- Folder Handle Utilities
- SandraHub Payout Tracker (cont. 2)
- SandraHub SDP BSM Upload
- SandraHub SDP Mapping Manager
- MartaHub Approval Page
- SandraHub MFTS Agency Codes
- SandraHub SDP Report
- Marta Auth/Access Lib
- MartaHub Analytics Page
- MartaHub Calendar Page
- MartaHub Settings Page
- MartaHub Docs (misc)
- SandraHub Menu Access Manager
- SandraHub Payout Tracker (cont. 3)
- SandraHub Payout Tracker (cont. 4)
- MartaHub Insight Page
- MartaHub Monitoring Page
- SandraHub Email Mapping
- JS Config
- Package Manifest (cont. 2)
- SandraHub Payout Tracker (cont. 5)
- SandraHub Notification Bell
- SandraHub SDP Batch Monitor
- SandraHub SDP Drafts
- Marta Registration Page
- Geo Import Lib (cont.)
- MartaHub Map Page / Hub Logo Loader
- API: MC-Cluster Route
- API: Verify OTP
- SandraHub Mapping Page
- API: BSM Assignments Upload
- API: MFTS Roster Template
- API: MFTS Vacancy Template
- API: Sales Authority
- SDP Submission Forms (cont.)
- Root App Layout
- Geo Worker Lib
- API: BSM Setup
- API: MC-Cluster Upload
- API: MFTS Allocation Template
- Promotor App Layout/Metadata
- SDP Docs (misc)
- SDP Territory Lib
- API: Agency Validate Code
- API: Check Email
- API: Check Username
- App Icon
- Marta Layout
- MartaHub Layout
- Sandra Layout
- Resend Email Lib
- MFTS Alur Docs (misc)
- MFTS Plan Docs (misc)
- ESLint Config
- Next Config
- PostCSS Config
- Marta Access Lib (misc)

## God Nodes (most connected - your core abstractions)
1. `getMartaScope()` - 29 edges
2. `useHover()` - 23 edges
3. `PayoutTracker()` - 22 edges
4. `PNL_ImportWizard()` - 20 edges
5. `applyMartaScope()` - 20 edges
6. `MartaShell()` - 18 edges
7. `xlsx` - 18 edges
8. `HubLogo()` - 16 edges
9. `FormPengeluaran()` - 15 edges
10. `T` - 15 edges

## Surprising Connections (you probably didn't know these)
- `RegisterAssignment()` --indirect_call--> `clean()`  [INFERRED]
  app/sandra/register/assignment/page.jsx → lib/sdp/hqExport.js
- `TraceHub / SandraHub Next.js Application` --conceptually_related_to--> `Manpower Fulfillment Tracking System (MFTS)`  [INFERRED]
  README.md → docs/MFTS_PLAN.md
- `KodeOtoritas()` --references--> `xlsx`  [EXTRACTED]
  app/dashboard/components/KodeOtoritas.jsx → package.json
- `FormPendapatan()` --calls--> `pushNotification()`  [EXTRACTED]
  app/dashboard/components/PNL_FormPendapatan.jsx → lib/notificationService.js
- `FormPengeluaran()` --calls--> `removeOne()`  [EXTRACTED]
  app/dashboard/components/PNL_FormPengeluaran.jsx → lib/pnlAttachments.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Shared spm_sumatera Superadmin Role Across TraceHub Modules** — docs_martahub_activity_user_spec_spm_sumatera_role, docs_mfts_plan_role_hierarchy, docs_sdp_bulk_form_spec_role_hierarchy [INFERRED 0.80]
- **Reconciliation Engine Pattern Reused Across MartaHub Phases** — docs_martahub_dev_progress_phase3_reconciliation_engine, docs_martahub_dev_progress_phase5_md_activities, docs_martahub_dev_progress_phase7_dsf_sales_msisdn, docs_martahub_dev_progress_p_caller_email_pattern [EXTRACTED 1.00]
- **Evidence-vs-Reference Principle Applied Across MartaHub Feature Areas** — docs_martahub_activity_user_spec_evidence_vs_reference, docs_martahub_activity_user_spec_md_activities, docs_martahub_activity_user_spec_event_site_status_lapis2, docs_martahub_activity_user_spec_validity_msisdn, docs_martahub_activity_user_spec_outlet_latlng_master [EXTRACTED 1.00]

## Communities (119 total, 17 thin omitted)

### Community 0 - "Promotor Tracking System (Admin) + PNL Import Wizard"
Cohesion: 0.06
Nodes (54): autoMatch(), dispRaw(), dlTemplate(), fmtDateTime(), fmtNum(), fmtPeriodeShort(), FORM_DEFS, GROUP_META (+46 more)

### Community 1 - "SandraHub Promotor Registration Flow"
Cohesion: 0.08
Nodes (23): AgencyRegisterPage(), lbl(), mk(), BSM_BRANDS, mk(), RegisterAssignment(), ROLE_CFG, B (+15 more)

### Community 2 - "Promotor Field App (PWA) — Tagging & Client Logic"
Cohesion: 0.09
Nodes (25): AccessHelp(), BottomSheet(), CameraSheet(), extractPhone(), loadJsQR(), QRScannerSheet(), AppShell(), C (+17 more)

### Community 3 - "MartaHub Sumatra Map Visualization"
Cohesion: 0.09
Nodes (33): ACTIVITY_STATUS_COLOR, buildBaseMap(), buildSiteFacets(), C, CAT_KEYS, CHORO, choroColor(), convexHull() (+25 more)

### Community 4 - "MartaHub Main Dashboard Page"
Cohesion: 0.09
Nodes (30): achievementPct(), breakdown(), C, CAT_COLORS, CAT_LABELS, computeDashboardData(), costRatioPct(), EMPTY_DASHBOARD (+22 more)

### Community 5 - "MartaHub Master Data Page"
Cohesion: 0.06
Nodes (24): brandColor(), brandLabel(), brandTag, btn, card, chip, covPill, disabledPbtn (+16 more)

### Community 6 - "SandraHub Payout Tracker"
Cohesion: 0.08
Nodes (21): AdminScreen(), applySidebarFilter(), C, DARK, DashScreen(), getMpxTypeFromRow(), getPartnerNameFromRow(), getRegionFromRow() (+13 more)

### Community 7 - "SandraHub PNL Form Pendapatan (Revenue)"
Cohesion: 0.08
Nodes (15): CustomSPRowDesktop(), FACTORY_HPP, fmtDate(), formatIDR(), formatPct(), LastUpdatedInfo(), LocalInput, MobMarginRow() (+7 more)

### Community 8 - "SandraHub PNL Form Pengeluaran (Expense)"
Cohesion: 0.11
Nodes (16): ExpenseTable(), fmtDate(), formatIDR(), formatPct(), FormPengeluaran(), getPrevMY(), lainDbLabel(), lainDbPrice() (+8 more)

### Community 9 - "MartaHub POSM/Material Tracking"
Cohesion: 0.09
Nodes (21): Body(), brandLabel(), btn, CAN_MANAGE_ROLES, card, currentYYYYMM(), disabledPbtn, guessCol() (+13 more)

### Community 10 - "SandraHub MFTS Manpower Module"
Cohesion: 0.13
Nodes (22): AddVacancyModal(), AdvanceModal(), AgencyMappingView(), ageTone(), brandBadge(), btn(), daysSince(), iconBtn() (+14 more)

### Community 11 - "SandraHub SDP Field/Edit Forms"
Cohesion: 0.11
Nodes (22): emailOk(), mk(), SDP_Edit(), STATUS_USAHA, SUMATRA_FALLBACK, TERMINATE, toInputDate(), toStoreDate() (+14 more)

### Community 12 - "TypeScript Config"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, **/*.ts (+19 more)

### Community 13 - "SandraHub Dashboard Shell/Routing"
Cohesion: 0.11
Nodes (18): buildGlobalCSS(), CONTROLLABLE_MENUS, CURRENT_DATE, CURRENT_MONTH_INDEX, CURRENT_YEAR, DashboardPage(), getCurrentMonth(), getCurrentYear() (+10 more)

### Community 14 - "SandraHub MFTS Allocation"
Cohesion: 0.16
Nodes (23): addMonths(), baseName(), brandBadge(), btn(), clampPeriod(), CUR_MONTH, FCOLS, FilterMenu() (+15 more)

### Community 15 - "MartaHub Activities/Submission"
Cohesion: 0.15
Nodes (19): Body(), card, CAT_LABEL, fmtDate(), inp, STATUS, MartaShell(), NAV (+11 more)

### Community 16 - "SandraHub SDP Home"
Cohesion: 0.14
Nodes (20): brandOfCluster(), buildPeriods(), DesktopDashboard(), fillerNext(), fmtDateTime(), greeting(), mk(), MobileHome() (+12 more)

### Community 17 - "SandraHub SDP Status Form"
Cohesion: 0.09
Nodes (20): mk(), SDP_MyCodes(), APPROVAL_APPROVE_CARD, APPROVAL_STATUS_CARD, BULKGRID_CARD, DRAFTS_CARD, EMAIL_MAP_CARD, EXPORT_CARD (+12 more)

### Community 18 - "MartaHub Spec & Dev Progress Docs"
Cohesion: 0.12
Nodes (25): Activity Details Screen (PlanDetailScreen), Check-In Lapis 1 (instant, vs Plan event point), dsf_org_id (DSF identity column), Event Site Status Lapis 2 (periodic reconciliation), Evidence vs Reference Principle (§0.2), Geo Compliance Score Formula (§8.3), Link Folder Lokal Mechanism (§9.1), MD Activities (3 Installation Modes, §8) (+17 more)

### Community 19 - "Package Manifest"
Cohesion: 0.08
Nodes (25): exceljs, jszip, leaflet, lucide-react, motion, next, dependencies, exceljs (+17 more)

### Community 20 - "SandraHub SDP Quick Form"
Cohesion: 0.13
Nodes (17): SDP_AddressSearch(), FALLBACK, SDP_MapModal(), SDP_MapPicker(), SUMATRA_FALLBACK, DB_COLS, FIELD_STEP, GEOCOL (+9 more)

### Community 21 - "SandraHub PNL Pivot Summary"
Cohesion: 0.12
Nodes (13): abbreviatePartner(), B, csvCell(), fFull(), fNum(), fRaw(), MonthCell(), MONTHS_FULL (+5 more)

### Community 22 - "MartaHub Assignments Page"
Cohesion: 0.11
Nodes (19): AddModal(), badge(), Body(), BRAND_LABEL, BRANDS, btn, card, EditModal() (+11 more)

### Community 23 - "SandraHub SDP Summary"
Cohesion: 0.15
Nodes (17): BRAND_BANNER, brandOfCluster(), buildPeriods(), COL, fullLabel(), mk(), MONMAP, MONTHS_FULL (+9 more)

### Community 24 - "SDP Validation/ID-Format Lib"
Cohesion: 0.19
Nodes (17): CIRCLE_CODE, circleCode(), identifier, isHybridScope(), partnerCode(), previewSdpId(), toYYMM(), digits() (+9 more)

### Community 25 - "Agency Portal Page"
Cohesion: 0.23
Nodes (17): ActionSheet(), AgencyPortal(), ageTone(), baseName(), brandBadge(), btn(), daysSince(), fmtPeriod() (+9 more)

### Community 26 - "SandraHub PNL Admin Panel"
Cohesion: 0.18
Nodes (12): AccessCodesSection(), ALL_ROLES, generateCode(), makeInputStyle(), makeSelectStyle(), PartnerBranchesSection(), PERMISSION_COLS, PNL_AdminPanel() (+4 more)

### Community 27 - "SandraHub MFTS Manpower/Progress"
Cohesion: 0.24
Nodes (16): baseName(), brandBadge(), btn(), FCOLS, iconBtn(), inp(), lbl(), ManpowerForm() (+8 more)

### Community 28 - "SandraHub Payout Tracker (cont.)"
Cohesion: 0.12
Nodes (18): BnRow(), Btn(), DetailRow(), HeatBtn(), HeatCell(), kbd(), MsOption(), MultiSel() (+10 more)

### Community 29 - "Geo Import Utilities"
Cohesion: 0.22
Nodes (15): FolderConnectPanel(), ConnectSourceSection(), bboxOf(), keepSumatra(), MB(), normalize(), parseGeoFile(), parseHeavyMainThread() (+7 more)

### Community 30 - "Marta Site Import Lib"
Cohesion: 0.19
Nodes (16): Body(), ListSiteView(), UploadStep(), buildRows(), currentYYYYMM(), deriveTable(), fetchImportHistory(), guessMapping() (+8 more)

### Community 31 - "MartaHub Validasi Page"
Cohesion: 0.14
Nodes (15): Body(), btn, CAN_RUN_ROLES, card, disabledBtn, disabledPbtn, distanceMeters(), guessCol() (+7 more)

### Community 32 - "SandraHub PNL MPX Summary"
Cohesion: 0.19
Nodes (11): calcR(), dtf(), ensurePdfLib(), idr(), makePDF(), mk(), MPX_Summary_PNL(), PROD_NAMES (+3 more)

### Community 33 - "SandraHub SDP Dashboard BU"
Cohesion: 0.20
Nodes (13): AREA_ORDER, AREA_SHORT, AreaCard(), BranchRow(), currentPeriod(), mk(), normalize(), periodLabel() (+5 more)

### Community 34 - "Hub Login & Branding (Sandra/Promotor/Marta)"
Cohesion: 0.15
Nodes (9): HubPickerPage(), HUBS, mk(), mk(), ROLE_LABEL, SandraLoginInner(), BG, BORDER (+1 more)

### Community 35 - "PNL Attachments Lib"
Cohesion: 0.20
Nodes (15): applyOverrides(), FormPendapatan(), mk(), monthScore(), MultiFileUpload(), ACCEPTED_MIME, buildPath(), fmtSize() (+7 more)

### Community 36 - "SandraHub SDP Submission Forms"
Cohesion: 0.15
Nodes (12): FORMS, FormView(), GEOCOL, mk(), REB_FIELDS, REB_SECTIONS, REG_FIELDS, REG_SECTIONS (+4 more)

### Community 37 - "Token-based Form Fill / SDP Lists"
Cohesion: 0.14
Nodes (9): inp, lbl, PublicIsiPage(), remain(), t, ROW_STATUS, SDP_EXPORT_ROLES, SDP_FORM_ROLES (+1 more)

### Community 38 - "Site Import Lib"
Cohesion: 0.19
Nodes (15): ID_KEYS, idbAllSites(), idbClearSites(), idbPutSite(), inSumatra(), LAT_KEYS, LNG_KEYS, NAME_KEYS (+7 more)

### Community 39 - "MartaHub Geo Compliance/Leaderboard"
Cohesion: 0.17
Nodes (8): T, Body(), card, iconBtn, pctColor(), ROLE_LABEL, card, MARTA_CONFIGURED

### Community 40 - "SDP Bulk Form Spec Docs"
Cohesion: 0.13
Nodes (15): mf_territory (territory master), mf_territory_clusters (cluster+circle list), Coverage Risk (territory-linked prioritization), Vacancy Priority/Criticality, SDP_BatchMonitor (completeness tracking), SDP_BulkGrid (desktop paste grid), Hybrid Brand Pairing (IM3+3ID, Pairing ID), SDP_QuickForm (mobile entry) (+7 more)

### Community 41 - "MartaHub Spec Docs (cont.)"
Cohesion: 0.14
Nodes (14): Next.js Agent Instructions Notice, CLAUDE.md Project Instructions, SSO-only Login (Google + Outlook), Email + OTP passwordless authentication, MartaHub KPI Formulas (Achievement/Productivity/Geo-compliance), MartaHub Platform, Pre-provision + Pending status model, Export Adapter Pattern (HQ format decoupling) (+6 more)

### Community 42 - "SandraHub PNL Control Center"
Cohesion: 0.21
Nodes (10): ExcelFilter(), DISABLED_BD(), DISABLED_BG(), getAvailableMonths(), MONTH_SHORT, MonthPicker(), MONTHS, PNLControlCenter() (+2 more)

### Community 43 - "SandraHub MFTS Territory"
Cohesion: 0.27
Nodes (12): baseName(), btn(), colLetter(), ColSelect(), curMonth(), inp(), lbl(), matchHybrid() (+4 more)

### Community 44 - "SandraHub SDP Bulk Grid"
Cohesion: 0.23
Nodes (12): COLS, DB_COLS, ghost(), mk(), norm(), PasteModal(), SDP_BulkGrid(), solid() (+4 more)

### Community 45 - "SDP HQ Export"
Cohesion: 0.29
Nodes (12): mk(), SDP_Export(), selStyle(), STATUS_OPTS, SUMATERA_REGIONS, buildMatrix(), buildTSV(), cellValue() (+4 more)

### Community 46 - "SandraHub SDP Upload Territory"
Cohesion: 0.21
Nodes (11): fmtDate(), IOH, mk(), MONTHS, parseWorkbook(), periodLabel(), RiwayatUpload(), SDP_UploadTerritory() (+3 more)

### Community 47 - "MartaHub Spec Docs (cont. 2)"
Cohesion: 0.14
Nodes (14): Activity Report Wizard (SubmitActualScreen), Map View Sync with Filter Layers (§10), Removal of posmat_compliant Toggle, Monthly List Site + Map SHP Upload, mkt_sites (draft normalized site table), Phase 6: Drop posmat_compliant, Phase 9: Map View Sync, mh_activities (plan+checkin+actual table) (+6 more)

### Community 48 - "MartaHub Spec Docs (cont. 3)"
Cohesion: 0.19
Nodes (14): Head TMV / Brand TMV Regional Structure (§4.5a), supervisor_assignment_id (hierarchy FK column), TL DSF / DSF / MD Hierarchy (§4.2), 4-Layer Marcomm Role & Provisioning Hierarchy, mkt_assignments (draft allowlist table), Phase 2: Full User Management Hierarchy, MartaShell (web navigation shell), mh_assignments (provisioning allowlist table) (+6 more)

### Community 49 - "SandraHub SDP Approval"
Cohesion: 0.23
Nodes (10): APPROVER, brandOfCluster(), editStatus(), fmtDate(), KIND, mk(), RowInfo(), SDP_Approval() (+2 more)

### Community 50 - "SandraHub SDP Rekap CSE"
Cohesion: 0.24
Nodes (10): arr(), brandOf(), DetailDrawer(), EXPORT_COLS, fmtDate(), formStatusCfg(), mk(), MONTHS (+2 more)

### Community 51 - "MFTS Plan Docs"
Cohesion: 0.15
Nodes (13): Candidate Counter (sourced/interviewed/offered/declined), Canonical MC- Hybrid Cluster Naming, mf_allocation (headcount target table), mf_hybrid_map (hybrid cluster mapping table), mf_manpower (active manpower master), mf_stages (configurable pipeline stages table), mf_vacancies (vacancy seats table), MFTS_Allocation.jsx (allocation UI) (+5 more)

### Community 52 - "Package Manifest (cont.)"
Cohesion: 0.15
Nodes (13): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+5 more)

### Community 53 - "SandraHub Kode Otoritas / MC-Cluster Mapping"
Cohesion: 0.18
Nodes (4): KodeOtoritas(), mk(), MC_ClusterMapping(), emptyRow()

### Community 54 - "MFTS Alur/Plan Docs"
Cohesion: 0.18
Nodes (12): SPM Sumatera Superadmin Role (§4.5), mf_vacancy_events (single source of truth for timing), Roster Excel Bulk Manpower Update, Vacancy Stage Pipeline (mf_stages), Verifikasi Joined (Anti-Gaming), MFTS End-to-End Workflow (Territory→Alokasi→Vacancy→Manpower), Exception-First North Star Principle, Fulfillment Quality Score (speed × retention) (+4 more)

### Community 55 - "Folder Handle Utilities"
Cohesion: 0.47
Nodes (10): checkPermission(), clearFolderHandle(), ensurePermission(), getFolderHandle(), listMatchingFiles(), openDB(), saveFolderHandle(), setLastFile() (+2 more)

### Community 56 - "SandraHub Payout Tracker (cont. 2)"
Cohesion: 0.20
Nodes (11): BnDetailRow(), DashTab(), fmtMoney(), GrandTotalBanner(), heatClr(), pct(), SummaryDataRow(), SummaryTable() (+3 more)

### Community 57 - "SandraHub SDP BSM Upload"
Cohesion: 0.29
Nodes (8): mapStatus(), mk(), MONTHS, nextMonthFirst(), parseEmailArr(), parseExcel(), periodLabel(), SDP_BsmUpload()

### Community 58 - "SandraHub SDP Mapping Manager"
Cohesion: 0.25
Nodes (9): AREAS, BRANCH_MAP, BU_TYPES, CreateModal(), fmtDate(), genCode(), getClusters(), mk() (+1 more)

### Community 59 - "MartaHub Approval Page"
Cohesion: 0.25
Nodes (9): Body(), btn, card, CAT_LABEL, catLabel(), fmtDate(), fmtDateTime(), mdPhotoUrl() (+1 more)

### Community 60 - "SandraHub MFTS Agency Codes"
Cohesion: 0.40
Nodes (9): AddCodeModal(), btn(), fmt(), iconBtn(), inp(), lbl(), MFTS_AgencyCodes(), mk() (+1 more)

### Community 61 - "SandraHub SDP Report"
Cohesion: 0.33
Nodes (8): brandOfCluster(), buildPeriods(), mk(), MONTHS, pad2(), periodLabel(), SDP_Report(), statusOf()

### Community 62 - "Marta Auth/Access Lib"
Cohesion: 0.36
Nodes (7): MartaLoginInner(), mk(), canViewMarta(), checkMartaAccess(), isMartaAdmin(), MARTA_ADMIN_ROLES, MARTA_VIEW_ROLES

### Community 63 - "MartaHub Analytics Page"
Cohesion: 0.29
Nodes (8): Body(), card, CAT_LABEL, MONTH_ABBR, monthKeyOf(), productivityPct(), rowCategory(), sumBy()

### Community 64 - "MartaHub Calendar Page"
Cohesion: 0.24
Nodes (8): Body(), card, DOW, isoDate(), MONTH_NAMES, navBtn, pad(), STATUS_COLOR

### Community 65 - "MartaHub Settings Page"
Cohesion: 0.24
Nodes (5): Body(), CAN_EDIT_SETTINGS_ROLES, card, ROLE_LABEL, regionLabel()

### Community 66 - "MartaHub Docs (misc)"
Cohesion: 0.20
Nodes (10): Activity Calendar (§1.1a), Event Category → Activity Category Rename, Create Plan Activity Wizard (4-step), Location Picker (OSM map), BME/RGE Activity Plan + Check-in (Bagian B), mkt_activity_checkins (draft table), mkt_activity_plans (draft table), mh_sites Local Migration Deliberately Skipped (+2 more)

### Community 67 - "SandraHub Menu Access Manager"
Cohesion: 0.36
Nodes (8): IOH, MENU_CATALOG, MenuAccessManager(), mk(), ROLE_CATALOG, roleHasMenu(), SDPM, SFM

### Community 68 - "SandraHub Payout Tracker (cont. 3)"
Cohesion: 0.39
Nodes (9): buildAgg(), DonutRow(), findCol(), FunnelRowItem(), gcell(), gnum(), gstr(), isRawRow() (+1 more)

### Community 69 - "SandraHub Payout Tracker (cont. 4)"
Cohesion: 0.25
Nodes (9): clearCache(), daysBetween(), dbLoad(), fmtDate(), getCache(), monthKey(), PayoutTracker(), setCache() (+1 more)

### Community 70 - "MartaHub Insight Page"
Cohesion: 0.33
Nodes (6): achievementPct(), Body(), card, fmtDate(), geoPct(), sumBy()

### Community 71 - "MartaHub Monitoring Page"
Cohesion: 0.28
Nodes (6): Body(), card, fmtBool(), fmtDate(), STATUS_COLOR, STATUS_LABEL

### Community 72 - "SandraHub Email Mapping"
Cohesion: 0.25
Nodes (6): ADMIN_ROLES, EmailMappingPage(), EMPTY, mk(), ROLE_LABEL, ROLES

### Community 73 - "JS Config"
Cohesion: 0.22
Nodes (8): compilerOptions, baseUrl, ignoreDeprecations, jsx, paths, exclude, node_modules, .next

### Community 74 - "Package Manifest (cont. 2)"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 75 - "SandraHub Payout Tracker (cont. 5)"
Cohesion: 0.32
Nodes (8): DATE_COLS, fmtExportCell(), fmtMonthYear(), fmtShortDate(), isDateKey(), isMonthKey(), MonthTotalRow(), toRealDate()

### Community 76 - "SandraHub Notification Bell"
Cohesion: 0.38
Nodes (4): fmtTime(), MONTHS_ID, NotificationBell(), parseNotes()

### Community 77 - "SandraHub SDP Batch Monitor"
Cohesion: 0.43
Nodes (5): mk(), SDP_BatchMonitor(), STATUS_TONE, tdS(), thS()

### Community 78 - "SandraHub SDP Drafts"
Cohesion: 0.52
Nodes (6): btn(), fmtDate(), mk(), remaining(), SDP_Drafts(), shareUrl()

### Community 79 - "Marta Registration Page"
Cohesion: 0.33
Nodes (4): BRANDS, MartaRegisterPage(), mk(), ROLES

### Community 80 - "Geo Import Lib (cont.)"
Cohesion: 0.43
Nodes (7): useGeoLayers(), idbAll(), idbClear(), idbDelete(), idbPut(), openDB(), tx()

### Community 81 - "MartaHub Map Page / Hub Logo Loader"
Cohesion: 0.38
Nodes (4): MapIntelligencePage(), mk(), HubLogoLoader(), HubLogoLoaderDark()

### Community 82 - "API: MC-Cluster Route"
Cohesion: 0.47
Nodes (4): DELETE(), POST(), requireAdmin(), supabaseAdmin

### Community 83 - "API: Verify OTP"
Cohesion: 0.60
Nodes (5): createAuthUser(), findAuthUserByEmail(), friendlyAuthError(), POST(), supabaseAdmin

### Community 84 - "SandraHub Mapping Page"
Cohesion: 0.47
Nodes (4): ADMIN_ROLES, DeleteModal(), MappingPage(), mk()

### Community 85 - "API: BSM Assignments Upload"
Cohesion: 0.60
Nodes (4): generateBSMCode(), POST(), requireAdmin(), supabaseAdmin

### Community 86 - "API: MFTS Roster Template"
Cohesion: 0.60
Nodes (4): EDITABLE, HEAD, json(), POST()

### Community 87 - "API: MFTS Vacancy Template"
Cohesion: 0.60
Nodes (4): colLetter(), HEAD, json(), POST()

### Community 88 - "API: Sales Authority"
Cohesion: 0.50
Nodes (3): PATCH(), requireSPM(), supabaseAdmin

### Community 89 - "SDP Submission Forms (cont.)"
Cohesion: 0.40
Nodes (5): DocBtn(), FileInput(), openDoc(), react, react

### Community 90 - "Root App Layout"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 93 - "API: MC-Cluster Upload"
Cohesion: 0.67
Nodes (3): POST(), requireAdmin(), supabaseAdmin

### Community 94 - "API: MFTS Allocation Template"
Cohesion: 0.67
Nodes (3): HEAD, json(), POST()

### Community 96 - "SDP Docs (misc)"
Cohesion: 0.50
Nodes (4): Auto-fill Scope Limitation (honest data reality), sdp_master RLS Security Gap, sdp_master (auto-fill source table), submitted_by = auth.uid() RLS Requirement

### Community 97 - "SDP Territory Lib"
Cohesion: 0.83
Nodes (3): buildKecIndex(), parseKecId(), sortArr()

## Knowledge Gaps
- **367 isolated node(s):** `MONTHS_ID`, `supabaseAdmin`, `supabaseAdmin`, `supabaseAdmin`, `supabaseAdmin` (+362 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `xlsx` connect `Promotor Tracking System (Admin) + PNL Import Wizard` to `SandraHub Payout Tracker`, `Site Import Lib`, `SandraHub Email Mapping`, `SandraHub SDP Field/Edit Forms`, `SandraHub SDP Upload Territory`, `SandraHub SDP Rekap CSE`, `Package Manifest`, `SandraHub PNL Pivot Summary`, `SandraHub Kode Otoritas / MC-Cluster Mapping`, `SandraHub SDP BSM Upload`, `Marta Site Import Lib`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Package Manifest` to `Promotor Tracking System (Admin) + PNL Import Wizard`, `SDP Submission Forms (cont.)`, `Package Manifest (cont. 2)`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `readWorkbook()` connect `Marta Site Import Lib` to `Promotor Tracking System (Admin) + PNL Import Wizard`, `MartaHub POSM/Material Tracking`, `MartaHub Master Data Page`, `MartaHub Validasi Page`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `MONTHS_ID`, `supabaseAdmin`, `supabaseAdmin` to the rest of the system?**
  _367 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Promotor Tracking System (Admin) + PNL Import Wizard` be split into smaller, more focused modules?**
  _Cohesion score 0.06229508196721312 - nodes in this community are weakly interconnected._
- **Should `SandraHub Promotor Registration Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.08170731707317073 - nodes in this community are weakly interconnected._
- **Should `Promotor Field App (PWA) — Tagging & Client Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.08658536585365853 - nodes in this community are weakly interconnected._