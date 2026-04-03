import cron from "node-cron";
import { pool } from "../db";
import { sendDailyReport, type PendingRow } from "./email.service";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Para cada usuario admin activo en el sistema:
 * 1. Obtiene sus suscripciones ACTIVA pendientes de cobro
 * 2. Envía un email con el resumen al correo del admin
 */
async function runDailyReport() {
  console.log(`[cron] Iniciando reporte diario (${new Date().toISOString()})`);

  try {
    // 1) Obtener todos los usuarios (admins)
    const [usuarios]: any = await pool.query(
      "SELECT id, nombre, email FROM usuarios ORDER BY id ASC"
    );

    if (!usuarios || usuarios.length === 0) {
      console.log("[cron] Sin usuarios registrados — nada que enviar");
      return;
    }

    for (const usuario of usuarios) {
      try {
        // 2) Pendientes de cobro de este usuario
        const [rows]: any = await pool.query(
          `
          SELECT
            cl.nombre                                   AS cliente_nombre,
            sv.nombre_servicio                          AS servicio,
            cu.correo                                   AS cuenta_correo,
            s.precio_mensual,
            DATEDIFF(CURDATE(), COALESCE(s.proximo_cobro, CURDATE())) AS atraso_dias,
            DATE_FORMAT(s.proximo_cobro, '%Y-%m-%d')    AS proximo_cobro
          FROM suscripciones s
          JOIN clientes cl
            ON cl.id = s.cliente_id
           AND cl.usuario_id = s.usuario_id
           AND cl.activo = 1
          JOIN cuentas cu
            ON cu.id = s.cuenta_id
           AND cu.usuario_id = s.usuario_id
           AND cu.activa = 1
          JOIN servicios sv
            ON sv.id = cu.servicio_id
           AND sv.usuario_id = s.usuario_id
           AND sv.activo = 1
          WHERE s.usuario_id = ?
            AND s.estado = 'ACTIVA'
            AND s.proximo_cobro <= CURDATE()
          ORDER BY
            DATEDIFF(CURDATE(), COALESCE(s.proximo_cobro, CURDATE())) DESC,
            cl.nombre ASC
          `,
          [usuario.id]
        );

        const pendientes: PendingRow[] = rows ?? [];

        await sendDailyReport(
          usuario.nombre,
          usuario.email,
          todayISO(),
          pendientes
        );
      } catch (err: any) {
        console.error(
          `[cron] Error enviando correo a ${usuario.email}: ${err?.message}`
        );
      }
    }

    console.log(`[cron] Reporte diario completado para ${usuarios.length} usuario(s)`);
  } catch (err: any) {
    console.error(`[cron] Error general en reporte diario: ${err?.message}`);
  }
}

export function startDailyCron() {
  // Default: 0 14 * * * = 14:00 UTC = 8:00 AM Guatemala (UTC-6)
  const expr = process.env.DAILY_REPORT_CRON || "0 14 * * *";

  if (!cron.validate(expr)) {
    console.error(`[cron] Expresión DAILY_REPORT_CRON inválida: "${expr}" — cron no iniciado`);
    return;
  }

  cron.schedule(expr, runDailyReport, { timezone: "UTC" });
  console.log(`[cron] Reporte diario programado: "${expr}" (UTC) → ${resolveLocalTime(expr)}`);
}

/** Solo para el log de inicio — muestra la hora GT equivalente */
function resolveLocalTime(expr: string): string {
  const parts = expr.split(" ");
  const hour = Number(parts[1]);
  if (!Number.isNaN(hour)) {
    return `${pad2((hour - 6 + 24) % 24)}:00 Guatemala`;
  }
  return "hora desconocida";
}

/** Función de prueba manual — útil para verificar sin esperar al cron */
export async function triggerDailyReportNow() {
  return runDailyReport();
}
