import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/http";
import type { Servicio } from "../api/servicios";
import { getServicios } from "../api/servicios";
import "../styles/historial-cobros.css";

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

function money(n: unknown) {
  const v = Number(n ?? 0);
  return v.toLocaleString("es-GT", { style: "currency", currency: "GTQ" });
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function errMsg(e: unknown) {
  if (typeof e === "object" && e && "message" in e) return String((e as any).message);
  return "Error inesperado";
}

type ServiciosResp = { items: Servicio[] } | Servicio[];

export default function HistorialCobrosPage() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [{ id, type, message }, ...prev].slice(0, 4));
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2400);
  };

  const [servicios, setServicios] = useState<Servicio[]>([]);

  const [hLoading, setHLoading] = useState(false);
  const [historial, setHistorial] = useState<CobroItem[]>([]);
  const [hFrom, setHFrom] = useState<string>(todayISO());
  const [hTo, setHTo] = useState<string>(todayISO());
  const [hQ, setHQ] = useState<string>("");
  const [hServicioId, setHServicioId] = useState<number | "">("");

  useEffect(() => {
    (async () => {
      try {
        const s = (await getServicios("1")) as ServiciosResp;
        const list = Array.isArray(s) ? s : s.items;
        setServicios(list || []);
      } catch {
        // silencioso
      }
    })();
  }, []);

  async function loadHistorial() {
    setHLoading(true);
    try {
      const params = new URLSearchParams();
      if (hFrom) params.set("from", hFrom);
      if (hTo) params.set("to", hTo);
      if (hQ.trim()) params.set("q", hQ.trim());
      if (hServicioId !== "") params.set("servicioId", String(hServicioId));

      const res = await apiFetch<{ items: CobroItem[] }>(`/cobros?${params.toString()}`, {
        method: "GET",
      });

      setHistorial(res.items || []);
    } catch (e: unknown) {
      setHistorial([]);
      pushToast("info", errMsg(e) || "No se pudo cargar historial");
    } finally {
      setHLoading(false);
    }
  }

  const tRef = useRef<number | null>(null);
  useEffect(() => {
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => loadHistorial(), 350);

    return () => {
      if (tRef.current) window.clearTimeout(tRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hFrom, hTo, hQ, hServicioId]);

  return (
    <div className="page-shell historialCobrosPage">
      <div className="toastStack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      <div className="pageHead">
        <div>
          <h1 className="pageTitle">Historial de Cobros</h1>
          <p className="pageSub">
            Auditoría por rango, servicio o búsqueda (cliente / correo / servicio).
          </p>
        </div>
      </div>

      <div className="tools">
        <input
          className="input"
          type="date"
          value={hFrom}
          onChange={(e) => setHFrom(e.target.value)}
        />
        <input className="input" type="date" value={hTo} onChange={(e) => setHTo(e.target.value)} />

        <select
          className="input"
          value={hServicioId}
          onChange={(e) => setHServicioId(e.target.value ? Number(e.target.value) : "")}
          title="Servicio"
        >
          <option value="">Servicio: Todos</option>
          {servicios.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.nombre_servicio}
            </option>
          ))}
        </select>

        <input
          className="input"
          value={hQ}
          onChange={(e) => setHQ(e.target.value)}
          placeholder="Cliente / correo / servicio…"
        />

        <button className="btn ghost" onClick={loadHistorial} disabled={hLoading}>
          {hLoading ? "Cargando…" : "Recargar"}
        </button>
      </div>

      <div className="tableWrap">
        {hLoading ? (
          <div className="empty">
            <div className="emptyTitle">Cargando…</div>
            <div className="emptySub">Leyendo historial.</div>
          </div>
        ) : historial.length === 0 ? (
          <div className="empty">
            <div className="emptyTitle">Sin registros</div>
            <div className="emptySub">No hay cobros en el rango seleccionado.</div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Cuenta</th>
                <th>Meses</th>
                <th>Monto</th>
                <th>Método</th>
                <th>Boleta</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((x) => (
                <tr key={x.id}>
                  <td>{x.fecha}</td>
                  <td>{x.cliente_nombre}</td>
                  <td>{x.servicio}</td>
                  <td>{x.cuenta_correo}</td>
                  <td>{x.meses_pagados}</td>
                  <td>{money(x.monto)}</td>
                  <td>
                    <span className="badge">{x.metodo}</span>
                  </td>
                  <td>{x.boleta || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
