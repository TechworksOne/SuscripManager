import { Router } from "express";
import { pool } from "../db";
import { auth } from "../middlewares/auth";

const router = Router();

function asInt(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

function getUserId(req: any): number {
  const id = req.user?.id;
  if (!id) throw new Error("No autorizado");
  return Number(id);
}

// ── helpers de validación ─────────────────────────────────

const VALID_TIPO   = ["perfil", "cuenta", "acceso", "pin"] as const;
const VALID_ESTADO = ["DISPONIBLE", "OCUPADO"] as const;

// ─────────────────────────────────────────────────────────
// GET /cuentas/:id/accesos
// Lista todos los accesos de una cuenta con datos del cliente
// asignado si existe.
// ─────────────────────────────────────────────────────────
router.get("/cuentas/:id/accesos", auth, async (req: any, res) => {
  try {
    const userId   = getUserId(req);
    const cuentaId = asInt(req.params.id);

    if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
      return res.status(400).json({ ok: false, error: "ID de cuenta inválido" });
    }

    // Verificar que la cuenta pertenece al usuario
    const [ctaRows] = await pool.query(
      `SELECT id FROM cuentas WHERE id = ? AND usuario_id = ? LIMIT 1`,
      [cuentaId, userId]
    );
    if (!(ctaRows as any[])[0]) {
      return res.status(404).json({ ok: false, error: "Cuenta no encontrada" });
    }

    const [rows] = await pool.query(
      `SELECT
         ca.id,
         ca.cuenta_id,
         ca.suscripcion_id,
         ca.nombre_acceso,
         ca.correo_acceso,
         ca.password_acceso,
         ca.pin_acceso,
         ca.tipo_acceso,
         ca.estado,
         ca.created_at,
         ca.updated_at,
         -- datos del cliente asignado (si hay suscripción)
         cl.id   AS cliente_id,
         cl.nombre AS cliente_nombre,
         cl.telefono AS cliente_telefono,
         -- datos de la suscripción
         s.precio_mensual,
         s.estado AS suscripcion_estado,
         DATE_FORMAT(s.proximo_cobro, '%Y-%m-%d') AS proximo_cobro
       FROM cuenta_accesos ca
       LEFT JOIN suscripciones s  ON s.id  = ca.suscripcion_id
       LEFT JOIN clientes cl      ON cl.id = s.cliente_id
       WHERE ca.cuenta_id = ?
       ORDER BY ca.id ASC`,
      [cuentaId]
    );

    return res.json({ ok: true, items: rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: "DB_ERROR", detail: e?.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /cuentas/:id/accesos
// Crea un acceso manualmente para una cuenta.
// ─────────────────────────────────────────────────────────
router.post("/cuentas/:id/accesos", auth, async (req: any, res) => {
  try {
    const userId   = getUserId(req);
    const cuentaId = asInt(req.params.id);

    if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
      return res.status(400).json({ ok: false, error: "ID de cuenta inválido" });
    }

    const { nombre_acceso, correo_acceso, password_acceso, pin_acceso, tipo_acceso } =
      req.body ?? {};

    const tipo = tipo_acceso ? String(tipo_acceso).toLowerCase() : "perfil";
    if (!VALID_TIPO.includes(tipo as any)) {
      return res.status(400).json({ ok: false, error: `tipo_acceso inválido. Valores: ${VALID_TIPO.join(", ")}` });
    }

    // La cuenta debe pertenecer al usuario
    const [ctaRows] = await pool.query(
      `SELECT id FROM cuentas WHERE id = ? AND usuario_id = ? LIMIT 1`,
      [cuentaId, userId]
    );
    if (!(ctaRows as any[])[0]) {
      return res.status(404).json({ ok: false, error: "Cuenta no encontrada" });
    }

    const [ins] = await pool.query(
      `INSERT INTO cuenta_accesos
         (cuenta_id, nombre_acceso, correo_acceso, password_acceso, pin_acceso, tipo_acceso, estado)
       VALUES (?, ?, ?, ?, ?, ?, 'DISPONIBLE')`,
      [
        cuentaId,
        nombre_acceso ? String(nombre_acceso).trim() : null,
        correo_acceso ? String(correo_acceso).trim() : null,
        password_acceso ? String(password_acceso) : null,
        pin_acceso ? String(pin_acceso).trim() : null,
        tipo,
      ]
    );

    return res.status(201).json({ ok: true, id: (ins as any).insertId });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: "DB_ERROR", detail: e?.message });
  }
});

// ─────────────────────────────────────────────────────────
// PUT /accesos/:id
// Actualiza datos de un acceso (solo si NO está OCUPADO
// o si sólo cambia datos descriptivos sin tocar el estado).
// ─────────────────────────────────────────────────────────
router.put("/accesos/:id", auth, async (req: any, res) => {
  try {
    const userId   = getUserId(req);
    const accesoId = asInt(req.params.id);

    if (!Number.isFinite(accesoId) || accesoId <= 0) {
      return res.status(400).json({ ok: false, error: "ID de acceso inválido" });
    }

    const { nombre_acceso, correo_acceso, password_acceso, pin_acceso, tipo_acceso } =
      req.body ?? {};

    // Verificar que el acceso pertenece al usuario (vía cuenta)
    const [rows] = await pool.query(
      `SELECT ca.id
       FROM cuenta_accesos ca
       INNER JOIN cuentas c ON c.id = ca.cuenta_id AND c.usuario_id = ?
       WHERE ca.id = ?
       LIMIT 1`,
      [userId, accesoId]
    );
    if (!(rows as any[])[0]) {
      return res.status(404).json({ ok: false, error: "Acceso no encontrado" });
    }

    const tipo = tipo_acceso ? String(tipo_acceso).toLowerCase() : null;
    if (tipo && !VALID_TIPO.includes(tipo as any)) {
      return res.status(400).json({ ok: false, error: `tipo_acceso inválido. Valores: ${VALID_TIPO.join(", ")}` });
    }

    await pool.query(
      `UPDATE cuenta_accesos
       SET
         nombre_acceso   = COALESCE(?, nombre_acceso),
         correo_acceso   = ?,
         password_acceso = ?,
         pin_acceso      = ?,
         tipo_acceso     = COALESCE(?, tipo_acceso)
       WHERE id = ?`,
      [
        nombre_acceso !== undefined ? String(nombre_acceso).trim() : null,
        correo_acceso !== undefined ? (correo_acceso ? String(correo_acceso).trim() : null) : undefined,
        password_acceso !== undefined ? (password_acceso ? String(password_acceso) : null) : undefined,
        pin_acceso !== undefined ? (pin_acceso ? String(pin_acceso).trim() : null) : undefined,
        tipo,
        accesoId,
      ]
    );

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: "DB_ERROR", detail: e?.message });
  }
});

