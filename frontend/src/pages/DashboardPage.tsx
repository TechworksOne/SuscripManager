import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign, TrendingUp, BarChart3, Clock, AlertTriangle,
  CalendarClock, ArrowRight, RefreshCw, CheckCircle2, XCircle,
  Info, Banknote,
} from "lucide-react";
import { apiFetch } from "../api/http";

// ─── Types ───────────────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";
type Toast = { id: string; type: ToastType; message: string };

type CobroItem = {
  id: number;
  fecha: string;
  monto: number;
  metodo: "EFECTIVO" | "TRANSFERENCIA" | "OTRO" | string;
  meses_pagados: number;
  boleta?: string | null;
  cliente_nombre: string;
  servicio: string;
  cuenta_correo: string;
  periodo_inicio?: string | null;
  nota?: string | null;
};

type ParaCobrarItem = {
  suscripcion_id: number;
  cliente_id: number;
  cliente_nombre: string;
  telefono?: string | null;
  servicio_id: number;
  servicio: string;
  cuenta_correo: string;
  precio_mensual: number;
  dia_cobro: number;
  fecha_inicio?: string | null;
  proximo_cobro?: string | null;
  atraso_dias: number;
  estado?: "ACTIVA" | "PAUSADA" | "CANCELADA" | string;
};

// ─── Utils ────────────────────────────────────────────────────────────────────
function money(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString("es-GT", { style: "currency", currency: "GTQ" });
}
function pad2(n: number) { return String(n).padStart(2, "0"); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function monthRangeISO() {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth();
  const from = `${y}-${pad2(m + 1)}-01`;
  const last = new Date(y, m + 1, 0);
  return { from, to: `${y}-${pad2(m + 1)}-${pad2(last.getDate())}` };
}
function safeDateOnly(s: string) { return s?.length >= 10 ? s.slice(0, 10) : s ?? ""; }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

// ─── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target: number, active: boolean, ms = 850): number {
  const [val, setVal] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!active) return;
    if (timer.current) clearInterval(timer.current);
    let frame = 0;
    const frames = Math.round(ms / 16);
    timer.current = setInterval(() => {
      frame++;
      const t = easeOutCubic(Math.min(frame / frames, 1));
      setVal(frame >= frames ? target : Math.round(t * target));
      if (frame >= frames) clearInterval(timer.current!);
    }, 16);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [target, active, ms]);
  return val;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function MethodBadge({ method }: { method: string }) {
  const s: Record<string, string> = {
    EFECTIVO:      "bg-slate-500/15 text-slate-300 border-slate-500/20",
    TRANSFERENCIA: "bg-blue-500/15  text-blue-300  border-blue-500/20",
    OTRO:          "bg-violet-500/15 text-violet-300 border-violet-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-[3px] rounded-full border text-[11px] font-medium ${s[method] ?? "bg-white/10 text-white/50 border-white/15"}`}>
      {method}
    </span>
  );
}

function AtrasoTag({ days }: { days: number }) {
  if (days > 30) return (
    <span className="inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full bg-red-500/15 border border-red-500/25 text-red-400 text-[11px] font-semibold">
      <AlertTriangle size={9} strokeWidth={2.5} />{days}d
    </span>
  );
  if (days > 0) return (
    <span className="inline-flex items-center px-2.5 py-[3px] rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[11px] font-semibold">
      {days}d
    </span>
  );
  if (days === 0) return (
    <span className="inline-flex items-center px-2.5 py-[3px] rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-400 text-[11px] font-semibold">
      Hoy
    </span>
  );
  return (
    <span className="inline-flex items-center px-2.5 py-[3px] rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[11px] font-medium">
      {Math.abs(days)}d
    </span>
  );
}

