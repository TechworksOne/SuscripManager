import { Router } from "express";
import { pool } from "../db";
import { auth } from "../middlewares/auth";

const router = Router();

function asInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

function toDateOnlyISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysInMonth(year: number, monthIndex0: number) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/**
 * Regla:
 * - Si hoy <= diaCobro: este mes
 * - Si hoy > diaCobro: próximo mes
 * ✅ Clamp al último día del mes (evita "31 en febrero")
 */
function calcProximoCobro(diaCobro: number, base = new Date()) {
  const year = base.getFullYear();
  const month0 = base.getMonth();
  const today = base.getDate();

  const targetMonth0 = today <= diaCobro ? month0 : month0 + 1;

  // Normalizamos year/mes si se pasa de diciembre
  const dt = new Date(year, targetMonth0, 1);
  const y = dt.getFullYear();
  const m0 = dt.getMonth();

  const dim = daysInMonth(y, m0);
  const day = Math.min(diaCobro, dim);

  return toDateOnlyISO(new Date(y, m0, day));
}

/**
 * Avanza una fecha ISO por N meses, respetando el día de cobro (clamped al último día del mes).
 */
function addMonthsToDate(isoDate: string, months: number, diaCobro: number): string {
  if (months <= 0) return isoDate;
  const base = new Date(isoDate + "T00:00:00");
  const targetMonth0 = base.getMonth() + months;
  const dt = new Date(base.getFullYear(), targetMonth0, 1);
  const y = dt.getFullYear();
  const m0 = dt.getMonth();
  const dim = daysInMonth(y, m0);
  const day = Math.min(diaCobro, dim);
  return toDateOnlyISO(new Date(y, m0, day));
}

function getUserId(req: any) {
  const id = req.user?.id;
  if (!id) throw new Error("No autorizado");
  return Number(id);
}

/**
 * (OPCIONAL) GET /api/suscripciones/clientes/:clienteId/suscripciones
 */
router.get("/clientes/:clienteId/suscripciones", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const clienteId = asInt(req.params.clienteId);

    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: "clienteId inválido" });
    }

    const [cliRows] = await pool.query(
      `SELECT id, nombre, telefono, activo
       FROM clientes
       WHERE id = ? AND usuario_id = ?
       LIMIT 1`,
      [clienteId, userId]
    );

    const cliente = (cliRows as any[])[0];
    if (!cliente) return res.status(404).json({ ok: false, error: "Cliente no encontrado" });

    const [rows] = await pool.query(
      `SELECT
          s.id,
          s.estado,
          s.estado_cobro,
          s.precio_mensual,
          s.dia_cobro,
          s.pin_perfil,
          DATE_FORMAT(s.proximo_cobro, '%Y-%m-%d') AS proximo_cobro,
          DATE_FORMAT(s.fecha_inicio,  '%Y-%m-%d') AS fecha_inicio,

          cu.id AS cuenta_id,
          cu.correo AS cuenta_correo,
          cu.cupo_total,
          cu.cupo_ocupado,
          cu.activa AS cuenta_activa,

          sv.id AS servicio_id,
          sv.nombre_servicio AS servicio
       FROM suscripciones s
       JOIN cuentas cu   ON cu.id = s.cuenta_id
       JOIN servicios sv ON sv.id = cu.servicio_id
       WHERE s.usuario_id = ? AND s.cliente_id = ?
       ORDER BY sv.nombre_servicio ASC, s.id DESC`,
      [userId, clienteId]
    );

    return res.json({ ok: true, cliente, items: rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: "DB_ERROR", detail: e?.message });
  }
});

/**
 * ✅ POST /api/suscripciones
 * Body: { clienteId, cuentaId, precioMensual, diaCobro, fechaInicio?, pin_perfil? }
 *
 * Regla de negocio (moderna):
 * - Cupo ocupado = suscripciones ACTIVA/PAUSADA con cliente ACTIVO.
 * - Si el cliente está INACTIVO, NO puede asignarse suscripción (porque “no ocupa cupo”)
 *   y no tiene sentido comercial meterlo a una cuenta.
 */
