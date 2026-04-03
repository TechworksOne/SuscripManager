import React, { useEffect, useMemo, useState } from "react";
import type { Servicio } from "../api/servicios";
import {
  actualizarServicio,
  crearServicio,
  getServicios,
  toggleServicioActivo,
} from "../api/servicios";

import "../styles/servicios.css";

type ToastType = "success" | "error" | "info";
type Toast = { id: string; type: ToastType; message: string };

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

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

  // toasts (overlay)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 2400);
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

  const totalActivosVista = useMemo(
    () => items.filter((s) => Number(s.activo ?? 1) === 1).length,
    [items]
  );
  const totalInactivosVista = useMemo(
    () => items.filter((s) => Number(s.activo ?? 1) === 0).length,
    [items]
  );

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
        // ✅ Solo nombre. Si su backend exige costo/venta, quedan en 0.
        await crearServicio({
          nombre_servicio: nombreTrim,
          costo_servicio: 0,
          venta_por_cuenta: 0,
        } as any);

        pushToast("success", "Servicio creado");
      } else {
        // ✅ Solo actualiza nombre. (No tocamos costo/venta)
        await actualizarServicio(editing.id, {
          nombre_servicio: nombreTrim,
        } as any);

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

    // optimistic
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

  return (
    <div className="page-shell serviciosPage">
      {/* Toasts */}
      <div className="toastStack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      <div className="pageHead">
        <div>
          <h1 className="pageTitle">Servicios</h1>
        </div>

        <button className="btn primary" onClick={openCreate}>
          + Nuevo servicio
        </button>
      </div>

      {/* KPI único */}
      <div className="kpiRow kpiRow--single">
        <div className="kpi">
          <div className="kpi-label">Servicios (según filtro)</div>
          <div className="kpi-value">{filtered.length}</div>
          <div className="kpi-foot">
            <span className="badge ok">Activos: {totalActivosVista}</span>
            <span className="badge muted">Inactivos: {totalInactivosVista}</span>
          </div>
        </div>
      </div>

      {/* Tools */}
      <div className="clientes-tools">
        <select
          className="input"
          value={activoFilter}
          onChange={(e) => setActivoFilter(e.target.value as any)}
        >
          <option value="1">Activos</option>
          <option value="0">Inactivos</option>
          <option value="all">Todos</option>
        </select>

        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar servicio por nombre…"
        />
      </div>

      {/* Table */}
      <div className="tableWrap">
        {loading ? (
          <div className="empty">
            <div className="emptyTitle">Cargando…</div>
            <div className="emptySub">Leyendo catálogo desde el backend.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="emptyTitle">No hay servicios</div>
            <div className="emptySub">
              Cambie el filtro o cree el primer servicio (Netflix, Disney, etc.).
            </div>
            <button className="btn primary" onClick={openCreate}>
              Crear servicio
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Estado</th>
                <th style={{ width: 220 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const isActive = Number(s.activo ?? 1) === 1;
                const isToggling = togglingId === s.id;

                return (
                  <tr key={s.id}>
                    <td>
                      <div className="cellMain">{s.nombre_servicio}</div>
                      <div className="cellSub">ID: {s.id}</div>
                    </td>

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
                            onChange={() => onToggleActivo(s)}
                          />
                          <span className="slider" />
                        </label>

                        <button
                          className="btn ghost"
                          onClick={() => openEdit(s)}
                          disabled={isToggling}
                        >
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

      {/* Modal */}
      {open && (
        <div className="modalBack" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modalHead">
              <div>
                <div className="modalTitle">{editing ? "Editar servicio" : "Nuevo servicio"}</div>
                <div className="modalSub">Defina únicamente el nombre del servicio.</div>
              </div>
              <button
                className="iconClose"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <form onSubmit={onSubmit}>
              <div className="modalBody">
                <div className="field">
                  <div className="label">Nombre</div>
                  <input
                    className="input"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Netflix, Disney+, Spotify…"
                    required
                  />
                </div>
              </div>

              <div className="modalFoot">
                <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button className="btn primary" type="submit" disabled={saving}>
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
