import { apiFetch } from "./http";

export type ActivoFilter = "1" | "0" | "all";

export interface Cuenta {
  id: number;
  servicio_id: number;
  nombre_servicio: string;

  correo: string;
  password_correo: string;
  password_app: string | null;

  cupo_total: number;
  cupo_ocupado: number;

  activa: 0 | 1;
  notas: string | null;

  // Pago
  tarjeta_nombre: string | null;
  tarjeta_last4: string | null; // string para preservar ceros
  dia_pago: number | null;      // 1-31
  proximo_pago: string | null;  // "YYYY-MM-DD" (ya sin ISO Z)

  created_at: string;
  updated_at: string;
}

export interface CuentasResponse {
  items: Cuenta[];
}

export interface CrearCuentaPayload {
  servicio_id: number;
  correo: string;
  password_correo: string;
  password_app?: string | null;
  cupo_total: number;
  notas?: string | null;

  tarjeta_nombre?: string | null;
  tarjeta_last4?: string | null;
  dia_pago?: number | null;
}

export type ActualizarCuentaPayload = CrearCuentaPayload;

export async function getCuentas(activo: ActivoFilter = "1"): Promise<CuentasResponse> {
  const qs = activo === "all" ? "" : `?activo=${activo}`;
  return apiFetch<CuentasResponse>(`/cuentas${qs}`);
}

export async function crearCuenta(payload: CrearCuentaPayload): Promise<{ ok: true; id: number }> {
  return apiFetch<{ ok: true; id: number }>("/cuentas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function actualizarCuenta(id: number, payload: ActualizarCuentaPayload): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/cuentas/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function toggleCuentaActiva(id: number, activa: boolean): Promise<{ ok: true; activa: 0 | 1 }> {
  return apiFetch<{ ok: true; activa: 0 | 1 }>(`/cuentas/${id}/activa`, {
    method: "PATCH",
    body: JSON.stringify({ activa }),
  });
}

// ✅ Marca pagado SOLO si está vencida (backend valida también)
export async function marcarPagado(id: number): Promise<{ ok: true; proximo_pago: string }> {
  return apiFetch<{ ok: true; proximo_pago: string }>(`/cuentas/${id}/pagado`, {
    method: "POST",
  });
}
