// src/pages/CobranzaPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  DollarSign,
  Loader2,
  RefreshCw,
  Search,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { apiFetch } from "../api/http";
import type { Servicio } from "../api/servicios";
import { getServicios } from "../api/servicios";
import "../styles/cobranza.css";

/* =========================
   Types (frontend)
========================= */
type ToastType = "success" | "error" | "info";
type Toast = { id: string; type: ToastType; message: string };

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

  fecha_inicio?: string | null; // YYYY-MM-DD
  proximo_cobro?: string | null; // YYYY-MM-DD
  atraso_dias: number; // >0 atrasado, 0 hoy, <0 faltan dias
  estado?: "ACTIVA" | "PAUSADA" | "CANCELADA" | string;
};

type ClienteCobranzaGroup = {
  cliente_id: number;
  cliente_nombre: string;
  telefono?: string | null;

  servicios_count: number;
  total_mensual: number;

  proximo_cobro_min?: string | null;
  atraso_max: number;

  subs: ParaCobrarItem[];
};

/* =========================
   Helpers
========================= */
function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function money(n: any) {
  const v = Number(n ?? 0);
  return v.toLocaleString("es-GT", { style: "currency", currency: "GTQ" });
}
function pickMinDate(a?: string | null, b?: string | null) {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  return a.localeCompare(b) <= 0 ? a : b;
}
function errMsg(e: unknown) {
  if (typeof e === "object" && e && "message" in e) return String((e as any).message);
  return "Error inesperado";
}

/* =========================
   Small UI: Custom Select
========================= */
type SelectOption<T extends string> = { value: T; label: string };

