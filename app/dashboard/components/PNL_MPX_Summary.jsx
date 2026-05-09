"use client";

import React, { useState, useMemo, useEffect } from 'react';
import supabase from "../../../lib/supabase"; 
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart3, 
  Wallet,
  ArrowUpRight, 
  ArrowDownRight,
  Download,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  AlertCircle,
  Search
} from 'lucide-react';

// --- UTILITIES ---
const formatIDR = (val) => {
  const isNegative = val < 0;
  const formatted = new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR', 
    maximumFractionDigits: 0 
  }).format(Math.abs(val));
  return isNegative ? `-${formatted}` : formatted;
};

const formatPct = (val) => isFinite(val) && val !== 0 ? `${val.toFixed(2)}%` : '0.00%';

const MPX_Summary_PNL = ({ activeContext, theme }) => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const isDark = theme === 'dark';

  // --- FETCH DATA DARI SUPABASE ---
  useEffect(() => {
    const fetchReportData = async () => {
      // Validasi: Pastikan semua context yang dibutuhkan tersedia
      if (!activeContext?.mpxName || !activeContext?.branch || !activeContext?.month || !activeContext?.year) {
        setIsLoading(false);
        setData(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        const { data: dbData, error: dbError } = await supabase
          .from('pnl_reports')
          .select('*')
          .eq('partner_name', activeContext.mpxName)
          .eq('branch', activeContext.branch)
          .eq('month', activeContext.month)
          .eq('year', activeContext.year)
          .maybeSingle();

        if (dbError) throw dbError;
        setData(dbData);
      } catch (err) {
        console.error("Fetch Summary Error:", err.message);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReportData();
  }, [activeContext]);

  // --- LOGIC: Agregasi Data ---
  const report = useMemo(() => {
    if (!data) return null;

    // 1. Hitung Omset (Retail Sales)
    const totalOmset = 
      (Number(data.retail_sp_3gb_im3) || 0) +
      (Number(data.retail_sp_0_im3) || 0) +
      (Number(data.retail_sp_kpk_3id) || 0) +
      (Number(data.retail_sp_3gb_3id) || 0) +
      (Number(data.retail_vc_0_im3) || 0) +
      (Number(data.retail_vc_2_5gb) || 0) +
      (Number(data.retail_vc_3gb_30) || 0) +
      (Number(data.retail_vc_3_5gb_5d) || 0) +
      (Number(data.retail_vc_5gb_5d) || 0) +
      (Number(data.retail_vc_7gb_7d) || 0) +
      (Number(data.retail_vc_fi_4gb) || 0) +
      (Number(data.retail_vc_fi_1_5gb_1d) || 0) +
      (Number(data.retail_vc_fi_3gb_1d) || 0) +
      (Number(data.retail_vc_fi_5gb_2d) || 0) +
      (Number(data.retail_vc_fi_3gb_3d) || 0) +
      (Number(data.retail_vc_fi_5gb_3d) || 0) +
      (Number(data.retail_vc_fi_15gb_7d) || 0) +
      (Number(data.retail_vc_0_3id) || 0) +
      (Number(data.mobo_jual) || 0);

    // 2. Breakdown Pendapatan
    const totalKomisi = 
      (Number(data.realtime_margin) || 0) + 
      (Number(data.back_margin) || 0) + 
      (Number(data.sla_fee) || 0) + 
      (Number(data.special_program) || 0);
    
    const totalHadiah = 
      (Number(data.rewards_champions) || 0) + 
      (Number(data.rewards_lainnya) || 0);

    const totalPendapatan = Number(data.grand_total_revenue) || 0;

    // 3. Breakdown Pengeluaran (Multiply Price * Qty)
    const totalOpex = 
      (Number(data.price_opex_gedung) * (Number(data.qty_opex_gedung) || 0)) +
      (Number(data.price_opex_kendaraan) * (Number(data.qty_opex_kendaraan) || 0)) +
      (Number(data.price_opex_listrik) * (Number(data.qty_opex_listrik) || 0)) +
      (Number(data.price_opex_air) * (Number(data.qty_opex_air) || 0)) +
      (Number(data.price_opex_it) * (Number(data.qty_opex_it) || 0)) +
      (Number(data.price_opex_logistik) * (Number(data.qty_opex_logistik) || 0)) +
      (Number(data.price_opex_asuransi) * (Number(data.qty_opex_asuransi) || 0)) +
      (Number(data.price_opex_lain) * (Number(data.qty_opex_lain) || 0));

    const totalSdm = 
      (Number(data.price_sdm_bm) * (Number(data.qty_sdm_bm) || 0)) +
      (Number(data.price_sdm_admin) * (Number(data.qty_sdm_admin) || 0)) +
      (Number(data.price_sdm_finance) * (Number(data.qty_sdm_finance) || 0)) +
      (Number(data.price_sdm_md) * (Number(data.qty_sdm_md) || 0)) +
      (Number(data.price_sdm_ss) * (Number(data.qty_sdm_ss) || 0)) +
      (Number(data.price_sdm_ops) * (Number(data.qty_sdm_ops) || 0)) +
      (Number(data.price_sdm_dinas) * (Number(data.qty_sdm_dinas) || 0));

    const totalMarketing = 
      (Number(data.price_mkt_ws) * (Number(data.qty_mkt_ws) || 0)) +
      (Number(data.price_mkt_retail) * (Number(data.qty_mkt_retail) || 0)) +
      (Number(data.price_mkt_event) * (Number(data.qty_mkt_event) || 0)) +
      (Number(data.price_mkt_lain) * (Number(data.qty_mkt_lain) || 0));

    const totalCom = 
      (Number(data.price_com_admin) * (Number(data.qty_com_admin) || 0)) +
      (Number(data.price_com_bunga) * (Number(data.qty_com_bunga) || 0));

    const totalPengeluaran = Number(data.grand_total_pengeluaran) || 0;

    // 4. Laba Bersih
    const netProfit = totalPendapatan - totalPengeluaran;
    const getRatio = (val) => (totalOmset > 0 ? (val / totalOmset) * 100 : 0);

    return {
      totalOmset, totalKomisi, totalHadiah,
      totalOpex, totalSdm, totalMarketing, totalCom,
      totalPendapatan, totalPengeluaran, netProfit, getRatio
    };
  }, [data]);

  // --- UI STATES ---
  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
      <p className="text-sm font-medium animate-pulse">Menghubungkan ke database...</p>
    </div>
  );

  if (!activeContext?.mpxName) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] opacity-40">
      <Search size={48} className="mb-4" />
      <p className="text-sm font-medium">Silakan pilih Partner dan Cabang terlebih dahulu.</p>
    </div>
  );

  if (error || !data) return (
    <div className={`max-w-md mx-auto my-20 p-8 rounded-3xl border text-center ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
      <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
      <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>Data Tidak Tersedia</h3>
      <p className="text-sm text-slate-500">Belum ada laporan final untuk {activeContext.mpxName} periode {activeContext.month} {activeContext.year}.</p>
    </div>
  );

  const cardCls = isDark ? 'bg-[#1C2026] border-white/5' : 'bg-white border-slate-200 shadow-sm';
  const tableHeaderCls = `uppercase text-[10px] font-bold tracking-widest pb-4 border-b ${isDark ? 'text-slate-500 border-white/5' : 'text-slate-400 border-slate-200'}`;
  
  const Row = ({ label, amount, ratio, isBold = false, indentLevel = 0, colorCls = "" }) => (
    <div className={`flex items-center justify-between py-3 border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
      <span className={`text-sm ${isBold ? 'font-semibold' : 'font-normal'} ${isDark ? 'text-slate-300' : 'text-slate-600'}`} style={{ paddingLeft: `${indentLevel * 24}px` }}>
        {label}
      </span>
      <div className="flex items-center gap-8 text-right">
        <span className={`text-sm ${isBold ? 'font-bold' : 'font-medium'} ${colorCls || (isDark ? 'text-slate-100' : 'text-slate-900')}`}>
          {formatIDR(amount || 0)}
        </span>
        <span className={`text-xs font-mono w-16 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {formatPct(ratio || 0)}
        </span>
      </div>
    </div>
  );

  return (
    <div className={`max-w-5xl mx-auto pb-20 px-4 font-sans antialiased transition-colors duration-200 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
      
      {/* 1. HEADER */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 pt-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-sm">
            <BarChart3 size={20} />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight">MPX Financial Summary</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">{activeContext.branch} • {activeContext.month} {data.year}</p>
          </div>
        </div>
        
        <div className="flex gap-2 group relative">
          <button className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold transition-all ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-slate-300 hover:bg-slate-50'}`}>
            <Download size={16} /> Download Report <ChevronDown size={14} />
          </button>
          <div className={`absolute top-full right-0 mt-2 w-40 rounded-xl border p-2 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-50 ${cardCls}`}>
            <button className={`w-full flex items-center gap-2 p-2 rounded-lg text-[10px] font-bold uppercase hover:bg-emerald-500/10 hover:text-emerald-500`}>
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <button className={`w-full flex items-center gap-2 p-2 rounded-lg text-[10px] font-bold uppercase hover:bg-rose-500/10 hover:text-rose-500`}>
              <FileText size={14} /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* 2. METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {[
          { label: 'Retail Omset', val: report.totalOmset, icon: Wallet, color: 'text-blue-500' },
          { label: 'Total Revenue', val: report.totalPendapatan, icon: ArrowUpRight, color: 'text-emerald-500' },
          { label: 'Total Expense', val: report.totalPengeluaran, icon: ArrowDownRight, color: 'text-rose-500' }
        ].map((m, i) => (
          <div key={i} className={`p-6 rounded-2xl border ${cardCls}`}>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{m.label}</p>
            <div className="flex items-center gap-3">
              <m.icon size={20} className={m.color} />
              <h3 className="text-xl font-bold tracking-tight">{formatIDR(m.val)}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* 3. TABLE */}
      <div className={`rounded-3xl border overflow-hidden ${cardCls}`}>
        <div className="p-6 md:p-8">
          <div className="flex justify-between items-center px-2 mb-2">
            <span className={tableHeaderCls + " flex-1"}>Description</span>
            <div className="flex gap-8 text-right">
              <span className={tableHeaderCls + " w-32"}>Amount</span>
              <span className={tableHeaderCls + " w-16"}>Ratio</span>
            </div>
          </div>

          <div className="mb-8">
            <Row label="A. Omset Penjualan (Retail)" amount={report.totalOmset} ratio={100} isBold />
            <Row label="Starter Pack & Voucher" amount={report.totalOmset - (Number(data.mobo_jual) || 0)} ratio={report.getRatio(report.totalOmset - (Number(data.mobo_jual) || 0))} indentLevel={1} />
            <Row label="Saldo MOBO" amount={data.mobo_jual} ratio={report.getRatio(data.mobo_jual)} indentLevel={1} />
          </div>

          <div className="mb-8">
            <Row label="B. Struktur Pendapatan" amount={report.totalPendapatan} ratio={report.getRatio(report.totalPendapatan)} isBold colorCls="text-emerald-500" />
            <div className="mt-2">
              <Row label="Total Komisi dan Insentif" amount={report.totalKomisi} ratio={report.getRatio(report.totalKomisi)} indentLevel={1} />
              <Row label="Rewards & Program" amount={report.totalHadiah} ratio={report.getRatio(report.totalHadiah)} indentLevel={1} />
              <Row label="Partner Extra Income" amount={data.partner_income} ratio={report.getRatio(data.partner_income)} indentLevel={1} />
            </div>
          </div>

          <div className="mb-8">
            <Row label="C. Struktur Pengeluaran" amount={report.totalPengeluaran} ratio={report.getRatio(report.totalPengeluaran)} isBold colorCls="text-rose-500" />
            <Row label="OPEX Branch" amount={report.totalOpex} ratio={report.getRatio(report.totalOpex)} indentLevel={1} />
            <Row label="SDM Branch" amount={report.totalSdm} ratio={report.getRatio(report.totalSdm)} indentLevel={1} />
            <Row label="Marketing & Cluster Dev" amount={report.totalMarketing} ratio={report.getRatio(report.totalMarketing)} indentLevel={1} />
            <Row label="Cost of Money" amount={report.totalCom} ratio={report.getRatio(report.totalCom)} indentLevel={1} />
            <Row label="Partner Extra Expense" amount={data.partner_expense} ratio={report.getRatio(data.partner_expense)} indentLevel={1} />
          </div>

          <div className={`p-8 rounded-[2rem] flex justify-between items-center mt-12 ${
            report.netProfit >= 0 ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
          }`}>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">Net Profit Before Tax</h3>
              <p className="text-[10px] italic opacity-60 mt-1">Total Pendapatan - Total Pengeluaran</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black tracking-tighter">{formatIDR(report.netProfit)}</p>
              <p className="text-[10px] font-bold bg-black/20 inline-block px-2 py-0.5 rounded mt-2 uppercase">Ratio: {formatPct(report.getRatio(report.netProfit))}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MPX_Summary_PNL;