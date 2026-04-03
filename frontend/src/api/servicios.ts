import { apiFetch } from "./http";

export type ActivoFilter = "1" | "0" | "all";

/**
 * Servicio (tolerante a backend viejo/nuevo)
 * - activa (nuevo) / activo (viejo)
 * - precio_base (nuevo) / costo_servicio (viejo)
 * - venta_por_cuenta (opcional si usted lo tiene en DB)
 */
export interface Servicio {
  id: number;
  usuario_id: number;

  nombre_servicio: string;

  // NUEVO
  precio_base?: number;
  activa?: 0 | 1;

  // LEGACY (para no romper ServiciosPage.tsx)
  costo_servicio?: number;
  venta_por_cuenta?: number;
  activo?: 0 | 1;

  created_at?: string;
  updated_at?: string;
}

export interface ServiciosResponse {
  items: Servicio[];
}

export interface CrearServicioPayload {
  nombre_servicio: string;
  // aceptamos ambas llaves para compatibilidad
  precio_base?: number;
  costo_servicio?: number;
  venta_por_cuenta?: number;
}

export interface ActualizarServicioPayload extends CrearServicioPayload {}

/** Helpers: normaliza a formato nuevo (activa + precio_base) */
export function normalizeServicio(s: Servicio): Servicio {
  const activa = (s.activa ?? s.activo ?? 1) as 0 | 1;
  const precio_base =
    Number.isFinite(Number(s.precio_base))
      ? Number(s.precio_base)
      : Number.isFinite(Number(s.costo_servicio))
      ? Number(s.costo_servicio)
      : 0;

  return {
    ...s,
    activa,
    precio_base,
  };
}

/**
 * GET /servicios?activo=1|0|all
 */
export async function getServicios(activo: ActivoFilter = "1"): Promise<ServiciosResponse> {
  // IMPORTANTE: su backend interpreta ?activo=all
  const qs = `?activo=${activo}`;
  const data = await apiFetch<ServiciosResponse>(`/servicios${qs}`);
  return { items: (data.items || []).map(normalizeServicio) };
}

/**
 * POST /servicios
 * Su backend espera: { nombre_servicio, costo_servicio, venta_por_cuenta }
 * (aunque usted quiera "precio_base", aquí lo mapeamos para que funcione)
 */
export async function crearServicio(payload: CrearServicioPayload): Promise<any> {
  const costo = payload.costo_servicio ?? payload.precio_base ?? 0;

  return apiFetch(`/servicios`, {
    method: "POST",
    body: JSON.stringify({
      nombre_servicio: payload.nombre_servicio,
      costo_servicio: Number(costo ?? 0),
      venta_por_cuenta: Number(payload.venta_por_cuenta ?? 0),
    }),
  });
}

/**
 * PUT /servicios/:id
 * Su backend espera: { nombre_servicio, costo_servicio, venta_por_cuenta }
 */
export async function actualizarServicio(id: number, payload: ActualizarServicioPayload): Promise<any> {
  const costo = payload.costo_servicio ?? payload.precio_base ?? 0;

  return apiFetch(`/servicios/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      nombre_servicio: payload.nombre_servicio,
      costo_servicio: Number(costo ?? 0),
      venta_por_cuenta: Number(payload.venta_por_cuenta ?? 0),
    }),
  });
}

/**
 * PATCH /servicios/:id/activo
 * ✅ Esta es la ruta REAL de su backend
 * body: { activo: true|false|1|0 }
 */
export async function toggleServicioActivo(id: number, activa: boolean): Promise<any> {
  return apiFetch(`/servicios/${id}/activo`, {
    method: "PATCH",
    body: JSON.stringify({ activo: activa ? 1 : 0 }),
  });
}
