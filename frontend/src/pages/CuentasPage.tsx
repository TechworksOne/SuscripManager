import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  CreditCard,
  Database,
  Edit2,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Monitor,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import type { Cuenta } from "../api/cuentas";
import {
  actualizarCuenta,
  crearCuenta,
  getCuentas,
  marcarPagado,
  toggleCuentaActiva,
} from "../api/cuentas";
import type { Servicio } from "../api/servicios";
import { getServicios } from "../api/servicios";
import AccesosPanel from "../components/AccesosPanel";
import "../styles/cuentas.css";

// ── Types ────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";
type Toast = { id: string; type: ToastType; message: string };
type PagoFilter = "all" | "due_today" | "overdue" | "ok" | "no_schedule";
type ModalTab = "cuenta" | "credenciales" | "pago" | "notas";
type BColor = "green" | "amber" | "red" | "slate" | "sky";
type MetricColor = "blue" | "green" | "amber" | "violet" | "slate";

// ── Helpers ──────────────────────────────────────────────

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

function mask(s?: string | null) {
  if (!s) return "—";
  return "••••••••••";
}

function clampDigits4(value: string) {
  return (value || "").replace(/\D/g, "").slice(0, 4);
}

function clampDay(value: string) {
  const only = (value || "").replace(/\D/g, "").slice(0, 2);
  if (!only) return "";
  const n = Number(only);
  if (!Number.isFinite(n)) return "";
  if (n < 1) return "1";
  if (n > 31) return "31";
  return String(n);
}

function ymdToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ymdKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function pagoHoyToastKey(cuentaId: number) {
  return `pago_hoy_notified:${cuentaId}:${ymdKey()}`;
}

function compareYmd(a: string, b: string) {
  // YYYY-MM-DD lexicográfico funciona perfecto
  return a.localeCompare(b);
}

// ── Helpers ──────────────────────────────────────────────

// ── Shared Tailwind class strings ────────────────────────
const inputCls =
  "w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/5 text-white/90 text-sm font-semibold placeholder:text-white/35 outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500/35 transition-all duration-150 disabled:opacity-50";
const selectCls = inputCls + " appearance-none cursor-pointer pr-9";

// ── MetricCard ───────────────────────────────────────────
function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: MetricColor;
  children?: React.ReactNode;
}) {
  const palette: Record<MetricColor, { wrap: string; icon: string; num: string }> = {
    blue:   { wrap: "border-sky-500/20 bg-sky-500/10",      icon: "bg-sky-500/15 text-sky-400",       num: "text-sky-200"    },
    green:  { wrap: "border-emerald-500/20 bg-emerald-500/10", icon: "bg-emerald-500/15 text-emerald-400", num: "text-emerald-200" },
    amber:  { wrap: "border-amber-500/20 bg-amber-500/10",   icon: "bg-amber-500/15 text-amber-400",   num: "text-amber-200"  },
    violet: { wrap: "border-violet-500/20 bg-violet-500/10", icon: "bg-violet-500/15 text-violet-400", num: "text-violet-200" },
    slate:  { wrap: "border-white/10 bg-white/5",            icon: "bg-white/10 text-white/55",        num: "text-white/80"   },
  };
  const { wrap, icon, num } = palette[color];
  return (
    <div
      className={`rounded-2xl border ${wrap} p-5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/25 cursor-default`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-white/40 mb-2">
            {label}
          </p>
          <p className={`text-5xl font-black tracking-tight leading-none ${num}`}>{value}</p>
          {children && <div className="mt-3 flex flex-wrap gap-1.5">{children}</div>}
        </div>
        <div className={`shrink-0 w-11 h-11 rounded-xl ${icon} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────
function Badge({ color = "slate" as BColor, children }: { color?: BColor; children: React.ReactNode }) {
  const m: Record<BColor, string> = {
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10  text-amber-400  border-amber-500/20",
    red:   "bg-red-500/10    text-red-400    border-red-500/20",
    slate: "bg-white/5       text-white/55   border-white/10",
    sky:   "bg-sky-500/10    text-sky-400    border-sky-500/20",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-extrabold ${m[color]}`}
    >
      {children}
    </span>
  );
}

// ── FieldLabel ───────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-extrabold uppercase tracking-widest text-white/50 mb-1.5">
      {children}
    </p>
  );
}

