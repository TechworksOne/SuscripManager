import { apiFetch } from "./http";

export type Cliente = {
  id: number;
  nombre: string;
  telefono?: string | null;
  direccion?: string | null;
  notas?: string | null;
  activo?: number; // 1 o 0
};

export type ResumenClientes = {
  totalClientes: number;
  mrr: number;
};

export type SuscripcionCliente = {
  id: number;
  cuenta_id: number;
  cuenta_correo: string;
  servicio: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  precio_mensual: number;
  dia_cobro: number;
  estado: "ACTIVA" | "PAUSADA" | "CANCELADA" | "VENCIDA";
  pin_perfil?: string | null;
};

export const getClientes = (activo: "all" | "1" | "0" = "all") =>
  apiFetch<{ items: Cliente[] }>(`/clientes?activo=${activo}`);

export const getResumenClientes = () =>
  apiFetch<ResumenClientes>("/clientes/resumen", { method: "GET" });

// ✅ IMPORTANTE: su backend de suscripciones está bajo /api
export const getSuscripcionesCliente = (clienteId: number) =>
  apiFetch<{ items: SuscripcionCliente[] }>(`/api/clientes/${clienteId}/suscripciones`, { method: "GET" });

export const crearCliente = (payload: {
  nombre: string;
  telefono?: string | null;
  direccion?: string | null;
  notas?: string | null;
}) =>
  apiFetch<{ id: number }>("/clientes", { method: "POST", body: JSON.stringify(payload) });

export const actualizarCliente = (
  id: number,
  payload: { nombre: string; telefono?: string | null; direccion?: string | null; notas?: string | null }
) =>
  apiFetch<{ ok: true }>(`/clientes/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const toggleClienteActivo = (id: number, activo: boolean) =>
  apiFetch<{ ok: true; activo: number }>(`/clientes/${id}/activo`, {
    method: "PATCH",
    body: JSON.stringify({ activo }),
  });