// ─────────────────────────────────────────────────────────
// DELETE /accesos/:id
// Elimina un acceso. Solo permitido si está DISPONIBLE.
// ─────────────────────────────────────────────────────────
router.delete("/accesos/:id", auth, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    const userId   = getUserId(req);
    const accesoId = asInt(req.params.id);

    if (!Number.isFinite(accesoId) || accesoId <= 0) {
      return res.status(400).json({ ok: false, error: "ID de acceso inválido" });
    }

    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT ca.id, ca.estado, ca.suscripcion_id
       FROM cuenta_accesos ca
       INNER JOIN cuentas c ON c.id = ca.cuenta_id AND c.usuario_id = ?
       WHERE ca.id = ?
       LIMIT 1
       FOR UPDATE`,
      [userId, accesoId]
    );

    const acceso = (rows as any[])[0];
    if (!acceso) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Acceso no encontrado" });
    }

    if (acceso.estado === "OCUPADO" || acceso.suscripcion_id !== null) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        error: "ACCESO_OCUPADO",
        message: "No se puede eliminar un acceso mientras está asignado a una suscripción. Desasígnalo primero.",
      });
    }

    await conn.query(`DELETE FROM cuenta_accesos WHERE id = ?`, [accesoId]);
    await conn.commit();

    return res.json({ ok: true });
  } catch (e: any) {
    try { await conn.rollback(); } catch {}
    return res.status(500).json({ ok: false, error: "DB_ERROR", detail: e?.message });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────
// PUT /suscripciones/:id/asignar-acceso
// Body: { acceso_id: number }
// Asigna un acceso a una suscripción con transacción completa.
// ─────────────────────────────────────────────────────────
router.put("/suscripciones/:id/asignar-acceso", auth, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    const userId = getUserId(req);
    const susId  = asInt(req.params.id);
    const accesoId = asInt(req.body?.acceso_id);

    if (!Number.isFinite(susId) || susId <= 0) {
      return res.status(400).json({ ok: false, error: "ID de suscripción inválido" });
    }
    if (!Number.isFinite(accesoId) || accesoId <= 0) {
      return res.status(400).json({ ok: false, error: "acceso_id inválido" });
    }

    await conn.beginTransaction();

    // 1) Obtener suscripción (con lock)
    const [susRows] = await conn.query(
      `SELECT s.id, s.cuenta_id, s.acceso_id
       FROM suscripciones s
       WHERE s.id = ? AND s.usuario_id = ?
       LIMIT 1
       FOR UPDATE`,
      [susId, userId]
    );
    const sus = (susRows as any[])[0];
    if (!sus) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Suscripción no encontrada" });
    }
    if (sus.acceso_id !== null) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        error: "SUSCRIPCION_YA_TIENE_ACCESO",
        message: "La suscripción ya tiene un acceso asignado. Desasígnalo primero.",
      });
    }

    // 2) Obtener acceso (con lock)
    const [accRows] = await conn.query(
      `SELECT ca.id, ca.cuenta_id, ca.estado, ca.suscripcion_id
       FROM cuenta_accesos ca
       INNER JOIN cuentas c ON c.id = ca.cuenta_id AND c.usuario_id = ?
       WHERE ca.id = ?
       LIMIT 1
       FOR UPDATE`,
      [userId, accesoId]
    );
    const acceso = (accRows as any[])[0];
    if (!acceso) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Acceso no encontrado" });
    }
    if (acceso.estado === "OCUPADO" || acceso.suscripcion_id !== null) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        error: "ACCESO_OCUPADO",
        message: "El acceso ya está ocupado por otra suscripción.",
      });
    }

    // 3) Validar que el acceso pertenece a la misma cuenta de la suscripción
    if (Number(acceso.cuenta_id) !== Number(sus.cuenta_id)) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        error: "CUENTA_MISMATCH",
        message: "El acceso no pertenece a la misma cuenta de la suscripción.",
      });
    }

    // 4) Asignar
    await conn.query(
      `UPDATE cuenta_accesos
       SET suscripcion_id = ?, estado = 'OCUPADO'
       WHERE id = ?`,
      [susId, accesoId]
    );

    await conn.query(
      `UPDATE suscripciones SET acceso_id = ? WHERE id = ? AND usuario_id = ?`,
      [accesoId, susId, userId]
    );

    await conn.commit();
    return res.json({ ok: true });
  } catch (e: any) {
    try { await conn.rollback(); } catch {}
    return res.status(500).json({ ok: false, error: "DB_ERROR", detail: e?.message });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────
// PUT /suscripciones/:id/desasignar-acceso
// Libera el acceso de una suscripción.
// ─────────────────────────────────────────────────────────
router.put("/suscripciones/:id/desasignar-acceso", auth, async (req: any, res) => {
  const conn = await pool.getConnection();
  try {
    const userId = getUserId(req);
    const susId  = asInt(req.params.id);

    if (!Number.isFinite(susId) || susId <= 0) {
      return res.status(400).json({ ok: false, error: "ID de suscripción inválido" });
    }

    await conn.beginTransaction();

    const [susRows] = await conn.query(
      `SELECT id, acceso_id
       FROM suscripciones
       WHERE id = ? AND usuario_id = ?
       LIMIT 1
       FOR UPDATE`,
      [susId, userId]
    );
    const sus = (susRows as any[])[0];
    if (!sus) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Suscripción no encontrada" });
    }
    if (sus.acceso_id === null) {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: "La suscripción no tiene acceso asignado" });
    }

    // Liberar acceso
    await conn.query(
      `UPDATE cuenta_accesos
       SET suscripcion_id = NULL, estado = 'DISPONIBLE'
       WHERE id = ?`,
      [sus.acceso_id]
    );

    // Limpiar referencia en suscripción
    await conn.query(
      `UPDATE suscripciones SET acceso_id = NULL WHERE id = ? AND usuario_id = ?`,
      [susId, userId]
    );

    await conn.commit();
    return res.json({ ok: true });
  } catch (e: any) {
    try { await conn.rollback(); } catch {}
    return res.status(500).json({ ok: false, error: "DB_ERROR", detail: e?.message });
  } finally {
    conn.release();
  }
});

export default router;
