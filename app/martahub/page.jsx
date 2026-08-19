"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { supabase } from "../../lib/supabase";
import { guardMarta, isMartaAdmin } from "../../lib/martaAccess";
import { supabaseMarta } from "../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope, applyMartaScopeSlug } from "../../lib/martaScope";
import { HubLogo } from "../../components/HubLogo";
import { HubLogoLoader, HubLogoLoaderDark } from "../../components/HubLogoLoader";
import { MapCard } from "./components/SumatraMap";
import { slug, monthKeyYYYYMM, nearestPriorTarget } from "../../lib/activityTarget";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ MOCK DASHBOARD DATA - HANYA UNTUK VISUALISASI, HAPUS KAPAN SAJA          ║
// ║ Set USE_MOCK_DASHBOARD_DATA = false (atau hapus seluruh blok ini + baris ║
// ║ pemanggilannya di useEffect, cari "MOCK_ACTIVITIES") untuk kembali ke    ║
// ║ data asli mh_activities/mh_activity_target/mh_md_installations. Tidak    ║
// ║ menyentuh database sama sekali - murni override state lokal di browser  ║
// ║ SETELAH fetch asli selesai, jadi aman dihapus tanpa efek samping.        ║
// ║ branch_id di MOCK_ACTIVITIES pakai UUID mh_branches ASLI (MEDAN/ACEH/    ║
// ║ PEKANBARU/PADANG/PALEMBANG/BANDAR LAMPUNG) supaya nama cabang & region   ║
// ║ tetap tampil benar lewat branchMap/scoping yang sudah ada.               ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const USE_MOCK_DASHBOARD_DATA = true;
const MOCK_BRANCHES = [
  { id: "61b44f8c-2af6-4cf3-a450-9ca695aad1ae", name: "MEDAN", lat: 3.5952, lng: 98.6722 },
  { id: "6444e7cf-e2bb-4cfd-81d0-c18c7c1d5ceb", name: "ACEH", lat: 5.5483, lng: 95.3238 },
  { id: "8d3177d7-4a0e-44b6-80c7-e4b53ea95742", name: "PEKANBARU", lat: 0.5071, lng: 101.4478 },
  { id: "04fc17ac-43de-4ec9-b960-5f27530775c8", name: "PADANG", lat: -0.9471, lng: 100.4172 },
  { id: "1afd6760-2f2a-4784-b424-a5ee180d7006", name: "PALEMBANG", lat: -2.9761, lng: 104.7754 },
  { id: "785db1f7-283d-498d-9025-ec8764a973c5", name: "BANDAR LAMPUNG", lat: -5.4292, lng: 105.2610 },
];
const MB = Object.fromEntries(MOCK_BRANCHES.map((b) => [b.name, b]));
const MOCK_ACTIVITIES = [
  { id: "mock-1", status: "approved", brand: "IM3", branch_id: MB.MEDAN.id, plan_date: "2026-08-03", actual_date: "2026-08-03", event_category: "directSelling", event_categories: null, network_category: "strong", target_sp: 14, target_fwa: 8, actual_sp: 15, actual_fwa: 9, cost_estimate: 4200000, cost_actual: 4200000, actual_rev_3m: 9800000, checkin_valid: true, geo_compliant: true, event_name: "Direct Selling Plaza Medan Fair", mc: "MC-01", created_at: "2026-08-03T09:15:00+07:00", latitude: MB.MEDAN.lat + 0.04, longitude: MB.MEDAN.lng - 0.03 },
  { id: "mock-2", status: "approved", brand: "IM3", branch_id: MB.MEDAN.id, plan_date: "2026-08-10", actual_date: "2026-08-10", event_category: "sponsorship", event_categories: null, network_category: "medium", target_sp: 10, target_fwa: 6, actual_sp: 9, actual_fwa: 5, cost_estimate: 3100000, cost_actual: 3100000, actual_rev_3m: 6400000, checkin_valid: true, geo_compliant: true, event_name: "Sponsorship Festival Kuliner Medan", mc: "MC-02", created_at: "2026-08-10T10:00:00+07:00", latitude: MB.MEDAN.lat - 0.02, longitude: MB.MEDAN.lng + 0.05 },
  { id: "mock-3", status: "plan_submitted", brand: "TRI", branch_id: MB.MEDAN.id, plan_date: "2026-08-17", actual_date: null, event_category: "thematic", event_categories: null, network_category: "medium", target_sp: 12, target_fwa: 7, actual_sp: null, actual_fwa: null, cost_estimate: 3800000, cost_actual: null, actual_rev_3m: null, checkin_valid: null, geo_compliant: null, event_name: "Thematic Ramadan Preview Medan", mc: "MC-01", created_at: "2026-08-17T08:30:00+07:00", latitude: MB.MEDAN.lat + 0.01, longitude: MB.MEDAN.lng + 0.02 },

  { id: "mock-4", status: "approved", brand: "IM3", branch_id: MB.ACEH.id, plan_date: "2026-08-02", actual_date: "2026-08-02", event_category: "openBooth", event_categories: null, network_category: "strong", target_sp: 9, target_fwa: 5, actual_sp: 10, actual_fwa: 6, cost_estimate: 2800000, cost_actual: 2800000, actual_rev_3m: 7200000, checkin_valid: true, geo_compliant: true, event_name: "Open Booth Simpang Lima Banda Aceh", mc: "MC-03", created_at: "2026-08-02T09:00:00+07:00", latitude: MB.ACEH.lat + 0.03, longitude: MB.ACEH.lng - 0.02 },
  { id: "mock-5", status: "approved", brand: "TRI", branch_id: MB.ACEH.id, plan_date: "2026-08-08", actual_date: "2026-08-08", event_category: "jointEvent", event_categories: null, network_category: "strong", target_sp: 16, target_fwa: 9, actual_sp: 14, actual_fwa: 8, cost_estimate: 5200000, cost_actual: 5200000, actual_rev_3m: 11000000, checkin_valid: true, geo_compliant: true, event_name: "Joint Event Kampus Unsyiah", mc: "MC-04", created_at: "2026-08-08T09:30:00+07:00", latitude: MB.ACEH.lat - 0.03, longitude: MB.ACEH.lng + 0.04 },
  { id: "mock-6", status: "draft", brand: "IM3", branch_id: MB.ACEH.id, plan_date: "2026-08-19", actual_date: null, event_category: "project", event_categories: null, network_category: "weak", target_sp: 20, target_fwa: 12, actual_sp: null, actual_fwa: null, cost_estimate: 6000000, cost_actual: null, actual_rev_3m: null, checkin_valid: null, geo_compliant: null, event_name: "Project Perluasan Jaringan Aceh Besar", mc: "MC-03", created_at: "2026-08-19T07:45:00+07:00", latitude: MB.ACEH.lat + 0.02, longitude: MB.ACEH.lng + 0.01 },

  { id: "mock-7", status: "approved", brand: "TRI", branch_id: MB.PEKANBARU.id, plan_date: "2026-08-05", actual_date: "2026-08-05", event_category: "directSelling", event_categories: null, network_category: "medium", target_sp: 11, target_fwa: 6, actual_sp: 12, actual_fwa: 7, cost_estimate: 3400000, cost_actual: 3400000, actual_rev_3m: 8300000, checkin_valid: true, geo_compliant: true, event_name: "Direct Selling Mal SKA Pekanbaru", mc: "MC-05", created_at: "2026-08-05T09:10:00+07:00", latitude: MB.PEKANBARU.lat + 0.03, longitude: MB.PEKANBARU.lng - 0.03 },
  { id: "mock-8", status: "revision_needed", brand: "IM3", branch_id: MB.PEKANBARU.id, plan_date: "2026-08-12", actual_date: "2026-08-12", event_category: "sponsorship", event_categories: null, network_category: "weak", target_sp: 8, target_fwa: 4, actual_sp: 5, actual_fwa: 2, cost_estimate: 2500000, cost_actual: 2500000, actual_rev_3m: 3100000, checkin_valid: false, geo_compliant: false, event_name: "Sponsorship Car Free Day Pekanbaru", mc: "MC-06", created_at: "2026-08-12T09:20:00+07:00", latitude: MB.PEKANBARU.lat - 0.02, longitude: MB.PEKANBARU.lng + 0.02 },
  { id: "mock-9", status: "approved", brand: "TRI", branch_id: MB.PEKANBARU.id, plan_date: "2026-08-15", actual_date: "2026-08-15", event_category: "thematic", event_categories: null, network_category: "strong", target_sp: 13, target_fwa: 7, actual_sp: 13, actual_fwa: 7, cost_estimate: 4000000, cost_actual: 4000000, actual_rev_3m: 9500000, checkin_valid: true, geo_compliant: true, event_name: "Thematic Kemerdekaan Pekanbaru", mc: "MC-05", created_at: "2026-08-15T09:05:00+07:00", latitude: MB.PEKANBARU.lat + 0.01, longitude: MB.PEKANBARU.lng + 0.04 },

  { id: "mock-10", status: "approved", brand: "TRI", branch_id: MB.PADANG.id, plan_date: "2026-08-04", actual_date: "2026-08-04", event_category: "openBooth", event_categories: null, network_category: "medium", target_sp: 10, target_fwa: 6, actual_sp: 11, actual_fwa: 6, cost_estimate: 3200000, cost_actual: 3200000, actual_rev_3m: 7600000, checkin_valid: true, geo_compliant: true, event_name: "Open Booth Pasar Raya Padang", mc: "MC-07", created_at: "2026-08-04T09:00:00+07:00", latitude: MB.PADANG.lat + 0.03, longitude: MB.PADANG.lng - 0.02 },
  { id: "mock-11", status: "approved", brand: "IM3", branch_id: MB.PADANG.id, plan_date: "2026-08-11", actual_date: "2026-08-11", event_category: "jointEvent", event_categories: null, network_category: "strong", target_sp: 15, target_fwa: 8, actual_sp: 15, actual_fwa: 8, cost_estimate: 4900000, cost_actual: 4900000, actual_rev_3m: 12200000, checkin_valid: true, geo_compliant: true, event_name: "Joint Event Kampus Unand", mc: "MC-08", created_at: "2026-08-11T09:15:00+07:00", latitude: MB.PADANG.lat - 0.03, longitude: MB.PADANG.lng + 0.03 },
  { id: "mock-12", status: "plan_submitted", brand: "TRI", branch_id: MB.PADANG.id, plan_date: "2026-08-18", actual_date: null, event_category: "project", event_categories: null, network_category: "medium", target_sp: 18, target_fwa: 10, actual_sp: null, actual_fwa: null, cost_estimate: 5500000, cost_actual: null, actual_rev_3m: null, checkin_valid: null, geo_compliant: null, event_name: "Project Ekspansi Kawasan Kuranji", mc: "MC-07", created_at: "2026-08-18T08:00:00+07:00", latitude: MB.PADANG.lat + 0.02, longitude: MB.PADANG.lng + 0.01 },

  { id: "mock-13", status: "approved", brand: "IM3", branch_id: MB.PALEMBANG.id, plan_date: "2026-08-06", actual_date: "2026-08-06", event_category: "directSelling", event_categories: null, network_category: "strong", target_sp: 12, target_fwa: 7, actual_sp: 13, actual_fwa: 7, cost_estimate: 3700000, cost_actual: 3700000, actual_rev_3m: 8900000, checkin_valid: true, geo_compliant: true, event_name: "Direct Selling Jakabaring Palembang", mc: "MC-09", created_at: "2026-08-06T09:10:00+07:00", latitude: MB.PALEMBANG.lat + 0.03, longitude: MB.PALEMBANG.lng - 0.02 },
  { id: "mock-14", status: "approved", brand: "TRI", branch_id: MB.PALEMBANG.id, plan_date: "2026-08-13", actual_date: "2026-08-13", event_category: "sponsorship", event_categories: null, network_category: "medium", target_sp: 9, target_fwa: 5, actual_sp: 8, actual_fwa: 5, cost_estimate: 2900000, cost_actual: 2900000, actual_rev_3m: 6100000, checkin_valid: true, geo_compliant: true, event_name: "Sponsorship Turnamen Futsal Palembang", mc: "MC-10", created_at: "2026-08-13T09:30:00+07:00", latitude: MB.PALEMBANG.lat - 0.02, longitude: MB.PALEMBANG.lng + 0.03 },
  { id: "mock-15", status: "rejected", brand: "IM3", branch_id: MB.PALEMBANG.id, plan_date: "2026-08-16", actual_date: "2026-08-16", event_category: "thematic", event_categories: null, network_category: "weak", target_sp: 14, target_fwa: 8, actual_sp: 6, actual_fwa: 3, cost_estimate: 4300000, cost_actual: 4300000, actual_rev_3m: 2800000, checkin_valid: false, geo_compliant: false, event_name: "Thematic Ramadan Pasar Cinde", mc: "MC-09", created_at: "2026-08-16T09:20:00+07:00", latitude: MB.PALEMBANG.lat + 0.01, longitude: MB.PALEMBANG.lng + 0.02 },

  { id: "mock-16", status: "approved", brand: "IM3", branch_id: MB["BANDAR LAMPUNG"].id, plan_date: "2026-08-07", actual_date: "2026-08-07", event_category: "openBooth", event_categories: null, network_category: "strong", target_sp: 11, target_fwa: 6, actual_sp: 12, actual_fwa: 6, cost_estimate: 3500000, cost_actual: 3500000, actual_rev_3m: 8700000, checkin_valid: true, geo_compliant: true, event_name: "Open Booth Mal Boemi Kedaton", mc: "MC-11", created_at: "2026-08-07T09:05:00+07:00", latitude: MB["BANDAR LAMPUNG"].lat + 0.03, longitude: MB["BANDAR LAMPUNG"].lng - 0.02 },
  { id: "mock-17", status: "approved", brand: "TRI", branch_id: MB["BANDAR LAMPUNG"].id, plan_date: "2026-08-14", actual_date: "2026-08-14", event_category: "jointEvent", event_categories: null, network_category: "strong", target_sp: 17, target_fwa: 9, actual_sp: 16, actual_fwa: 9, cost_estimate: 5400000, cost_actual: 5400000, actual_rev_3m: 12800000, checkin_valid: true, geo_compliant: true, event_name: "Joint Event Kampus Unila", mc: "MC-12", created_at: "2026-08-14T09:15:00+07:00", latitude: MB["BANDAR LAMPUNG"].lat - 0.03, longitude: MB["BANDAR LAMPUNG"].lng + 0.03 },
  { id: "mock-18", status: "approved", brand: "IM3", branch_id: MB["BANDAR LAMPUNG"].id, plan_date: "2026-08-19", actual_date: "2026-08-19", event_category: "project", event_categories: null, network_category: "medium", target_sp: 10, target_fwa: 5, actual_sp: 11, actual_fwa: 6, cost_estimate: 3300000, cost_actual: 3300000, actual_rev_3m: 7900000, checkin_valid: true, geo_compliant: true, event_name: "Project Perluasan Way Halim", mc: "MC-11", created_at: "2026-08-19T08:50:00+07:00", latitude: MB["BANDAR LAMPUNG"].lat + 0.01, longitude: MB["BANDAR LAMPUNG"].lng + 0.01 },

  // Baris Maret-Juli 2026 - HANYA supaya Achievement/Productivity Trend (6
  // bulan terakhir) tidak rata datar lalu melonjak di bulan terakhir (semua
  // data asli memang baru mulai Agustus 2026, lihat MIN_MONTH_KEY). Sengaja
  // rasio target/actual & revenue/cost dibuat naik-turun tiap bulan (BUKAN
  // satu arah/monoton) supaya dua kurva punya bentuk berbeda satu sama
  // lain - achievement% & productivity% dua metrik independen di dunia nyata.
  { id: "mock-19", status: "approved", brand: "IM3", branch_id: MB.MEDAN.id, plan_date: "2026-03-05", actual_date: "2026-03-05", event_category: "directSelling", event_categories: null, network_category: "medium", target_sp: 16, target_fwa: 9, actual_sp: 9, actual_fwa: 5, cost_estimate: 3000000, cost_actual: 3000000, actual_rev_3m: 3600000, checkin_valid: true, geo_compliant: true, event_name: "Direct Selling Medan Mall (Mar)", mc: "MC-01", created_at: "2026-03-05T09:00:00+07:00", latitude: MB.MEDAN.lat + 0.02, longitude: MB.MEDAN.lng - 0.01 },
  { id: "mock-20", status: "approved", brand: "TRI", branch_id: MB.PEKANBARU.id, plan_date: "2026-03-18", actual_date: "2026-03-18", event_category: "sponsorship", event_categories: null, network_category: "weak", target_sp: 10, target_fwa: 5, actual_sp: 6, actual_fwa: 3, cost_estimate: 2200000, cost_actual: 2200000, actual_rev_3m: 2500000, checkin_valid: true, geo_compliant: true, event_name: "Sponsorship Pekanbaru Run (Mar)", mc: "MC-05", created_at: "2026-03-18T09:00:00+07:00", latitude: MB.PEKANBARU.lat - 0.02, longitude: MB.PEKANBARU.lng + 0.02 },

  { id: "mock-21", status: "approved", brand: "IM3", branch_id: MB.PADANG.id, plan_date: "2026-04-08", actual_date: "2026-04-08", event_category: "openBooth", event_categories: null, network_category: "medium", target_sp: 14, target_fwa: 8, actual_sp: 10, actual_fwa: 6, cost_estimate: 3800000, cost_actual: 3800000, actual_rev_3m: 3300000, checkin_valid: true, geo_compliant: true, event_name: "Open Booth Padang Plaza (Apr)", mc: "MC-07", created_at: "2026-04-08T09:00:00+07:00", latitude: MB.PADANG.lat + 0.02, longitude: MB.PADANG.lng - 0.02 },
  { id: "mock-22", status: "approved", brand: "TRI", branch_id: MB.PALEMBANG.id, plan_date: "2026-04-20", actual_date: "2026-04-20", event_category: "jointEvent", event_categories: null, network_category: "medium", target_sp: 12, target_fwa: 7, actual_sp: 9, actual_fwa: 5, cost_estimate: 2600000, cost_actual: 2600000, actual_rev_3m: 2900000, checkin_valid: true, geo_compliant: true, event_name: "Joint Event Kampus Sriwijaya (Apr)", mc: "MC-10", created_at: "2026-04-20T09:00:00+07:00", latitude: MB.PALEMBANG.lat - 0.02, longitude: MB.PALEMBANG.lng + 0.02 },

  { id: "mock-23", status: "approved", brand: "IM3", branch_id: MB["BANDAR LAMPUNG"].id, plan_date: "2026-05-06", actual_date: "2026-05-06", event_category: "thematic", event_categories: null, network_category: "weak", target_sp: 13, target_fwa: 7, actual_sp: 7, actual_fwa: 4, cost_estimate: 3400000, cost_actual: 3400000, actual_rev_3m: 5600000, checkin_valid: true, geo_compliant: true, event_name: "Thematic Ramadan Lampung (Mei)", mc: "MC-11", created_at: "2026-05-06T09:00:00+07:00", latitude: MB["BANDAR LAMPUNG"].lat + 0.02, longitude: MB["BANDAR LAMPUNG"].lng - 0.02 },
  { id: "mock-24", status: "approved", brand: "TRI", branch_id: MB.ACEH.id, plan_date: "2026-05-22", actual_date: "2026-05-22", event_category: "project", event_categories: null, network_category: "strong", target_sp: 11, target_fwa: 6, actual_sp: 6, actual_fwa: 3, cost_estimate: 2100000, cost_actual: 2100000, actual_rev_3m: 3800000, checkin_valid: true, geo_compliant: true, event_name: "Project Ekspansi Aceh Besar (Mei)", mc: "MC-03", created_at: "2026-05-22T09:00:00+07:00", latitude: MB.ACEH.lat - 0.02, longitude: MB.ACEH.lng + 0.02 },

  { id: "mock-25", status: "approved", brand: "TRI", branch_id: MB.MEDAN.id, plan_date: "2026-06-09", actual_date: "2026-06-09", event_category: "directSelling", event_categories: null, network_category: "strong", target_sp: 15, target_fwa: 8, actual_sp: 12, actual_fwa: 7, cost_estimate: 4000000, cost_actual: 4000000, actual_rev_3m: 4600000, checkin_valid: true, geo_compliant: true, event_name: "Direct Selling Medan Fair (Jun)", mc: "MC-02", created_at: "2026-06-09T09:00:00+07:00", latitude: MB.MEDAN.lat + 0.02, longitude: MB.MEDAN.lng + 0.02 },
  { id: "mock-26", status: "approved", brand: "IM3", branch_id: MB.PEKANBARU.id, plan_date: "2026-06-24", actual_date: "2026-06-24", event_category: "sponsorship", event_categories: null, network_category: "strong", target_sp: 9, target_fwa: 5, actual_sp: 8, actual_fwa: 4, cost_estimate: 2300000, cost_actual: 2300000, actual_rev_3m: 2500000, checkin_valid: true, geo_compliant: true, event_name: "Sponsorship Komunitas Pekanbaru (Jun)", mc: "MC-06", created_at: "2026-06-24T09:00:00+07:00", latitude: MB.PEKANBARU.lat - 0.02, longitude: MB.PEKANBARU.lng - 0.02 },

  { id: "mock-27", status: "approved", brand: "TRI", branch_id: MB.PADANG.id, plan_date: "2026-07-07", actual_date: "2026-07-07", event_category: "openBooth", event_categories: null, network_category: "weak", target_sp: 17, target_fwa: 9, actual_sp: 9, actual_fwa: 5, cost_estimate: 3600000, cost_actual: 3600000, actual_rev_3m: 6300000, checkin_valid: true, geo_compliant: true, event_name: "Open Booth Pasar Raya (Jul)", mc: "MC-07", created_at: "2026-07-07T09:00:00+07:00", latitude: MB.PADANG.lat + 0.02, longitude: MB.PADANG.lng + 0.02 },
  { id: "mock-28", status: "approved", brand: "IM3", branch_id: MB.PALEMBANG.id, plan_date: "2026-07-21", actual_date: "2026-07-21", event_category: "jointEvent", event_categories: null, network_category: "weak", target_sp: 10, target_fwa: 5, actual_sp: 6, actual_fwa: 3, cost_estimate: 2400000, cost_actual: 2400000, actual_rev_3m: 4900000, checkin_valid: true, geo_compliant: true, event_name: "Joint Event Jakabaring (Jul)", mc: "MC-09", created_at: "2026-07-21T09:00:00+07:00", latitude: MB.PALEMBANG.lat - 0.02, longitude: MB.PALEMBANG.lng - 0.02 },
];
// Target resmi (mh_activity_target) per branch(slug)×brand×bulan - dipakai
// achievementPct(). branch_id di sini SLUG (bukan uuid), diturunkan dari
// nama cabang lewat slug() yang sama dipakai kode asli (lib/activityTarget.js).
const MOCK_ACTIVITY_TARGETS = [
  { branch_id: slug("MEDAN"), brand: "IM3", month: "202608", target_sp: 28, target_fwa: 16, target_revenue: 20000000 },
  { branch_id: slug("MEDAN"), brand: "TRI", month: "202608", target_sp: 14, target_fwa: 8, target_revenue: 10000000 },
  { branch_id: slug("ACEH"), brand: "IM3", month: "202608", target_sp: 12, target_fwa: 7, target_revenue: 9000000 },
  { branch_id: slug("ACEH"), brand: "TRI", month: "202608", target_sp: 18, target_fwa: 10, target_revenue: 13000000 },
  { branch_id: slug("PEKANBARU"), brand: "TRI", month: "202608", target_sp: 28, target_fwa: 15, target_revenue: 19000000 },
  { branch_id: slug("PEKANBARU"), brand: "IM3", month: "202608", target_sp: 10, target_fwa: 5, target_revenue: 6000000 },
  { branch_id: slug("PADANG"), brand: "TRI", month: "202608", target_sp: 13, target_fwa: 7, target_revenue: 9000000 },
  { branch_id: slug("PADANG"), brand: "IM3", month: "202608", target_sp: 16, target_fwa: 9, target_revenue: 13000000 },
  { branch_id: slug("PALEMBANG"), brand: "IM3", month: "202608", target_sp: 22, target_fwa: 12, target_revenue: 15000000 },
  { branch_id: slug("PALEMBANG"), brand: "TRI", month: "202608", target_sp: 10, target_fwa: 6, target_revenue: 7000000 },
  { branch_id: slug("BANDAR LAMPUNG"), brand: "IM3", month: "202608", target_sp: 24, target_fwa: 13, target_revenue: 17000000 },
  { branch_id: slug("BANDAR LAMPUNG"), brand: "TRI", month: "202608", target_sp: 19, target_fwa: 10, target_revenue: 14000000 },
  // Target Maret-Juli 2026 - pasangan persis dgn baris mock-19..mock-28 di
  // atas, supaya Achievement Trend 6 bulan tidak nol di bulan-bulan itu.
  { branch_id: slug("MEDAN"), brand: "IM3", month: "202603", target_sp: 16, target_fwa: 9, target_revenue: 4000000 },
  { branch_id: slug("PEKANBARU"), brand: "TRI", month: "202603", target_sp: 10, target_fwa: 5, target_revenue: 2800000 },
  { branch_id: slug("PADANG"), brand: "IM3", month: "202604", target_sp: 14, target_fwa: 8, target_revenue: 4200000 },
  { branch_id: slug("PALEMBANG"), brand: "TRI", month: "202604", target_sp: 12, target_fwa: 7, target_revenue: 3300000 },
  { branch_id: slug("BANDAR LAMPUNG"), brand: "IM3", month: "202605", target_sp: 13, target_fwa: 7, target_revenue: 3700000 },
  { branch_id: slug("ACEH"), brand: "TRI", month: "202605", target_sp: 11, target_fwa: 6, target_revenue: 3100000 },
  { branch_id: slug("MEDAN"), brand: "TRI", month: "202606", target_sp: 15, target_fwa: 8, target_revenue: 4500000 },
  { branch_id: slug("PEKANBARU"), brand: "IM3", month: "202606", target_sp: 9, target_fwa: 5, target_revenue: 2600000 },
  { branch_id: slug("PADANG"), brand: "TRI", month: "202607", target_sp: 17, target_fwa: 9, target_revenue: 5100000 },
  { branch_id: slug("PALEMBANG"), brand: "IM3", month: "202607", target_sp: 10, target_fwa: 5, target_revenue: 2900000 },
];
// Titik instalasi POSM (mh_md_installations) - branch_id SLUG (sama seperti
// mh_sites/mh_posmat_stock), dipakai layer POSM di Activity Map.
const MOCK_POSM = [
  { id: "mock-posm-1", mode: "outlet", site_id: "MDN-OUT-014", street_description: null, branch_id: slug("MEDAN"), brand: "im3", location_status: "valid", created_at: "2026-08-03T11:00:00+07:00", latitude: MB.MEDAN.lat - 0.05, longitude: MB.MEDAN.lng + 0.02 },
  { id: "mock-posm-2", mode: "street", site_id: null, street_description: "Jl. Sisingamangaraja, Medan", branch_id: slug("MEDAN"), brand: "tri", location_status: "pending", created_at: "2026-08-11T11:00:00+07:00", latitude: MB.MEDAN.lat + 0.06, longitude: MB.MEDAN.lng - 0.04 },
  { id: "mock-posm-3", mode: "outlet", site_id: "ACH-OUT-002", street_description: null, branch_id: slug("ACEH"), brand: "im3", location_status: "valid", created_at: "2026-08-05T11:00:00+07:00", latitude: MB.ACEH.lat + 0.04, longitude: MB.ACEH.lng + 0.03 },
  { id: "mock-posm-4", mode: "outlet", site_id: "PKU-OUT-021", street_description: null, branch_id: slug("PEKANBARU"), brand: "tri", location_status: "valid", created_at: "2026-08-09T11:00:00+07:00", latitude: MB.PEKANBARU.lat - 0.04, longitude: MB.PEKANBARU.lng + 0.05 },
  { id: "mock-posm-5", mode: "street", site_id: null, street_description: "Jl. Khatib Sulaiman, Padang", branch_id: slug("PADANG"), brand: "im3", location_status: "pending", created_at: "2026-08-12T11:00:00+07:00", latitude: MB.PADANG.lat + 0.05, longitude: MB.PADANG.lng - 0.03 },
  { id: "mock-posm-6", mode: "outlet", site_id: "PLB-OUT-030", street_description: null, branch_id: slug("PALEMBANG"), brand: "tri", location_status: "valid", created_at: "2026-08-14T11:00:00+07:00", latitude: MB.PALEMBANG.lat - 0.03, longitude: MB.PALEMBANG.lng + 0.04 },
  { id: "mock-posm-7", mode: "outlet", site_id: "TLK-OUT-008", street_description: null, branch_id: slug("BANDAR LAMPUNG"), brand: "im3", location_status: "valid", created_at: "2026-08-17T11:00:00+07:00", latitude: MB["BANDAR LAMPUNG"].lat + 0.03, longitude: MB["BANDAR LAMPUNG"].lng + 0.02 },
  { id: "mock-posm-8", mode: "street", site_id: null, street_description: "Jl. Sudirman, Bandar Lampung", branch_id: slug("BANDAR LAMPUNG"), brand: "tri", location_status: "mismatch", created_at: "2026-08-19T11:00:00+07:00", latitude: MB["BANDAR LAMPUNG"].lat - 0.05, longitude: MB["BANDAR LAMPUNG"].lng - 0.02 },
];

