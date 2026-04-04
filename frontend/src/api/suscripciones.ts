import { apiFetch } from "./http";

export type CrearSuscripcionPayload = {
  clienteId: number;
  cuentaId: number;
  precioMensual: number;
  diaCobro: number;
  fechaInicio?: string;
  mesesYaPagados?: number;
  pin_perfil?: string | null;
};

export async function crearSuscripcion(payload: CrearSuscripcionPayload) {
  // backend: POST /api/suscripciones
  return apiFetch<{ ok: true; suscripcionId: number; proximoCobro: string }>(`/suscripciones`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function actualizarPinSuscripcion(suscripcionId: number, pin_perfil: string | null) {
  // backend: PATCH /api/suscripciones/:id/pin
  return apiFetch<{ ok: true }>(`/suscripciones/${suscripcionId}/pin`, {
    method: "PATCH",
    body: JSON.stringify({ pin_perfil }),
  });
}

export async function eliminarSuscripcion(suscripcionId: number) {
  // backend: DELETE /api/suscripciones/:id
  return apiFetch<{ ok: true }>(`/suscripciones/${suscripcionId}`, {
    method: "DELETE",
  });
}