// ── SectionHead ──────────────────────────────────────────
function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-white/45">{title}</p>
      {hint && <p className="text-xs text-white/35 font-medium mt-0.5">{hint}</p>}
    </div>
  );
}

// ── Main component ───────────────────────────────────────
export default function CuentasPage() {
  const [items, setItems] = useState<Cuenta[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [activoFilter, setActivoFilter] = useState<"1" | "0" | "all">("1");
  const [pagoFilter, setPagoFilter] = useState<PagoFilter>("all");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Cuenta | null>(null);

  const [servicioId, setServicioId] = useState<string>("");
  const [correo, setCorreo] = useState("");
  const [passwordCorreo, setPasswordCorreo] = useState("");
  const [passwordApp, setPasswordApp] = useState("");
  const [cupoTotal, setCupoTotal] = useState<string>("5");
  const [notas, setNotas] = useState("");

  // pago
  const [tarjetaNombre, setTarjetaNombre] = useState("");
  const [tarjetaLast4, setTarjetaLast4] = useState("");
  const [diaPago, setDiaPago] = useState("");
  const [diaPagoFecha, setDiaPagoFecha] = useState("");

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);

  // Panel de accesos — qué cuenta está abierta (null = cerrado)
  const [accesosCuenta, setAccesosCuenta] = useState<Cuenta | null>(null);

  const [revealCorreo, setRevealCorreo] = useState<Record<number, boolean>>({});
  const [revealApp, setRevealApp] = useState<Record<number, boolean>>({});

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2400);
  };

  const todayYmd = ymdToday();

  function getPagoStatus(c: Cuenta) {
    const proximo = c.proximo_pago ? String(c.proximo_pago) : null;
    const dia = c.dia_pago ? Number(c.dia_pago) : null;

    if (!dia && !proximo) return { kind: "no_schedule" as const, label: "Sin calendario" };

    if (proximo) {
      const cmp = compareYmd(proximo, todayYmd);
      if (cmp === 0) return { kind: "due_today" as const, label: "Pendiente hoy" };
      if (cmp < 0) return { kind: "overdue" as const, label: "Atrasada" };
      return { kind: "ok" as const, label: "Al día" };
    }

    const todayDay = new Date().getDate();
    if (dia === todayDay) return { kind: "due_today" as const, label: "Pendiente hoy" };
    return { kind: "ok" as const, label: "Al día" };
  }

  async function refresh() {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([getCuentas(activoFilter), getServicios("1")]);
      const cuentas = (c.items || []) as Cuenta[];

      setItems(cuentas);
      setServicios((s.items || []) as Servicio[]);

      // ✅ Toast automático 1 vez por día por cuenta cuando toca pagar HOY o está atrasada
      for (const x of cuentas) {
        const activa = Number(x.activa ?? 1) === 1;
        if (!activa) continue;

        const st = getPagoStatus(x);
        if (st.kind !== "due_today" && st.kind !== "overdue") continue;

        const key = pagoHoyToastKey(x.id);
        if (localStorage.getItem(key)) continue;

        const servicio = x.nombre_servicio || `Servicio #${x.servicio_id}`;
        const last4 = x.tarjeta_last4 ? `**** ${x.tarjeta_last4}` : "sin tarjeta";
        pushToast("info", `Pago pendiente: ${servicio} (${last4})`);

        localStorage.setItem(key, "1");
      }
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo cargar cuentas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activoFilter]);

  const filtered = useMemo(() => {
    const needle = norm(q);

    let list = items;

    if (pagoFilter !== "all") {
      list = list.filter((c) => getPagoStatus(c).kind === pagoFilter);
    }

    if (needle) {
      list = list.filter(
        (x) => norm(x.correo).includes(needle) || norm(x.nombre_servicio).includes(needle)
      );
    }

    const rank = (c: Cuenta) => {
      const k = getPagoStatus(c).kind;
      if (k === "due_today") return 0;
      if (k === "overdue") return 1;
      if (k === "ok") return 2;
      return 3;
    };

    return [...list].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;

      const pa = a.proximo_pago ? String(a.proximo_pago) : "9999-12-31";
      const pb = b.proximo_pago ? String(b.proximo_pago) : "9999-12-31";
      const cmp = compareYmd(pa, pb);
      if (cmp !== 0) return cmp;

      return b.id - a.id;
    });
  }, [items, q, pagoFilter]);

  const totalActivasVista = useMemo(
    () => items.filter((x) => Number(x.activa ?? 1) === 1).length,
    [items]
  );
  const totalInactivasVista = useMemo(
    () => items.filter((x) => Number(x.activa ?? 1) === 0).length,
    [items]
  );

  // ✅ KPI: cupos disponibles totales en la vista actual
  const cuposDisponiblesVista = useMemo(() => {
    return filtered.reduce((acc, c) => {
      const total = Number(c.cupo_total ?? 0);
      const ocupado = Number(c.cupo_ocupado ?? 0);
      const disp = Math.max(0, total - ocupado);
      return acc + disp;
    }, 0);
  }, [filtered]);

  function resetForm() {
    setServicioId("");
    setCorreo("");
    setPasswordCorreo("");
    setPasswordApp("");
    setCupoTotal("5");
    setNotas("");

    setTarjetaNombre("");
    setTarjetaLast4("");
    setDiaPago("");
    setDiaPagoFecha("");
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setModalTab("cuenta");
    setOpen(true);
    window.setTimeout(() => scrollToTab("cuenta"), 0);
  }

  function openEdit(c: Cuenta) {
    setEditing(c);

    setServicioId(String(c.servicio_id ?? ""));
    setCorreo(String(c.correo ?? ""));
    setPasswordCorreo(String(c.password_correo ?? ""));
    setPasswordApp(c.password_app ? String(c.password_app) : "");
    setCupoTotal(String(c.cupo_total ?? 1));
    setNotas(c.notas ? String(c.notas) : "");

    setTarjetaNombre(c.tarjeta_nombre ? String(c.tarjeta_nombre) : "");
    setTarjetaLast4(c.tarjeta_last4 ? String(c.tarjeta_last4) : "");
    const dpStr = c.dia_pago ? String(c.dia_pago) : "";
    setDiaPago(dpStr);
    setDiaPagoFecha(""); // fecha picker no se pre-rellena en edición (solo extrae el día)

    setModalTab("cuenta");
    setOpen(true);
    window.setTimeout(() => scrollToTab("cuenta"), 0);
  }

  async function copy(text: string, okMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      pushToast("success", okMsg);
    } catch {
      pushToast("error", "No se pudo copiar (permiso del navegador)");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const sid = Number(servicioId);
    const correoTrim = correo.trim();
    const cupo = Number(cupoTotal);

    if (!Number.isFinite(sid) || sid <= 0) return pushToast("error", "Seleccione un servicio");
    if (correoTrim.length < 6 || !correoTrim.includes("@"))
      return pushToast("error", "Correo inválido");
    if ((passwordCorreo || "").trim().length < 2)
      return pushToast("error", "Contraseña de correo requerida");
    if (!Number.isFinite(cupo) || cupo < 1 || cupo > 50)
      return pushToast("error", "Cupo inválido (1–50)");

    const last4 = clampDigits4(tarjetaLast4);
    const dayStr = clampDay(diaPago);
    const day = dayStr ? Number(dayStr) : null;

    if (tarjetaLast4.trim() && last4.length !== 4)
      return pushToast("error", "Tarjeta: use exactamente 4 dígitos");
    if (diaPago.trim() && (!day || day < 1 || day > 31))
      return pushToast("error", "Día de pago inválido (1–31)");

    setSaving(true);
    try {
      const payload = {
        servicio_id: sid,
        correo: correoTrim,
        password_correo: passwordCorreo,
        password_app: passwordApp.trim() ? passwordApp : null,
        cupo_total: cupo,
        notas: notas.trim() ? notas : null,

        tarjeta_nombre: tarjetaNombre.trim() ? tarjetaNombre.trim() : null,
        tarjeta_last4: last4 ? last4 : null,
        dia_pago: day,
      };

      if (!editing) {
        await crearCuenta(payload);
        pushToast("success", "Cuenta creada");
      } else {
        await actualizarCuenta(editing.id, payload);
        pushToast("success", "Cuenta actualizada");
      }

      setOpen(false);
      await refresh();
    } catch (err: any) {
      pushToast("error", err?.message || "No fue posible guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActiva(c: Cuenta) {
    if (togglingId === c.id) return;

    const prev = Number(c.activa ?? 1) === 1;
    const next = !prev;

    setTogglingId(c.id);
    setItems((cur) => cur.map((x) => (x.id === c.id ? { ...x, activa: next ? 1 : 0 } : x)));

    try {
      await toggleCuentaActiva(c.id, next);
      pushToast("success", next ? "Activada" : "Desactivada");
      if (activoFilter !== "all") await refresh();
    } catch (err: any) {
      setItems((cur) => cur.map((x) => (x.id === c.id ? { ...x, activa: prev ? 1 : 0 } : x)));
      pushToast("error", err?.message || "No se pudo cambiar el estado");
    } finally {
      setTogglingId(null);
    }
  }

  async function onMarcarPagado(c: Cuenta) {
    if (payingId === c.id) return;

    const st = getPagoStatus(c);
    const permitido = st.kind === "due_today" || st.kind === "overdue";
    if (!permitido) {
      pushToast("info", "Esta cuenta está al día. No requiere marcar pagado.");
      return;
    }

    setPayingId(c.id);
    try {
      const r = await marcarPagado(c.id);
      pushToast("success", `Pagado. Próximo: ${r.proximo_pago}`);
      await refresh();
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo marcar pagado");
    } finally {
      setPayingId(null);
    }
  }

  const kpiPendientes = useMemo(() => {
    return items.filter((c) => {
      const st = getPagoStatus(c);
      return st.kind === "due_today" || st.kind === "overdue";
    }).length;
  }, [items]);

  /* =========================
     MODAL NAV (vertical)
  ========================= */
  const [modalTab, setModalTab] = useState<ModalTab>("cuenta");
  const modalScrollRef = useRef<HTMLDivElement | null>(null);

  const secCuentaRef = useRef<HTMLDivElement | null>(null);
  const secCredsRef = useRef<HTMLDivElement | null>(null);
  const secPagoRef = useRef<HTMLDivElement | null>(null);
  const secNotasRef = useRef<HTMLDivElement | null>(null);

  function refForTab(t: ModalTab) {
    if (t === "cuenta") return secCuentaRef;
    if (t === "credenciales") return secCredsRef;
    if (t === "pago") return secPagoRef;
    return secNotasRef;
  }

  function scrollToTab(t: ModalTab) {
    const el = refForTab(t).current;
    const sc = modalScrollRef.current;
    if (!el || !sc) return;
    // scroll suave dentro del contenedor (no la ventana)
    const top = el.offsetTop - 12;
    sc.scrollTo({ top, behavior: "smooth" });
  }

  function goTab(t: ModalTab) {
    setModalTab(t);
    scrollToTab(t);
  }

  return (
    <div className="w-full max-w-7xl mx-auto">

      {/* ── Toasts ───────────────────────────────────── */}
      <div
        className="fixed right-4 top-4 z-50 flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const tw =
            t.type === "success"
              ? "border-emerald-500/25 text-emerald-300"
              : t.type === "error"
              ? "border-red-500/25 text-red-300"
              : "border-sky-500/25 text-sky-300";
          return (
            <div
              key={t.id}
              className={`px-4 py-3 rounded-2xl border bg-[#080c18]/95 backdrop-blur-md font-bold text-sm shadow-2xl shadow-black/40 ${tw}`}
            >
              {t.message}
            </div>
          );
        })}
      </div>

      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[2.25rem] font-black tracking-tight text-white/95 leading-none">
            Cuentas
          </h1>
          <p className="mt-2 text-white/45 font-medium text-sm leading-relaxed">
            Administra cuentas de streaming, cupos y ciclos de pago.
            <span className="ml-2 text-white/30 text-xs">
              * Cupo ocupado = solo clientes activos.
            </span>
          </p>
        </div>
        <button
          onClick={openCreate}
          className="shrink-0 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-300 font-extrabold text-sm hover:bg-sky-500/20 hover:border-sky-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 shadow-lg shadow-sky-500/5"
        >
          <Plus className="w-4 h-4" />
          Nueva cuenta
        </button>
      </div>

      {/* ── KPI cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <MetricCard icon={Monitor} label="Cuentas (vista)" value={filtered.length} color="blue">
          <Badge color="green">
            <CheckCircle2 className="w-3 h-3" />
            {totalActivasVista} activas
          </Badge>
          <Badge color="slate">{totalInactivasVista} inact.</Badge>
        </MetricCard>

        <MetricCard icon={CheckCircle2} label="Activas" value={totalActivasVista} color="green" />

        <MetricCard
          icon={AlertTriangle}
          label="Pagos pendientes"
          value={kpiPendientes}
          color={kpiPendientes > 0 ? "amber" : "slate"}
        >
          {kpiPendientes > 0 && <Badge color="amber">Requieren acción</Badge>}
        </MetricCard>

        <MetricCard
          icon={Users}
          label="Cupos disponibles"
          value={cuposDisponiblesVista}
          color="violet"
        >
          <Badge color="slate">Clientes activos</Badge>
        </MetricCard>
      </div>

      {/* ── Filter bar ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-5">
        <div className="relative">
          <select
            value={activoFilter}
            onChange={(e) => setActivoFilter(e.target.value as "1" | "0" | "all")}
            className={selectCls + " w-full sm:w-36"}
          >
            <option value="1">Activas</option>
            <option value="0">Inactivas</option>
            <option value="all">Todas</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={pagoFilter}
            onChange={(e) => setPagoFilter(e.target.value as PagoFilter)}
            className={selectCls + " w-full sm:w-52"}
          >
            <option value="all">Todos los pagos</option>
            <option value="due_today">Pendientes hoy</option>
            <option value="overdue">Atrasadas</option>
            <option value="ok">Al día</option>
            <option value="no_schedule">Sin calendario</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por correo o servicio…"
            className={inputCls + " pl-10"}
          />
        </div>
      </div>

      {/* ── Content ──────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-8 h-8 text-sky-400/60 animate-spin" />
          <p className="text-white/35 font-semibold text-sm">Cargando cuentas…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/5 flex flex-col items-center text-center py-20 px-6">
          <div className="w-20 h-20 rounded-2xl bg-sky-500/8 border border-sky-500/15 flex items-center justify-center mb-6 shadow-lg shadow-sky-500/5">
            <Database className="w-9 h-9 text-sky-400/50" />
          </div>
          <h3 className="text-xl font-black text-white/80 mb-2">Sin cuentas</h3>
          <p className="text-white/40 font-medium text-sm max-w-xs mb-6 leading-relaxed">
            No hay cuentas que coincidan con los filtros. Ajústalos o crea la primera cuenta.
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-sky-500/12 border border-sky-500/20 text-sky-300 font-bold text-sm hover:bg-sky-500/18 hover:-translate-y-0.5 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Crear primera cuenta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const isActive   = Number(c.activa ?? 1) === 1;
            const isToggling = togglingId === c.id;
            const revC       = !!revealCorreo[c.id];
            const revA       = !!revealApp[c.id];
            const total      = Number(c.cupo_total ?? 1);
            const ocupado    = Number(c.cupo_ocupado ?? 0);
            const disponibles = Math.max(0, total - ocupado);
            const overflow    = (total - ocupado) < 0;
            const dia    = c.dia_pago      ? Number(c.dia_pago) : null;
            const last4  = c.tarjeta_last4 ? String(c.tarjeta_last4) : "";
            const tname  = c.tarjeta_nombre ? String(c.tarjeta_nombre) : "";
            const proximo = c.proximo_pago ? String(c.proximo_pago) : null;
            const st      = getPagoStatus(c);
            const pendiente = st.kind === "due_today" || st.kind === "overdue";
            const pagoBadgeColor: BColor =
              st.kind === "overdue"   ? "red"   :
              st.kind === "due_today" ? "amber" :
              st.kind === "ok"        ? "green" : "slate";

            return (
              <div
                key={c.id}
                className={`rounded-2xl border overflow-hidden flex flex-col transition-all duration-200 hover:shadow-xl hover:shadow-black/30 ${
                  isActive
                    ? "border-white/10 bg-white/5"
                    : "border-white/5  bg-white/1 opacity-70"
                }`}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3.5 border-b border-white/8 bg-black/10">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-base text-white/95 truncate">
                      {c.nombre_servicio || `Servicio #${c.servicio_id}`}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-white/35 font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/8">
                        ID {c.id}
                      </span>
                      <Badge color={pagoBadgeColor}>
                        {(st.kind === "overdue" || st.kind === "due_today") && (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {st.kind === "ok" && <CheckCircle2 className="w-3 h-3" />}
                        {st.label}
                        {proximo ? ` · ${proximo}` : dia ? ` · Día ${dia}` : ""}
                      </Badge>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-extrabold tracking-wide ${
                        isActive
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          : "bg-white/5 border-white/10 text-white/40"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isActive ? "bg-emerald-400" : "bg-white/30"
                        }`}
                      />
                      {isActive ? "ACTIVA" : "INACTIVA"}
                    </span>

                    {/* Toggle switch */}
                    <label
                      className={`relative inline-flex items-center cursor-pointer ${
                        isToggling ? "opacity-50 pointer-events-none" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isActive}
                        disabled={isToggling}
                        onChange={() => onToggleActiva(c)}
                      />
                      <div
                        className={`w-10 h-5 rounded-full border transition-all duration-200 relative ${
                          isActive
                            ? "bg-emerald-500/20 border-emerald-500/30"
                            : "bg-white/10 border-white/12"
                        }`}
                      >
                        <span
                          className={`absolute top-px w-4 h-4 rounded-full bg-white/90 shadow-sm transition-all duration-200 ${
                            isActive ? "left-4" : "left-0.5"
                          }`}
                        />
                      </div>
                    </label>
                  </div>
                </div>

                {/* Card body */}
                <div className="px-4 py-3.5 flex flex-col gap-3 flex-1">
                  {/* Email */}
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-widest text-white/35 w-18 shrink-0">
                      Correo
                    </span>
                    <span className="font-mono text-sm text-white/80 font-semibold truncate">
                      {c.correo}
                    </span>
                  </div>

                  {/* Credentials */}
                  <div className="flex flex-col gap-2">
                    {[
                      {
                        label: "Pass correo",
                        value: c.password_correo,
                        revealed: revC,
                        toggle: () => setRevealCorreo((p) => ({ ...p, [c.id]: !p[c.id] })),
                        onCopy: () =>
                          copy(String(c.password_correo || ""), "Contraseña correo copiada"),
                      },
                      {
                        label: "Pass cuenta",
                        value: c.password_app,
                        revealed: revA,
                        toggle: () => setRevealApp((p) => ({ ...p, [c.id]: !p[c.id] })),
                        onCopy: () =>
                          copy(String(c.password_app || ""), "Contraseña cuenta copiada"),
                      },
                    ].map(({ label, value, revealed, toggle, onCopy }) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-white/8 bg-white/5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-extrabold uppercase tracking-[.08em] text-white/35 mb-0.5">
                            {label}
                          </p>
                          <p className="font-mono text-sm text-white/80 font-semibold truncate">
                            {revealed ? String(value || "—") : mask(value)}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={toggle}
                            disabled={!value}
                            className="h-8 w-8 rounded-lg border border-white/8 bg-white/5 text-white/45 hover:text-white/80 hover:bg-white/8 transition-all flex items-center justify-center disabled:opacity-30"
                          >
                            {revealed ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={onCopy}
                            disabled={!value}
                            className="h-8 w-8 rounded-lg border border-white/8 bg-white/5 text-white/45 hover:text-white/80 hover:bg-white/8 transition-all flex items-center justify-center disabled:opacity-30"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mini stat cards */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-white/8 bg-white/5 p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/35 mb-1.5">
                        Cupos
                      </p>
                      <p className="text-2xl font-black text-white/85 tracking-tight">
                        {ocupado}/{total}
                      </p>
                      <p className="text-xs text-white/40 font-semibold mt-1">
                        {disponibles} disponibles
                        {overflow && (
                          <span className="ml-1.5 text-amber-400">⚠ Revisar</span>
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/5 p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        Pago
                      </p>
                      <p className="text-2xl font-black text-white/85 tracking-tight">
                        {dia ? `Día ${dia}` : "—"}
                      </p>
                      <p className="text-xs text-white/40 font-semibold mt-1 truncate">
                        {tname || "Sin tarjeta"}
                        {last4 ? ` · ****${last4}` : ""}
                      </p>
                    </div>
                  </div>

                  {c.notas && (
                    <p className="text-xs text-white/40 font-medium leading-relaxed px-0.5">
                      {c.notas}
                    </p>
                  )}
                </div>

                {/* Card footer */}
                <div className="flex gap-2 px-4 pb-4 pt-3 border-t border-white/8 bg-black/10">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-white/10 bg-white/5 text-white/65 font-bold text-sm hover:bg-white/8 hover:text-white/90 transition-all duration-200"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccesosCuenta(c)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-indigo-500/22 bg-indigo-500/8 text-indigo-300/80 font-bold text-sm hover:bg-indigo-500/14 hover:text-indigo-300 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Accesos
                  </button>
                  <button
                    type="button"
                    onClick={() => onMarcarPagado(c)}
                    disabled={payingId === c.id || !pendiente}
                    title={
                      !pendiente
                        ? "Solo disponible cuando hay pago pendiente"
                        : "Marcar como pagado"
                    }
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border font-bold text-sm transition-all duration-200 ${
                      pendiente
                        ? "bg-sky-500/12 border-sky-500/22 text-sky-300 hover:bg-sky-500/18 hover:border-sky-500/30 hover:-translate-y-0.5"
                        : "bg-white/5 border-white/8 text-white/25 cursor-not-allowed"
                    } disabled:opacity-50 disabled:translate-y-0`}
                  >
                    {payingId === c.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Actualizando…
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-3.5 h-3.5" />
                        Marcar pagado
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── AccesosPanel ──────────────────────────────── */}
      {accesosCuenta && (
        <AccesosPanel
          cuentaId={accesosCuenta.id}
          cupoTotal={Number(accesosCuenta.cupo_total ?? 0)}
          onClose={() => setAccesosCuenta(null)}
          pushToast={pushToast}
        />
      )}

      {/* ── Modal ────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/55 backdrop-blur-sm grid place-items-center p-4 z-40"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#080c18]/95 backdrop-blur-xl shadow-2xl shadow-black/60 flex flex-col max-h-[92vh]">
            {/* Modal header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-white/8">
              <div>
                <p className="font-black text-lg text-white/95">
                  {editing ? "Editar cuenta" : "Nueva cuenta"}
                </p>
                <p className="text-sm text-white/40 font-medium mt-0.5">
                  Servicio, credenciales, cupos y datos de pago.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-white/55 hover:text-white/90 hover:bg-white/8 transition-all flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex flex-1 min-h-0">
                {/* Sidebar nav (desktop) */}
                <aside className="hidden md:flex md:w-52 shrink-0 flex-col gap-2 border-r border-white/8 bg-black/10 p-3">
                  {(["cuenta", "credenciales", "pago", "notas"] as ModalTab[]).map((tab) => {
                    const meta: Record<ModalTab, { title: string; sub: string }> = {
                      cuenta:       { title: "Cuenta",       sub: "Servicio, cupos" },
                      credenciales: { title: "Credenciales", sub: "Contraseñas"     },
                      pago:         { title: "Pago",         sub: "Tarjeta, día"    },
                      notas:        { title: "Notas",        sub: "Detalle interno" },
                    };
                    const active = modalTab === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => goTab(tab)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all duration-150 ${
                          active
                            ? "border-sky-500/30 bg-sky-500/10"
                            : "border-white/8 bg-white/5 hover:bg-white/8"
                        }`}
                      >
                        <p
                          className={`font-extrabold ${
                            active ? "text-sky-300" : "text-white/75"
                          }`}
                        >
                          {meta[tab].title}
                        </p>
                        <p className="text-[11px] text-white/35 font-medium mt-0.5">
                          {meta[tab].sub}
                        </p>
                      </button>
                    );
                  })}
                </aside>

                {/* Horizontal tab pills (mobile) */}
                <div className="md:hidden flex gap-2 overflow-x-auto px-4 py-3 border-b border-white/8 shrink-0 w-full">
                  {(["cuenta", "credenciales", "pago", "notas"] as ModalTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => goTab(tab)}
                      className={`shrink-0 h-8 px-3.5 rounded-full border text-xs font-extrabold transition-all duration-150 ${
                        modalTab === tab
                          ? "border-sky-500/30 bg-sky-500/12 text-sky-300"
                          : "border-white/8 bg-white/5 text-white/55 hover:bg-white/8"
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Scrollable content */}
                <div className="flex-1 min-h-0 overflow-y-auto" ref={modalScrollRef}>
                  <div className="p-5 flex flex-col gap-1">

                    {/* CUENTA */}
                    <section ref={secCuentaRef} className="pb-5 mb-1 border-b border-white/8">
                      <SectionHead title="Cuenta" hint="Servicio, cupos y correo de acceso." />
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <FieldLabel>Servicio</FieldLabel>
                          <div className="relative">
                            <select
                              className={selectCls}
                              value={servicioId}
                              onChange={(e) => setServicioId(e.target.value)}
                              required
                            >
                              <option value="">Seleccione…</option>
                              {servicios.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.nombre_servicio}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                          </div>
                          {servicios.length === 0 && (
                            <p className="text-xs text-amber-400/80 mt-1.5 font-medium">
                              No hay servicios activos.
                            </p>
                          )}
                        </div>
                        <div>
                          <FieldLabel>Cupo total</FieldLabel>
                          <input
                            className={inputCls}
                            value={cupoTotal}
                            onChange={(e) =>
                              setCupoTotal(e.target.value.replace(/\D/g, "").slice(0, 2))
                            }
                            inputMode="numeric"
                            placeholder="5"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel>Correo</FieldLabel>
                        <input
                          className={inputCls}
                          value={correo}
                          onChange={(e) => setCorreo(e.target.value)}
                          placeholder="email@mail.com"
                          required
                        />
                      </div>
                    </section>

                    {/* CREDENCIALES */}
                    <section ref={secCredsRef} className="py-5 mb-1 border-b border-white/8">
                      <SectionHead title="Credenciales" hint="Acceso a correo y cuenta." />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <FieldLabel>Contraseña correo</FieldLabel>
                          <input
                            className={inputCls}
                            value={passwordCorreo}
                            onChange={(e) => setPasswordCorreo(e.target.value)}
                            placeholder="Requerida"
                            required
                          />
                        </div>
                        <div>
                          <FieldLabel>Contraseña cuenta</FieldLabel>
                          <input
                            className={inputCls}
                            value={passwordApp}
                            onChange={(e) => setPasswordApp(e.target.value)}
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                    </section>

                    {/* PAGO */}
                    <section ref={secPagoRef} className="py-5 mb-1 border-b border-white/8">
                      <SectionHead title="Pago" hint="Datos internos para control de cobro." />
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <FieldLabel>Nombre tarjeta</FieldLabel>
                          <input
                            className={inputCls}
                            value={tarjetaNombre}
                            onChange={(e) => setTarjetaNombre(e.target.value)}
                            placeholder="Ej: Visa BI"
                          />
                          <p className="text-[11px] text-white/30 mt-1.5 font-medium">Etiqueta interna.</p>
                        </div>
                        <div>
                          <FieldLabel>Últimos 4 dígitos</FieldLabel>
                          <input
                            className={inputCls}
                            value={tarjetaLast4}
                            onChange={(e) => setTarjetaLast4(clampDigits4(e.target.value))}
                            inputMode="numeric"
                            placeholder="1234"
                            maxLength={4}
                          />
                          <p className="text-[11px] text-white/30 mt-1.5 font-medium">Solo 4 dígitos.</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <FieldLabel>Día de pago</FieldLabel>
                          <input
                            type="date"
                            className={inputCls + " scheme-dark"}
                            value={diaPagoFecha}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDiaPagoFecha(v);
                              if (v) setDiaPago(String(new Date(v + "T00:00:00").getDate()));
                              else setDiaPago("");
                            }}
                          />
                          {diaPago ? (
                            <p className="text-[11px] text-white/40 mt-1.5 font-medium">
                              Genera próximo pago cada día <span className="text-white/65 font-bold">{diaPago}</span> del mes
                            </p>
                          ) : (
                            <p className="text-[11px] text-white/30 mt-1.5 font-medium">
                              Genera próximo pago automáticamente.
                            </p>
                          )}
                        </div>
                        <div>
                          <FieldLabel>Referencia interna</FieldLabel>
                          <input
                            className={inputCls}
                            value={notas}
                            onChange={(e) => setNotas(e.target.value)}
                            placeholder="Cuenta principal, etc."
                          />
                        </div>
                      </div>
                    </section>

                    {/* NOTAS */}
                    <section ref={secNotasRef} className="pt-5 pb-2">
                      <SectionHead
                        title="Notas"
                        hint="Información adicional para operaciones."
                      />
                      <textarea
                        className={inputCls + " h-auto py-3 min-h-24 resize-y"}
                        rows={4}
                        value={notas}
                        onChange={(e) => setNotas(e.target.value)}
                        placeholder="Información adicional…"
                      />
                    </section>
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-white/8 bg-black/10">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 px-5 rounded-xl border border-white/10 bg-white/5 text-white/60 font-bold text-sm hover:bg-white/8 hover:text-white/85 transition-all duration-150"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-10 px-5 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-300 font-extrabold text-sm hover:bg-sky-500/20 hover:border-sky-500/35 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear cuenta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