// ─── Constants ────────────────────────────────────────────────────────────────
const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const C = {
  primary:   "#ED1C24",
  primaryL:  "#E23B86",
  primaryD:  "#C6168D",
  accent:    "#FF6F00",
  success:   "#2E7D32",
  successL:  "#E8F5E9",
  warning:   "#F57F17",
  warningL:  "#FFFDE7",
  error:     "#C62828",
  errorL:    "#FFEBEE",
  im3:       "#E53935",
  tri:       "#E23B86",
};

const mk = (d) => ({
  appBg:    d ? "#0A0C10" : "#F0F4FA",
  sidebar:  d ? "#0D1117" : "#FFFFFF",
  surface:  d ? "#111520" : "#FFFFFF",
  card:     d ? "#141824" : "#FFFFFF",
  hover:    d ? "#1A2030" : "#F0F4FA",
  line:     d ? "#1E2435" : "#E3E8F0",
  hi:       d ? "#E8EDF8" : "#0D1117",
  mid:      d ? "#7B8BAD" : "#4A5568",
  lo:       d ? "#4A5A7D" : "#7B8BAD",
  primary:  "#ED1C24",
  primaryBg: d ? "#2A0A14" : "#FCEAEE",
  primaryBd: d ? "#5A1030" : "#F3C6D6",
  success:  "#2E7D32",
  successBg: d ? "#0A2010" : "#E8F5E9",
  warning:  "#F57F17",
  warningBg: d ? "#2A1A00" : "#FFFDE7",
  error:    "#C62828",
  errorBg:  d ? "#2A0808" : "#FFEBEE",
  accent:   "#FF6F00",
  accentBg: d ? "#2A1500" : "#FFF3E0",
});

