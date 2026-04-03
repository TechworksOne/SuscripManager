// src/pages/CombosPage.tsx
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/http";
import "../styles/combos.css";

type ComboTipoUI = "APPS" | "MESES";
type ComboEstado = "ACTIVO" | "INACTIVO";

/** OJO: su tabla usa nombre_servicio */
type Servicio = {
  id: number;
  nombre_servicio: string;
};

type ComboTipoDB = "BUNDLE" | "PROMO" | "MIXTO";
type PricingModoDB = "FIJO" | "PORCENTAJE" | "MONTO";

type ComboServicio = { id: number; nombre: string };
type Combo = {
  id: number;
  nombre: string;
  tipo: ComboTipoDB;
  estado: ComboEstado;

  pricing_modo: PricingModoDB;
  pricing_valor: number;

  promo_paga_meses: number | null;
  promo_regala_meses: number | null;
  promo_acumulable: boolean;

  servicios: ComboServicio[];

  created_at?: string;
  updated_at?: string;
};

function money(n: any) {
  const v = Number(n ?? 0);
  return v.toLocaleString("es-GT", { style: "currency", currency: "GTQ" });
}

type ToastType = "success" | "error" | "info";
type Toast = { id: string; type: ToastType; message: string };

export default function CombosPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);

  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2400);
  };

  // data (servicios/apps)
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [serviciosLoading, setServiciosLoading] = useState(false);

  // ===== LISTADO COMBOS =====
  const [combos, setCombos] = useState<Combo[]>([]);
  const [combosLoading, setCombosLoading] = useState(false);
  const [qList, setQList] = useState("");
  const [tipoList, setTipoList] = useState<"" | ComboTipoDB>("");
  const [estadoList, setEstadoList] = useState<"" | ComboEstado>("");

  async function loadCombos() {
    try {
      setCombosLoading(true);
      const params = new URLSearchParams();
      if (qList.trim()) params.set("q", qList.trim());
      if (tipoList) params.set("tipo", tipoList);
      if (estadoList) params.set("estado", estadoList);

      const res = await apiFetch<{ items: any[] }>(`/combos?${params.toString()}`, { method: "GET" });
      const items = Array.isArray(res?.items) ? res.items : [];

      const norm: Combo[] = items.map((c: any) => ({
        id: Number(c.id),
        nombre: String(c.nombre ?? ""),
        tipo: (c.tipo ?? "BUNDLE") as ComboTipoDB,
        estado: (c.estado ?? "ACTIVO") as ComboEstado,

        pricing_modo: (c.pricing_modo ?? "FIJO") as PricingModoDB,
        pricing_valor: Number(c.pricing_valor ?? 0),

        promo_paga_meses: c.promo_paga_meses == null ? null : Number(c.promo_paga_meses),
        promo_regala_meses: c.promo_regala_meses == null ? null : Number(c.promo_regala_meses),
        promo_acumulable: !!c.promo_acumulable,

        // backend devuelve [{id, nombre}] (ojo: no nombre_servicio aquí, ya viene “nombre”)
        servicios: Array.isArray(c.servicios)
          ? c.servicios.map((s: any) => ({ id: Number(s.id), nombre: String(s.nombre ?? "") }))
          : [],
        created_at: c.created_at,
        updated_at: c.updated_at,
      }));

      setCombos(norm);
    } catch (e: any) {
      setCombos([]);
      pushToast("error", e?.message || "No se pudieron cargar los combos");
    } finally {
      setCombosLoading(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => loadCombos(), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qList, tipoList, estadoList]);

  async function toggleCombo(id: number) {
    try {
      await apiFetch(`/combos/${id}/toggle`, { method: "PATCH" });
      pushToast("success", "Estado actualizado.");
      await loadCombos();
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo cambiar el estado");
    }
  }

  async function deleteCombo(id: number) {
    try {
      await apiFetch(`/combos/${id}`, { method: "DELETE" });
      pushToast("success", "Combo desactivado (eliminación lógica).");
      await loadCombos();
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo eliminar");
    }
  }

  // ===== FORM (crear) =====
  const [tipoUI, setTipoUI] = useState<ComboTipoUI>("APPS");
  const [nombre, setNombre] = useState("");
  const [estado, setEstado] = useState<ComboEstado>("ACTIVO");

  // apps
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<number[]>([]);
  const [precioModo, setPrecioModo] = useState<"FIJO" | "PORCENTAJE">("FIJO");
  const [precioValor, setPrecioValor] = useState<string>("");

  // promo meses
  const [pagaMeses, setPagaMeses] = useState<string>("");
  const [regalaMeses, setRegalaMeses] = useState<string>("");

  // load servicios
  useEffect(() => {
    (async () => {
      try {
        setServiciosLoading(true);
        const r = await apiFetch<{ items: Servicio[] }>("/servicios", { method: "GET" });
        // soporta backend que devuelva {items} o array directo
        setServicios((r as any).items || (r as any) || []);
      } catch (e: any) {
        pushToast("error", e?.message || "No se pudieron cargar los servicios");
        setServicios([]);
      } finally {
        setServiciosLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requiereApps = tipoUI === "APPS";
  const requiereMeses = tipoUI === "MESES";

  const selectedServicios = useMemo(() => {
    const map = new Map(servicios.map((s) => [s.id, s.nombre_servicio]));
    return serviciosSeleccionados.map((id) => ({ id, nombre: map.get(id) || `ID ${id}` }));
  }, [servicios, serviciosSeleccionados]);

  // Validaciones por paso
  const canNext = useMemo(() => {
    if (step === 1) return true;
    if (step === 2) return nombre.trim().length >= 3;
    if (step === 3) {
      if (requiereApps) {
        if (serviciosSeleccionados.length < 1) return false;
        const pv = Number(precioValor || 0);
        if (!Number.isFinite(pv) || pv <= 0) return false;
        if (precioModo === "PORCENTAJE" && (pv <= 0 || pv >= 100)) return false;
      }
      if (requiereMeses) {
        const p = Number(pagaMeses || 0);
        const r = Number(regalaMeses || 0);
        if (!Number.isFinite(p) || p <= 0) return false;
        if (!Number.isFinite(r) || r <= 0) return false;
      }
      return true;
    }
    return false;
  }, [step, nombre, requiereApps, requiereMeses, serviciosSeleccionados, precioModo, precioValor, pagaMeses, regalaMeses]);

  function toggleServicio(id: number) {
    setServiciosSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function resetAll() {
    setStep(1);
    setTipoUI("APPS");
    setNombre("");
    setEstado("ACTIVO");
    setServiciosSeleccionados([]);
    setPrecioModo("FIJO");
    setPrecioValor("");
    setPagaMeses("");
    setRegalaMeses("");
  }

  async function onGuardar() {
    if (!canNext) {
      pushToast("error", "Revise los campos antes de guardar.");
      return;
    }

    const tipoDB: ComboTipoDB = tipoUI === "APPS" ? "BUNDLE" : "PROMO";

    const payload: any = {
      nombre: nombre.trim(),
      tipo: tipoDB,
      estado,

      pricing_modo: requiereApps ? precioModo : "FIJO",
      pricing_valor: requiereApps ? Number(precioValor) : 0,

      promo_paga_meses: requiereMeses ? Number(pagaMeses) : null,
      promo_regala_meses: requiereMeses ? Number(regalaMeses) : null,

      // NO combinable
      promo_acumulable: 0,

      // backend espera servicios_ids
      servicios_ids: requiereApps ? serviciosSeleccionados : [],
    };

    try {
      setLoading(true);
      await apiFetch("/combos", { method: "POST", body: JSON.stringify(payload) });
      pushToast("success", "Combo guardado correctamente.");
      resetAll();
      await loadCombos();
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo guardar el combo.");
    } finally {
      setLoading(false);
    }
  }

  const resumen = useMemo(() => {
    const parts: string[] = [];
    parts.push(tipoUI === "APPS" ? "Apps con precio especial" : "Meses gratis");
    parts.push(estado === "ACTIVO" ? "Activo" : "Inactivo");

    let precioTxt = "—";
    if (requiereApps) {
      const pv = Number(precioValor || 0);
      precioTxt = precioModo === "FIJO" ? `Cobra: ${money(pv)}` : `Descuento: ${pv}%`;
    }

    let promoTxt = "—";
    if (requiereMeses) {
      promoTxt = `Paga ${pagaMeses || "?"} mes(es) y se regala ${regalaMeses || "?"}`;
    }

    return { parts, precioTxt, promoTxt };
  }, [tipoUI, estado, requiereApps, precioModo, precioValor, requiereMeses, pagaMeses, regalaMeses]);

  const comboKpis = useMemo(() => {
    const total = combos.length;
    const activos = combos.filter((c) => c.estado === "ACTIVO").length;
    const promos = combos.filter((c) => c.tipo === "PROMO").length;
    const bundles = combos.filter((c) => c.tipo === "BUNDLE").length;
    return { total, activos, promos, bundles };
  }, [combos]);

  function badgeTipo(tipo: ComboTipoDB) {
    if (tipo === "BUNDLE") return "Apps";
    if (tipo === "PROMO") return "Meses";
    return "Mixto";
  }

  function descCombo(c: Combo) {
    if (c.tipo === "PROMO") {
      return `Paga ${c.promo_paga_meses ?? "?"} y regala ${c.promo_regala_meses ?? "?"}${c.promo_acumulable ? " (acumulable)" : ""}`;
    }
    if (c.pricing_modo === "FIJO") return `Precio fijo: ${money(c.pricing_valor)}`;
    if (c.pricing_modo === "PORCENTAJE") return `Descuento: ${Number(c.pricing_valor)}%`;
    return `Monto: ${money(c.pricing_valor)}`;
  }

  return (
    <div className="page combosPage">
      <div className="toastStack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* ===== HEADER ===== */}
      <div className="headRow">
        <div>
          <h1 className="pageTitle">Combos</h1>
          <p className="pageSub">Cree reglas comerciales simples y administre sus combos existentes.</p>

          <div className="steps">
            <span className={`stepPill ${step === 1 ? "on" : ""}`}>1) Qué ofrece</span>
            <span className={`stepPill ${step === 2 ? "on" : ""}`}>2) Básico</span>
            <span className={`stepPill ${step === 3 ? "on" : ""}`}>3) Configurar</span>
          </div>
        </div>

        <div className="actionsRow">
          <button className="btn" onClick={resetAll} disabled={loading}>
            Limpiar
          </button>
        </div>
      </div>

      {/* ===== KPIs DEL LISTADO ===== */}
      <div className="kpiRow" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <div className="kpi-label">Total combos</div>
          <div className="kpi-value">{comboKpis.total}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Activos</div>
          <div className="kpi-value">{comboKpis.activos}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bundles</div>
          <div className="kpi-value">{comboKpis.bundles}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Promos</div>
          <div className="kpi-value">{comboKpis.promos}</div>
        </div>
      </div>

      {/* ===== LISTADO DE COMBOS EXISTENTES ===== */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panelHead">
          <div>
            <div className="panelTitle">Combos existentes</div>
            <div className="panelSub">Gestión operativa: filtrar, activar/desactivar y eliminar lógico.</div>
          </div>
          <div className="actionsRow">
            <button className="btn ghost" onClick={loadCombos} disabled={combosLoading}>
              {combosLoading ? "Cargando…" : "Recargar"}
            </button>
          </div>
        </div>

        <div className="content">
          <div className="clientes-tools" style={{ marginBottom: 12 }}>
            <input
              className="input"
              value={qList}
              onChange={(e) => setQList(e.target.value)}
              placeholder="Buscar por nombre…"
              title="Buscar"
            />

            <select className="input" value={tipoList} onChange={(e) => setTipoList((e.target.value || "") as any)} title="Tipo">
              <option value="">Tipo: Todos</option>
              <option value="BUNDLE">BUNDLE (Apps)</option>
              <option value="PROMO">PROMO (Meses)</option>
              <option value="MIXTO">MIXTO</option>
            </select>

            <select
              className="input"
              value={estadoList}
              onChange={(e) => setEstadoList((e.target.value || "") as any)}
              title="Estado"
            >
              <option value="">Estado: Todos</option>
              <option value="ACTIVO">ACTIVO</option>
              <option value="INACTIVO">INACTIVO</option>
            </select>
          </div>

          {combosLoading ? (
            <div className="warn">Cargando combos…</div>
          ) : combos.length === 0 ? (
            <div className="warn">No hay combos con esos filtros.</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Combo</th>
                    <th>Tipo</th>
                    <th>Detalle</th>
                    <th>Servicios</th>
                    <th>Estado</th>
                    <th style={{ width: 260 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {combos.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="cellMain">{c.nombre}</div>
                        <div className="cellSub">ID: {c.id}</div>
                      </td>
                      <td>
                        <span className="pill">{badgeTipo(c.tipo)}</span>
                      </td>
                      <td>{descCombo(c)}</td>
                      <td>
                        {c.tipo === "PROMO" ? (
                          "—"
                        ) : c.servicios?.length ? (
                          <span className="cellSub">{c.servicios.map((s) => s.nombre).join(", ")}</span>
                        ) : (
                          <span className="cellSub">Sin servicios</span>
                        )}
                      </td>
                      <td>
                        <span className={`statusBadge ${c.estado === "ACTIVO" ? "on" : "muted"}`}>{c.estado}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="btn ghost" type="button" onClick={() => toggleCombo(c.id)} title="Activar/Desactivar">
                            {c.estado === "ACTIVO" ? "Desactivar" : "Activar"}
                          </button>
                          <button className="btn danger" type="button" onClick={() => deleteCombo(c.id)} title="Eliminar lógico">
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Edición (PUT) la montamos después */}
            </div>
          )}
        </div>
      </div>

      {/* ===== CREACIÓN (WIZARD) ===== */}
      <div className="shell">
        {/* FORM */}
        <div className="panel">
          <div className="panelHead">
            <div>
              <div className="panelTitle">{step === 1 ? "¿Qué quiere ofrecer?" : step === 2 ? "Datos básicos" : "Configurar combo"}</div>
              <div className="panelSub">
                {step === 1
                  ? "Elija una opción. No hay combinaciones aquí."
                  : step === 2
                  ? "Nombre claro y estado. Eso es todo."
                  : "Seleccione apps o defina meses gratis. Manténgalo simple."}
              </div>
            </div>
          </div>

          <div className="content">
            {/* STEP 1 */}
            {step === 1 && (
              <div className="optRow">
                <div className={`opt ${tipoUI === "APPS" ? "on" : ""}`} onClick={() => setTipoUI("APPS")}>
                  <div className="optTitle">Apps con precio especial</div>
                  <div className="optSub">Junta varias apps y cobra un precio fijo o con descuento.</div>
                </div>

                <div className={`opt ${tipoUI === "MESES" ? "on" : ""}`} onClick={() => setTipoUI("MESES")}>
                  <div className="optTitle">Meses gratis</div>
                  <div className="optSub">Si el cliente paga X meses, usted le regala Y meses.</div>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="grid2">
                <div className="card">
                  <div className="field">
                    <label>Nombre del combo</label>
                    <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Netflix Familiar Especial" maxLength={120} />
                    <div className="hint">Nombre claro = operación más rápida.</div>
                  </div>
                </div>

                <div className="card">
                  <div className="field">
                    <label>Estado</label>
                    <select value={estado} onChange={(e) => setEstado(e.target.value as ComboEstado)}>
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="INACTIVO">INACTIVO</option>
                    </select>
                    <div className="hint">Tip: deje INACTIVO y active cuando esté listo.</div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div className="grid2">
                {/* APPS */}
                {requiereApps && (
                  <div className="card">
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Apps incluidas</div>
                    <div className="hint" style={{ marginTop: 0 }}>
                      Marque las apps que formarán el combo.
                    </div>

                    {serviciosLoading ? (
                      <div className="warn">Cargando apps…</div>
                    ) : servicios.length === 0 ? (
                      <div className="warn">No hay servicios. Cree servicios primero.</div>
                    ) : (
                      <div className="chips">
                        {servicios.map((s) => (
                          <span
                            key={s.id}
                            className={`chip ${serviciosSeleccionados.includes(s.id) ? "on" : ""}`}
                            onClick={() => toggleServicio(s.id)}
                            title="Click para seleccionar"
                          >
                            {s.nombre_servicio}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="field" style={{ marginTop: 14 }}>
                      <label>¿Cómo cobra?</label>
                      <select value={precioModo} onChange={(e) => setPrecioModo(e.target.value as any)}>
                        <option value="FIJO">Precio fijo</option>
                        <option value="PORCENTAJE">Descuento (%)</option>
                      </select>
                    </div>

                    <div className="field">
                      <label>{precioModo === "FIJO" ? "Precio (Q)" : "Descuento (%)"}</label>
                      <input
                        value={precioValor}
                        onChange={(e) => setPrecioValor(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder={precioModo === "FIJO" ? "Ej: 70" : "Ej: 15"}
                        inputMode="decimal"
                      />
                      <div className="hint">
                        {precioModo === "FIJO" ? "Usted define el precio final del combo." : "Ej: 15 significa 15% menos del total de apps."}
                      </div>
                    </div>
                  </div>
                )}

                {/* MESES */}
                {requiereMeses && (
                  <div className="card">
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Promoción por meses</div>
                    <div className="hint" style={{ marginTop: 0 }}>
                      Simple: paga X, se regala Y. (No combinable)
                    </div>

                    <div className="grid2" style={{ marginTop: 10 }}>
                      <div className="field" style={{ marginTop: 0 }}>
                        <label>Paga (meses)</label>
                        <input value={pagaMeses} onChange={(e) => setPagaMeses(e.target.value.replace(/[^\d]/g, ""))} placeholder="Ej: 3" inputMode="numeric" />
                      </div>
                      <div className="field" style={{ marginTop: 0 }}>
                        <label>Se regala (meses)</label>
                        <input
                          value={regalaMeses}
                          onChange={(e) => setRegalaMeses(e.target.value.replace(/[^\d]/g, ""))}
                          placeholder="Ej: 1"
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <div className="warn">Este combo queda marcado como NO combinable.</div>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="actionsRow">
              <button className="btn" onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as any)))} disabled={loading || step === 1}>
                Atrás
              </button>

              {step < 3 ? (
                <button className="btn primary" onClick={() => setStep((s) => (s === 3 ? 3 : ((s + 1) as any)))} disabled={loading || !canNext}>
                  Siguiente
                </button>
              ) : (
                <button className="btn primary" onClick={onGuardar} disabled={loading || !canNext}>
                  {loading ? "Guardando…" : "Guardar combo"}
                </button>
              )}
            </div>

            {step === 3 && !canNext && (
              <div className="warn">
                Le falta algo:{" "}
                {requiereApps && serviciosSeleccionados.length < 1 ? "seleccione al menos una app. " : ""}
                {requiereApps && (!precioValor || Number(precioValor) <= 0) ? "defina un precio/descuento válido. " : ""}
                {requiereMeses && (!pagaMeses || !regalaMeses) ? "complete meses paga/regala. " : ""}
              </div>
            )}
          </div>
        </div>

        {/* SUMMARY */}
        <div className="panel">
          <div className="panelHead">
            <div>
              <div className="panelTitle">Resumen</div>
              <div className="panelSub">Validación rápida antes de guardar.</div>
            </div>
          </div>

          <div className="content">
            <div className="summaryLine">
              <span className="k">Nombre</span>
              <span className="v">{nombre.trim() ? nombre.trim() : "—"}</span>
            </div>
            <div className="summaryLine">
              <span className="k">Qué ofrece</span>
              <span className="v">{resumen.parts[0]}</span>
            </div>
            <div className="summaryLine">
              <span className="k">Estado</span>
              <span className="v">{resumen.parts[1]}</span>
            </div>

            {requiereApps && (
              <>
                <div className="summaryLine">
                  <span className="k">Apps</span>
                  <span className="v">{selectedServicios.length ? selectedServicios.map((s) => s.nombre).join(", ") : "—"}</span>
                </div>
                <div className="summaryLine">
                  <span className="k">Precio</span>
                  <span className="v">{resumen.precioTxt}</span>
                </div>
              </>
            )}

            {requiereMeses && (
              <div className="summaryLine">
                <span className="k">Promo</span>
                <span className="v">{resumen.promoTxt}</span>
              </div>
            )}

            <div className="summaryLine">
              <span className="k">Combinable</span>
              <span className="v">No</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
