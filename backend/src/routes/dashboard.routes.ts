import { Router } from "express";
import { auth } from "../middlewares/auth";

import { db } from "../config/db";

const router = Router();

/**
 * Helpers de fechas en formato YYYY-MM-DD (local)
 */
function toISODateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfMonthLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * GET /dashboard/summary
 * Multi-admin: todo se filtra por req.user.id
 */
router.get("/summary", auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const now = new Date();
    const today = toISODateLocal(now);
    const monthStart = toISODateLocal(startOfMonthLocal(now));

    // Ventana "vencen pronto": próximos 7 días
    const next7 = new Date(now);
    next7.setDate(next7.getDate() + 7);
    const next7ISO = toISODateLocal(next7);

    // 1) Cobros hoy y cobros mes
    const [rowsCobrosHoy] = await db.query<any[]>(
      `
      SELECT
        COALESCE(SUM(monto), 0) AS total_hoy,
        COUNT(*) AS count_hoy
      FROM cobros
      WHERE usuario_id = ?
        AND DATE(fecha) = ?
      `,
      [userId, today]
    );

    const [rowsCobrosMes] = await db.query<any[]>(
      `
      SELECT
        COALESCE(SUM(monto), 0) AS total_mes,
        COUNT(*) AS count_mes
      FROM cobros
      WHERE usuario_id = ?
        AND DATE(fecha) >= ?
        AND DATE(fecha) <= ?
      `,
      [userId, monthStart, today]
    );

    // 2) Pendientes: suscripciones ACTIVA con proximo_cobro <= hoy
    const [rowsPendientes] = await db.query<any[]>(
      `
      SELECT
        COUNT(*) AS pendientes_count,
        COALESCE(SUM(precio_mensual), 0) AS estimado_cobrar
      FROM suscripciones
      WHERE usuario_id = ?
        AND estado = 'ACTIVA'
        AND proximo_cobro IS NOT NULL
        AND DATE(proximo_cobro) <= ?
      `,
      [userId, today]
    );

    // 3) Vencen pronto (próximos 7 días)
    const [rowsVencen] = await db.query<any[]>(
      `
      SELECT
        s.id,
        DATE_FORMAT(s.proximo_cobro, '%Y-%m-%d') AS proximo_cobro,
        s.precio_mensual,
        COALESCE(cl.nombre, '') AS cliente_nombre,
        COALESCE(sv.nombre_servicio, '') AS servicio,
        COALESCE(cu.correo, '') AS cuenta_correo
      FROM suscripciones s
      JOIN clientes cl ON cl.id = s.cliente_id AND cl.activo = 1
      JOIN cuentas cu ON cu.id = s.cuenta_id
      JOIN servicios sv ON sv.id = cu.servicio_id
      WHERE s.usuario_id = ?
        AND s.estado = 'ACTIVA'
        AND s.proximo_cobro IS NOT NULL
        AND DATE(s.proximo_cobro) >= ?
        AND DATE(s.proximo_cobro) <= ?
      ORDER BY s.proximo_cobro ASC
      LIMIT 12
      `,
      [userId, today, next7ISO]
    );

    // 4) Contadores base
    const [rowsCounts] = await db.query<any[]>(
      `
      SELECT
        (SELECT COUNT(*) FROM clientes WHERE usuario_id = ?) AS clientes_count,
        (SELECT COUNT(*) FROM servicios WHERE usuario_id = ?) AS servicios_count,
        (SELECT COUNT(*) FROM cuentas WHERE usuario_id = ?) AS cuentas_count,
        (SELECT COUNT(*) FROM cuentas WHERE usuario_id = ? AND activa = 1) AS cuentas_activas
      `,
      [userId, userId, userId, userId]
    );

    const cobrosHoy = rowsCobrosHoy?.[0] ?? { total_hoy: 0, count_hoy: 0 };
    const cobrosMes = rowsCobrosMes?.[0] ?? { total_mes: 0, count_mes: 0 };
    const pendientes = rowsPendientes?.[0] ?? { pendientes_count: 0, estimado_cobrar: 0 };
    const counts = rowsCounts?.[0] ?? {
      clientes_count: 0,
      servicios_count: 0,
      cuentas_count: 0,
      cuentas_activas: 0,
    };

    return res.json({
      range: { today, monthStart },
      kpis: {
        cobrado_hoy: Number(cobrosHoy.total_hoy ?? 0),
        cobros_hoy: Number(cobrosHoy.count_hoy ?? 0),
        cobrado_mes: Number(cobrosMes.total_mes ?? 0),
        cobros_mes: Number(cobrosMes.count_mes ?? 0),

        pendientes: Number(pendientes.pendientes_count ?? 0),
        estimado_cobrar: Number(pendientes.estimado_cobrar ?? 0),

        clientes: Number(counts.clientes_count ?? 0),
        servicios: Number(counts.servicios_count ?? 0),
        cuentas: Number(counts.cuentas_count ?? 0),
        cuentas_activas: Number(counts.cuentas_activas ?? 0),
      },
      vencen_pronto: rowsVencen ?? [],
    });
  } catch (err) {
    console.error("dashboard/summary error:", err);
    return res.status(500).json({ message: "Error interno al cargar dashboard" });
  }
});

export default router;