// ─── Nav Config ───────────────────────────────────────────────────────────────
const NAV = [
  { label: "Dashboard", icon: "grid", path: "dashboard" },
  { section: "ACTIVITY" },
  { label: "Activity Plan", icon: "calendar", path: "activities" },
  { label: "Activity Submission", icon: "send", path: "submission" },
  { label: "Activity Monitoring", icon: "monitor", path: "monitoring" },
  { label: "Calendar", icon: "cal", path: "calendar" },
  { section: "INTELLIGENCE" },
  { label: "Map Intelligence", icon: "map", path: "map" },
  { label: "Productivity Analytics", icon: "chart", path: "analytics" },
  { label: "Performance Insight", icon: "insight", path: "insight" },
  { label: "Leaderboard", icon: "trophy", path: "leaderboard" },
  { label: "Geo Compliance", icon: "pin", path: "geo-compliance" },
  { section: "MANAGEMENT" },
  { label: "Approval Center", icon: "check", path: "approval" },
  { label: "User Management", icon: "users", path: "assignments", route: "/martahub/assignments" },
  { label: "Master Data", icon: "db", path: "master" },
  { label: "POSM Stock", icon: "db", path: "posmat" },
  { label: "Validasi Lokasi", icon: "check", path: "validasi" },
  { label: "System Settings", icon: "settings", path: "settings" },
];

