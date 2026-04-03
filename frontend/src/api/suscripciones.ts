import { apiFetch } from "./http";

export type CrearSuscripcionPayload = {
  clienteId: number;
  cuentaId: number;
  precioMensual: number;
  diaCobro: number;
};

export async function crearSuscripcion(payload: CrearSuscripcionPayload) {
  // backend: POST /api/suscripciones
  return apiFetch<{ ok: true; suscripcionId: number; proximoCobro: string }>(`/suscripciones`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function eliminarSuscripcion(suscripcionId: number) {
  // backend: DELETE /api/suscripciones/:id
  return apiFetch<{ ok: true }>(`/suscripciones/${suscripcionId}`, {
    method: "DELETE",
  });
}
