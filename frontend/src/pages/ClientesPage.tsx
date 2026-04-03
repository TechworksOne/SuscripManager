import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Cliente, SuscripcionCliente } from "../api/clientes";
import { actualizarCliente, crearCliente, getClientes, toggleClienteActivo } from "../api/clientes";

import type { Servicio } from "../api/servicios";
import { getServicios } from "../api/servicios";

import type { Cuenta } from "../api/cuentas";
import { getCuentas } from "../api/cuentas";

import { apiFetch } from "../api/http";
import { crearSuscripcion, eliminarSuscripcion } from "../api/suscripciones";

/* =========================
   Helpers
========================= */
type ToastType = "success" | "error" | "info";
type Toast = { id: string; type: ToastType; message: string };

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
  const [precioTouched, setPrecioTouched] = useState(false);

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
        await crearSuscripcion({
          clienteId: clienteIdFinal,
          cuentaId: Number(cuentaId),
          precioMensual: Number(precioMensual),
          diaCobro: Number(diaCobro),
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

  const susCount = useMemo(() => {
    return editing ? susItems.length : 0;
  }, [editing, susItems.length]);

  return (
    <div className="page-shell clientesPage">
      <div className="toastStack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      <div className="pageHead">
        <div>
          <h1 className="pageTitle">Clientes</h1>
        </div>

        <button className="btn primary" onClick={openCreate}>
          + Nuevo cliente
        </button>
      </div>

      <div className="kpiRow">
        <div className="kpi">
          <div className="kpi-label">Clientes visibles</div>
          <div className="kpi-value">{kpi.visibles}</div>
          <div className="kpi-foot">
            <span className="hint">Según filtros.</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Activos</div>
          <div className="kpi-value">{kpi.activos}</div>
          <div className="kpi-foot">
            <span className="badge ok">Operativos</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Inactivos</div>
          <div className="kpi-value">{kpi.inactivos}</div>
          <div className="kpi-foot">
            <span className="badge muted">Archivados</span>
          </div>
        </div>
      </div>

      {/* ===== herramientas/filtros ===== */}
      <div className="clientes-tools">
        <select
          className="input"
          value={activoFilter}
          onChange={(e) => setActivoFilter(e.target.value as any)}
          title="Estado"
        >
          <option value="1">Activos</option>
          <option value="0">Inactivos</option>
          <option value="all">Todos</option>
        </select>

        <input
          className="input"
          value={qNombre}
          onChange={(e) => setQNombre(e.target.value)}
          placeholder="Filtrar por nombre y teléfono"
          title="Nombre del cliente"
        />

        <select
          className="input"
          value={servicioFilterId}
          onChange={(e) => setServicioFilterId(e.target.value ? Number(e.target.value) : ("" as any))}
          title="Servicio"
        >
          <option value="">Servicio: Todos</option>
          {(servicios as any[]).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre_servicio}
            </option>
          ))}
        </select>

        <input
          className="input"
          value={qCorreoCuenta}
          onChange={(e) => setQCorreoCuenta(e.target.value)}
          placeholder="Correo de la cuenta (ej: cuenta@gmail.com)…"
          title="Correo de cuenta"
        />

        <input
          className="input"
          value={diaCobroFilter}
          onChange={(e) => setDiaCobroFilter(clampInt(e.target.value, 1, 31))}
          placeholder="Día de corte (1..31)"
          inputMode="numeric"
          title="Día de corte"
        />
      </div>

      <div className="tableWrap">
        {loading ? (
          <div className="empty">
            <div className="emptyTitle">Cargando…</div>
            <div className="emptySub">Leyendo datos desde el backend.</div>
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <div className="emptyTitle">Sin resultados</div>
            <div className="emptySub">Pruebe limpiar filtros o cree un cliente nuevo.</div>
            <button className="btn primary" onClick={openCreate}>
              Crear cliente
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th style={{ width: 220 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const isActive = Number(c.activo ?? 1) === 1;
                const isToggling = togglingId === c.id;

                return (
                  <tr key={c.id}>
                    <td>
                      <div className="cellMain">{c.nombre}</div>
                      <div className="cellSub">ID: {c.id}</div>
                    </td>
                    <td>{c.telefono || "—"}</td>
                    <td>
                      <span className={`statusBadge ${isActive ? "on" : "off"}`}>
                        {isActive ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </td>
                    <td>
                      <div className="rowActions">
                        <label className="switch" title={isActive ? "Desactivar" : "Activar"}>
                          <input
                            type="checkbox"
                            checked={isActive}
                            disabled={isToggling}
                            onChange={() => onToggleActivo(c)}
                          />
                          <span className="slider" />
                        </label>

                        <button className="btn ghost" onClick={() => openEdit(c)} disabled={isToggling}>
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* =========================
          MODAL CREATE/EDIT (Split)
      ========================== */}
      {open && (
        <div className="modalBack" role="dialog" aria-modal="true">
          <div className="modal modalWide">
            <div className="modalHead">
              <div>
                <div className="modalTitle">{editing ? "Editar cliente" : "Nuevo cliente"}</div>
                <div className="modalSub">Datos básicos para contacto y control.</div>
              </div>

              <button className="iconClose" type="button" onClick={() => setOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <form onSubmit={onSubmit}>
              <div className="modalSplit">
                {/* NAV */}
                <aside className="modalNav" aria-label="Navegación de secciones">
                  <button
                    type="button"
                    className={`modalNavItem ${modalTab === "cliente" ? "active" : ""}`}
                    onClick={() => goTab("cliente")}
                  >
                    <span className="mniTitle">Cliente</span>
                    <span className="mniSub">Nombre y teléfono</span>
                  </button>

                  <button
                    type="button"
                    className={`modalNavItem ${modalTab === "asignar" ? "active" : ""}`}
                    onClick={() => goTab("asignar")}
                  >
                    <span className="mniTitle">Asignar</span>
                    <span className="mniSub">Servicio, cuenta, cobro</span>
                  </button>

                  <button
                    type="button"
                    className={`modalNavItem ${modalTab === "suscripciones" ? "active" : ""}`}
                    onClick={() => goTab("suscripciones")}
                    disabled={!editing}
                    title={!editing ? "Disponible al editar" : "Ver suscripciones"}
                  >
                    <span className="mniTitle">Suscripciones</span>
                    <span className="mniSub">
                      {editing ? `${susCount} asignadas` : "No disponible"}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`modalNavItem ${modalTab === "extra" ? "active" : ""}`}
                    onClick={() => goTab("extra")}
                  >
                    <span className="mniTitle">Extra</span>
                    <span className="mniSub">Dirección y notas</span>
                  </button>
                </aside>

                {/* CONTENT */}
                <div className="modalContent" ref={modalScrollRef}>
                  <div className="modalBody">
                    {/* SECCIÓN: CLIENTE */}
                    <div className="modalSection" ref={secClienteRef}>
                      <div className="sectionHead">
                        <div className="sectionTitle">Cliente</div>
                        <div className="sectionHint">Datos básicos para contacto.</div>
                      </div>

                      <div className="grid2">
                        <div className="field">
                          <div className="label">Nombre</div>
                          <input
                            className="input"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            required
                          />
                        </div>

                        <div className="field">
                          <div className="label">Teléfono</div>
                          <input
                            className="input"
                            value={telefono}
                            onChange={(e) => setTelefono(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECCIÓN: ASIGNAR */}
                    <div className="modalSection" ref={secAsignarRef}>
                      <div className="sectionHead">
                        <div className="sectionTitle">Asignar</div>
                        <div className="sectionHint">Crear una suscripción al mismo tiempo.</div>
                      </div>

                      <div className="susBlock" style={{ marginTop: 0 }}>
                        <div className="susHead">
                          <div>
                            <div className="susTitle">Asignar suscripción ahora</div>
                            <div className="susHint">
                              Define servicio, cuenta disponible, día de cobro y precio mensual.
                            </div>
                          </div>

                          <label className="switch" title={asignarSuscripcion ? "Quitar" : "Asignar"}>
                            <input
                              type="checkbox"
                              checked={asignarSuscripcion}
                              onChange={(e) => {
                                const v = e.target.checked;
                                setAsignarSuscripcion(v);
                                if (!v) resetSuscripcionForm();
                                else setPrecioTouched(false);
                              }}
                            />
                            <span className="slider" />
                          </label>
                        </div>

                        {asignarSuscripcion && (
                          <div className="susGrid">
                            <div className="field">
                              <div className="label">Servicio</div>
                              <select
                                className="input"
                                value={servicioId}
                                onChange={(e) =>
                                  setServicioId(e.target.value ? Number(e.target.value) : ("" as any))
                                }
                                required
                              >
                                <option value="">Seleccione…</option>
                                {(servicios as any[]).map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.nombre_servicio}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="field">
                              <div className="label">Cuenta (solo disponibles)</div>
                              <select
                                className="input"
                                value={cuentaId}
                                onChange={(e) =>
                                  setCuentaId(e.target.value ? Number(e.target.value) : ("" as any))
                                }
                                disabled={!servicioId || cuentasDisponibles.length === 0}
                                required
                              >
                                <option value="">
                                  {servicioId ? "Seleccione…" : "Primero elija servicio…"}
                                </option>
                                {cuentasDisponibles.map((cu: any) => (
                                  <option key={cu.id} value={cu.id}>
                                    {cu.correo} ({Number(cu.cupo_ocupado)}/{Number(cu.cupo_total)})
                                  </option>
                                ))}
                              </select>

                              {servicioId && cuentasDisponibles.length === 0 && (
                                <div className="susWarn">
                                  No hay cuentas disponibles para este servicio (todas llenas o inactivas).
                                </div>
                              )}
                            </div>

                            <div className="field">
                              <div className="label">Precio mensual (Q)</div>
                              <input
                                className="input"
                                value={precioMensual}
                                onChange={(e) => {
                                  setPrecioMensual(e.target.value);
                                  setPrecioTouched(true);
                                }}
                                placeholder="Ej: 35"
                                inputMode="decimal"
                                required
                              />
                              <div className="susMini">
                                {servicioSeleccionado ? (
                                  <>Sugerido: Q {String((servicioSeleccionado as any).venta_por_cuenta ?? "—")}</>
                                ) : (
                                  <>Seleccione un servicio para sugerencia.</>
                                )}
                              </div>
                            </div>

                            <div className="field">
                              <div className="label">Día de cobro (1..31)</div>
                              <input
                                className="input"
                                value={diaCobro}
                                onChange={(e) =>
                                  setDiaCobro(clampInt(e.target.value, 1, 31) || e.target.value)
                                }
                                inputMode="numeric"
                                required
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SECCIÓN: SUSCRIPCIONES */}
                    <div className="modalSection" ref={secSusRef}>
                      <div className="sectionHead">
                        <div className="sectionTitle">Suscripciones</div>
                        <div className="sectionHint">Lo que ya está asignado al cliente.</div>
                      </div>

                      {editing ? (
                        <div className="susBlock" style={{ marginTop: 0 }}>
                          <div className="susHead">
                            <div>
                              <div className="susTitle">Suscripciones del cliente</div>
                              <div className="susHint">
                                Lo que ya está asignado en el sistema (puede haber más de una).
                              </div>
                            </div>

                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => loadSuscripciones(editing.id)}
                              disabled={susLoading}
                              title="Recargar"
                            >
                              {susLoading ? "Cargando…" : "Recargar"}
                            </button>
                          </div>

                          {susLoading ? (
                            <div className="susWarn">Leyendo suscripciones…</div>
                          ) : susItems.length === 0 ? (
                            <div className="susWarn">Este cliente no tiene suscripciones asignadas.</div>
                          ) : (
                            <div className="tableWrap" style={{ marginTop: 10 }}>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>Servicio</th>
                                    <th>Cuenta</th>
                                    <th>Precio</th>
                                    <th>Día cobro</th>
                                    <th>Estado</th>
                                    <th style={{ width: 120 }}>Acción</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {susItems.map((s: any) => {
                                    const deleting = susDeletingId === s.id;
                                    return (
                                      <tr key={s.id}>
                                        <td>
                                          <div className="cellMain">{s.servicio}</div>
                                          <div className="cellSub">Suscripción ID: {s.id}</div>
                                        </td>
                                        <td>{s.cuenta_correo}</td>
                                        <td>{money(s.precio_mensual)}</td>
                                        <td>{s.dia_cobro}</td>
                                        <td>
                                          <span className={`statusBadge ${s.estado === "ACTIVA" ? "on" : "off"}`}>
                                            {s.estado}
                                          </span>
                                        </td>
                                        <td>
                                          <button
                                            type="button"
                                            className="btn ghost"
                                            onClick={() => openDeleteConfirm(s)}
                                            disabled={deleting}
                                            title="Eliminar suscripción"
                                          >
                                            {deleting ? "Eliminando…" : "Eliminar"}
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="susWarn" style={{ marginTop: 0 }}>
                          Cree el cliente o ábralo en edición para ver suscripciones.
                        </div>
                      )}
                    </div>

                    {/* SECCIÓN: EXTRA */}
                    <div className="modalSection" ref={secExtraRef}>
                      <div className="sectionHead">
                        <div className="sectionTitle">Extra</div>
                        <div className="sectionHint">Campos internos para control.</div>
                      </div>

                      <div className="field">
                        <div className="label">Dirección</div>
                        <input className="input" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
                      </div>

                      <div className="field">
                        <div className="label">Notas</div>
                        <textarea className="input" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modalFoot">
                <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button className="btn primary" type="submit" disabled={saving}>
                  {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal Confirmación Eliminar Suscripción ===== */}
      {confirmOpen && (
        <div className="modalBack" role="dialog" aria-modal="true">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modalHead">
              <div>
                <div className="modalTitle">Confirmar eliminación</div>
                <div className="modalSub">Esta acción no se puede deshacer.</div>
              </div>

              <button className="iconClose" type="button" onClick={closeDeleteConfirm} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="susWarn" style={{ marginTop: 0 }}>
                ¿Está seguro que desea eliminar esta suscripción?
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="cellMain">
                  Servicio: <b>{susToDelete?.servicio}</b>
                </div>
                <div className="cellSub" style={{ marginTop: 6 }}>
                  Cuenta: <b>{susToDelete?.cuenta_correo}</b>
                </div>
              </div>
            </div>

            <div className="modalFoot">
              <button className="btn ghost" type="button" onClick={closeDeleteConfirm} disabled={confirmLoading}>
                Cancelar
              </button>
              <button className="btn primary" type="button" onClick={onDeleteSuscripcionConfirmado} disabled={confirmLoading}>
                {confirmLoading ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