function EmptyState({ title, sub, icon: Icon }: {
  title: string; sub: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 gap-3 text-center">
      <div className="w-11 h-11 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
        <Icon size={20} className="text-white/20" />
      </div>
      <div>
        <p className="text-white/60 font-semibold text-[13px] leading-none">{title}</p>
        <p className="text-white/25 text-[12px] mt-1.5 max-w-[240px] leading-relaxed">{sub}</p>
      </div>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.04] ${className}`} />;
}

interface KpiCardProps {
  label: string; value: string; sub: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  iconClass: string; borderClass: string; glowClass: string;
  badge: string; badgeClass: string;
}
function KpiCard({ label, value, sub, icon: Icon, iconClass, borderClass, glowClass, badge, badgeClass }: KpiCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${borderClass} bg-white/[0.025] backdrop-blur-xl p-4 hover:-translate-y-0.5 transition-all duration-200 shadow-lg ${glowClass}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 ${iconClass}`}>
          <Icon size={15} strokeWidth={1.8} />
        </div>
        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-[3px] rounded-full border ${badgeClass}`}>
          {badge}
        </span>
      </div>
      <div className="text-[24px] font-black tracking-tight text-white leading-none mb-1">{value}</div>
      <div className="text-[12px] font-medium text-white/40 leading-none">{label}</div>
      {sub && <div className="text-[11px] text-white/20 mt-0.5 leading-none">{sub}</div>}
    </div>
  );
}

interface PanelProps { title: string; sub: string; action?: ReactNode; children: ReactNode; }
function Panel({ title, sub, action, children }: PanelProps) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-xl overflow-hidden shadow-xl shadow-black/15">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent">
        <div>
          <h2 className="text-[14px] font-bold text-white/85 leading-none">{title}</h2>
          <p className="text-[12px] text-white/30 mt-1.5 leading-none">{sub}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function pushToast(type: ToastType, message: string) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts(prev => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 2800);
  }

  const [pendientes, setPendientes] = useState<ParaCobrarItem[]>([]);
  const [cobrosMes, setCobrosMes]   = useState<CobroItem[]>([]);
  const [cobrosHoy, setCobrosHoy]   = useState<CobroItem[]>([]);

  async function loadAll() {
    setLoading(true);
    try {
      const hoy = todayISO();
      const { from, to } = monthRangeISO();
      const [rPend, rMes, rHoy] = await Promise.all([
        apiFetch<{ items: ParaCobrarItem[] }>("/cobros/para-cobrar"),
        apiFetch<{ items: CobroItem[] }>(`/cobros?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        apiFetch<{ items: CobroItem[] }>(`/cobros?from=${encodeURIComponent(hoy)}&to=${encodeURIComponent(hoy)}`),
      ]);
      setPendientes(rPend.items ?? []);
      setCobrosMes(rMes.items ?? []);
      setCobrosHoy(rHoy.items ?? []);
    } catch (e: any) {
      pushToast("error", e?.message ?? "No se pudo cargar el dashboard");
      setPendientes([]); setCobrosMes([]); setCobrosHoy([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = useMemo(() => {
    const totalHoy     = cobrosHoy.reduce((a, x) => a + Number(x.monto ?? 0), 0);
    const totalMes     = cobrosMes.reduce((a, x) => a + Number(x.monto ?? 0), 0);
    const atrasados    = pendientes.filter(p => Number(p.atraso_dias ?? 0) > 0).length;
    const vencen7      = pendientes.filter(p => { const a = Number(p.atraso_dias ?? 0); return a < 0 && Math.abs(a) <= 7; }).length;
    const mrrEstimado  = pendientes.reduce((a, p) => a + Number(p.precio_mensual ?? 0), 0);
    const clientesUnicos = new Set(pendientes.map(p => p.cliente_id)).size;
    return { totalHoy, totalMes, atrasados, vencen7, mrrEstimado, clientesUnicos, pendientes: pendientes.length };
  }, [cobrosHoy, cobrosMes, pendientes]);

  const topPendientes = useMemo(() =>
    [...pendientes].sort((a, b) => {
      const da = Number(a.atraso_dias ?? 0), db = Number(b.atraso_dias ?? 0);
      if (db !== da) return db - da;
      return (a.proximo_cobro ?? "9999-12-31").localeCompare(b.proximo_cobro ?? "9999-12-31");
    }).slice(0, 8),
  [pendientes]);

  const ultimosCobros = useMemo(() =>
    [...cobrosMes].sort((a, b) => safeDateOnly(b.fecha).localeCompare(safeDateOnly(a.fecha))).slice(0, 10),
  [cobrosMes]);

  // Count-up — must be called unconditionally (Rules of Hooks)
  const ready   = !loading;
  const cHoy    = useCountUp(kpis.totalHoy,     ready);
  const cMes    = useCountUp(kpis.totalMes,     ready);
  const cMrr    = useCountUp(kpis.mrrEstimado,  ready);
  const cPend   = useCountUp(kpis.pendientes,   ready);
  const cAtras  = useCountUp(kpis.atrasados,    ready);
  const cVenc   = useCountUp(kpis.vencen7,      ready);

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white/90">

      {/* Ambient glows */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{
        background: [
          "radial-gradient(900px 500px at 8% 0%,   rgba(99,102,241,0.11) 0%, transparent 55%)",
          "radial-gradient(700px 400px at 90% 18%,  rgba(59,130,246,0.08) 0%, transparent 55%)",
          "radial-gradient(600px 380px at 50% 100%, rgba(16,185,129,0.06) 0%, transparent 55%)",
        ].join(", "),
      }} />

      {/* Toasts */}
      <div aria-live="polite" aria-relevant="additions"
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[min(360px,calc(100vw-24px))]">
        {toasts.map(t => {
          const cfg = {
            success: { border: "border-emerald-500/25", Icon: CheckCircle2, cls: "text-emerald-400" },
            error:   { border: "border-red-500/25",     Icon: XCircle,       cls: "text-red-400"     },
            info:    { border: "border-blue-500/25",    Icon: Info,          cls: "text-blue-400"    },
          }[t.type];
          return (
            <div key={t.id} style={{ animation: "tbIn .16s ease-out" }}
              className={`flex items-start gap-2.5 px-4 py-3 rounded-2xl border ${cfg.border} bg-[#070b14]/95 backdrop-blur-xl text-white/80 text-[13px] leading-snug shadow-2xl`}>
              <cfg.Icon size={15} className={`${cfg.cls} flex-shrink-0 mt-0.5`} />
              {t.message}
            </div>
          );
        })}
      </div>

      {/* Page body */}
      <div className="relative z-10">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
          <div>
            <h1 className="text-[28px] font-black tracking-tight leading-none text-white">Dashboard</h1>
            <p className="mt-1.5 text-white/35 text-[13px] max-w-md leading-relaxed">
              Control operacional — cobranzas activas, ingresos y auditoría en tiempo real.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadAll}
              className="h-9 px-4 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/45 text-[13px] font-medium hover:bg-white/[0.07] hover:text-white/65 hover:border-white/[0.12] transition-all duration-150 cursor-pointer">
              <RefreshCw size={13} />Actualizar
            </button>
            <button onClick={() => nav("/cobranza")}
              className="h-9 px-4 flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white text-[13px] font-semibold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02] hover:brightness-110 transition-all duration-150 cursor-pointer">
              Abrir cobranza<ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* ── KPI grid ───────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className={`h-[108px] ${i === 0 ? "sm:col-span-2 lg:col-span-2" : ""}`} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">

            {/* HERO — Cobrado hoy */}
            <div className="sm:col-span-2 lg:col-span-2 relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/50 via-emerald-900/15 to-transparent backdrop-blur-xl p-5 hover:-translate-y-0.5 transition-all duration-200 shadow-xl shadow-emerald-500/[0.08]">
              <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
              <div className="flex items-start justify-between mb-4 relative">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                    <DollarSign size={17} strokeWidth={2} className="text-emerald-400" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Cobrado hoy</span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-[3px] rounded-full bg-emerald-500/12 border border-emerald-500/20 text-emerald-400/85">
                  <TrendingUp size={10} strokeWidth={2.5} />{cobrosHoy.length} cobros
                </span>
              </div>
              <div className="relative text-[36px] font-black tracking-tight text-white leading-none mb-1.5">{money(cHoy)}</div>
              <div className="text-[12px] text-white/25 font-mono">{todayISO()}</div>
            </div>

            {/* Cobrado este mes */}
            <KpiCard label="Cobrado este mes" value={money(cMes)} sub="Rango mensual"
              icon={Banknote}
              iconClass="bg-blue-500/15 border-blue-500/20 text-blue-400"
              borderClass="border-white/[0.07]" glowClass="shadow-blue-500/[0.05]"
              badge={`${cobrosMes.length} cobros`}
              badgeClass="bg-blue-500/10 border-blue-500/15 text-blue-400/75" />

            {/* MRR */}
            <KpiCard label="MRR estimado" value={money(cMrr)} sub="Ingresos recurrentes"
              icon={BarChart3}
              iconClass="bg-indigo-500/15 border-indigo-500/20 text-indigo-400"
              borderClass="border-white/[0.07]" glowClass="shadow-indigo-500/[0.05]"
              badge={`${kpis.clientesUnicos} clientes`}
              badgeClass="bg-indigo-500/10 border-indigo-500/15 text-indigo-400/75" />

            {/* Pendientes */}
            <KpiCard label="Pendientes" value={String(cPend)} sub="Servicios por cobrar"
              icon={Clock}
              iconClass="bg-amber-500/15 border-amber-500/20 text-amber-400"
              borderClass="border-white/[0.07]" glowClass="shadow-amber-500/[0.05]"
              badge={money(kpis.mrrEstimado)}
              badgeClass="bg-amber-500/10 border-amber-500/15 text-amber-400/75" />

            {/* Atrasados */}
            <KpiCard label="Atrasados" value={String(cAtras)} sub="Prioridad alta"
              icon={AlertTriangle}
              iconClass="bg-red-500/15 border-red-500/20 text-red-400"
              borderClass={kpis.atrasados > 0 ? "border-red-500/20" : "border-white/[0.07]"}
              glowClass={kpis.atrasados > 0 ? "shadow-red-500/[0.08]" : ""}
              badge={kpis.atrasados > 0 ? "Urgente" : "Al día"}
              badgeClass={kpis.atrasados > 0
                ? "bg-red-500/10 border-red-500/20 text-red-400/80"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400/80"} />

            {/* Vencen 7 días */}
            <KpiCard label="Vencen ≤ 7 días" value={String(cVenc)} sub="Riesgo inmediato"
              icon={CalendarClock}
              iconClass="bg-orange-500/15 border-orange-500/20 text-orange-400"
              borderClass="border-white/[0.07]" glowClass="shadow-orange-500/[0.05]"
              badge="Esta semana"
              badgeClass="bg-orange-500/10 border-orange-500/15 text-orange-400/75" />

          </div>
        )}

        {/* ── Panels ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Panel — Top pendientes */}
          <Panel title="Top pendientes" sub="Priorizado por días de atraso"
            action={
              <button onClick={() => nav("/cobranza")}
                className="h-8 px-3.5 flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white text-[12px] font-semibold shadow-md shadow-blue-500/20 hover:shadow-blue-500/35 hover:scale-[1.02] transition-all duration-150 cursor-pointer">
                Ir a cobranza<ArrowRight size={12} />
              </button>
            }>
            {loading ? (
              <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
            ) : topPendientes.length === 0 ? (
              <EmptyState title="Sin pendientes" sub="Excelente — no hay servicios por cobrar en este momento." icon={CheckCircle2} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" style={{ tableLayout: "fixed" }}>
                  <thead>
                    <tr className="border-b border-white/[0.05]">
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/20 w-[38%]">Cliente</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/20 w-[27%]">Servicio</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/20 w-[17%]">Estado</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-white/20 w-[18%]">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPendientes.map(p => (
                      <tr key={p.suscripcion_id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors duration-100">
                        <td className="px-4 py-3 overflow-hidden">
                          <div className="font-semibold text-[13px] text-white/80 truncate">{p.cliente_nombre}</div>
                        </td>
                        <td className="px-4 py-3 overflow-hidden">
                          <div className="text-[12px] text-white/35 truncate">{p.servicio}</div>
                        </td>
                        <td className="px-4 py-3"><AtrasoTag days={Number(p.atraso_dias ?? 0)} /></td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-[13px] font-bold text-white/70">{money(p.precio_mensual)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Panel — Últimos cobros */}
          <Panel title="Últimos cobros" sub="Auditoría rápida — este mes"
            action={
              <button onClick={() => nav("/historial-cobros")}
                className="h-8 px-3.5 flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/45 text-[12px] font-medium hover:bg-white/[0.07] hover:text-white/65 hover:border-white/[0.12] transition-all duration-150 cursor-pointer">
                Ver historial<ArrowRight size={12} />
              </button>
            }>
            {loading ? (
              <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
            ) : ultimosCobros.length === 0 ? (
              <EmptyState title="Sin cobros este mes" sub="Todavía no hay registros de cobros para el período actual." icon={Banknote} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" style={{ tableLayout: "fixed" }}>
                  <thead>
                    <tr className="border-b border-white/[0.05]">
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/20 w-[18%]">Fecha</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/20 w-[37%]">Cliente</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-white/20 w-[22%]">Monto</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-white/20 w-[23%]">Método</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimosCobros.map(x => (
                      <tr key={x.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors duration-100">
                        <td className="px-4 py-3">
                          <div className="text-[12px] text-white/35 font-mono tabular-nums">{safeDateOnly(x.fecha)}</div>
                        </td>
                        <td className="px-4 py-3 overflow-hidden">
                          <div className="font-semibold text-[13px] text-white/80 truncate">{x.cliente_nombre}</div>
                          <div className="text-[11px] text-white/30 truncate">{x.servicio}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-[13px] font-bold text-emerald-400">{money(x.monto)}</div>
                        </td>
                        <td className="px-4 py-3 text-center"><MethodBadge method={x.metodo} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

        </div>
      </div>

      <style>{`
        @keyframes tbIn {
          from { transform: translateY(-8px) scale(0.98); opacity: 0; }
          to   { transform: translateY(0)    scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
