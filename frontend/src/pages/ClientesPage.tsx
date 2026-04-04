import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Edit2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
  Users,
  UserX,
  X,
} from "lucide-react";
import type { Cliente, SuscripcionCliente } from "../api/clientes";
import { actualizarCliente, crearCliente, getClientes, toggleClienteActivo } from "../api/clientes";

import type { Servicio } from "../api/servicios";
import { getServicios } from "../api/servicios";

import type { Cuenta } from "../api/cuentas";
import { getCuentas } from "../api/cuentas";

import { apiFetch } from "../api/http";
import { actualizarPinSuscripcion, crearSuscripcion, eliminarSuscripcion } from "../api/suscripciones";

import "../styles/clientes.css";

// ── Types ────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";
type Toast = { id: string; type: ToastType; message: string };
type MetricColor = "blue" | "green" | "slate";

// ── Shared Tailwind strings ───────────────────────────────
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
  const pal: Record<MetricColor, { wrap: string; icon: string; num: string }> = {
    blue:  { wrap: "border-sky-500/20 bg-sky-500/10",       icon: "bg-sky-500/15 text-sky-400",        num: "text-sky-200"     },
    green: { wrap: "border-emerald-500/20 bg-emerald-500/10", icon: "bg-emerald-500/15 text-emerald-400", num: "text-emerald-200" },
    slate: { wrap: "border-white/10 bg-white/5",             icon: "bg-white/10 text-white/45",          num: "text-white/80"   },
  };
  const { wrap, icon, num } = pal[color];
  return (
    <div className={`rounded-2xl border ${wrap} p-5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/25`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-white/40 mb-2">{label}</p>
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

// ── FieldLabel ───────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-extrabold uppercase tracking-widest text-white/50 mb-1.5">{children}</p>;
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

// ── Helpers ──────────────────────────────────────────────

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}
function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function money(n: any) {
  const v = Number(n ?? 0);
  return v.toLocaleString("es-GT", { style: "currency", currency: "GTQ" });
}
function clampInt(v: string, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const i = Math.trunc(n);
  if (i < min || i > max) return "";
  return String(i);
}

/* =========================
   Component
========================= */
export default function ClientesPage() {
  const [items, setItems] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);

  // ====== filtros (UI) ======
  const [activoFilter, setActivoFilter] = useState<"1" | "0" | "all">("1");

  const [qNombre, setQNombre] = useState("");
  const [qCorreoCuenta, setQCorreoCuenta] = useState("");
  const [servicioFilterId, setServicioFilterId] = useState<number | "">("");
  const [diaCobroFilter, setDiaCobroFilter] = useState<string>(""); // "" = todos

  // KPI global (activos/inactivos)
  const [kpiGlobal, setKpiGlobal] = useState({ activos: 0, inactivos: 0 });

  // modal create/edit
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [notas, setNotas] = useState("");

  // ====== Suscripción (asignar) ======
  const [asignarSuscripcion, setAsignarSuscripcion] = useState(false);

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);

  const [servicioId, setServicioId] = useState<number | "">("");
  const [cuentaId, setCuentaId] = useState<number | "">("");

  const [precioMensual, setPrecioMensual] = useState<string>("");
  const [diaCobro, setDiaCobro] = useState<string>("15");
  const [diaCobroFecha, setDiaCobroFecha] = useState<string>(""); // date picker value (YYYY-MM-DD)
  const [mesesYaPagados, setMesesYaPagados] = useState<number>(0);
  const [mesGratisAsignar, setMesGratisAsignar] = useState(false);
  const [pinPerfil, setPinPerfil] = useState<string>("");
  const [precioTouched, setPrecioTouched] = useState(false);

  // ====== editar PIN inline ======
  const [editPinId, setEditPinId] = useState<number | null>(null);
  const [editPinValue, setEditPinValue] = useState<string>("");
  const [savingPin, setSavingPin] = useState(false);

  // ====== Suscripciones del cliente (mostrar) ======
  const [susItems, setSusItems] = useState<SuscripcionCliente[]>([]);
  const [susLoading, setSusLoading] = useState(false);
  const [susDeletingId, setSusDeletingId] = useState<number | null>(null);

  // bloqueo por fila (evita spam toggle)
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // ===== Confirm modal (eliminar suscripción) =====
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [susToDelete, setSusToDelete] = useState<any>(null);

  // ✅ Abort controllers
  const abortListRef = useRef<AbortController | null>(null);
  const abortKpiRef = useRef<AbortController | null>(null);

  // =========================
  // ✅ Modal sections + tabs
  // =========================
  type ModalTab = "cliente" | "asignar" | "suscripciones" | "extra";
  const [modalTab, setModalTab] = useState<ModalTab>("cliente");

  const modalScrollRef = useRef<HTMLDivElement | null>(null);
  const secClienteRef = useRef<HTMLDivElement | null>(null);
  const secAsignarRef = useRef<HTMLDivElement | null>(null);
  const secSusRef = useRef<HTMLDivElement | null>(null);
  const secExtraRef = useRef<HTMLDivElement | null>(null);

  function refForTab(t: ModalTab) {
    if (t === "cliente") return secClienteRef;
    if (t === "asignar") return secAsignarRef;
    if (t === "suscripciones") return secSusRef;
    return secExtraRef;
  }

  function scrollToTab(t: ModalTab) {
    const el = refForTab(t).current;
    const sc = modalScrollRef.current;
    if (!el || !sc) return;

    sc.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
  }

  function goTab(t: ModalTab) {
    setModalTab(t);
    window.setTimeout(() => scrollToTab(t), 0);
  }

  function openDeleteConfirm(s: any) {
    setSusToDelete(s);
    setConfirmOpen(true);
  }

  function closeDeleteConfirm() {
    if (confirmLoading) return;
    setConfirmOpen(false);
    setSusToDelete(null);
  }

  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 2400);
  };

  /**
   * Intenta cargar clientes con filtros server-side (si existe el endpoint).
   * Fallback: usa getClientes(activoFilter) y filtra en frontend (nombre/teléfono).
   *
   * ✅ Ahora soporta AbortController (cancelar request anterior)
   */
  async function fetchClientesWithFilters(signal?: AbortSignal) {
    const params = new URLSearchParams();

    if (activoFilter !== "all") params.set("activo", activoFilter);
    if (qNombre.trim()) params.set("nombre", qNombre.trim());
    if (qCorreoCuenta.trim()) params.set("correoCuenta", qCorreoCuenta.trim());
    if (servicioFilterId) params.set("servicioId", String(servicioFilterId));
    if (diaCobroFilter.trim()) params.set("diaCobro", diaCobroFilter.trim());

    const hasAdvanced =
      !!qCorreoCuenta.trim() || !!servicioFilterId || !!diaCobroFilter.trim() || !!qNombre.trim();

    // 1) Intento server-side
    if (hasAdvanced) {
      try {
        const res = await apiFetch<{ items: Cliente[] }>(`/clientes?${params.toString()}`, {
          method: "GET",
          signal,
        } as any);
        return res.items || [];
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        // fallback abajo
      }
    }

    // 2) Fallback
    const res = await getClientes(activoFilter);
    const base = res.items || [];

    const needle = norm(qNombre);
    if (!needle) return base;

    return base.filter((c) => {
      const a = norm(c.nombre || "");
      const b = norm(String(c.telefono ?? ""));
      return a.includes(needle) || b.includes(needle);
    });
  }

  /**
   * KPI global: activos/inactivos.
   */
  async function refreshKpiGlobal() {
    abortKpiRef.current?.abort();
    const controller = new AbortController();
    abortKpiRef.current = controller;

    try {
      const all = await getClientes("all");
      const activos = (all.items || []).filter((c) => Number(c.activo ?? 1) === 1).length;
      const inactivos = (all.items || []).filter((c) => Number(c.activo ?? 1) === 0).length;
      setKpiGlobal({ activos, inactivos });
    } catch {
      // silencioso
    }
  }

  /**
   * Refresh listado (principal)
   */
  async function refreshList() {
    abortListRef.current?.abort();
    const controller = new AbortController();
    abortListRef.current = controller;

    setLoading(true);
    try {
      const list = await fetchClientesWithFilters(controller.signal);
      setItems(list || []);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      pushToast("error", e?.message || "No se pudo cargar clientes");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function preloadSuscripcionData() {
    try {
      const s = await getServicios("1");
      const c = await getCuentas("1");
      setServicios((s as any).items || (s as any) || []);
      setCuentas((c as any).items || (c as any) || []);
    } catch (e: any) {
      pushToast("info", e?.message || "No se pudieron cargar servicios/cuentas");
    }
  }

  // Cargar servicios al entrar a la página (para filtro por servicio)
  useEffect(() => {
    (async () => {
      try {
        const s = await getServicios("1");
        setServicios((s as any).items || (s as any) || []);
      } catch {
        // silencioso
      }
    })();
  }, []);

  /**
   * Traer suscripciones
   * Backend esperado: GET /clientes/:id/suscripciones
   */
  async function loadSuscripciones(clienteId: number) {
    setSusLoading(true);
    try {
      const res = await apiFetch<{ items: SuscripcionCliente[] }>(
        `/clientes/${clienteId}/suscripciones`,
        { method: "GET" }
      );
      setSusItems(res.items || []);
    } catch (e: any) {
      setSusItems([]);
      pushToast("info", e?.message || "No se pudieron cargar suscripciones del cliente");
    } finally {
      setSusLoading(false);
    }
  }

  // KPI global NO en cada tecla
  useEffect(() => {
    refreshKpiGlobal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh listado con debounce corto + cancelación
  useEffect(() => {
    const t = window.setTimeout(() => refreshList(), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activoFilter, qNombre, qCorreoCuenta, servicioFilterId, diaCobroFilter]);

  // Cargar servicios/cuentas cuando abre modal (para asignar)
  useEffect(() => {
    if (open) preloadSuscripcionData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // KPI visibles
  const kpi = useMemo(() => {
    return {
      visibles: items.length,
      activos: kpiGlobal.activos,
      inactivos: kpiGlobal.inactivos,
    };
  }, [items.length, kpiGlobal.activos, kpiGlobal.inactivos]);

  function resetSuscripcionForm() {
    setAsignarSuscripcion(false);
    setServicioId("");
    setCuentaId("");
    setPrecioMensual("");
    setDiaCobro("15");
    setDiaCobroFecha("");
    setMesesYaPagados(0);
    setMesGratisAsignar(false);
    setPinPerfil("");
    setPrecioTouched(false);
  }

  function openCreate() {
    setEditing(null);
    setNombre("");
    setTelefono("");
    setDireccion("");
    setNotas("");
    setSusItems([]);
    resetSuscripcionForm();

    setModalTab("cliente");
    setOpen(true);
    window.setTimeout(() => scrollToTab("cliente"), 0);
  }

  function openEdit(c: Cliente) {
    setEditing(c);
    setNombre(c.nombre || "");
    setTelefono(String(c.telefono ?? ""));
    setDireccion(String(c.direccion ?? ""));
    setNotas(String(c.notas ?? ""));
    setSusItems([]);
    resetSuscripcionForm();

    setModalTab("cliente");
    setOpen(true);
    window.setTimeout(() => scrollToTab("cliente"), 0);

    loadSuscripciones(c.id);
  }

  const servicioSeleccionado = useMemo(() => {
    if (!servicioId) return null;
    return (servicios as any[]).find((x) => Number(x.id) === Number(servicioId)) || null;
  }, [servicios, servicioId]);

  // Cuentas disponibles
  const cuentasDisponibles = useMemo(() => {
    if (!servicioId) return [];
    const sid = Number(servicioId);

    return (cuentas as any[]).filter((cu) => {
      const okServicio = Number(cu.servicio_id) === sid;
      const okActiva = Number(cu.activa ?? 1) === 1;

      const total = Number(cu.cupo_total ?? 0);
      const ocupado = Number(cu.cupo_ocupado ?? 0);
      const okCupo = ocupado < total;

      return okServicio && okActiva && okCupo;
    });
  }, [cuentas, servicioId]);

  // Si la cuenta seleccionada ya no existe, reset
  useEffect(() => {
    if (!cuentaId) return;
    const existe = cuentasDisponibles.some((c: any) => Number(c.id) === Number(cuentaId));
    if (!existe) setCuentaId("");
  }, [cuentasDisponibles, cuentaId]);

  // Precio sugerido
  useEffect(() => {
    setCuentaId("");
    if (!servicioSeleccionado) return;

    const vp = toNum((servicioSeleccionado as any).venta_por_cuenta);
    if (!precioTouched && Number.isFinite(vp) && vp > 0) {
      setPrecioMensual(String(vp));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicioId, (servicioSeleccionado as any)?.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (nombre.trim().length < 2) {
      pushToast("error", "Nombre inválido");
      return;
    }

    if (asignarSuscripcion) {
      if (!servicioId) return pushToast("error", "Seleccione un servicio");
      if (!cuentaId) return pushToast("error", "Seleccione una cuenta disponible");

      const pm = toNum(precioMensual);
      const dc = toNum(diaCobro);
      if (!Number.isFinite(pm) || pm <= 0) return pushToast("error", "Precio mensual inválido");
      if (!Number.isFinite(dc) || dc < 1 || dc > 31)
        return pushToast("error", "Día de cobro inválido (1..31)");
    }

    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        direccion: direccion.trim() || null,
        notas: notas.trim() || null,
      };

      let clienteIdFinal: number;

      if (!editing) {
        const created = await crearCliente(payload);
        clienteIdFinal = Number((created as any)?.id);
        if (!clienteIdFinal) throw new Error("No se pudo obtener el ID del cliente creado");
        pushToast("success", "Cliente creado");
      } else {
        await actualizarCliente(editing.id, payload);
        clienteIdFinal = editing.id;
        pushToast("success", "Cliente actualizado");
      }

      if (asignarSuscripcion) {
        const pinVal = pinPerfil.trim();
        if (pinVal !== "" && !/^\d{4,6}$/.test(pinVal))
          return pushToast("error", "PIN de perfil inválido (solo números, 4 a 6 dígitos)");

        await crearSuscripcion({
          clienteId: clienteIdFinal,
          cuentaId: Number(cuentaId),
          precioMensual: Number(precioMensual),
          diaCobro: Number(diaCobro),
          fechaInicio: diaCobroFecha || undefined,
          mesesYaPagados: mesesYaPagados > 0 ? (mesesYaPagados + (mesGratisAsignar && mesesYaPagados % 3 === 0 ? 1 : 0)) : undefined,
          pin_perfil: pinVal || null,
        });

        pushToast("success", "Suscripción asignada");

        await loadSuscripciones(clienteIdFinal);
        resetSuscripcionForm();
      }

      await refreshList();
      await refreshKpiGlobal();

      setOpen(false);
      setEditing(null);
    } catch (err: any) {
      pushToast("error", err?.message || "No fue posible guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActivo(cliente: Cliente) {
    if (togglingId === cliente.id) return;

    const prev = Number(cliente.activo ?? 1) === 1;
    const next = !prev;

    setTogglingId(cliente.id);
    setItems((cur) => cur.map((x) => (x.id === cliente.id ? { ...x, activo: next ? 1 : 0 } : x)));

    try {
      await toggleClienteActivo(cliente.id, next);
      pushToast("success", next ? "Cliente activado" : "Cliente desactivado");

      if (activoFilter !== "all") await refreshList();
      await refreshKpiGlobal();
    } catch (err: any) {
      setItems((cur) => cur.map((x) => (x.id === cliente.id ? { ...x, activo: prev ? 1 : 0 } : x)));
      pushToast("error", err?.message || "No se pudo cambiar el estado");
    } finally {
      setTogglingId(null);
    }
  }

  async function onDeleteSuscripcionConfirmado() {
    if (!editing || !susToDelete) return;

    const sid = Number(susToDelete.id);
    if (!Number.isFinite(sid)) return;

    setConfirmLoading(true);
    setSusDeletingId(sid);

    try {
      await eliminarSuscripcion(sid);
      pushToast("success", "Suscripción eliminada");
      await loadSuscripciones(editing.id);
      closeDeleteConfirm();
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo eliminar la suscripción");
    } finally {
      setConfirmLoading(false);
      setSusDeletingId(null);
    }
  }

  async function onSavePin(susId: number) {
    if (savingPin) return;
    const pinVal = editPinValue.trim();
    if (pinVal !== "" && !/^\d{4,6}$/.test(pinVal)) {
      pushToast("error", "PIN inválido (solo números, 4 a 6 dígitos)");
      return;
    }
    setSavingPin(true);
    try {
      await actualizarPinSuscripcion(susId, pinVal || null);
      setSusItems((prev) =>
        prev.map((s) => s.id === susId ? { ...s, pin_perfil: pinVal || null } : s)
      );
      pushToast("success", "PIN actualizado");
      setEditPinId(null);
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo guardar el PIN");
    } finally {
      setSavingPin(false);
    }
  }

  const susCount = useMemo(() => {
    return editing ? susItems.length : 0;
  }, [editing, susItems.length]);

  return (
    <div className="w-full max-w-7xl mx-auto">

      {/* ── Toasts ───────────────────────────────────── */}
      <div className="fixed right-4 top-4 z-50 flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => {
          const tw =
            t.type === "success" ? "border-emerald-500/25 text-emerald-300"
            : t.type === "error" ? "border-red-500/25 text-red-300"
            : "border-sky-500/25 text-sky-300";
          return (
            <div key={t.id} className={`px-4 py-3 rounded-2xl border bg-[#080c18]/95 backdrop-blur-md font-bold text-sm shadow-2xl shadow-black/40 ${tw}`}>
              {t.message}
            </div>
          );
        })}
      </div>

      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[2.25rem] font-black tracking-tight text-white/95 leading-none">Clientes</h1>
          <p className="mt-2 text-white/45 font-medium text-sm">Gestión de clientes activos, inactivos y sus suscripciones.</p>
        </div>
        <button
          onClick={openCreate}
          className="shrink-0 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-300 font-extrabold text-sm hover:bg-sky-500/20 hover:border-sky-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 shadow-lg shadow-sky-500/5"
        >
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </button>
      </div>

      {/* ── KPI cards ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <MetricCard icon={Users} label="Clientes visibles" value={kpi.visibles} color="blue">
          <span className="text-[11px] text-white/35 font-semibold">Según filtros activos</span>
        </MetricCard>
        <MetricCard icon={CheckCircle2} label="Activos" value={kpi.activos} color="green">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-extrabold text-emerald-400">
            Operativos
          </span>
        </MetricCard>
        <MetricCard icon={UserX} label="Inactivos" value={kpi.inactivos} color="slate">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-extrabold text-white/40">
            Archivados
          </span>
        </MetricCard>
      </div>

      {/* ── Filter bar ───────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-2.5 mb-5">
        {/* Estado toggle pills */}
        <div className="flex gap-1.5 shrink-0">
          {(["1", "0", "all"] as const).map((v) => {
            const labels = { "1": "Activos", "0": "Inactivos", all: "Todos" };
            const active = activoFilter === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setActivoFilter(v)}
                className={`h-11 px-4 rounded-xl border font-bold text-sm transition-all duration-150 ${
                  active
                    ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
                    : "bg-white/5 border-white/8 text-white/55 hover:bg-white/8 hover:text-white/80"
                }`}
              >
                {labels[v]}
              </button>
            );
          })}
        </div>

        {/* Search name */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          <input
            type="search"
            value={qNombre}
            onChange={(e) => setQNombre(e.target.value)}
            placeholder="Nombre o teléfono…"
            className={inputCls + " pl-10"}
          />
        </div>

        {/* Service select */}
        <div className="relative shrink-0 sm:w-48">
          <select
            value={servicioFilterId}
            onChange={(e) => setServicioFilterId(e.target.value ? Number(e.target.value) : ("" as any))}
            className={selectCls}
          >
            <option value="">Servicio: Todos</option>
            {(servicios as any[]).map((s) => (
              <option key={s.id} value={s.id}>{s.nombre_servicio}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
        </div>

        {/* Email filter */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          <input
            type="search"
            value={qCorreoCuenta}
            onChange={(e) => setQCorreoCuenta(e.target.value)}
            placeholder="Correo de cuenta…"
            className={inputCls + " pl-10"}
          />
        </div>

        {/* Día de corte */}
        <div className="relative shrink-0 sm:w-36">
          <input
            value={diaCobroFilter}
            onChange={(e) => setDiaCobroFilter(clampInt(e.target.value, 1, 31))}
            placeholder="Día corte"
            inputMode="numeric"
            className={inputCls}
          />
        </div>
      </div>

      {/* ── Table / Empty ────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-8 h-8 text-sky-400/60 animate-spin" />
          <p className="text-white/35 font-semibold text-sm">Cargando clientes…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/5 flex flex-col items-center text-center py-20 px-6">
          <div className="w-20 h-20 rounded-2xl bg-sky-500/8 border border-sky-500/15 flex items-center justify-center mb-6">
            <User className="w-9 h-9 text-sky-400/50" />
          </div>
          <h3 className="text-xl font-black text-white/80 mb-2">Sin resultados</h3>
          <p className="text-white/40 font-medium text-sm max-w-xs mb-6 leading-relaxed">
            No hay clientes con los filtros aplicados. Ajústalos o crea el primero.
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-sky-500/12 border border-sky-500/20 text-sky-300 font-bold text-sm hover:bg-sky-500/18 hover:-translate-y-0.5 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Crear primer cliente
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/2 overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-black/20 border-b border-white/8">
                <th className="text-left px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-white/40">Cliente</th>
                <th className="text-left px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-white/40">Teléfono</th>
                <th className="text-left px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-white/40">Estado</th>
                <th className="text-right px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-white/40">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const isActive = Number(c.activo ?? 1) === 1;
                const isToggling = togglingId === c.id;

                return (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/2.5 transition-colors duration-100 last:border-0">
                    <td className="px-5 py-3.5">
                      <p className="font-extrabold text-white/90 text-sm">{c.nombre}</p>
                      <p className="text-[11px] text-white/35 font-semibold mt-0.5">ID {c.id}</p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/60 font-medium">{c.telefono || "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-extrabold tracking-wide ${
                        isActive
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          : "bg-white/5 border-white/10 text-white/40"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-400" : "bg-white/30"}`} />
                        {isActive ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {/* Toggle */}
                        <label className={`relative inline-flex items-center cursor-pointer ${isToggling ? "opacity-50 pointer-events-none" : ""}`}>
                          <input type="checkbox" className="sr-only" checked={isActive} disabled={isToggling} onChange={() => onToggleActivo(c)} />
                          <div className={`w-10 h-5 rounded-full border transition-all duration-200 relative ${isActive ? "bg-emerald-500/20 border-emerald-500/30" : "bg-white/10 border-white/12"}`}>
                            <span className={`absolute top-px w-4 h-4 rounded-full bg-white/90 shadow-sm transition-all duration-200 ${isActive ? "left-5" : "left-0.5"}`} />
                          </div>
                        </label>

                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          disabled={isToggling}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/8 bg-white/5 text-white/55 font-bold text-xs hover:bg-white/8 hover:text-white/85 transition-all duration-150 disabled:opacity-40"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal Create/Edit ─────────────────────────── */}
      {open && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm grid place-items-center p-4 z-40" role="dialog" aria-modal="true">
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#080c18]/95 backdrop-blur-xl shadow-2xl shadow-black/60 flex flex-col max-h-[92vh]">

            {/* Modal header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-white/8 shrink-0">
              <div>
                <p className="font-black text-lg text-white/95">{editing ? "Editar cliente" : "Nuevo cliente"}</p>
                <p className="text-sm text-white/40 font-medium mt-0.5">Datos, suscripciones y notas del cliente.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"
                className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-white/55 hover:text-white/90 hover:bg-white/8 transition-all flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex flex-1 min-h-0">
                {/* Sidebar nav */}
                <aside className="hidden md:flex md:w-52 shrink-0 flex-col gap-2 border-r border-white/8 bg-black/10 p-3">
                  {(["cliente", "asignar", "suscripciones", "extra"] as ModalTab[]).map((tab) => {
                    const meta: Record<ModalTab, { title: string; sub: string }> = {
                      cliente:        { title: "Cliente",        sub: "Nombre y teléfono" },
                      asignar:        { title: "Asignar",        sub: "Servicio, cobro"   },
                      suscripciones:  { title: "Suscripciones",  sub: editing ? `${susCount} asignadas` : "Solo en edición" },
                      extra:          { title: "Extra",          sub: "Dirección y notas" },
                    };
                    const active = modalTab === tab;
                    const disabled = tab === "suscripciones" && !editing;
                    return (
                      <button key={tab} type="button" onClick={() => goTab(tab)} disabled={disabled}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                          active ? "border-sky-500/30 bg-sky-500/10" : "border-white/8 bg-white/5 hover:bg-white/8"
                        }`}>
                        <p className={`font-extrabold ${active ? "text-sky-300" : "text-white/75"}`}>{meta[tab].title}</p>
                        <p className="text-[11px] text-white/35 font-medium mt-0.5">{meta[tab].sub}</p>
                      </button>
                    );
                  })}
                </aside>

                {/* Mobile tab pills */}
                <div className="md:hidden flex gap-2 overflow-x-auto px-4 py-3 border-b border-white/8 shrink-0 w-full">
                  {(["cliente", "asignar", "suscripciones", "extra"] as ModalTab[]).map((tab) => (
                    <button key={tab} type="button" onClick={() => goTab(tab)} disabled={tab === "suscripciones" && !editing}
                      className={`shrink-0 h-8 px-3.5 rounded-full border text-xs font-extrabold transition-all duration-150 disabled:opacity-40 ${
                        modalTab === tab ? "border-sky-500/30 bg-sky-500/12 text-sky-300" : "border-white/8 bg-white/5 text-white/55"
                      }`}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Scrollable content */}
                <div className="flex-1 min-h-0 overflow-y-auto" ref={modalScrollRef}>
                  <div className="p-5 flex flex-col gap-1">

                    {/* CLIENTE */}
                    <section ref={secClienteRef} className="pb-5 mb-1 border-b border-white/8">
                      <SectionHead title="Cliente" hint="Datos básicos para contacto." />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <FieldLabel>Nombre</FieldLabel>
                          <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" required />
                        </div>
                        <div>
                          <FieldLabel>Teléfono</FieldLabel>
                          <input className={inputCls} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Opcional" />
                        </div>
                      </div>
                    </section>

                    {/* ASIGNAR */}
                    <section ref={secAsignarRef} className="py-5 mb-1 border-b border-white/8">
                      <SectionHead title="Asignar suscripción" hint="Crea una suscripción al mismo tiempo." />

                      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/5 mb-4">
                        <div>
                          <p className="font-extrabold text-sm text-white/85">Asignar suscripción ahora</p>
                          <p className="text-xs text-white/40 font-medium mt-0.5">Servicio, cuenta, cobro y precio.</p>
                        </div>
                        <label className={`relative inline-flex items-center cursor-pointer`}>
                          <input type="checkbox" className="sr-only" checked={asignarSuscripcion}
                            onChange={(e) => { const v = e.target.checked; setAsignarSuscripcion(v); if (!v) resetSuscripcionForm(); else setPrecioTouched(false); }} />
                          <div className={`w-10 h-5 rounded-full border transition-all duration-200 relative ${asignarSuscripcion ? "bg-emerald-500/20 border-emerald-500/30" : "bg-white/10 border-white/12"}`}>
                            <span className={`absolute top-px w-4 h-4 rounded-full bg-white/90 shadow-sm transition-all duration-200 ${asignarSuscripcion ? "left-5" : "left-0.5"}`} />
                          </div>
                        </label>
                      </div>

                      {asignarSuscripcion && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <FieldLabel>Servicio</FieldLabel>
                            <div className="relative">
                              <select className={selectCls} value={servicioId}
                                onChange={(e) => setServicioId(e.target.value ? Number(e.target.value) : ("" as any))} required>
                                <option value="">Seleccione…</option>
                                {(servicios as any[]).map((s) => <option key={s.id} value={s.id}>{s.nombre_servicio}</option>)}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                            </div>
                          </div>

                          <div>
                            <FieldLabel>Cuenta disponible</FieldLabel>
                            <div className="relative">
                              <select className={selectCls} value={cuentaId}
                                onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : ("" as any))}
                                disabled={!servicioId || cuentasDisponibles.length === 0} required>
                                <option value="">{servicioId ? "Seleccione…" : "Primero elija servicio…"}</option>
                                {cuentasDisponibles.map((cu: any) => (
                                  <option key={cu.id} value={cu.id}>{cu.correo} ({Number(cu.cupo_ocupado)}/{Number(cu.cupo_total)})</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                            </div>
                            {servicioId && cuentasDisponibles.length === 0 && (
                              <p className="mt-2 text-xs text-amber-400/90 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Sin cuentas disponibles para este servicio.
                              </p>
                            )}
                          </div>

                          <div>
                            <FieldLabel>Precio mensual (Q)</FieldLabel>
                            <input className={inputCls} value={precioMensual}
                              onChange={(e) => { setPrecioMensual(e.target.value); setPrecioTouched(true); }}
                              placeholder="Ej: 35" inputMode="decimal" required />
                            <p className="text-[11px] text-white/30 mt-1.5 font-medium">
                              {servicioSeleccionado
                                ? `Sugerido: Q ${String((servicioSeleccionado as any).venta_por_cuenta ?? "—")}`
                                : "Seleccione servicio para sugerencia"}
                            </p>
                          </div>

                          <div>
                            <FieldLabel>Día de cobro</FieldLabel>
                            <input
                              type="date"
                              className={inputCls + " scheme-dark"}
                              value={diaCobroFecha}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDiaCobroFecha(v);
                                if (v) setDiaCobro(String(new Date(v + "T00:00:00").getDate()));
                              }}
                              required
                            />
                            {diaCobro && diaCobroFecha && (
                              <p className="text-[11px] text-white/35 mt-1.5 font-medium">
                                Cobro cada día <span className="text-white/60 font-bold">{diaCobro}</span> del mes
                              </p>
                            )}
                          </div>

                          <div>
                            <FieldLabel>Meses ya pagados</FieldLabel>
                            <div className="flex items-center gap-0">
                              <button type="button"
                                onClick={() => setMesesYaPagados((p) => Math.max(0, p - 1))}
                                className="h-9 w-9 flex items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-white/5 text-white/50 font-bold text-base hover:bg-white/10 hover:text-white/80 transition-all select-none">−</button>
                              <div className="h-9 flex-1 flex items-center justify-center border-y border-white/10 bg-white/5 text-white/85 font-bold text-sm min-w-10">
                                {mesesYaPagados}
                              </div>
                              <button type="button"
                                onClick={() => setMesesYaPagados((p) => Math.min(24, p + 1))}
                                className="h-9 w-9 flex items-center justify-center rounded-r-lg border border-l-0 border-white/10 bg-white/5 text-white/50 font-bold text-base hover:bg-white/10 hover:text-white/80 transition-all select-none">+</button>
                            </div>
                            {mesesYaPagados > 0 && (
                              <p className="text-[11px] text-emerald-400/80 mt-1.5 font-medium">
                                Próximo cobro avanza {mesesYaPagados + (mesGratisAsignar && mesesYaPagados % 3 === 0 ? 1 : 0)} {(mesesYaPagados + (mesGratisAsignar && mesesYaPagados % 3 === 0 ? 1 : 0)) === 1 ? "mes" : "meses"}
                                {mesGratisAsignar && mesesYaPagados % 3 === 0 && (
                                  <span className="ml-1.5 text-yellow-400/90">(¡+1 gratis!)</span>
                                )}
                              </p>
                            )}
                            {mesesYaPagados === 0 && (
                              <p className="text-[11px] text-white/30 mt-1.5 font-medium">
                                0 = aun no ha pagado este mes
                              </p>
                            )}
                            {mesesYaPagados > 0 && mesesYaPagados % 3 === 0 && (
                              <label className="flex items-center gap-2 mt-2 cursor-pointer select-none group">
                                <div className={`relative w-8 h-4 rounded-full border transition-all duration-200 ${mesGratisAsignar ? "bg-yellow-500/20 border-yellow-500/35" : "bg-white/8 border-white/12"}`}>
                                  <span className={`absolute top-px w-3 h-3 rounded-full transition-all duration-200 ${mesGratisAsignar ? "left-4 bg-yellow-400" : "left-0.5 bg-white/40"}`} />
                                </div>
                                <span className="text-[11px] font-semibold text-white/50 group-hover:text-white/75 transition-colors">
                                  Regalar 1 mes gratis por {mesesYaPagados} meses
                                </span>
                                <input type="checkbox" className="sr-only" checked={mesGratisAsignar}
                                  onChange={(e) => setMesGratisAsignar(e.target.checked)} />
                              </label>
                            )}
                          </div>

                          <div className="col-span-2">
                            <FieldLabel>PIN de perfil (opcional)</FieldLabel>
                            <input
                              className={inputCls}
                              value={pinPerfil}
                              onChange={(e) => setPinPerfil(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              placeholder="Ej: 1234 o 12345"
                              inputMode="numeric"
                              maxLength={6}
                            />
                            <p className="text-[11px] text-white/30 mt-1.5 font-medium">Solo números, 4 a 6 dígitos. Dejar en blanco para omitir.</p>
                          </div>
                        </div>
                      )}
                    </section>

                    {/* SUSCRIPCIONES */}
                    <section ref={secSusRef} className="py-5 mb-1 border-b border-white/8">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <SectionHead title="Suscripciones" hint="Las ya asignadas al cliente." />
                        {editing && (
                          <button type="button" onClick={() => loadSuscripciones(editing.id)} disabled={susLoading}
                            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/8 bg-white/5 text-white/55 font-bold text-xs hover:bg-white/8 transition-all disabled:opacity-40">
                            <RefreshCw className={`w-3.5 h-3.5 ${susLoading ? "animate-spin" : ""}`} />
                            {susLoading ? "Cargando…" : "Recargar"}
                          </button>
                        )}
                      </div>

                      {!editing ? (
                        <p className="text-sm text-white/35 font-medium px-1">Cree el cliente o ábralo en edición para ver suscripciones.</p>
                      ) : susLoading ? (
                        <div className="flex items-center gap-2 text-white/40 text-sm font-medium px-1">
                          <Loader2 className="w-4 h-4 animate-spin" /> Leyendo suscripciones…
                        </div>
                      ) : susItems.length === 0 ? (
                        <p className="text-sm text-white/35 font-medium px-1">Este cliente no tiene suscripciones asignadas.</p>
                      ) : (
                        <div className="rounded-xl border border-white/8 overflow-hidden">
                          <table className="w-full border-collapse">
                            <thead className="bg-black/20 border-b border-white/8">
                              <tr>
                                {["Servicio", "Cuenta", "Precio", "Día", "PIN", ""].map((h) => (
                                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-white/35">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {susItems.map((s: any) => {
                                const deleting = susDeletingId === s.id;
                                return (
                                  <tr key={s.id} className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                                    <td className="px-3 py-2.5">
                                      <p className="text-sm font-extrabold text-white/85">{s.servicio}</p>
                                      <p className="text-[10px] text-white/30 font-semibold">ID {s.id}</p>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-white/55 font-medium">{s.cuenta_correo}</td>
                                    <td className="px-3 py-2.5 text-xs text-white/70 font-bold">{money(s.precio_mensual)}</td>
                                    <td className="px-3 py-2.5 text-xs text-white/55 font-medium">{s.dia_cobro}</td>
                                    <td className="px-3 py-2.5">
                                      {editPinId === s.id ? (
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            className="w-20 h-7 px-2 rounded-lg border border-white/10 bg-white/5 text-white/90 text-xs font-mono font-semibold placeholder:text-white/25 outline-none focus:border-sky-500/40 tracking-widest"
                                            value={editPinValue}
                                            onChange={(e) => setEditPinValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                            placeholder="••••"
                                            inputMode="numeric"
                                            maxLength={6}
                                            autoFocus
                                          />
                                          <button type="button" onClick={() => onSavePin(s.id)} disabled={savingPin}
                                            className="inline-flex items-center h-7 px-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/12 text-emerald-400 font-bold text-xs hover:bg-emerald-500/20 transition-all disabled:opacity-40">
                                            {savingPin ? <Loader2 className="w-3 h-3 animate-spin" /> : "✓"}
                                          </button>
                                          <button type="button" onClick={() => setEditPinId(null)}
                                            className="inline-flex items-center h-7 px-2 rounded-lg border border-white/8 bg-white/4 text-white/35 text-xs hover:bg-white/8 hover:text-white/60 transition-all">
                                            ✕
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          {s.pin_perfil ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sky-500/20 bg-sky-500/8 text-sky-300 text-xs font-mono font-bold tracking-widest">
                                              {s.pin_perfil}
                                            </span>
                                          ) : (
                                            <span className="text-xs text-white/20 font-medium">Sin PIN</span>
                                          )}
                                          <button type="button"
                                            onClick={() => { setEditPinId(s.id); setEditPinValue(s.pin_perfil || ""); }}
                                            className="inline-flex items-center h-6 px-2 rounded-md border border-white/8 bg-white/4 text-white/35 font-bold text-[10px] hover:bg-white/8 hover:text-white/65 transition-all">
                                            {s.pin_perfil ? "Editar" : "+ PIN"}
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <button type="button" onClick={() => openDeleteConfirm(s)} disabled={deleting}
                                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-red-500/20 bg-red-500/8 text-red-400 font-bold text-xs hover:bg-red-500/14 transition-all disabled:opacity-40">
                                        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                        {deleting ? "…" : "Eliminar"}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>

                    {/* EXTRA */}
                    <section ref={secExtraRef} className="pt-5 pb-2">
                      <SectionHead title="Extra" hint="Dirección y notas internas." />
                      <div className="flex flex-col gap-3">
                        <div>
                          <FieldLabel>Dirección</FieldLabel>
                          <input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Opcional" />
                        </div>
                        <div>
                          <FieldLabel>Notas</FieldLabel>
                          <textarea className={inputCls + " h-auto py-3 min-h-24 resize-y"} rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Información adicional…" />
                        </div>
                      </div>
                    </section>

                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-white/8 bg-black/10 shrink-0">
                <button type="button" onClick={() => setOpen(false)}
                  className="h-10 px-5 rounded-xl border border-white/10 bg-white/5 text-white/60 font-bold text-sm hover:bg-white/8 hover:text-white/85 transition-all duration-150">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="h-10 px-5 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-300 font-extrabold text-sm hover:bg-sky-500/20 transition-all duration-150 disabled:opacity-50 inline-flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm delete subscription ───────────────── */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm grid place-items-center p-4 z-50" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#080c18]/96 backdrop-blur-xl shadow-2xl shadow-black/60">
            <div className="flex items-start justify-between px-5 py-4 border-b border-white/8">
              <div>
                <p className="font-black text-lg text-white/95">Confirmar eliminación</p>
                <p className="text-sm text-white/40 font-medium mt-0.5">Esta acción no se puede deshacer.</p>
              </div>
              <button type="button" onClick={closeDeleteConfirm} disabled={confirmLoading} aria-label="Cerrar"
                className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-white/55 hover:bg-white/8 transition-all flex items-center justify-center disabled:opacity-40">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/8 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-300/90 font-semibold">¿Está seguro que desea eliminar esta suscripción?</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-extrabold text-white/80">Servicio: <span className="text-white/95">{susToDelete?.servicio}</span></p>
                <p className="text-xs text-white/45 font-medium">Cuenta: {susToDelete?.cuenta_correo}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 px-5 pb-5">
              <button type="button" onClick={closeDeleteConfirm} disabled={confirmLoading}
                className="h-10 px-5 rounded-xl border border-white/10 bg-white/5 text-white/60 font-bold text-sm hover:bg-white/8 transition-all disabled:opacity-40">
                Cancelar
              </button>
              <button type="button" onClick={onDeleteSuscripcionConfirmado} disabled={confirmLoading}
                className="h-10 px-5 rounded-xl bg-red-500/12 border border-red-500/20 text-red-400 font-extrabold text-sm hover:bg-red-500/18 transition-all disabled:opacity-50 inline-flex items-center gap-2">
                {confirmLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmLoading ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}