// src/pages/CobranzaPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
   Combos (para aplicar en cobros)
========================= */
type ComboTipoDB = "BUNDLE" | "PROMO";
type ComboEstado = "ACTIVO" | "INACTIVO";
type ComboPricingModo = "FIJO" | "PORCENTAJE";

type ComboServicio = { id: number; nombre?: string | null };
type Combo = {
  id: number;
  nombre: string;
  tipo: ComboTipoDB;
  estado: ComboEstado;

  pricing_modo: ComboPricingModo;
  pricing_valor: number;

  promo_paga_meses: number | null;
  promo_regala_meses: number | null;
  promo_acumulable: number;

  servicios?: ComboServicio[] | number[];
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
function clampInt(v: string, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const i = Math.trunc(n);
  if (i < min || i > max) return "";
  return String(i);
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

function comboServicioIds(c: Combo): number[] {
  const s = c.servicios || [];
  if (!Array.isArray(s)) return [];
  return (s as any[])
    .map((x) => (typeof x === "number" ? x : Number(x?.id)))
    .filter((n) => Number.isFinite(n));
}

function isBundleApplicable(combo: Combo, selectedServicioIds: number[]) {
  if (combo.tipo !== "BUNDLE") return false;
  const need = comboServicioIds(combo);
  if (need.length === 0) return false;
  const have = new Set(selectedServicioIds);
  return need.every((id) => have.has(id));
}

/**
 * ✅ Calcula el MENSUAL con BUNDLE (no multiplicar meses aquí)
 * - FIJO: pricing_valor se interpreta como precio mensual del bundle
 * - PORCENTAJE: descuento sobre base mensual
 */
function calcBundleMensual(combo: Combo, baseMensual: number) {
  const pv = Number(combo.pricing_valor || 0);
  if (!Number.isFinite(pv) || pv <= 0) return baseMensual;

  if (combo.pricing_modo === "FIJO") return pv;

  const pct = pv;
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return baseMensual;
  return Math.max(0, baseMensual * (1 - pct / 100));
}

/**
 * ✅ Promo con acumulación (igual que backend):
 * - acumulable=1: floor(mesesPagados/paga)*regala
 * - acumulable=0: regala una vez si cumple
 */
function calcPromo(mesesPagados: number, combo: Combo) {
  const paga = Number(combo.promo_paga_meses || 0);
  const regala = Number(combo.promo_regala_meses || 0);
  const acumulable = Number(combo.promo_acumulable || 0);

  if (!Number.isFinite(paga) || paga <= 0) return { mesesRegalados: 0, mesesTotales: mesesPagados };
  if (!Number.isFinite(regala) || regala <= 0) return { mesesRegalados: 0, mesesTotales: mesesPagados };
  if (mesesPagados < paga) return { mesesRegalados: 0, mesesTotales: mesesPagados };

  const mesesRegalados = acumulable === 1 ? Math.floor(mesesPagados / paga) * regala : regala;
  return { mesesRegalados, mesesTotales: mesesPagados + mesesRegalados };
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

  // combos
  const [combos, setCombos] = useState<Combo[]>([]);
  const [combosLoading, setCombosLoading] = useState(false);

  // ===== Cobrar =====
  const [loading, setLoading] = useState(false);
  const [rawItems, setRawItems] = useState<ParaCobrarItem[]>([]);

  const [q, setQ] = useState("");
  const [servicioId, setServicioId] = useState<number | "">("");
  const [diaCobro, setDiaCobro] = useState<string>("");

  // modal
  const [openCobro, setOpenCobro] = useState(false);
  const [savingCobro, setSavingCobro] = useState(false);
  const [targetCliente, setTargetCliente] = useState<ClienteCobranzaGroup | null>(null);

  const [mesesPagados, setMesesPagados] = useState<string>("1");
  const [metodo, setMetodo] = useState<"EFECTIVO" | "TRANSFERENCIA" | "OTRO">("EFECTIVO");
  const [boleta, setBoleta] = useState<string>("");
  const [nota, setNota] = useState<string>("");

  const [selectedSubs, setSelectedSubs] = useState<Record<number, boolean>>({});
  const [comboId, setComboId] = useState<number | "">("");

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

  async function loadCombos() {
    setCombosLoading(true);
    try {
      const res = await apiFetch<any>(`/combos?estado=ACTIVO`, { method: "GET" });
      const items: Combo[] = (res?.items || res || []) as Combo[];
      setCombos(Array.isArray(items) ? items : []);
    } catch {
      setCombos([]);
    } finally {
      setCombosLoading(false);
    }
  }

  useEffect(() => {
    loadCombos();
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
    setMetodo("EFECTIVO");
    setBoleta("");
    setNota("");
    setComboId("");

    const sel: Record<number, boolean> = {};
    for (const s of c.subs) sel[s.suscripcion_id] = true;
    setSelectedSubs(sel);

    setOpenCobro(true);
  }

  const selectedList = useMemo(() => {
    if (!targetCliente) return [];
    return targetCliente.subs.filter((s) => selectedSubs[s.suscripcion_id]);
  }, [targetCliente, selectedSubs]);

  const selectedServicioIds = useMemo(() => {
    return selectedList.map((s) => Number(s.servicio_id)).filter((n) => Number.isFinite(n));
  }, [selectedList]);

  const subtotalSeleccionadoMensual = useMemo(() => {
    return selectedList.reduce((acc, s) => acc + Number(s.precio_mensual || 0), 0);
  }, [selectedList]);

  const months = useMemo(() => {
    const m = toNum(mesesPagados);
    return Number.isFinite(m) && m > 0 ? m : 1;
  }, [mesesPagados]);

  const comboSelected = useMemo(() => {
    if (comboId === "") return null;
    return combos.find((c) => c.id === comboId) || null;
  }, [comboId, combos]);

  const combosAplicables = useMemo(() => {
    const act = combos.filter((c) => c.estado === "ACTIVO");
    const bundleOk = act.filter((c) => c.tipo === "BUNDLE" && isBundleApplicable(c, selectedServicioIds));
    const promoOk = act.filter((c) => c.tipo === "PROMO");
    return { bundleOk, promoOk };
  }, [combos, selectedServicioIds]);

  useEffect(() => {
    if (!comboSelected) return;
    if (comboSelected.tipo === "BUNDLE") {
      if (!isBundleApplicable(comboSelected, selectedServicioIds)) setComboId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServicioIds]);

  const baseTotal = useMemo(() => subtotalSeleccionadoMensual * months, [subtotalSeleccionadoMensual, months]);

  const preview = useMemo(() => {
    let montoFinal = baseTotal;
    let mesesRegalados = 0;
    let mesesTotales = months;
    let detalle = "Sin combo";

    if (!comboSelected) return { montoFinal, mesesRegalados, mesesTotales, detalle };

    if (comboSelected.tipo === "BUNDLE") {
      const mensual = calcBundleMensual(comboSelected, subtotalSeleccionadoMensual);
      montoFinal = mensual * months;
      mesesRegalados = 0;
      mesesTotales = months;
      detalle =
        comboSelected.pricing_modo === "FIJO"
          ? `Combo BUNDLE (precio mensual fijo ${money(comboSelected.pricing_valor)})`
          : `Combo BUNDLE (descuento ${comboSelected.pricing_valor}%)`;
    } else if (comboSelected.tipo === "PROMO") {
      const promo = calcPromo(months, comboSelected);
      mesesRegalados = promo.mesesRegalados;
      mesesTotales = promo.mesesTotales;
      montoFinal = baseTotal;
      detalle =
        comboSelected.promo_acumulable === 1
          ? `Promo acumulable: paga ${comboSelected.promo_paga_meses} y se regala ${comboSelected.promo_regala_meses}`
          : `Promo: paga ${comboSelected.promo_paga_meses} y se regala ${comboSelected.promo_regala_meses}`;
    }

    return { montoFinal, mesesRegalados, mesesTotales, detalle };
  }, [comboSelected, baseTotal, months, subtotalSeleccionadoMensual]);

  async function onSubmitCobroLote(e: React.FormEvent) {
    e.preventDefault();
    if (!targetCliente || savingCobro) return;

    const mp = toNum(mesesPagados);
    if (!Number.isFinite(mp) || mp < 1 || mp > 12) return pushToast("error", "Meses pagados inválido (1..12)");
    if (selectedList.length === 0) return pushToast("error", "Seleccione al menos un servicio para cobrar");

    if (comboSelected?.tipo === "BUNDLE" && !isBundleApplicable(comboSelected, selectedServicioIds)) {
      return pushToast("error", "El combo seleccionado no aplica a los servicios marcados.");
    }

    setSavingCobro(true);
    try {
      await apiFetch(`/cobros/lote`, {
        method: "POST",
        body: JSON.stringify({
          suscripcionIds: selectedList.map((s) => s.suscripcion_id),
          mesesPagados: mp,
          metodo,
          boleta: metodo === "TRANSFERENCIA" ? boleta.trim() || null : null,
          nota: nota.trim() || null,
          comboId: comboId === "" ? null : comboId,
        }),
      });

      pushToast("success", `Cobro registrado (${selectedList.length} servicio(s))`);

      setOpenCobro(false);
      setTargetCliente(null);
      setSelectedSubs({});
      setComboId("");

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
                mesesPagados: mp,
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
        setComboId("");
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
            className="modalBack"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpenCobro(false);
            }}
          >
            <div className="modal">
              <div className="modalHead">
                <div>
                  <div className="modalTitle">Registrar cobro</div>
                  <div className="modalSub">
                    {targetCliente.cliente_nombre} · {targetCliente.telefono || "—"} ·{" "}
                    {targetCliente.servicios_count} servicio(s)
                  </div>
                </div>

                <button className="iconClose" type="button" onClick={() => setOpenCobro(false)} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <form onSubmit={onSubmitCobroLote}>
                <div className="modalBody">
                  <div className="field">
                    <div className="label">Servicios a cobrar</div>
                    <table className="miniTable">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}></th>
                          <th>Servicio</th>
                          <th>Cuenta</th>
                          <th>Precio</th>
                          <th>Próximo</th>
                          <th>Atraso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetCliente.subs.map((s) => {
                          const checked = !!selectedSubs[s.suscripcion_id];
                          const atraso = Number(s.atraso_dias || 0);
                          const badge = atraso > 0 ? "off" : atraso === 0 ? "on" : "muted";
                          const label =
                            atraso > 0 ? `${atraso} día(s)` : atraso === 0 ? "Hoy" : `En ${Math.abs(atraso)} día(s)`;

                          return (
                            <tr key={s.suscripcion_id}>
                              <td>
                                <input
                                  className="chk"
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
                              <td>{s.servicio}</td>
                              <td>{s.cuenta_correo}</td>
                              <td>{money(s.precio_mensual)}</td>
                              <td>{s.proximo_cobro || "—"}</td>
                              <td>
                                <span className={`statusBadge ${badge}`}>{label}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="fieldHint">
                      Tip: si el cliente pagó solo un servicio hoy, desactive el resto. Operación limpia, auditoría intacta.
                    </div>
                  </div>

                  <div className="grid2">
                    <div className="field">
                      <div className="label">Meses pagados (1..12)</div>
                      <input
                        className="input"
                        value={mesesPagados}
                        onChange={(e) => setMesesPagados(clampInt(e.target.value, 1, 12) || e.target.value)}
                        inputMode="numeric"
                        required
                      />
                      <div className="fieldHint">
                        Subtotal mensual (selección): <b>{money(subtotalSeleccionadoMensual)}</b> · Base x meses:{" "}
                        <b>{money(baseTotal)}</b>
                      </div>
                    </div>

                    <SelectField
                      label="Método"
                      value={metodo}
                      onChange={setMetodo}
                      options={[
                        { value: "EFECTIVO", label: "EFECTIVO" },
                        { value: "TRANSFERENCIA", label: "TRANSFERENCIA" },
                        { value: "OTRO", label: "OTRO" },
                      ]}
                    />
                  </div>

                  <div className="grid2">
                    <div className="field">
                      <div className="label">Combo (opcional · 1 o ninguno)</div>
                      <select
                        className="input"
                        value={comboId}
                        onChange={(e) => setComboId(e.target.value ? Number(e.target.value) : ("" as any))}
                        disabled={combosLoading}
                        title="Combo"
                      >
                        <option value="">Sin combo</option>

                        {combosAplicables.bundleOk.length > 0 && (
                          <optgroup label="Combos de Apps (BUNDLE)">
                            {combosAplicables.bundleOk.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre} ·{" "}
                                {c.pricing_modo === "FIJO" ? `${money(c.pricing_valor)}/mes` : `${c.pricing_valor}%`}
                              </option>
                            ))}
                          </optgroup>
                        )}

                        {combosAplicables.promoOk.length > 0 && (
                          <optgroup label="Promos por meses (PROMO)">
                            {combosAplicables.promoOk.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre} · paga {c.promo_paga_meses} / regala {c.promo_regala_meses}
                                {c.promo_acumulable === 1 ? " (acumulable)" : ""}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>

                      <div className="fieldHint">
                        {comboId === "" ? "Seleccione un combo si aplica." : "Aplicando 1 combo."}
                      </div>
                    </div>

                    <div className="comboBox">
                      <div className="comboLine">
                        <span className="k">Regla</span>
                        <span className="v">{preview.detalle}</span>
                      </div>
                      <div className="comboLine">
                        <span className="k">Monto final</span>
                        <span className="v">{money(preview.montoFinal)}</span>
                      </div>
                      <div className="comboLine">
                        <span className="k">Meses pagados</span>
                        <span className="v">{months}</span>
                      </div>
                      <div className="comboLine">
                        <span className="k">Meses regalados</span>
                        <span className="v">{preview.mesesRegalados}</span>
                      </div>
                      <div className="comboLine">
                        <span className="k">Meses totales</span>
                        <span className="v">{preview.mesesTotales}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid2">
                    {metodo === "TRANSFERENCIA" ? (
                      <div className="field">
                        <div className="label">Número de boleta / referencia</div>
                        <input
                          className="input"
                          value={boleta}
                          onChange={(e) => setBoleta(e.target.value)}
                          placeholder="Ej: 000123 / referencia / voucher…"
                          autoFocus
                        />
                        <div className="fieldHint">Recomendado para auditoría (transferencias).</div>
                      </div>
                    ) : (
                      <div className="field">
                        <div className="label">Boleta</div>
                        <div className="fieldHint">
                          Disponible solo para <b>TRANSFERENCIA</b>.
                        </div>
                      </div>
                    )}

                    <div className="field">
                      <div className="label">Nota (opcional)</div>
                      <input
                        className="input"
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                </div>

                <div className="modalFoot">
                  <button className="btn ghost" type="button" onClick={() => setOpenCobro(false)}>
                    Cancelar
                  </button>

                  <button className="btn primary" type="submit" disabled={savingCobro}>
                    {savingCobro ? "Guardando…" : `Registrar cobro (${selectedList.length})`}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="page-shell cobranzaPage">
      <div className="toastStack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      <div className="pageHead">
        <div>
          <h1 className="pageTitle">Cobranza</h1>
          <p className="pageSub">
            1 fila por cliente. Cobro en lote por servicios. Combo: 1 o ninguno. (El backend ya filtra cliente/cuenta/servicio
            inactivos.)
          </p>
        </div>
      </div>

      <div className="kpiRow">
        <div className="kpi">
          <div className="kpi-label">Clientes visibles</div>
          <div className="kpi-value">{kpi.clientes}</div>
          <div className="kpi-foot">
            <span className="hint">Según filtros.</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Clientes atrasados</div>
          <div className="kpi-value">{kpi.atrasados}</div>
          <div className="kpi-foot">
            <span className="badge muted">Prioridad</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Estimado mensual</div>
          <div className="kpi-value">{money(kpi.estimado)}</div>
          <div className="kpi-foot">
            <span className="badge ok">Base</span>
          </div>
        </div>
      </div>

      <div className="clientes-tools">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente, teléfono, correo o servicio…"
          title="Cliente / teléfono / correo / servicio"
        />

        <select
          className="input"
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

        <input
          className="input"
          value={diaCobro}
          onChange={(e) => setDiaCobro(clampInt(e.target.value, 1, 31))}
          placeholder="Día corte (1..31)"
          inputMode="numeric"
          title="Día de cobro"
        />

        <button type="button" className="btn ghost" onClick={() => loadParaCobrar()} disabled={loading}>
          {loading ? "Cargando…" : "Recargar"}
        </button>
      </div>

      <div className="tableWrap">
        {loading ? (
          <div className="empty">
            <div className="emptyTitle">Cargando…</div>
            <div className="emptySub">Leyendo cartera para cobranza.</div>
          </div>
        ) : groupedClientes.length === 0 ? (
          <div className="empty">
            <div className="emptyTitle">Sin resultados</div>
            <div className="emptySub">Ajuste filtros.</div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th>Servicios</th>
                <th>Total mensual</th>
                <th>Próximo cobro</th>
                <th>Atraso</th>
                <th>ACCIÓN</th>
              </tr>
            </thead>
            <tbody>
              {groupedClientes.map((c) => {
                const atraso = Number(c.atraso_max || 0);
                const badge = atraso > 0 ? "off" : atraso === 0 ? "on" : "muted";
                const label =
                  atraso > 0 ? `${atraso} día(s)` : atraso === 0 ? "Hoy" : `En ${Math.abs(atraso)} día(s)`;

                return (
                  <tr key={c.cliente_id}>
                    <td>
                      <div className="cellMain">{c.cliente_nombre}</div>
                      <div className="cellSub">ID: {c.cliente_id}</div>
                    </td>
                    <td>{c.telefono || "—"}</td>
                    <td>
                      <span className="pill">{c.servicios_count} servicio(s)</span>
                    </td>
                    <td>{money(c.total_mensual)}</td>
                    <td>{c.proximo_cobro_min || "—"}</td>
                    <td>
                      <span className={`statusBadge ${badge}`}>{label}</span>
                    </td>
                    <td>
                      <button type="button" className="btn primary" onClick={() => openRegistrarCobroCliente(c)}>
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

      {/* ✅ Portal: la modal vive en document.body, por eso sí tapa el navbar */}
      {modalNode}
    </div>
  );
}