router.post("/", auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const userId = getUserId(req);

    const clienteId = asInt(req.body?.clienteId);
    const cuentaId = asInt(req.body?.cuentaId);
    const diaCobro = asInt(req.body?.diaCobro);
    const precioMensual = Number(req.body?.precioMensual);
    const fechaInicio = req.body?.fechaInicio
      ? String(req.body.fechaInicio)
      : toDateOnlyISO(new Date());

    // mesesYaPagados: cuántos meses ya abonó el cliente (avanza proximo_cobro)
    const mesesYaPagadosRaw = asInt(req.body?.mesesYaPagados ?? 0);
    const mesesYaPagados = Number.isFinite(mesesYaPagadosRaw) && mesesYaPagadosRaw > 0
      ? Math.min(mesesYaPagadosRaw, 120)
      : 0;

    // acceso_id: opcional — asigna el acceso al crearse la suscripción
    const accesoIdRaw = req.body?.acceso_id != null ? asInt(req.body.acceso_id) : null;
    const accesoId = accesoIdRaw && Number.isFinite(accesoIdRaw) && accesoIdRaw > 0 ? accesoIdRaw : null;

    // pin_perfil: opcional, 4-6 dígitos
    const pinPerfilRaw = req.body?.pin_perfil != null ? String(req.body.pin_perfil).trim() : null;
    if (pinPerfilRaw !== null && pinPerfilRaw !== "") {
      if (!/^\d{4,6}$/.test(pinPerfilRaw)) {
        return res.status(400).json({ ok: false, error: "pin_perfil inválido (solo números, 4 a 6 dígitos)" });
      }
    }
    const pinPerfil = pinPerfilRaw === "" ? null : pinPerfilRaw;

    if (
      !Number.isFinite(clienteId) ||
      clienteId <= 0 ||
      !Number.isFinite(cuentaId) ||
      cuentaId <= 0
    ) {
      return res.status(400).json({ ok: false, error: "clienteId/cuentaId inválido" });
    }
    if (!Number.isFinite(diaCobro) || diaCobro < 1 || diaCobro > 31) {
      return res.status(400).json({ ok: false, error: "diaCobro inválido (1..31)" });
    }
    if (!Number.isFinite(precioMensual) || precioMensual <= 0) {
      return res.status(400).json({ ok: false, error: "precioMensual inválido" });
    }

    await conn.beginTransaction();

    // 1) Cliente pertenece al usuario Y debe estar ACTIVO
    const [cliRows] = await conn.query(
      `SELECT id, activo
       FROM clientes
       WHERE id = ? AND usuario_id = ?
       LIMIT 1
       FOR UPDATE`,
      [clienteId, userId]
    );

    const cli = (cliRows as any[])[0];
    if (!cli) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Cliente no encontrado" });
    }
    if (Number(cli.activo) !== 1) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        error: "CLIENTE_INACTIVO",
        message: "El cliente está desactivado. No se puede asignar suscripción.",
      });
    }

    // 2) Bloqueo de cuenta para evitar carreras ✅
    const [ctaRows] = await conn.query(
      `SELECT id, activa, cupo_total
       FROM cuentas
       WHERE id = ? AND usuario_id = ?
       FOR UPDATE`,
      [cuentaId, userId]
    );

    const cta = (ctaRows as any[])[0];
    if (!cta) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Cuenta no encontrada" });
    }
    if (Number(cta.activa) !== 1) {
      await conn.rollback();
      return res.status(400).json({ ok: false, error: "Cuenta inactiva" });
    }

    // 3) ✅ Ocupado REAL (solo clientes activos)
    const [occRows] = await conn.query(
      `SELECT COUNT(*) AS ocupado
       FROM suscripciones s
       INNER JOIN clientes cl ON cl.id = s.cliente_id AND cl.activo = 1
       WHERE s.usuario_id = ? AND s.cuenta_id = ?
         AND s.estado IN ('ACTIVA', 'PAUSADA')`,
      [userId, cuentaId]
    );

    const ocupadoReal = Number((occRows as any[])[0]?.ocupado ?? 0);
    const total = Number(cta.cupo_total ?? 0);

    if (ocupadoReal >= total) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        error: "CUENTA_LLENA",
        message: "Cuenta sin cupo disponible",
      });
    }

    const proximoCobroBase = calcProximoCobro(diaCobro, new Date());
    const proximoCobro = mesesYaPagados > 0
      ? addMonthsToDate(proximoCobroBase, mesesYaPagados, diaCobro)
      : proximoCobroBase;

    // 4) Crear suscripción
    const [ins] = await conn.query(
      `INSERT INTO suscripciones
       (usuario_id, cliente_id, cuenta_id, fecha_inicio, precio_mensual, dia_cobro, estado, proximo_cobro, estado_cobro, pin_perfil)
       VALUES
       (?, ?, ?, ?, ?, ?, 'ACTIVA', ?, 'AL_DIA', ?)`,
      [userId, clienteId, cuentaId, fechaInicio, precioMensual, diaCobro, proximoCobro, pinPerfil]
    );

    const suscripcionId = (ins as any).insertId;

    // 4b) Si se proporcionó acceso_id, vincular atómicamente
    if (accesoId !== null) {
      const [acRows] = await conn.query(
        `SELECT id, cuenta_id, estado
         FROM cuenta_accesos
         WHERE id = ? AND cuenta_id = ?
         LIMIT 1
         FOR UPDATE`,
        [accesoId, cuentaId]
      );
      const ac = (acRows as any[])[0];
      if (!ac) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: "Acceso no encontrado para esta cuenta" });
      }
      if (ac.estado !== "DISPONIBLE") {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: "El acceso seleccionado ya está ocupado" });
      }
      await conn.query(
        `UPDATE suscripciones SET acceso_id = ? WHERE id = ?`,
        [accesoId, suscripcionId]
      );
      await conn.query(
        `UPDATE cuenta_accesos SET estado = 'OCUPADO', suscripcion_id = ? WHERE id = ?`,
        [suscripcionId, accesoId]
      );
    }

    // 5) ✅ Sincronizar cache de cupo_ocupado (ocupadoReal + 1)
    await conn.query(
      `UPDATE cuentas
       SET cupo_ocupado = ?
       WHERE id = ? AND usuario_id = ?`,
      [ocupadoReal + 1, cuentaId, userId]
    );

    await conn.commit();

    return res.status(201).json({
      ok: true,
      suscripcionId,
      proximoCobro,
    });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    return res.status(500).json({
      ok: false,
      error: "ERROR_CREANDO_SUSCRIPCION",
      detail: e?.message,
    });
  } finally {
    conn.release();
  }
});

