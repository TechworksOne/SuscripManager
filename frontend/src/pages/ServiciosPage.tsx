import React, { useEffect, useMemo, useState } from "react";
import type { Servicio } from "../api/servicios";
import {
  actualizarServicio,
  crearServicio,
  getServicios,
  toggleServicioActivo,
} from "../api/servicios";
import {
  Plus,
  Search,
  Pencil,
  LayoutGrid,
  ChevronDown,
  X,
  Tv,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type ToastType = "success" | "error" | "info";
type Toast = { id: string; type: ToastType; message: string };

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

// ── ServiceCard ───────────────────────────────────────────────────────────────
function ServiceCard({
  s,
  isToggling,
  onToggle,
  onEdit,
}: {
  s: Servicio;
  isToggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const isActive = Number(s.activo ?? 1) === 1;

  return (
    <div
      className={`
        group relative flex items-center gap-4 px-5 py-4
        rounded-2xl border transition-all duration-200
        bg-white/[0.04] hover:bg-white/[0.07]
        border-white/[0.08] hover:border-white/[0.14]
        hover:shadow-lg hover:shadow-black/20
        ${isToggling ? "opacity-60 pointer-events-none" : ""}
      `}
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-blue-400">
        <Tv size={20} />
      </div>

      {/* Name + ID */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white/90 text-[15px] leading-tight truncate">
          {s.nombre_servicio}
        </p>
        <p className="text-xs text-white/40 mt-0.5 font-medium">ID #{s.id}</p>
      </div>

      {/* Status badge */}
      <div
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border
          ${isActive
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : "bg-slate-500/10 border-slate-500/20 text-slate-400"}
        `}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isActive
              ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
              : "bg-slate-500"
          }`}
        />
        {isActive ? "ACTIVO" : "INACTIVO"}
      </div>

      {/* Toggle switch */}
      <button
        onClick={onToggle}
        title={isActive ? "Desactivar" : "Activar"}
        className="relative flex-shrink-0 w-12 h-6"
        aria-label={isActive ? "Desactivar" : "Activar"}
      >
        <div
          className={`
            w-12 h-6 rounded-full border transition-all duration-200
            ${isActive
              ? "bg-emerald-500/20 border-emerald-500/30 shadow-[0_0_10px_rgba(52,211,153,0.25)]"
              : "bg-white/[0.06] border-white/10"}
          `}
        />
        <div
          className={`
            absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-md transition-all duration-200
            ${isActive ? "left-[27px]" : "left-[3px]"}
          `}
        />
      </button>

      {/* Edit button */}
      <button
        onClick={onEdit}
        className="
          flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold
          border border-white/10 bg-white/[0.04] text-white/60
          hover:bg-white/[0.09] hover:text-white/90 hover:border-white/20
          transition-all duration-150
        "
      >
        <Pencil size={13} />
        Editar
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ServiciosPage() {
  const [items, setItems] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [activoFilter, setActivoFilter] = useState<"1" | "0" | "all">("1");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Servicio | null>(null);
  const [nombre, setNombre] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2400);
  };

  async function refresh() {
    setLoading(true);
    try {
      const res = await getServicios(activoFilter);
      setItems(res.items || []);
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo cargar servicios");
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
    if (!needle) return items;
    return items.filter((s) => norm(s.nombre_servicio).includes(needle));
  }, [items, q]);

  const totalActivos = useMemo(() => items.filter((s) => Number(s.activo ?? 1) === 1).length, [items]);
  const totalInactivos = useMemo(() => items.filter((s) => Number(s.activo ?? 1) === 0).length, [items]);

  function openCreate() {
    setEditing(null);
    setNombre("");
    setOpen(true);
  }

  function openEdit(s: Servicio) {
    setEditing(s);
    setNombre(s.nombre_servicio || "");
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const nombreTrim = nombre.trim();
    if (nombreTrim.length < 2) return pushToast("error", "Nombre inválido");
    setSaving(true);
    try {
      if (!editing) {
        await crearServicio({ nombre_servicio: nombreTrim, costo_servicio: 0, venta_por_cuenta: 0 } as any);
        pushToast("success", "Servicio creado");
      } else {
        await actualizarServicio(editing.id, { nombre_servicio: nombreTrim } as any);
        pushToast("success", "Servicio actualizado");
      }
      setOpen(false);
      await refresh();
    } catch (err: any) {
      pushToast("error", err?.message || "No fue posible guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActivo(s: Servicio) {
    if (togglingId === s.id) return;
    const prev = Number(s.activo ?? 1) === 1;
    const next = !prev;
    setTogglingId(s.id);
    setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, activo: next ? 1 : 0 } : x)));
    try {
      await toggleServicioActivo(s.id, next);
      pushToast("success", next ? "Activado" : "Desactivado");
      if (activoFilter !== "all") await refresh();
    } catch (err: any) {
      setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, activo: prev ? 1 : 0 } : x)));
      pushToast("error", err?.message || "No se pudo cambiar el estado");
    } finally {
      setTogglingId(null);
    }
  }

  const toastColors: Record<ToastType, string> = {
    success: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
    error: "text-red-400 border-red-500/20 bg-red-500/10",
    info: "text-sky-400 border-sky-500/20 bg-sky-500/10",
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto px-1 pb-12">

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[120] flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl border font-bold text-sm backdrop-blur-md shadow-xl ${toastColors[t.type]}`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white/90">Servicios</h1>
          <p className="text-sm text-white/50 mt-1 font-medium">
            Administra el catálogo de plataformas disponibles
          </p>
        </div>
        <button
          onClick={openCreate}
          className="
            flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm
            bg-gradient-to-r from-blue-500 to-violet-500
            hover:from-blue-400 hover:to-violet-400
            shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30
            hover:scale-[1.03] active:scale-[0.98]
            transition-all duration-150 text-white
          "
        >
          <Plus size={16} strokeWidth={3} />
          Nuevo servicio
        </button>
      </div>

      {/* KPI card */}
      <div className="flex items-center gap-4 p-5 rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm mb-5">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
          <LayoutGrid size={18} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-white/50 font-semibold uppercase tracking-widest">Total servicios</p>
          <p className="text-3xl font-black text-white/90 leading-none mt-0.5">{items.length}</p>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span className="text-emerald-400 font-bold text-sm">{totalActivos} activos</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-500/10 border border-slate-500/20">
            <XCircle size={13} className="text-slate-400" />
            <span className="text-slate-400 font-bold text-sm">{totalInactivos} inactivos</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-[200px_1fr] gap-3 mb-5">
        <div className="relative">
          <select
            value={activoFilter}
            onChange={(e) => setActivoFilter(e.target.value as any)}
            className="
              w-full h-11 appearance-none pl-4 pr-10 rounded-xl
              bg-white/[0.05] border border-white/10 text-white/80 font-semibold text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40
              cursor-pointer transition-all
            "
          >
            <option value="1" className="bg-[#0b1220]">Activos</option>
            <option value="0" className="bg-[#0b1220]">Inactivos</option>
            <option value="all" className="bg-[#0b1220]">Todos</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
        </div>

        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre…"
            className="
              w-full h-11 pl-10 pr-4 rounded-xl
              bg-white/[0.05] border border-white/10 text-white/80 font-semibold text-sm
              placeholder:text-white/35
              focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40
              transition-all
            "
          />
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-2.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-2xl bg-white/[0.04] border border-white/[0.06] animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/20">
              <Tv size={26} />
            </div>
            <div>
              <p className="text-white/60 font-bold text-lg">No hay servicios</p>
              <p className="text-white/35 text-sm mt-1">Cambia el filtro o agrega el primero</p>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:scale-[1.03] transition-all"
            >
              <Plus size={15} strokeWidth={3} />
              Crear servicio
            </button>
          </div>
        ) : (
          filtered.map((s) => (
            <ServiceCard
              key={s.id}
              s={s}
              isToggling={togglingId === s.id}
              onToggle={() => onToggleActivo(s)}
              onEdit={() => openEdit(s)}
            />
          ))
        )}
      </div>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0f19]/90 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between px-6 py-5 border-b border-white/[0.08]">
              <div>
                <p className="font-black text-lg text-white/90">
                  {editing ? "Editar servicio" : "Nuevo servicio"}
                </p>
                <p className="text-sm text-white/45 mt-0.5">
                  {editing ? `Editando: ${editing.nombre_servicio}` : "Ingresa el nombre del servicio"}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-xl border border-white/10 bg-white/[0.05] text-white/50 hover:text-white/90 flex items-center justify-center transition-all"
                aria-label="Cerrar"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={onSubmit}>
              <div className="px-6 py-5">
                <label className="block text-xs font-bold uppercase tracking-widest text-white/50 mb-2">
                  Nombre del servicio
                </label>
                <input
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Netflix, Disney+, Spotify…"
                  required
                  className="
                    w-full h-11 px-4 rounded-xl
                    bg-white/[0.05] border border-white/10 text-white/85 font-semibold text-sm
                    placeholder:text-white/30
                    focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40
                    transition-all
                  "
                />
              </div>

              <div className="flex justify-end gap-3 px-6 pb-6">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-white/60 font-bold text-sm hover:bg-white/[0.08] hover:text-white/90 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="
                    px-5 py-2.5 rounded-xl font-bold text-sm text-white
                    bg-gradient-to-r from-blue-500 to-violet-500
                    hover:from-blue-400 hover:to-violet-400
                    shadow-lg shadow-blue-500/20
                    disabled:opacity-60 disabled:cursor-not-allowed
                    hover:scale-[1.02] active:scale-[0.98] transition-all
                  "
                >
                  {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear servicio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