function SelectField<T extends string>(props: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  hint?: string;
}) {
  const { label, value, onChange, options, placeholder, hint } = props;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as any)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="field" ref={wrapRef} onKeyDown={onKeyDown}>
      <div className="label">{label}</div>

      <button
        type="button"
        className={`selectBtn ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`selectValue ${selected ? "" : "placeholder"}`}>
          {selected?.label || placeholder || "Seleccione…"}
        </span>
        <span className="selectChevron">▾</span>
      </button>

      {open && (
        <div className="selectMenu" role="listbox">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`selectOption ${opt.value === value ? "active" : ""}`}
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {hint ? <div className="fieldHint">{hint}</div> : null}
    </div>
  );
}

/* =========================
   Component
========================= */
export default function CobranzaPage() {
  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2400);
  };

  // servicios
  const [servicios, setServicios] = useState<Servicio[]>([]);

  // ===== Cobrar =====
  const [loading, setLoading] = useState(false);
  const [rawItems, setRawItems] = useState<ParaCobrarItem[]>([]);

  const [q, setQ] = useState("");
  const [servicioId, setServicioId] = useState<number | "">("");
  const [diaCobro, setDiaCobro] = useState<string>("");
  const [diaCobroFecha, setDiaCobroFecha] = useState<string>("");

  // modal
  const [openCobro, setOpenCobro] = useState(false);
  const [savingCobro, setSavingCobro] = useState(false);
  const [targetCliente, setTargetCliente] = useState<ClienteCobranzaGroup | null>(null);

  const [mesesPagados, setMesesPagados] = useState<string>("1");
  const [mesGratisCobro, setMesGratisCobro] = useState(false);
  const [metodo, setMetodo] = useState<"EFECTIVO" | "TRANSFERENCIA" | "OTRO">("EFECTIVO");
  const [boleta, setBoleta] = useState<string>("");
  const [nota, setNota] = useState<string>("");

  const [selectedSubs, setSelectedSubs] = useState<Record<number, boolean>>({});

  // ✅ AbortController para cancelar requests viejos
  const abortRef = useRef<AbortController | null>(null);

  // preload servicios
  useEffect(() => {
    (async () => {
      try {
        const s = await getServicios("1");
        setServicios((s as any).items || (s as any) || []);
      } catch {
        // ok
      }
    })();
  }, []);

  async function loadParaCobrar() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (servicioId) params.set("servicioId", String(servicioId));
      if (diaCobro.trim()) params.set("diaCobro", diaCobro.trim());

      const res = await apiFetch<{ items: ParaCobrarItem[] }>(
        `/cobros/para-cobrar?${params.toString()}`,
        { method: "GET", signal: controller.signal }
      );

      setRawItems(res.items || []);
    } catch (e: any) {
      if (e?.name === "AbortError" || String(e?.message || "").includes("AbortError")) return;
      setRawItems([]);
      pushToast("info", e?.message || "No se pudo cargar la cobranza");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Debounce + carga inicial
  useEffect(() => {
    const t = window.setTimeout(() => loadParaCobrar(), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, servicioId, diaCobro]);

  // ✅ Abort al desmontar
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // ✅ Bloquear scroll del body cuando modal abierta
  useEffect(() => {
    if (!openCobro) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [openCobro]);

  // Cerrar con ESC
  useEffect(() => {
    if (!openCobro) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenCobro(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCobro]);

  useEffect(() => {
    if (metodo !== "TRANSFERENCIA" && boleta) setBoleta("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodo]);

  const groupedClientes = useMemo<ClienteCobranzaGroup[]>(() => {
    const byId = new Map<number, ClienteCobranzaGroup>();

    for (const it of rawItems) {
      const g = byId.get(it.cliente_id);
      if (!g) {
        byId.set(it.cliente_id, {
          cliente_id: it.cliente_id,
          cliente_nombre: it.cliente_nombre,
          telefono: it.telefono ?? null,
          servicios_count: 1,
          total_mensual: Number(it.precio_mensual || 0),
          proximo_cobro_min: it.proximo_cobro ?? null,
          atraso_max: Number(it.atraso_dias || 0),
          subs: [it],
        });
      } else {
        g.servicios_count += 1;
        g.total_mensual += Number(it.precio_mensual || 0);
        g.proximo_cobro_min = pickMinDate(g.proximo_cobro_min, it.proximo_cobro ?? null);
        g.atraso_max = Math.max(g.atraso_max, Number(it.atraso_dias || 0));
        g.telefono = g.telefono || it.telefono || null;
        g.subs.push(it);
      }
    }

    const arr = Array.from(byId.values());
    arr.sort((a, b) => {
      if (b.atraso_max !== a.atraso_max) return b.atraso_max - a.atraso_max;
      const da = a.proximo_cobro_min || "9999-12-31";
      const db = b.proximo_cobro_min || "9999-12-31";
      const cmp = da.localeCompare(db);
      if (cmp !== 0) return cmp;
      return a.cliente_nombre.localeCompare(b.cliente_nombre);
    });

    return arr;
  }, [rawItems]);

  const kpi = useMemo(() => {
    const atrasados = groupedClientes.filter((c) => Number(c.atraso_max || 0) > 0).length;
    const estimado = groupedClientes.reduce((acc, c) => acc + Number(c.total_mensual || 0), 0);
    return { clientes: groupedClientes.length, atrasados, estimado };
  }, [groupedClientes]);

  function openRegistrarCobroCliente(c: ClienteCobranzaGroup) {
    setTargetCliente(c);
    setMesesPagados("1");
    setMesGratisCobro(false);
    setMetodo("EFECTIVO");
    setBoleta("");
    setNota("");

    const sel: Record<number, boolean> = {};
    for (const s of c.subs) sel[s.suscripcion_id] = true;
    setSelectedSubs(sel);

    setOpenCobro(true);
  }

  const selectedList = useMemo(() => {
    if (!targetCliente) return [];
    return targetCliente.subs.filter((s) => selectedSubs[s.suscripcion_id]);
  }, [targetCliente, selectedSubs]);

  const subtotalSeleccionadoMensual = useMemo(() => {
    return selectedList.reduce((acc, s) => acc + Number(s.precio_mensual || 0), 0);
  }, [selectedList]);

  const months = useMemo(() => {
    const m = toNum(mesesPagados);
    return Number.isFinite(m) && m > 0 ? m : 1;
  }, [mesesPagados]);

  const baseTotal = useMemo(() => subtotalSeleccionadoMensual * months, [subtotalSeleccionadoMensual, months]);

  async function onSubmitCobroLote(e: React.FormEvent) {
    e.preventDefault();
    if (!targetCliente || savingCobro) return;

    const mp = toNum(mesesPagados);
    if (!Number.isFinite(mp) || mp < 1 || mp > 12) return pushToast("error", "Meses pagados inválido (1..12)");
    if (selectedList.length === 0) return pushToast("error", "Seleccione al menos un servicio para cobrar");

    const mesesEfectivos = mp + (mesGratisCobro && mp % 3 === 0 ? 1 : 0);

    setSavingCobro(true);
    try {
      await apiFetch(`/cobros/lote`, {
        method: "POST",
        body: JSON.stringify({
          suscripcionIds: selectedList.map((s) => s.suscripcion_id),
          mesesPagados: mesesEfectivos,
          metodo,
          boleta: metodo === "TRANSFERENCIA" ? boleta.trim() || null : null,
          nota: nota.trim() || null,
        }),
      });

      pushToast("success", `Cobro registrado (${selectedList.length} servicio(s))${ mesGratisCobro && mp % 3 === 0 ? " — ¡+1 mes gratis!" : ""}`);

      setOpenCobro(false);
      setTargetCliente(null);
      setSelectedSubs({});

      await loadParaCobrar();
    } catch (e: unknown) {
      // fallback compatibilidad (si /lote no existe o falla)
      try {
        await Promise.all(
          selectedList.map((s) =>
            apiFetch(`/cobros`, {
              method: "POST",
              body: JSON.stringify({
                suscripcionId: s.suscripcion_id,
                mesesPagados: mesesEfectivos,
                metodo,
                boleta: metodo === "TRANSFERENCIA" ? boleta.trim() || null : null,
                nota: nota.trim() || null,
              }),
            })
          )
        );

        pushToast("success", `Cobro registrado (${selectedList.length} servicio(s)) (modo compatibilidad)`);
        setOpenCobro(false);
        setTargetCliente(null);
        setSelectedSubs({});
        await loadParaCobrar();
      } catch (e2: unknown) {
        pushToast("error", errMsg(e2));
      }
    } finally {
      setSavingCobro(false);
    }
  }

  // ✅ Render de la modal vía Portal (tapa navbar sí o sí)
  const modalNode =
    openCobro && targetCliente
      ? createPortal(
          <div
            className="fixed inset-0 z-2147483647 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpenCobro(false);
            }}
          >
            <div className="modal w-full max-w-4xl max-h-[88vh] rounded-2xl border border-white/14 bg-[rgba(10,16,28,0.97)] shadow-2xl flex flex-col overflow-hidden">
              {/* Modal header */}
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/8 bg-white/3">
                <div>
                  <div className="text-base font-black tracking-tight text-white">Registrar cobro</div>
                  <div className="mt-1 text-xs text-white/55">
                    {targetCliente.cliente_nombre} · {targetCliente.telefono || "—"} ·{" "}
                    {targetCliente.servicios_count} servicio(s)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenCobro(false)}
                  aria-label="Cerrar"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/6 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={onSubmitCobroLote} className="flex flex-col flex-1 min-h-0">
                {/* Modal body */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-5">

                  {/* Services table */}
                  <div>
                    <div className="mb-2 text-xs font-black tracking-widest text-white/50 uppercase">Servicios a cobrar</div>
                    <div className="rounded-xl border border-white/10 bg-white/4 overflow-hidden">
                      <table className="miniTable w-full border-collapse">
                        <thead>
                          <tr className="border-b border-white/8 bg-white/3">
                            <th className="w-10 px-3 py-2.5 text-xs font-black text-white/45"></th>
                            <th className="px-3 py-2.5 text-left text-xs font-black text-white/45">Servicio</th>
                            <th className="px-3 py-2.5 text-left text-xs font-black text-white/45 hidden sm:table-cell">Cuenta</th>
                            <th className="px-3 py-2.5 text-right text-xs font-black text-white/45">Precio</th>
                            <th className="px-3 py-2.5 text-left text-xs font-black text-white/45 hidden md:table-cell">Próximo</th>
                            <th className="px-3 py-2.5 text-left text-xs font-black text-white/45">Atraso</th>
                          </tr>
                        </thead>
                        <tbody>
                          {targetCliente.subs.map((s) => {
                            const checked = !!selectedSubs[s.suscripcion_id];
                            const atraso = Number(s.atraso_dias || 0);
                            const variant = atraso > 0 ? "overdue" : atraso === 0 ? "today" : "upcoming";
                            const badge =
                              atraso > 0 ? `${atraso} día(s)` : atraso === 0 ? "Hoy" : `En ${Math.abs(atraso)} día(s)`;

                            return (
                              <tr key={s.suscripcion_id} className="border-b border-white/6 last:border-0 hover:bg-white/3 transition-colors">
                                <td className="px-3 py-2.5 text-center">
                                  <input
                                    className="chk w-4 h-4 accent-indigo-500 cursor-pointer"
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setSelectedSubs((prev) => ({
                                        ...prev,
                                        [s.suscripcion_id]: e.target.checked,
                                      }))
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2.5 text-sm font-semibold text-white">{s.servicio}</td>
                                <td className="px-3 py-2.5 text-xs text-white/50 hidden sm:table-cell">{s.cuenta_correo}</td>
                                <td className="px-3 py-2.5 text-right text-sm font-black text-emerald-300">{money(s.precio_mensual)}</td>
                                <td className="px-3 py-2.5 text-xs text-white/50 hidden md:table-cell">{s.proximo_cobro || "—"}</td>
                                <td className="px-3 py-2.5">
                                  <span className={[
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-black",
                                    variant === "overdue"  && "border-red-500/35 bg-red-500/15 text-red-300",
                                    variant === "today"    && "border-amber-500/35 bg-amber-500/15 text-amber-300",
                                    variant === "upcoming" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
                                  ].filter(Boolean).join(" ")}>
                                    {badge}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-white/40">
                      Tip: si el cliente pagó solo un servicio, desactiva el resto. Operación limpia, auditoría intacta.
                    </p>
                  </div>

                  {/* Meses + Método */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1.5 text-xs font-black tracking-wide text-white/60 uppercase">Meses pagados</label>
                      <div className="flex items-center gap-0">
                        <button
                          type="button"
                          onClick={() => setMesesPagados((p) => String(Math.max(1, Number(p) - 1)))}
                          className="h-11 w-11 flex items-center justify-center rounded-l-xl border border-r-0 border-white/10 bg-white/5 text-white/50 font-bold text-lg hover:bg-white/10 hover:text-white/80 transition-all select-none"
                        >−</button>
                        <div className="h-11 flex-1 flex items-center justify-center border-y border-white/10 bg-white/5 text-white font-black text-base min-w-[3rem]">
                          {months}
                        </div>
                        <button
                          type="button"
                          onClick={() => setMesesPagados((p) => String(Math.min(12, Number(p) + 1)))}
                          className="h-11 w-11 flex items-center justify-center rounded-r-xl border border-l-0 border-white/10 bg-white/5 text-white/50 font-bold text-lg hover:bg-white/10 hover:text-white/80 transition-all select-none"
                        >+</button>
                      </div>
                      <p className="mt-1.5 text-xs text-white/40">
                        Subtotal mensual: <b className="text-white/70">{money(subtotalSeleccionadoMensual)}</b> · Base:{" "}
                        <b className="text-white/70">{money(baseTotal)}</b>
                      </p>
                      {months > 0 && months % 3 === 0 && (
                        <label className="flex items-center gap-2 mt-2.5 cursor-pointer select-none group">
                          <div className={`relative w-8 h-4 rounded-full border transition-all duration-200 ${mesGratisCobro ? "bg-yellow-500/20 border-yellow-500/35" : "bg-white/8 border-white/12"}`}>
                            <span className={`absolute top-px w-3 h-3 rounded-full transition-all duration-200 ${mesGratisCobro ? "left-4 bg-yellow-400" : "left-0.5 bg-white/40"}`} />
                          </div>
                          <span className="text-[11px] font-semibold text-white/50 group-hover:text-white/75 transition-colors">
                            Regalar 1 mes gratis por {months} meses
                            {mesGratisCobro && <span className="ml-1 text-yellow-400/90">(¡+1 mes!)</span>}
                          </span>
                          <input type="checkbox" className="sr-only" checked={mesGratisCobro}
                            onChange={(e) => setMesGratisCobro(e.target.checked)} />
                        </label>
                      )}
                    </div>

                    <div>
                      <label className="block mb-1.5 text-xs font-black tracking-wide text-white/60 uppercase">Método</label>
                      <div className="relative">
                        <SelectField
                          label=""
                          value={metodo}
                          onChange={setMetodo}
                          options={[
                            { value: "EFECTIVO", label: "EFECTIVO" },
                            { value: "TRANSFERENCIA", label: "TRANSFERENCIA" },
                            { value: "OTRO", label: "OTRO" },
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Boleta + Nota */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {metodo === "TRANSFERENCIA" ? (
                      <div>
                        <label className="block mb-1.5 text-xs font-black tracking-wide text-white/60 uppercase">Número de boleta / referencia</label>
                        <input
                          className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/15 transition-colors"
                          value={boleta}
                          onChange={(e) => setBoleta(e.target.value)}
                          placeholder="Ej: 000123 / referencia / voucher…"
                          autoFocus
                        />
                        <p className="mt-1.5 text-xs text-white/40">Recomendado para auditoría.</p>
                      </div>
                    ) : (
                      <div>
                        <label className="block mb-1.5 text-xs font-black tracking-wide text-white/40 uppercase">Boleta</label>
                        <p className="text-xs text-white/30">Disponible solo para <b className="text-white/50">TRANSFERENCIA</b>.</p>
                      </div>
                    )}

                    <div>
                      <label className="block mb-1.5 text-xs font-black tracking-wide text-white/60 uppercase">Nota (opcional)</label>
                      <input
                        className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/15 transition-colors"
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                </div>

                {/* Modal footer */}
                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/8 bg-white/3">
                  <button
                    type="button"
                    onClick={() => setOpenCobro(false)}
                    className="flex items-center gap-2 h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingCobro}
                    className="flex items-center gap-2 h-10 px-5 rounded-xl border border-emerald-500/40 bg-linear-to-r from-sky-600/70 to-emerald-600/70 text-sm font-black text-white shadow-lg shadow-emerald-900/30 hover:from-sky-500/90 hover:to-emerald-500/90 hover:shadow-emerald-800/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 active:scale-95"
                  >
                    {savingCobro ? (
                      <><Loader2 size={14} className="animate-spin" /> Guardando…</>
                    ) : (
                      <><span className="font-black text-base leading-none">Q</span> Registrar cobro ({selectedList.length})</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      : null;

  /* ── Status helpers ── */
  function statusVariant(atraso: number): "overdue" | "today" | "upcoming" {
    if (atraso > 0) return "overdue";
    if (atraso === 0) return "today";
    return "upcoming";
  }
  function statusLabel(atraso: number) {
    if (atraso > 0) return `${atraso} día(s) atraso`;
    if (atraso === 0) return "Hoy";
    return `En ${Math.abs(atraso)} día(s)`;
  }

  /* ── Initials avatar ── */
  function initials(name: string) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }

  return (
    <div className="page-shell cobranzaPage">

      {/* ── Toasts ── */}
      <div className="fixed top-4 right-4 z-99999 flex flex-col gap-2.5 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-semibold shadow-2xl backdrop-blur-md",
              t.type === "success" && "bg-emerald-950/90 border-emerald-500/30 text-emerald-100",
              t.type === "error"   && "bg-red-950/90 border-red-500/30 text-red-100",
              t.type === "info"    && "bg-sky-950/90 border-sky-500/30 text-sky-100",
            ].filter(Boolean).join(" ")}
          >
            {t.type === "success" && <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />}
            {t.type === "error"   && <AlertCircle  size={15} className="shrink-0 text-red-400" />}
            {t.type === "info"    && <AlertCircle  size={15} className="shrink-0 text-sky-400" />}
            {t.message}
          </div>
        ))}
      </div>

      {/* ── Page header ── */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Cobranza</h1>
          <p className="mt-1 text-sm text-white/55">
            1 fila por cliente · cobro en lote
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 bg-white/5 text-sm">
            <DollarSign size={14} className="text-emerald-400" />
            <span className="text-white/60">Estimado mensual</span>
            <span className="font-black text-emerald-300">{money(kpi.estimado)}</span>
          </div>
          {kpi.atrasados > 0 && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-sm">
              <AlertCircle size={14} className="text-red-400" />
              <span className="text-white/60">Atrasados</span>
              <span className="font-black text-red-300">{kpi.atrasados}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="group flex flex-col gap-3 p-5 rounded-2xl border border-white/10 bg-white/4 shadow-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black tracking-widest text-white/50 uppercase">Clientes visibles</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10">
              <Users size={16} className="text-sky-400" />
            </div>
          </div>
          <div className="text-4xl font-black tracking-tight text-white">{kpi.clientes}</div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-sky-500/20 bg-sky-500/10 text-xs font-black text-sky-300 w-fit">
            Según filtros
          </span>
        </div>

        <div className={[
          "group flex flex-col gap-3 p-5 rounded-2xl border shadow-xl transition-all duration-200 hover:-translate-y-0.5",
          kpi.atrasados > 0
            ? "border-red-500/30 bg-red-500/8 hover:border-red-500/50 hover:bg-red-500/12"
            : "border-white/10 bg-white/4 hover:border-white/20 hover:bg-white/6",
        ].join(" ")}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black tracking-widest text-white/50 uppercase">Atrasados</span>
            <div className={[
              "flex h-9 w-9 items-center justify-center rounded-xl border",
              kpi.atrasados > 0 ? "border-red-500/30 bg-red-500/15" : "border-white/10 bg-white/8",
            ].join(" ")}>
              <AlertCircle size={16} className={kpi.atrasados > 0 ? "text-red-400" : "text-white/40"} />
            </div>
          </div>
          <div className={["text-4xl font-black tracking-tight", kpi.atrasados > 0 ? "text-red-300" : "text-white"].join(" ")}>
            {kpi.atrasados}
          </div>
          <span className={[
            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-black w-fit",
            kpi.atrasados > 0 ? "border-red-500/30 bg-red-500/15 text-red-300" : "border-white/10 bg-white/5 text-white/50",
          ].join(" ")}>
            {kpi.atrasados > 0 ? "Requieren acción" : "Al día"}
          </span>
        </div>

        <div className="group flex flex-col gap-3 p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/6 shadow-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/35 hover:bg-emerald-500/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black tracking-widest text-white/50 uppercase">Estimado mensual</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/15">
              <DollarSign size={16} className="text-emerald-400" />
            </div>
          </div>
          <div className="text-4xl font-black tracking-tight text-emerald-300">{money(kpi.estimado)}</div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-xs font-black text-emerald-300 w-fit">
            Suma de todos
          </span>
        </div>
      </div>

      {/* ── Filter toolbar ── */}
      <div className="flex flex-col gap-2.5 p-4 mb-5 rounded-2xl border border-white/10 bg-white/3 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
          <input
            className="w-full h-11 pl-9 pr-3.5 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/15 transition-colors"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente, teléfono, correo o servicio…"
          />
        </div>
        <div className="relative sm:w-48">
          <select
            className="w-full h-11 pl-3.5 pr-9 rounded-xl border border-white/10 bg-white/5 text-sm text-white appearance-none outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/15 transition-colors cursor-pointer"
            value={servicioId}
            onChange={(e) => setServicioId(e.target.value ? Number(e.target.value) : ("" as any))}
            title="Servicio"
          >
            <option value="">Servicio: Todos</option>
            {(servicios as any[]).map((s) => (
              <option key={(s as any).id} value={(s as any).id}>
                {(s as any).nombre_servicio}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
        </div>
        <div className="relative w-full sm:w-44">
          <input
            type="date"
            className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-white/5 text-sm text-white outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/15 transition-colors scheme-dark"
            value={diaCobroFecha}
            onChange={(e) => {
              const v = e.target.value;
              setDiaCobroFecha(v);
              if (v) setDiaCobro(String(new Date(v + "T00:00:00").getDate()));
              else setDiaCobro("");
            }}
            title="Filtrar por día de cobro"
          />
          {diaCobro && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-sky-400 pointer-events-none">
              Día {diaCobro}
            </span>
          )}
        </div>
        <button
          type="button"
          className="group flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/8 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
          onClick={() => loadParaCobrar()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-300"} />
          {loading ? "Cargando…" : "Recargar"}
        </button>
      </div>

      {/* ── Main table ── */}
      <div className="rounded-2xl border border-white/10 bg-white/3 overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-20 text-white/40">
            <Loader2 size={32} className="animate-spin" />
            <span className="text-sm font-semibold">Cargando cartera…</span>
          </div>
        ) : groupedClientes.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <Wallet size={28} className="text-white/30" />
            </div>
            <div>
              <p className="text-center text-base font-black text-white/60">No hay clientes para cobrar</p>
              <p className="mt-1 text-center text-sm text-white/35">Ajusta los filtros o revisa la cartera de suscripciones</p>
            </div>
            <a
              href="/clientes"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-sky-500/25 bg-sky-500/10 text-sm font-semibold text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/40 transition-colors"
            >
              <Users size={14} />
              Ir a clientes
            </a>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="px-4 py-3 text-left text-xs font-black tracking-widest text-white/45 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-black tracking-widest text-white/45 uppercase hidden sm:table-cell">Teléfono</th>
                <th className="px-4 py-3 text-left text-xs font-black tracking-widest text-white/45 uppercase">Servicios</th>
                <th className="px-4 py-3 text-right text-xs font-black tracking-widest text-white/45 uppercase hidden md:table-cell">Total mensual</th>
                <th className="px-4 py-3 text-left text-xs font-black tracking-widest text-white/45 uppercase hidden lg:table-cell">Próximo cobro</th>
                <th className="px-4 py-3 text-left text-xs font-black tracking-widest text-white/45 uppercase">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-black tracking-widest text-white/45 uppercase">Acción</th>
              </tr>
            </thead>
            <tbody>
              {groupedClientes.map((c) => {
                const atraso = Number(c.atraso_max || 0);
                const variant = statusVariant(atraso);
                const label = statusLabel(atraso);
                const isOverdue = variant === "overdue";

                return (
                  <tr
                    key={c.cliente_id}
                    className={[
                      "group border-b border-white/6 last:border-0 transition-colors duration-150",
                      isOverdue
                        ? "bg-red-500/4 hover:bg-red-500/8"
                        : "hover:bg-white/3",
                    ].join(" ")}
                  >
                    {/* Cliente */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={[
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black",
                          isOverdue
                            ? "border border-red-500/30 bg-red-500/15 text-red-300"
                            : "border border-white/10 bg-white/8 text-white/60",
                        ].join(" ")}>
                          {initials(c.cliente_nombre)}
                        </div>
                        <div>
                          <div className="text-sm font-black text-white">{c.cliente_nombre}</div>
                          <div className="text-xs text-white/40">ID: {c.cliente_id}</div>
                        </div>
                      </div>
                    </td>

                    {/* Teléfono */}
                    <td className="px-4 py-3.5 text-sm text-white/60 hidden sm:table-cell">
                      {c.telefono || "—"}
                    </td>

                    {/* Servicios badge */}
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-sky-500/20 bg-sky-500/10 text-xs font-black text-sky-300">
                        {c.servicios_count} servicio{c.servicios_count !== 1 ? "s" : ""}
                      </span>
                    </td>

                    {/* Total mensual */}
                    <td className="px-4 py-3.5 text-right hidden md:table-cell">
                      <span className="text-sm font-black text-emerald-300">{money(c.total_mensual)}</span>
                    </td>

                    {/* Próximo cobro */}
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-sm text-white/55">
                        <Calendar size={13} className="text-white/30" />
                        {c.proximo_cobro_min || "—"}
                      </div>
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3.5">
                      {variant === "overdue" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-red-500/35 bg-red-500/15 text-xs font-black text-red-300">
                          <AlertCircle size={11} />
                          {label}
                        </span>
                      )}
                      {variant === "today" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/35 bg-amber-500/15 text-xs font-black text-amber-300">
                          <Clock size={11} />
                          {label}
                        </span>
                      )}
                      {variant === "upcoming" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-xs font-black text-emerald-300">
                          <CheckCircle2 size={11} />
                          {label}
                        </span>
                      )}
                    </td>

                    {/* Acción */}
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openRegistrarCobroCliente(c)}
                        className={[
                          "inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-black transition-all duration-150",
                          "active:scale-95",
                          isOverdue
                            ? "border-red-500/40 bg-linear-to-r from-red-600/70 to-rose-600/70 text-white shadow-lg shadow-red-900/30 hover:from-red-500/90 hover:to-rose-500/90 hover:shadow-red-800/40"
                            : "border-sky-500/30 bg-linear-to-r from-sky-600/60 to-blue-600/60 text-white shadow-lg shadow-sky-900/25 hover:from-sky-500/80 hover:to-blue-500/80 hover:shadow-sky-800/35",
                        ].join(" ")}
                      >
                        <span className="font-black text-base leading-none">Q</span>
                        Cobrar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ✅ Portal: modal vive en document.body, tapa el navbar */}
      {modalNode}
    </div>
  );
}
