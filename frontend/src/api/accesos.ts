import { apiFetch } from "./http";

// ── Types ─────────────────────────────────────────────────

export type AccesoEstado = "DISPONIBLE" | "OCUPADO";
export type AccesoTipo   = "perfil" | "cuenta" | "acceso" | "pin";

export interface CuentaAcceso {
  id:               number;
  cuenta_id:        number;
  suscripcion_id:   number | null;
  nombre_acceso:    string | null;
  correo_acceso:    string | null;
  password_acceso:  string | null;
  pin_acceso:       string | null;
  tipo_acceso:      AccesoTipo;
  estado:           AccesoEstado;
  created_at:       string;
  updated_at:       string;

  // joined desde suscripciones + clientes
  cliente_id:       number | null;
  cliente_nombre:   string | null;
  cliente_telefono: string | null;
  precio_mensual:   number | null;
  suscripcion_estado: string | null;
  proximo_cobro:    string | null;
}

export interface CrearAccesoPayload {
  nombre_acceso?:    string | null;
  correo_acceso?:    string | null;
  password_acceso?:  string | null;
  pin_acceso?:       string | null;
  tipo_acceso?:      AccesoTipo;
}

export type ActualizarAccesoPayload = CrearAccesoPayload;

// ── API calls ─────────────────────────────────────────────

export async function getAccesosByCuenta(
  cuentaId: number
): Promise<{ ok: true; items: CuentaAcceso[] }> {
  return apiFetch(`/cuentas/${cuentaId}/accesos`);
}

export async function crearAcceso(
  cuentaId: number,
  payload: CrearAccesoPayload
): Promise<{ ok: true; id: number }> {
  return apiFetch(`/cuentas/${cuentaId}/accesos`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function actualizarAcceso(
  accesoId: number,
  payload: ActualizarAccesoPayload
): Promise<{ ok: true }> {
  return apiFetch(`/accesos/${accesoId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function eliminarAcceso(
  accesoId: number
): Promise<{ ok: true }> {
  return apiFetch(`/accesos/${accesoId}`, { method: "DELETE" });
}

export async function asignarAccesoASuscripcion(
  suscripcionId: number,
  accesoId: number
): Promise<{ ok: true }> {
  return apiFetch(`/suscripciones/${suscripcionId}/asignar-acceso`, {
    method: "PUT",
    body: JSON.stringify({ acceso_id: accesoId }),
  });
}

export async function desasignarAccesoSuscripcion(
  suscripcionId: number
): Promise<{ ok: true }> {
  return apiFetch(`/suscripciones/${suscripcionId}/desasignar-acceso`, {
    method: "PUT",
  });
}