// Rute untuk item nav yang punya halaman tersendiri
const NAV_ROUTES = {
  activities: "/martahub/activities",
  submission: "/martahub/submission",
  monitoring: "/martahub/monitoring",
  calendar: "/martahub/calendar",
  map: "/martahub/map",
  analytics: "/martahub/analytics",
  insight: "/martahub/insight",
  leaderboard: "/martahub/leaderboard",
  "geo-compliance": "/martahub/geo-compliance",
  approval: "/martahub/approval",
  master: "/martahub/master",
  posmat: "/martahub/posmat",
  validasi: "/martahub/validasi",
  assignments: "/martahub/assignments",
  settings: "/martahub/settings",
};

// ─── Icons ────────────────────────────────────────────────────────────────────
function Icon({ name, size = 16, color = "currentColor" }) {
  const s = { width: size, height: size, flexShrink: 0 };
  const p = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    grid:     <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    calendar: <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    send:     <svg style={s} viewBox="0 0 24 24" {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    monitor:  <svg style={s} viewBox="0 0 24 24" {...p}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
    cal:      <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>,
    map:      <svg style={s} viewBox="0 0 24 24" {...p}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
    chart:    <svg style={s} viewBox="0 0 24 24" {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    insight:  <svg style={s} viewBox="0 0 24 24" {...p}><path d="M2 20h20M6 20V10M10 20V4M14 20V12M18 20V8"/></svg>,
    trophy:   <svg style={s} viewBox="0 0 24 24" {...p}><path d="M6 9H3.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h2.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16M8 22v-3M16 22v-3M6 2h12v10a6 6 0 0 1-12 0V2z"/></svg>,
    check:    <svg style={s} viewBox="0 0 24 24" {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    db:       <svg style={s} viewBox="0 0 24 24" {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>,
    users:    <svg style={s} viewBox="0 0 24 24" {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    settings: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    bell:     <svg style={s} viewBox="0 0 24 24" {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    sun:      <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    moon:     <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
    logout:   <svg style={s} viewBox="0 0 24 24" {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    arrow:    <svg style={s} viewBox="0 0 24 24" {...p}><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
    filter:   <svg style={s} viewBox="0 0 24 24" {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    pin:      <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    eye:      <svg style={s} viewBox="0 0 24 24" {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    dots:     <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
    chevD:    <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="6 9 12 15 18 9"/></svg>,
    chevL:    <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="15 18 9 12 15 6"/></svg>,
    chevR:    <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="9 18 15 12 9 6"/></svg>,
    menu:     <svg style={s} viewBox="0 0 24 24" {...p}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
    close:      <svg style={s} viewBox="0 0 24 24" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    panelClose: <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><path d="M16 15l-3-3 3-3"/></svg>,
    panelOpen:  <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><path d="M14 9l3 3-3 3"/></svg>,
    close:    <svg style={s} viewBox="0 0 24 24" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    expand:   <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
    hub:      <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>,
    img:      <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    activity: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    trendUp:  <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    money:    <svg style={s} viewBox="0 0 24 24" {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>,
    percent:  <svg style={s} viewBox="0 0 24 24" {...p}><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  };
  return icons[name] || null;
}

// ─── Mini Sparkline SVG ────────────────────────────────────────────────────────
function Sparkline({ data, color, height = 40 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const w = 120, h = height, pad = 4;
  const xStep = (w - pad * 2) / (data.length - 1);
  const yScale = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const pts = data.map((v, i) => `${pad + i * xStep},${yScale(v)}`).join(" ");
  const areaD = `M${pad},${h} L${pts.split(" ").map((p, i) => i === 0 ? `${p}` : p).join(" L")} L${pad + (data.length - 1) * xStep},${h} Z`;
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${color.replace("#","")})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={pad + (data.length - 1) * xStep} cy={yScale(data[data.length - 1])} r="3" fill={color}/>
    </svg>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ data, size = 140, strokeW = 22 }) {
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);
  let offset = 0;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      {data.map((d, i) => {
        const dash = (d.value / total) * circ;
        const gap = circ - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={d.color} strokeWidth={strokeW}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────
// Versi premium menggantikan LineChart lama (polyline lurus + label statis):
// kurva halus (Catmull-Rom → Bezier), animasi "menggambar" garis via motion,
// glow lembut di stroke, gridline + skala Y, dan tooltip interaktif saat hover
// (crosshair + titik highlight) - pola umum dashboard analytics kelas atas.
function catmullRomPath(points) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function TrendChart({ data, labels, color, height = 140, suffix = "%" }) {
  const [hoverI, setHoverI] = useState(null);
  const svgRef = useRef(null);
  const uid = useMemo(() => color.replace("#", ""), [color]);

  if (!data || data.length < 2) {
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "currentColor", opacity: 0.4 }}>Belum cukup data.</div>;
  }

  const w = 480, h = height, padX = 8, padTop = 20, padBottom = 20;
  const plotH = h - padTop - padBottom;
  const max = Math.max(...data, 1) * 1.18;
  const min = 0;
  const xStep = (w - padX * 2) / (data.length - 1);
  const yScale = (v) => padTop + plotH - ((v - min) / (max - min || 1)) * plotH;
  const points = data.map((v, i) => [padX + i * xStep, yScale(v)]);
  const linePath = catmullRomPath(points);
  const areaPath = `${linePath} L${points[points.length - 1][0]},${padTop + plotH} L${points[0][0]},${padTop + plotH} Z`;
  const last = points[points.length - 1];
  const hp = hoverI != null ? points[hoverI] : null;

  const handleMove = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    let idx = Math.round((relX - padX) / xStep);
    idx = Math.max(0, Math.min(data.length - 1, idx));
    setHoverI(idx);
  };

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMove} onMouseLeave={() => setHoverI(null)}>
        <defs>
          <linearGradient id={`tg-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="55%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = padTop + plotH * (1 - f);
          return (
            <g key={f}>
              <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" strokeDasharray="3 5" />
              <text x={w - padX} y={y - 4} textAnchor="end" fontSize="8.5" fill="currentColor" opacity="0.35" fontWeight="700">{Math.round(max * f)}{suffix}</text>
            </g>
          );
        })}

        <motion.path d={areaPath} fill={`url(#tg-${uid})`}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.35 }} />

        <motion.path d={linePath} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
          filter={`url(#glow-${uid})`}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />

        {hp && <line x1={hp[0]} y1={padTop} x2={hp[0]} y2={padTop + plotH} stroke={color} strokeOpacity="0.32" strokeWidth="1" strokeDasharray="3 3" />}

        {points.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === hoverI ? 5 : 3} fill={i === hoverI ? color : "white"}
            stroke={color} strokeWidth={i === hoverI ? 0 : 2} style={{ transition: "r .12s" }} />
        ))}

        <motion.circle cx={last[0]} cy={last[1]} r="7" fill={color} fillOpacity="0.18"
          animate={{ scale: [1, 1.7, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: `${last[0]}px ${last[1]}px` }} />
      </svg>

      {hp && (
        <div style={{
          position: "absolute", left: `${(hp[0] / w) * 100}%`, top: `${Math.max(0, (hp[1] / h) * 100 - 20)}%`,
          transform: "translate(-50%, -100%)", background: color, color: "#fff", fontSize: 11, fontWeight: 800,
          padding: "5px 10px", borderRadius: 9, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: `0 6px 16px ${color}55`, zIndex: 5,
        }}>
          {data[hoverI]}{suffix}
          <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.85 }}>{labels[hoverI]}</div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {labels.map((l, i) => (
          <span key={i} style={{ fontSize: 9.5, color: "currentColor", opacity: i === hoverI ? 0.9 : 0.42, fontWeight: i === hoverI ? 800 : 600, transition: "opacity .12s" }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// Ringkasan Tertinggi/Rata-rata/Bulan Ini di bawah tiap TrendChart - kartu
// chart-nya di-stretch grid setinggi kartu Activity Map di sebelahnya (lihat
// .mh-charts), jadi tanpa ini ruang di bawah kurva selalu kosong. marginTop
// "auto" pada wrapper-nya (dipasang di pemanggil, card jadi flex column)
// yang mendorongnya nempel ke dasar kartu, ngisi ruang itu, bukan cuma
// duduk pas-pasan di bawah kurva.
function TrendStatFooter({ t, data, labels, color, suffix = "%" }) {
  if (!data || data.length === 0) return null;
  let peakIdx = 0;
  for (let i = 1; i < data.length; i++) if (data[i] > data[peakIdx]) peakIdx = i;
  const avg = Math.round(data.reduce((s, v) => s + v, 0) / data.length);
  const latest = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : latest;
  const delta = latest - prev;
  const deltaColor = delta >= 0 ? C.success : C.error;
  const cell = (label, value, sub, subColor) => (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: t.lo, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ marginTop: 2, fontSize: 9.5, fontWeight: 600, color: subColor || t.lo }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid ${t.line}`, display: "flex" }}>
      {cell("Tertinggi", `${data[peakIdx]}${suffix}`, labels[peakIdx], color)}
      <div style={{ width: 1, alignSelf: "stretch", background: t.line }} />
      {cell("Rata-rata", `${avg}${suffix}`, "6 bulan terakhir")}
      <div style={{ width: 1, alignSelf: "stretch", background: t.line }} />
      {cell(labels[labels.length - 1], `${latest}${suffix}`, `${delta >= 0 ? "+" : ""}${delta}${suffix} vs bulan lalu`, deltaColor)}
    </div>
  );
}

// ─── Real data: mh_activities → bentuk KPI/Chart/Table Dashboard ─────────────
// (Menggantikan MOCK statis - dihitung dari baris mh_activities asli yang
// sudah discope per TMV via lib/martaScope.js. Formula ikut §9 MARTAHUB_SPEC.md:
//   Achievement % = Σactual_sp / Σtarget_sp × 100
//   Productivity % = Σrevenue / Σcost × 100  (revenue=actual_rev_3m, cost=cost_actual ?? cost_estimate)
//   Geo-compliance % = proporsi baris dengan checkin_valid/geo_compliant = true

const CAT_LABELS = { directSelling: "Direct Selling", sponsorship: "Sponsorship", thematic: "Thematic", jointEvent: "Joint Event", openBooth: "Open Booth", project: "Project" };
const CAT_COLORS = { directSelling: "#ED1C24", sponsorship: "#7B1FA2", thematic: "#E65100", jointEvent: "#00695C", openBooth: "#0277BD", project: "#455A64" };
const NET_LABELS = { strong: "Strong", medium: "Medium", weak: "Weak" };
const NET_COLORS = { strong: "#2E7D32", medium: "#F57F17", weak: "#C62828" };
const STATUS_LABELS = { draft: "Draft", planned: "Planned", checked_in: "Checked In", submitted: "Submitted", approved: "Approved", rejected: "Rejected", revisionRequired: "Revision Required", inProgress: "In Progress", done: "Done", completed: "Completed", cancelled: "Cancelled" };
const STATUS_COLORS = { draft: "#7B8BAD", planned: "#0277BD", checked_in: "#0277BD", submitted: "#F57F17", approved: "#2E7D32", rejected: "#C62828", revisionRequired: "#C62828", inProgress: "#F57F17", done: "#2E7D32", completed: "#2E7D32", cancelled: "#7B8BAD" };
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const MONTH_FULL = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
// Data mh_activities di-reset & mulai kembali dari Agustus 2026 - jadi month
// picker dashboard (dan window fetch datanya) tidak perlu/boleh mundur lebih
// jauh dari ini; batas atas selalu bulan berjalan (dihitung dari `now`).
const MIN_MONTH_KEY = "2026-08";
function pad2(n) { return String(n).padStart(2, "0"); }
function ymKey(y, m) { return `${y}-${pad2(m)}`; } // m: 1-12
function keyAddMonths(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return ymKey(Math.floor(total / 12), (total % 12) + 1);
}
function monthLabelFull(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_FULL[(m || 1) - 1]} ${y}`;
}

function titleCase(s) {
  if (!s) return "-";
  return String(s).replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()).trim();
}
function rowCategory(a) {
  const arr = Array.isArray(a.event_categories) ? a.event_categories : null;
  const key = (arr && arr[0]) || a.event_category || null;
  if (!key) return { key: "others", label: "Others", color: "#455A64" };
  return { key, label: CAT_LABELS[key] || titleCase(key), color: CAT_COLORS[key] || "#455A64" };
}
function fmtRupiah(n) {
  const v = n || 0;
  const jt = v / 1_000_000;
  if (Math.abs(jt) >= 1) return `Rp ${jt.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}
function pctStr(n) { return `${Math.round(n || 0)}%`; }
function sumBy(rows, fn) { return rows.reduce((s, r) => s + (fn(r) || 0), 0); }
// Achievement % resmi = Σactual_sp ÷ Σtarget RESMI (mh_activity_target, di-set
// TMV/Brand TMV per Branch×Brand×Bulan) - BUKAN lagi Σtarget yang BME
// declare sendiri per-plan (r.target_sp). Target per-plan BME TETAP dipakai
// utk kolom "Achievement" per-baris di tabel Recent Activity (metrik BEDA:
// progress event itu sendiri vs rencana BME sendiri) - jangan disatukan.
// `ctx` wajib: { branchSlugMap, activityTargets } - lihat lib/activityTarget.js
// utk jembatan branch_id v1(uuid)->v2(slug) & carry-forward bulan terdekat.
function achievementPct(rows, ctx) {
  const a = sumBy(rows, (r) => r.actual_sp);
  if (!ctx) return 0;
  const { branchSlugMap, activityTargets } = ctx;
  const seen = new Set();
  let t = 0;
  for (const r of rows) {
    const bs = branchSlugMap.get(r.branch_id);
    if (!bs || !r.brand || !r.plan_date) continue;
    const mk = monthKeyYYYYMM(r.plan_date);
    const key = `${bs}|${r.brand}|${mk}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const eff = nearestPriorTarget(activityTargets, bs, r.brand, mk);
    if (eff?.target_sp) t += eff.target_sp;
  }
  return t > 0 ? (a / t) * 100 : 0;
}
function productivityPct(rows) {
  const cost = sumBy(rows, (r) => r.cost_actual ?? r.cost_estimate);
  const rev = sumBy(rows, (r) => r.actual_rev_3m);
  return cost > 0 ? (rev / cost) * 100 : 0;
}
function costRatioPct(rows) {
  const rev = sumBy(rows, (r) => r.actual_rev_3m);
  const cost = sumBy(rows, (r) => r.cost_actual ?? r.cost_estimate);
  return rev > 0 ? (cost / rev) * 100 : 0;
}
function geoCompliancePct(rows) {
  const tracked = rows.filter((r) => r.checkin_valid !== null && r.checkin_valid !== undefined ? true : (r.geo_compliant !== null && r.geo_compliant !== undefined));
  if (!tracked.length) return 0;
  const ok = tracked.filter((r) => (r.checkin_valid ?? r.geo_compliant) === true).length;
  return (ok / tracked.length) * 100;
}
function monthKeyOf(dateStr) { return dateStr ? String(dateStr).slice(0, 7) : null; }
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_ABBR[(m || 1) - 1]} ${String(y).slice(2)}`;
}
function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" });
}
function breakdown(list, labelOf, colorOf) {
  const counts = new Map();
  for (const r of list) {
    const key = labelOf(r).key;
    const prev = counts.get(key) || { label: labelOf(r).label, color: colorOf(r), value: 0 };
    prev.value += 1;
    counts.set(key, prev);
  }
  const total = list.length;
  return [...counts.values()].sort((a, b) => b.value - a.value).map((c) => ({
    ...c,
    pct: total > 0 ? `${((c.value / total) * 100).toFixed(1)}%` : "0%",
  }));
}

const EMPTY_DASHBOARD = { kpis: [], achieveTrend: { data: [], labels: [] }, productivTrend: { data: [], labels: [] }, eventCategory: [], networkCat: [], activities: [], currentMonthLabel: "", currentCount: 0 };

function computeDashboardData(rows, branchMap, branchSlugMap, activityTargets, selectedMonthKey) {
  if (!rows) return EMPTY_DASHBOARD;
  const targetCtx = { branchSlugMap: branchSlugMap || new Map(), activityTargets: activityTargets || [] };
  // Bulan yang dilihat sekarang datang dari month picker (default: bulan
  // berjalan) - BUKAN selalu `new Date()` seperti sebelumnya, supaya user
  // bisa geser ke bulan lain (dibatasi >= Agustus 2026, lihat MIN_MONTH_KEY).
  const curKey = selectedMonthKey || MIN_MONTH_KEY;
  const prevKey = keyAddMonths(curKey, -1);
  const prevLabel = monthLabel(prevKey);

  const curRows = rows.filter((r) => monthKeyOf(r.plan_date) === curKey);
  const prevRows = rows.filter((r) => monthKeyOf(r.plan_date) === prevKey);

  const curRevenue = sumBy(curRows, (r) => r.actual_rev_3m);
  const prevRevenue = sumBy(prevRows, (r) => r.actual_rev_3m);
  const curAch = achievementPct(curRows, targetCtx), prevAch = achievementPct(prevRows, targetCtx);
  const curProd = productivityPct(curRows), prevProd = productivityPct(prevRows);
  const curCost = costRatioPct(curRows), prevCost = costRatioPct(prevRows);
  const curGeo = geoCompliancePct(curRows), prevGeo = geoCompliancePct(prevRows);

  const pctDelta = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0));
  const dCount = pctDelta(curRows.length, prevRows.length);
  const dAch = curAch - prevAch, dProd = curProd - prevProd, dCost = curCost - prevCost, dGeo = curGeo - prevGeo;
  const dRev = pctDelta(curRevenue, prevRevenue);
  const sub = (d, unit) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}${unit} vs ${prevLabel}`;

  const monthKeys = [];
  for (let i = 5; i >= 0; i--) monthKeys.push(keyAddMonths(curKey, -i));
  // Satu lintasan per bulan menghasilkan seluruh 6 seri (dipakai trend chart
  // besar DAN sparkline mini per-KPI) - hindari re-filter rows 6× terpisah.
  const monthlyRowsByKey = monthKeys.map((k) => rows.filter((r) => monthKeyOf(r.plan_date) === k));
  const series = {
    count: monthlyRowsByKey.map((rs) => rs.length),
    achievement: monthlyRowsByKey.map((rs) => Math.round(achievementPct(rs, targetCtx))),
    productivity: monthlyRowsByKey.map((rs) => Math.round(productivityPct(rs))),
    revenue: monthlyRowsByKey.map((rs) => sumBy(rs, (r) => r.actual_rev_3m)),
    costRatio: monthlyRowsByKey.map((rs) => Math.round(costRatioPct(rs))),
    geo: monthlyRowsByKey.map((rs) => Math.round(geoCompliancePct(rs))),
  };
  const achieveTrend = { data: series.achievement, labels: monthKeys.map(monthLabel) };
  const productivTrend = { data: series.productivity, labels: monthKeys.map(monthLabel) };

  const kpis = [
    { label: "Total Activity", value: String(curRows.length), sub: sub(dCount, "%"), trend: dCount >= 0 ? "up" : "down", color: "#2563EB", icon: "activity", spark: series.count },
    { label: "Achievement", value: pctStr(curAch), sub: sub(dAch, "pp"), trend: dAch >= 0 ? "up" : "down", color: C.primary, icon: "trophy", spark: series.achievement, hero: true },
    { label: "Productivity", value: pctStr(curProd), sub: sub(dProd, "pp"), trend: dProd >= 0 ? "up" : "down", color: C.primaryD, icon: "trendUp", spark: series.productivity, hero: true },
    { label: "Revenue (Actual)", value: fmtRupiah(curRevenue), sub: sub(dRev, "%"), trend: dRev >= 0 ? "up" : "down", color: C.accent, icon: "money", spark: series.revenue },
    { label: "Cost Ratio", value: pctStr(curCost), sub: sub(dCost, "pp"), trend: dCost <= 0 ? "up" : "down", color: C.warning, icon: "percent", spark: series.costRatio },
    { label: "Geo Compliance", value: pctStr(curGeo), sub: sub(dGeo, "pp"), trend: dGeo >= 0 ? "up" : "down", color: C.success, icon: "pin", spark: series.geo },
  ];

  const eventCategory = breakdown(curRows, (r) => rowCategory(r), (r) => rowCategory(r).color);
  const networkCat = breakdown(
    curRows,
    (r) => ({ key: r.network_category || "unknown", label: NET_LABELS[r.network_category] || titleCase(r.network_category) || "Belum diketahui" }),
    (r) => NET_COLORS[r.network_category] || "#7B8BAD"
  );

  const activities = curRows.map((r, i) => {
    const cat = rowCategory(r);
    const rev = r.actual_rev_3m ?? 0;
    const cost = r.cost_actual ?? r.cost_estimate ?? 0;
    // Sengaja pakai r.target_sp (target internal per-event, BME isi sendiri
    // saat Create Plan) - BEDA dari KPI "Achievement %" di atas yang sekarang
    // pakai target RESMI dari mh_activity_target. Ini progress event itu
    // sendiri vs rencana BME sendiri, bukan vs target Branch×Brand resmi.
    const ach = r.target_sp ? ((r.actual_sp ?? 0) / r.target_sp) * 100 : null;
    const prod = cost ? (rev / cost) * 100 : null;
    const statusKey = r.status || "draft";
    return {
      no: i + 1,
      name: r.event_name || "-",
      branch: branchMap.get(r.branch_id) || "-",
      cat: cat.label,
      catColor: cat.color,
      planDate: fmtDate(r.plan_date),
      actualDate: fmtDate(r.actual_date),
      target: `${r.target_sp ?? 0}/${r.target_fwa ?? 0}`,
      actual: r.actual_sp == null ? "-" : `${r.actual_sp}/${r.actual_fwa ?? 0}`,
      revenue: fmtRupiah(rev),
      productivity: prod == null ? "-" : pctStr(prod),
      achievement: ach == null ? "-" : pctStr(ach),
      status: STATUS_LABELS[statusKey] || titleCase(statusKey),
      statusColor: STATUS_COLORS[statusKey] || "#7B8BAD",
    };
  });

  return { kpis, achieveTrend, productivTrend, eventCategory, networkCat, activities, currentMonthLabel: monthLabel(curKey), currentCount: curRows.length };
}

// Rute nyata (dari NAV_ROUTES) - sebelumnya tombol-tombol ini tidak punya
// onClick sama sekali (murni dekoratif, klaim aksi yang tidak terjadi apa-apa).
// "Check In (GPS)"/"Upload Document" dihapus dari sini: itu alur mobile-only
// (Check-in & upload foto activity report), web tidak punya halaman utk itu -
// menampilkannya di sini akan menjanjikan sesuatu yang tidak bisa dilakukan.
const QUICK_ACTIONS = [
  { label: "Plan Activity", sub: "Buat plan baru", icon: "calendar", color: "#ED1C24", route: "activities" },
  { label: "Submit Activity", sub: "Catat hasil activity", icon: "send", color: "#7B1FA2", route: "submission" },
  { label: "Activity Monitoring", sub: "Pantau semua activity", icon: "monitor", color: "#0277BD", route: "monitoring" },
  { label: "Activity Calendar", sub: "Jadwal & ketersediaan", icon: "cal", color: "#00695C", route: "calendar" },
  { label: "Approval Center", sub: "Tinjau persetujuan", icon: "check", color: "#E65100", route: "approval" },
];

// ─── Main Component ────────────────────────────────────────────────────────────
export default function MartaHubDashboard() {
  const router = useRouter();
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("hub-theme") !== "light"
      : false
  );
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [scope, setScope] = useState(null);
  const [pendingCount, setPendingCount] = useState(null);
  const [rawActivities, setRawActivities] = useState([]);
  const [rawPosm, setRawPosm] = useState([]);
  const [branchMap, setBranchMap] = useState(() => new Map());
  // branch_id v1 (uuid, mh_branches) -> slug(nama) v2 (text, sama seperti
  // mh_sites/mh_activity_target) - jembatan utk hitung Achievement % dari
  // target resmi TMV (lib/activityTarget.js, diverifikasi 100% match).
  const [branchSlugMap, setBranchSlugMap] = useState(() => new Map());
  const [activityTargets, setActivityTargets] = useState([]);
  const [dataErr, setDataErr] = useState(null);
  // Tanggal berjalan utk topbar - refresh tiap menit, cukup utk display kalender.
  const [now, setNow] = useState(() => new Date());
  // Bulan yang sedang dilihat di dashboard (month picker) - default bulan
  // berjalan, tapi tak boleh mundur sebelum MIN_MONTH_KEY (Agustus 2026,
  // titik data mh_activities direset & mulai lagi dari nol).
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const k = ymKey(d.getFullYear(), d.getMonth() + 1);
    return k < MIN_MONTH_KEY ? MIN_MONTH_KEY : k;
  });

  const t = mk(dark);

  // Bentuk KPI/chart/table dari baris mh_activities asli (sudah discope TMV)
  const data = useMemo(
    () => computeDashboardData(rawActivities, branchMap, branchSlugMap, activityTargets, selectedMonth),
    [rawActivities, branchMap, branchSlugMap, activityTargets, selectedMonth]
  );

  // Batas month picker: bawah tetap MIN_MONTH_KEY, atas mengikuti bulan
  // berjalan (tidak bisa lihat bulan depan yang datanya belum ada).
  const nowMonthKey = ymKey(now.getFullYear(), now.getMonth() + 1);
  const canPrevMonth = selectedMonth > MIN_MONTH_KEY;
  const canNextMonth = selectedMonth < nowMonthKey;
  const goPrevMonth = () => canPrevMonth && setSelectedMonth((k) => keyAddMonths(k, -1));
  const goNextMonth = () => canNextMonth && setSelectedMonth((k) => keyAddMonths(k, 1));

  // Titik Activity Map - data ASLI dari mh_activities (evidence, boleh tampil
  // apa adanya sesuai §0.2), MENGGANTIKAN 10 pin kota contoh yang sebelumnya
  // di-hardcode di SumatraMap.jsx (bukan dari database sama sekali).
  const mapActivities = useMemo(() => rawActivities
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map((r) => {
      const statusKey = r.status || "draft";
      return {
        lat: r.latitude, lng: r.longitude,
        name: r.event_name || "-",
        branch: branchMap.get(r.branch_id) || null,
        status: STATUS_LABELS[statusKey] || titleCase(statusKey),
        color: STATUS_COLORS[statusKey] || "#7B8BAD",
      };
    }), [rawActivities, branchMap]);

  // Titik POSM utk layer kedua di Activity Map - branch_id-nya slug text
  // (mis. "bandar-lampung"), bukan uuid mh_branches, jadi nama cabang di sini
  // diturunkan langsung dari slug-nya (bukan lookup ke branchMap yang keyed
  // by uuid) - cukup utk label tooltip peta.
  const mapPosm = useMemo(() => rawPosm
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map((r) => ({
      lat: r.latitude, lng: r.longitude,
      name: r.mode === "activity" ? "Instalasi POSM" : r.mode === "outlet" ? (r.site_id || "POSM Outlet") : (r.street_description || "Street Branding"),
      branch: r.branch_id ? r.branch_id.replace(/-/g, " ").toUpperCase() : null,
      mode: r.mode,
    })), [rawPosm]);

  // Filter Recent Activity berdasarkan tab status
  const filteredActivities = activeTab === "All"
    ? data.activities
    : data.activities.filter((a) => a.status === activeTab);
  const tabCount = (tab) => tab === "All" ? data.activities.length : data.activities.filter((a) => a.status === tab).length;

  useEffect(() => {
    // Sync theme from hub-theme (set by auth pages), fallback to system preference
    const saved = localStorage.getItem("hub-theme");
    if (saved) setDark(saved !== "light");
    else setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    guardMarta(router, "/martahub").then((res) => {
      if (!res.ok) return; // guard sudah redirect
      setUser(res.session.user);
      setProfile(res.profile);
      setLoading(false);
    });
  }, [router]);

  // Ambil scope TMV + data mh_activities asli (6 bulan terakhir) begitu user login diketahui
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const sc = await getMartaScope(user.email);
        if (cancelled) return;
        setScope(sc);

        // Sejak fase approval Actual dihapus (validasi otomatis via trigger
        // server), satu-satunya antrean approval manusia yang tersisa adalah
        // 'plan_submitted' - badge ini mengikuti approvalQueueProvider mobile.
        let pendingQ = supabaseMarta.from("mh_activities").select("id", { count: "exact", head: true }).eq("status", "plan_submitted");
        pendingQ = await applyMartaScope(pendingQ, sc);
        const { count: pending } = await pendingQ;
        if (!cancelled) setPendingCount(pending ?? 0);

        const { data: branches, error: branchErr } = await supabaseMarta.from("mh_branches").select("id, name");
        if (!cancelled && !branchErr && branches) {
          setBranchMap(new Map(branches.map((b) => [b.id, b.name])));
          setBranchSlugMap(new Map(branches.map((b) => [b.id, slug(b.name)])));
        }

        // Target resmi Achievement % (mh_activity_target, di-set TMV/Brand TMV
        // via Master Data > Target Aktivitas) - tabel kecil, org-wide, RLS
        // select-all, dibaca langsung tanpa RPC (pola sama mh_posmat_target).
        const { data: targets, error: targetErr } = await supabaseMarta
          .from("mh_activity_target")
          .select("branch_id,brand,month,target_sp,target_fwa,target_revenue");
        if (!cancelled && !targetErr && targets) setActivityTargets(targets);

        // Data mh_activities direset & mulai lagi dari Agustus 2026 (lihat
        // MIN_MONTH_KEY) - jadi fetch selalu dari titik itu, BUKAN rolling
        // "5 bulan dari hari ini" seperti sebelumnya (supaya month picker
        // yang mundur sampai Agustus tetap dapat datanya, sekaligus tidak
        // pernah menarik histori dari sebelum reset).
        const sinceISO = `${MIN_MONTH_KEY}-01`;

        let q = supabaseMarta
          .from("mh_activities")
          .select("id,status,brand,branch_id,plan_date,actual_date,event_category,event_categories,network_category,target_sp,target_fwa,actual_sp,actual_fwa,cost_estimate,cost_actual,actual_rev_3m,checkin_valid,geo_compliant,event_name,mc,created_at,latitude,longitude")
          .gte("plan_date", sinceISO)
          .order("plan_date", { ascending: false });
        q = await applyMartaScope(q, sc);
        const { data: rows, error } = await q;
        if (cancelled) return;
        if (error) throw new Error(error.message);
        setRawActivities(rows || []);

        // Titik instalasi POSM (mh_md_installations) utk layer kedua di
        // Activity Map - branch_id di sini SLUG TEXT (bukan uuid mh_branches
        // seperti mh_activities), jadi scoping-nya lewat applyMartaScopeSlug
        // (lihat lib/martaScope.js). Best-effort: gagal di sini tidak boleh
        // menjatuhkan data activity yang sudah berhasil dimuat.
        try {
          let pq = supabaseMarta
            .from("mh_md_installations")
            .select("id,mode,site_id,street_description,branch_id,brand,location_status,created_at,latitude,longitude")
            .not("latitude", "is", null).not("longitude", "is", null)
            .order("created_at", { ascending: false })
            .limit(500);
          pq = await applyMartaScopeSlug(pq, sc);
          const { data: posmRows, error: posmErr } = await pq;
          if (!cancelled && !posmErr) setRawPosm(posmRows || []);
        } catch { /* best-effort, layer POSM opsional */ }

        // ── MOCK DASHBOARD DATA - lihat blok besar di dekat import atas
        // file (MOCK_ACTIVITIES dkk) - override HANYA di state lokal
        // browser, dijalankan paling akhir supaya menang dari fetch asli
        // di atas. Hapus 4 baris ini + blok konstanta MOCK_* utk kembali
        // ke data asli.
        if (!cancelled && USE_MOCK_DASHBOARD_DATA) {
          setRawActivities(MOCK_ACTIVITIES);
          setActivityTargets(MOCK_ACTIVITY_TARGETS);
          setRawPosm(MOCK_POSM);
          setPendingCount(2);
        }
      } catch (e) {
        if (!cancelled) setDataErr(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

  // Responsif: <768 = mobile (sidebar jadi drawer), 768–1200 = auto-collapse
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const m = w < 768;
      setMobile(m);
      if (m) setCollapsed(false);           // drawer selalu tampil penuh
      else { setDrawerOpen(false); setCollapsed(w < 1200); }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/marta/login");
  };

  const toggleNav = () => (mobile ? setDrawerOpen((o) => !o) : setCollapsed((c) => !c));

  // Nama & inisial tampilan dari profil SandraHub
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Pengguna";
  const initial = (profile?.full_name || user?.email || "M").trim()[0]?.toUpperCase() || "M";
  const roleLabel = profile?.role === "spm_sumatera" ? "SPM Sumatera" : (profile?.role || "");
  const todayLabel = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const SIDEBAR_W = collapsed ? 64 : 240;

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--background,#F4F4F7)" }}>
      <HubLogoLoader variant="marta" logoSize={88} />
    </div>
  );

  return (
    <div className="mh-root" style={{ display: "flex", minHeight: "100vh", background: t.appBg, fontFamily: FONT, color: t.hi }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${dark ? "#1E2435" : "#D1DBF0"};border-radius:99px}
        .mh-nav{transition:background .15s,color .15s}
        .mh-nav:hover{background:${t.hover} !important}
        .mh-card{transition:box-shadow .2s,transform .2s}
        .mh-card:hover{box-shadow:0 8px 24px rgba(0,0,0,0.08) !important;transform:translateY(-1px)}
        .mh-btn{transition:opacity .14s,transform .1s;cursor:pointer;border:none;background:none;font-family:${FONT}}
        .mh-btn:hover{opacity:.8}
        .mh-btn:active{transform:scale(.97)}
        .mh-row:hover td{background:${t.hover} !important}
        @keyframes mh-pulse{0%,100%{opacity:1}50%{opacity:0.5}}

        /* ── Standarisasi dropdown & tombol ────────────────────────────────── */
        .mh-root select{
          -webkit-appearance:none !important; -moz-appearance:none !important; appearance:none !important;
          background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>") !important;
          background-repeat:no-repeat !important; background-position:right 11px center !important;
          background-size:13px !important; padding-right:30px !important; cursor:pointer;
        }
        .mh-root select::-ms-expand{display:none !important;}
        .mh-root button{ white-space:nowrap; }

        /* ── Responsive grids ── */
        .mh-content{padding:20px 24px 40px}
        .mh-brief{display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap}
        .mh-kpi-hero{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
        .mh-kpi-secondary{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
        .mh-charts{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:16px;margin-bottom:16px}
        .mh-donuts{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .mh-qa{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
        .mh-qa-btn{transition:transform .15s,box-shadow .15s}
        .mh-qa-btn:hover{transform:translateY(-2px)}
        .leaflet-container{background:${t.hover}}

        /* Laptop / half-screen */
        @media (max-width:1200px){
          .mh-kpi-secondary{grid-template-columns:repeat(2,1fr)}
          .mh-charts{grid-template-columns:1fr 1fr}
          .mh-qa{grid-template-columns:repeat(3,1fr)}
        }
        @media (max-width:900px){
          .mh-content{padding:16px 16px 32px}
          .mh-charts{grid-template-columns:1fr}
          .mh-donuts{grid-template-columns:1fr}
        }
        /* Mobile */
        @media (max-width:767px){
          .mh-kpi-hero{grid-template-columns:1fr;gap:10px}
          .mh-kpi-secondary{grid-template-columns:repeat(2,1fr);gap:10px}
          .mh-content{padding:14px 12px 28px}
          .mh-topbar{padding:0 14px !important;gap:10px !important}
          .mh-hide-sm{display:none !important}
          .mh-qa{grid-template-columns:repeat(2,1fr)}
        }
        @media (max-width:400px){
          .mh-kpi-secondary{grid-template-columns:1fr}
        }
        @media (prefers-reduced-motion: reduce){
          .mh-qa-btn, .mh-card{transition:none !important}
        }
      `}</style>

      {/* Backdrop untuk drawer mobile */}
      {mobile && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 290 }} />
      )}

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <div style={ mobile
        ? { width: 240, background: t.sidebar, borderRight: `1px solid ${t.line}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, height: "100vh", overflow: "hidden", zIndex: 300, transform: drawerOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform .25s cubic-bezier(.4,0,.2,1)", boxShadow: drawerOpen ? "0 0 40px rgba(0,0,0,0.3)" : "none" }
        : { width: SIDEBAR_W, minHeight: "100vh", background: t.sidebar, borderRight: `1px solid ${t.line}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflow: "hidden", transition: "width .22s cubic-bezier(.4,0,.2,1)", flexShrink: 0 } }>
        {/* Logo */}
        <div style={{ height: 60, flexShrink: 0, padding: collapsed ? 0 : "0 16px", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10, borderBottom: `1px solid ${t.line}`, cursor: "pointer", position: "relative" }} onClick={() => router.push("/")}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #ED1C24 0%, #C6168D 100%)" }} />
          <div style={{ width: 38, height: 38, flexShrink: 0, margin: collapsed ? "0 auto" : 0 }}>
            <HubLogo variant="marta" size={38} shadow={false} />
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.04em", color: t.hi, lineHeight: 1 }}>
                Marta<span style={{ background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
          {NAV.map((item, i) => {
            if (item.section) return (
              !collapsed ? <div key={i} style={{ padding: "14px 8px 6px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", color: t.lo, textTransform: "uppercase" }}>{item.section}</div>
              : <div key={i} style={{ height: 1, background: t.line, margin: "10px 8px" }} />
            );
            const active = activeNav === item.path;
            return (
              <div key={i} className="mh-nav" onClick={() => { const r = NAV_ROUTES[item.path]; if (r) { router.push(r); } else { setActiveNav(item.path); if (mobile) setDrawerOpen(false); } }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "10px 0" : "9px 10px", borderRadius: 9, cursor: "pointer", marginBottom: 1, justifyContent: collapsed ? "center" : "flex-start", background: active ? (dark ? "rgba(237,28,36,0.18)" : "rgba(237,28,36,0.08)") : "transparent", position: "relative" }}
                title={collapsed ? item.label : undefined}
              >
                <span style={{ color: active ? C.primary : t.lo, flexShrink: 0 }}><Icon name={item.icon} size={17} color={active ? C.primary : t.lo} /></span>
                {!collapsed && <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? C.primary : t.mid, flex: 1 }}>{item.label}</span>}
                {!collapsed && item.path === "approval" && !!pendingCount && <span style={{ fontSize: 10, fontWeight: 700, color: "white", background: C.error, borderRadius: 100, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{pendingCount}</span>}
                {active && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 3, background: C.primary, borderRadius: "0 3px 3px 0" }} />}
              </div>
            );
          })}
        </div>

        {/* User */}
        <div style={{ borderTop: `1px solid ${t.line}`, padding: collapsed ? "12px 0" : "12px 12px" }}>
          {!collapsed && user && (
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${C.primary},${C.primaryD})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{initial}</span>
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                <div style={{ fontSize: 10, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{roleLabel}</div>
              </div>
            </div>
          )}
          <button className="mh-btn" onClick={handleLogout}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 8, padding: collapsed ? "8px 0" : "8px 10px", borderRadius: 8, color: t.lo, fontSize: 12, fontWeight: 600 }}>
            <Icon name="logout" size={15} color={t.lo} />
            {!collapsed && "Sign Out"}
          </button>
        </div>
      </div>

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Topbar */}
        <div className="mh-topbar" style={{ height: 60, flexShrink: 0, background: t.surface, borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 16, position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #ED1C24 0%, #C6168D 100%)" }} />
          <button className="mh-btn" onClick={toggleNav} title={collapsed ? "Buka sidebar" : "Tutup sidebar"} style={{ padding: 6, borderRadius: 7, color: t.mid }}>
            <Icon name={mobile ? (drawerOpen ? "close" : "menu") : (collapsed ? "panelOpen" : "panelClose")} size={18} color={t.mid} />
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi }}>Dashboard</div>
            <div className="mh-hide-sm" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <Icon name="calendar" size={11} color={t.lo} />
              <span style={{ fontSize: 11, color: t.lo, fontWeight: 600, whiteSpace: "nowrap" }}>{todayLabel}</span>
              {data.currentMonthLabel && (
                <span style={{ fontSize: 11, color: t.lo, opacity: 0.75, whiteSpace: "nowrap" }}>· Periode {data.currentMonthLabel}</span>
              )}
            </div>
          </div>
          <div style={{ flex: 1 }} />

          {/* Bell - jumlah nyata dari antrean Approval (pendingCount), bukan dot dekoratif */}
          <button className="mh-btn" onClick={() => router.push("/martahub/approval")} title={pendingCount ? `${pendingCount} menunggu persetujuan` : "Tidak ada yang menunggu persetujuan"} style={{ position: "relative" }}>
            <div style={{ padding: 8, borderRadius: 9, border: `1.5px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="bell" size={17} color={t.mid} />
            </div>
            {!!pendingCount && (
              <div style={{ position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 99, background: C.error, border: `1.5px solid ${t.surface}`, color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {pendingCount > 99 ? "99+" : pendingCount}
              </div>
            )}
          </button>

          {/* Dark toggle */}
          <button className="mh-btn" onClick={() => setDark(!dark)} style={{ padding: 8, borderRadius: 9, border: `1.5px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", color: t.mid }}>
            <Icon name={dark ? "sun" : "moon"} size={16} color={t.mid} />
          </button>

          {/* Avatar */}
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${C.primary},${C.primaryD})`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title={`${displayName} · ${roleLabel}`}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{initial}</span>
          </div>
        </div>

        {/* Content */}
        <div className="mh-content" style={{ flex: 1, overflow: "auto" }}>

          {dataErr && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: t.errorBg, border: `1px solid ${C.error}30`, color: C.error, fontSize: 12, fontWeight: 600 }}>
              Gagal memuat data mh_activities: {dataErr}
            </div>
          )}
          {scope && !scope.unscoped && !scope.found && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: t.warningBg, border: `1px solid ${C.warning}30`, color: C.warning, fontSize: 12, fontWeight: 600 }}>
              Email Anda belum terdaftar sebagai profil MartaHub (mh_profiles) - dashboard menampilkan data kosong.
            </div>
          )}

          {/* ── Briefing - periode nyata + status approval nyata (data pendingCount
               sebelumnya sudah di-fetch tapi tidak pernah ditampilkan di konten). ── */}
          <div className="mh-brief">
            {/* Month picker - default bulan berjalan, tak bisa mundur sebelum
                Agustus 2026 (titik data direset) atau maju melewati hari ini. */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, background: t.card, border: `1px solid ${t.line}`, borderRadius: 100, padding: 3 }}>
              <button className="mh-btn" onClick={goPrevMonth} disabled={!canPrevMonth} title="Bulan sebelumnya"
                style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", opacity: canPrevMonth ? 1 : 0.28, cursor: canPrevMonth ? "pointer" : "default" }}>
                <Icon name="chevL" size={14} color={t.mid} />
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px", fontSize: 12.5, fontWeight: 800, color: t.hi, whiteSpace: "nowrap" }}>
                <Icon name="calendar" size={13} color={C.primary} />
                {monthLabelFull(selectedMonth)}
              </div>
              <button className="mh-btn" onClick={goNextMonth} disabled={!canNextMonth} title="Bulan berikutnya"
                style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", opacity: canNextMonth ? 1 : 0.28, cursor: canNextMonth ? "pointer" : "default" }}>
                <Icon name="chevR" size={14} color={t.mid} />
              </button>
            </div>
            <div style={{ fontSize: 13, color: t.mid }}>
              <b style={{ color: t.hi }}>{data.currentCount}</b> activity tercatat
            </div>
            <div style={{ flex: 1 }} />
            {pendingCount != null && (
              pendingCount > 0 ? (
                <button className="mh-btn" onClick={() => router.push("/martahub/approval")}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 100, background: t.warningBg, border: `1px solid ${C.warning}40` }}>
                  <Icon name="bell" size={13} color={C.warning} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#8a5b00" }}>{pendingCount} menunggu persetujuan</span>
                  <Icon name="arrow" size={12} color="#8a5b00" />
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 100, background: t.successBg }}>
                  <Icon name="check" size={13} color={C.success} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.success }}>Semua approval sudah diproses</span>
                </div>
              )
            )}
          </div>

          {/* ── KPI - 2 metrik utama (hero, dgn sparkline besar) + 4 pendukung ── */}
          <div className="mh-kpi-hero">
            {data.kpis.filter((k) => k.hero).map((kpi, i) => (
              <motion.div key={i} className="mh-card"
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                style={{ position: "relative", overflow: "hidden", background: dark ? `linear-gradient(135deg, ${kpi.color}22 0%, ${t.card} 60%)` : `linear-gradient(135deg, ${kpi.color}12 0%, ${t.card} 60%)`, border: `1px solid ${t.line}`, borderRadius: 16, padding: "18px 20px" }}>
                <div style={{ position: "absolute", right: -14, top: -14, opacity: dark ? 0.10 : 0.07, pointerEvents: "none" }}>
                  <Icon name={kpi.icon} size={104} color={kpi.color} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, position: "relative" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: kpi.color + "16", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon name={kpi.icon} size={16} color={kpi.color} />
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.03em", color: t.mid }}>{kpi.label}</div>
                    </div>
                    <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi, lineHeight: 1, marginBottom: 8, fontVariantNumeric: "tabular-nums" }}>{kpi.value}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 10, color: kpi.trend === "up" ? C.success : C.error, fontWeight: 800 }}>{kpi.trend === "up" ? "▲" : "▼"}</span>
                      <span style={{ fontSize: 11, color: kpi.trend === "up" ? C.success : C.error, fontWeight: 600 }}>{kpi.sub}</span>
                    </div>
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <Sparkline data={kpi.spark} color={kpi.color} height={46} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mh-kpi-secondary">
            {data.kpis.filter((k) => !k.hero).map((kpi, i) => (
              <motion.div key={i} className="mh-card"
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.14 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: kpi.color + "16", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={kpi.icon} size={15} color={kpi.color} />
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em", color: t.mid, lineHeight: 1.3 }}>{kpi.label}</div>
                </div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: t.hi, lineHeight: 1, marginBottom: 7, fontVariantNumeric: "tabular-nums" }}>{kpi.value}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 9.5, color: kpi.trend === "up" ? C.success : C.error, fontWeight: 800 }}>{kpi.trend === "up" ? "▲" : "▼"}</span>
                  <span style={{ fontSize: 10, color: kpi.trend === "up" ? C.success : C.error, fontWeight: 600 }}>{kpi.sub}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── Charts Row ────────────────────────────────────────────────── */}
          <motion.div className="mh-charts"
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            {/* Achievement Trend */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>Achievement Trend</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: t.lo, background: t.hover, borderRadius: 6, padding: "3px 8px" }}>6 Bulan Terakhir</span>
              </div>
              <div style={{ color: t.lo }}>
                <TrendChart data={data.achieveTrend.data} labels={data.achieveTrend.labels} color={C.primary} height={130} />
              </div>
              <TrendStatFooter t={t} data={data.achieveTrend.data} labels={data.achieveTrend.labels} color={C.primary} />
            </div>

            {/* Productivity Trend */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>Productivity Trend</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: t.lo, background: t.hover, borderRadius: 6, padding: "3px 8px" }}>6 Bulan Terakhir</span>
              </div>
              <div style={{ color: t.lo }}>
                <TrendChart data={data.productivTrend.data} labels={data.productivTrend.labels} color={C.primaryD} height={130} />
              </div>
              <TrendStatFooter t={t} data={data.productivTrend.data} labels={data.productivTrend.labels} color={C.primaryD} />
            </div>

            {/* Activity Map - filter layer sesungguhnya (status/site/wilayah) ada
                di dalam MapCard sendiri (tombol tune), tidak diduplikasi di sini. */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, marginBottom: 12 }}>Activity Map</div>
              <MapCard t={t} dark={dark} canManage={isMartaAdmin(profile?.role)} activityPoints={mapActivities} posmPoints={mapPosm} />
            </div>
          </motion.div>

          {/* ── Donut Charts Row ──────────────────────────────────────────── */}
          <motion.div className="mh-donuts"
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}>
            {/* Activity Category */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, marginBottom: 16 }}>Activity Category Contribution</div>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <DonutChart data={data.eventCategory} size={130} strokeW={20} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: t.hi }}>{data.eventCategory.reduce((s, d) => s + d.value, 0)}</div>
                    <div style={{ fontSize: 9.5, color: t.lo, fontWeight: 600 }}>Total</div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {data.eventCategory.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: t.mid }}>{d.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>{d.value}</span>
                        <span style={{ fontSize: 10.5, color: t.lo }}>({d.pct})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Network Category */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, marginBottom: 16 }}>Network Category Performance</div>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{ flexShrink: 0 }}>
                  <DonutChart data={data.networkCat} size={130} strokeW={20} />
                </div>
                <div style={{ flex: 1 }}>
                  {data.networkCat.map((d, i) => (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: t.mid }}>{d.label}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>{d.value} <span style={{ fontWeight: 400, color: t.lo, fontSize: 10.5 }}>({d.pct})</span></span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: t.hover, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: d.pct, background: d.color, borderRadius: 99 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Quick Actions ─────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
            <div className="mh-qa">
              {QUICK_ACTIONS.map((a, i) => (
                <button key={i} className="mh-btn mh-qa-btn" onClick={() => router.push(NAV_ROUTES[a.route])}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: a.color + "14", border: `1px solid ${a.color}30`, textAlign: "left", cursor: "pointer" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: a.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={a.icon} size={17} color="white" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: a.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</div>
                    <div style={{ fontSize: 10.5, color: a.color, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>

          {/* ── Recent Activity ──────────────────────────────────────────────
               Ringkasan saja (bukan tabel detail 14-kolom seperti sebelumnya) -
               detail penuh & filter lanjutan sudah ada di menu Activity
               Monitoring tersendiri; dashboard cukup menampilkan yang perlu
               diketahui sekilas + jalan pintas ke sana. Tab status diperbaiki:
               "Validated" sebelumnya tidak pernah cocok dgn status manapun
               (bug lama - tab itu selalu kosong), diganti "Rejected" yg nyata. */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>Recent Activity</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {["All", "Draft", "Submitted", "Approved", "Rejected"].map(tab => (
                  <button key={tab} className="mh-btn" onClick={() => setActiveTab(tab)}
                    style={{ padding: "4px 12px", borderRadius: 100, fontSize: 11, fontWeight: 700, border: `1.5px solid ${activeTab === tab ? "transparent" : t.line}`, background: activeTab === tab ? "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)" : "transparent", color: activeTab === tab ? "white" : t.mid, cursor: "pointer" }}>
                    {tab} <span style={{ opacity: 0.7, fontWeight: 600 }}>{tabCount(tab)}</span>
                  </button>
                ))}
                <button className="mh-btn" onClick={() => router.push("/martahub/monitoring")}
                  style={{ marginLeft: 8, padding: "4px 12px", borderRadius: 100, fontSize: 11, fontWeight: 700, border: `1.5px solid ${t.line}`, background: "transparent", color: C.primary, cursor: "pointer" }}>
                  View All
                </button>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: t.hover }}>
                    {["Event Name", "Branch", "Category", "Plan Date", "Achievement", "Status"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", fontSize: 10.5, fontWeight: 700, color: t.lo, textAlign: "left", whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}`, letterSpacing: "0.03em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: "26px 14px", textAlign: "center", fontSize: 12, color: t.lo }}>Tidak ada aktivitas untuk filter “{activeTab}”.</td></tr>
                  )}
                  {filteredActivities.slice(0, 8).map((a, i) => (
                    <tr key={i} className="mh-row" style={{ borderBottom: `1px solid ${t.line}` }}>
                      <td title={a.name} style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: t.hi, whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: t.mid, whiteSpace: "nowrap" }}>{a.branch}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ display: "inline-block", whiteSpace: "nowrap", fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: a.catColor + "18", color: a.catColor, border: `1px solid ${a.catColor}30` }}>{a.cat}</span>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 11.5, color: t.mid, whiteSpace: "nowrap" }}>{a.planDate}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: parseFloat(a.achievement) >= 100 ? C.success : C.warning, fontVariantNumeric: "tabular-nums" }}>{a.achievement}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: a.statusColor + "15", color: a.statusColor, border: `1px solid ${a.statusColor}35` }}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredActivities.length > 8 && (
              <div style={{ padding: "10px 20px", borderTop: `1px solid ${t.line}`, textAlign: "center" }}>
                <button className="mh-btn" onClick={() => router.push("/martahub/monitoring")} style={{ fontSize: 11.5, fontWeight: 700, color: C.primary }}>
                  Lihat {filteredActivities.length - 8} lainnya di Activity Monitoring →
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