/**
 * ✅ DELETE /api/suscripciones/:id
 * - Borra la suscripción
 * - Recalcula cupo real (solo clientes activos) y sincroniza cuentas.cupo_ocupado
 */
router.delete("/:id", auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const userId = getUserId(req);
    const id = asInt(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, cuenta_id
       FROM suscripciones
       WHERE id = ? AND usuario_id = ?
       LIMIT 1
       FOR UPDATE`,
      [id, userId]
    );

    const s = (rows as any[])[0];
    if (!s) {
      await conn.rollback();
      return res.status(404).json({ message: "Suscripción no encontrada" });
    }

    const cuentaId = Number(s.cuenta_id);

    await conn.query(`DELETE FROM suscripciones WHERE id = ? AND usuario_id = ?`, [id, userId]);

    // ✅ Recalcular cupo real (solo clientes activos)
    const [occRows] = await conn.query(
      `SELECT COUNT(*) AS ocupado
       FROM suscripciones s
       INNER JOIN clientes cl ON cl.id = s.cliente_id AND cl.activo = 1
       WHERE s.usuario_id = ? AND s.cuenta_id = ?
         AND s.estado IN ('ACTIVA', 'PAUSADA')`,
      [userId, cuentaId]
    );

    const ocupadoReal = Number((occRows as any[])[0]?.ocupado ?? 0);

    await conn.query(
      `UPDATE cuentas
       SET cupo_ocupado = ?
       WHERE id = ? AND usuario_id = ?`,
      [ocupadoReal, cuentaId, userId]
    );

    await conn.commit();
    return res.json({ ok: true });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    return res.status(500).json({ message: "ERROR_ELIMINANDO_SUSCRIPCION", detail: e?.message });
  } finally {
    conn.release();
  }
});

/**
 * PATCH /api/suscripciones/:id/pin
 * Body: { pin_perfil?: string }
 * Actualiza el PIN de perfil de una suscripción.
 */
router.patch("/:id/pin", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = asInt(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }

    const pinPerfilRaw = req.body?.pin_perfil != null ? String(req.body.pin_perfil).trim() : null;
    if (pinPerfilRaw !== null && pinPerfilRaw !== "") {
      if (!/^\d{4,6}$/.test(pinPerfilRaw)) {
        return res.status(400).json({ ok: false, error: "pin_perfil inválido (solo números, 4 a 6 dígitos)" });
      }
    }
    const pinPerfil = pinPerfilRaw === "" ? null : pinPerfilRaw;

    const [rows] = await pool.query(
      `SELECT id FROM suscripciones WHERE id = ? AND usuario_id = ? LIMIT 1`,
      [id, userId]
    );
    if (!(rows as any[])[0]) {
      return res.status(404).json({ ok: false, error: "Suscripción no encontrada" });
    }

    await pool.query(
      `UPDATE suscripciones SET pin_perfil = ? WHERE id = ? AND usuario_id = ?`,
      [pinPerfil, id, userId]
    );

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: "ERROR_ACTUALIZANDO_PIN", detail: e?.message });
  }
});

export default router;
