import { Router } from "express";
import { pool } from "../db";
import { auth } from "../middlewares/auth";

const router = Router();

function getUserId(req: any) {
  const id = req.user?.id;
  if (!id) throw new Error("No autorizado");
  return Number(id);
}

function asInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

/**
 * GET /clientes
 * Query:
 *  - activo=1|0|all
 *  - nombre=string
 *  - servicioId=number
 *  - correoCuenta=string
 *  - diaCobro=1..31
 *
 * Nota: si se usan filtros de suscripción (servicio/correo/día),
 * retorna clientes que tengan al menos una suscripción que cumpla.
 */
router.get("/", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);

    const activoParam = String(req.query.activo ?? "all");
    const nombre = String(req.query.nombre ?? "").trim();
    const correoCuenta = String(req.query.correoCuenta ?? "").trim();
    const servicioId = asInt(req.query.servicioId);
    const diaCobro = asInt(req.query.diaCobro);

    const where: string[] = ["c.usuario_id = ?"];
    const params: any[] = [usuarioId];

    // Activo
    if (activoParam === "1") where.push("c.activo = 1");
    else if (activoParam === "0") where.push("c.activo = 0");

    // Nombre
    if (nombre) {
      where.push("c.nombre LIKE ?");
      params.push(`%${nombre}%`);
    }

    const useSusFilters =
      (Number.isFinite(servicioId) && servicioId > 0) ||
      !!correoCuenta ||
      (Number.isFinite(diaCobro) && diaCobro >= 1 && diaCobro <= 31);

    // Modo simple: solo clientes
    if (!useSusFilters) {
      const [rows] = await pool.query(
        `
        SELECT c.id, c.nombre, c.telefono, c.direccion, c.notas, c.activo
        FROM clientes c
        WHERE ${where.join(" AND ")}
        ORDER BY c.id DESC
        `,
        params
      );

      return res.json({ items: rows });
    }

    // Modo pro: JOIN para filtrar por suscripciones/cuentas/servicios
    const whereSus: string[] = [...where];

    if (Number.isFinite(servicioId) && servicioId > 0) {
      whereSus.push("sv.id = ?");
      params.push(servicioId);
    }

    if (correoCuenta) {
      whereSus.push("cu.correo LIKE ?");
      params.push(`%${correoCuenta}%`);
    }

    if (Number.isFinite(diaCobro) && diaCobro >= 1 && diaCobro <= 31) {
      whereSus.push("s.dia_cobro = ?");
      params.push(diaCobro);
    }

    const [rows] = await pool.query(
      `
      SELECT DISTINCT
        c.id, c.nombre, c.telefono, c.direccion, c.notas, c.activo
      FROM clientes c
      JOIN suscripciones s
        ON s.cliente_id = c.id AND s.usuario_id = c.usuario_id
      JOIN cuentas cu
        ON cu.id = s.cuenta_id
      JOIN servicios sv
        ON sv.id = cu.servicio_id
      WHERE ${whereSus.join(" AND ")}
      ORDER BY c.id DESC
      `,
      params
    );

    return res.json({ items: rows });
  } catch (e: any) {
    res.status(500).json({ message: "ERROR_LISTANDO_CLIENTES", detail: e?.message });
  }
});

/**
 * GET /clientes/resumen
 */
router.get("/resumen", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);

    const [[c]] = await pool.query(
      `SELECT COUNT(*) AS totalClientes FROM clientes WHERE usuario_id = ?`,
      [usuarioId]
    );

    const [[m]] = await pool.query(
      `
      SELECT COALESCE(SUM(precio_mensual),0) AS mrr
      FROM suscripciones
      WHERE usuario_id = ? AND estado = 'ACTIVA'
      `,
      [usuarioId]
    );

    res.json({
      totalClientes: Number((c as any)?.totalClientes || 0),
      mrr: Number((m as any)?.mrr || 0),
    });
  } catch (e: any) {
    res.status(500).json({ message: "ERROR_RESUMEN_CLIENTES", detail: e?.message });
  }
});

/**
 * GET /clientes/:id/suscripciones
 * Devuelve TODAS las suscripciones del cliente (puede haber más de una).
 */
router.get("/:id/suscripciones", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);
    const clienteId = asInt(req.params.id);

    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const [[exists]] = await pool.query(
      `SELECT id FROM clientes WHERE id = ? AND usuario_id = ? LIMIT 1`,
      [clienteId, usuarioId]
    );

    if (!exists) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        s.id,
        s.cuenta_id,
        cu.correo AS cuenta_correo,
        sv.nombre_servicio AS servicio,
        s.precio_mensual,
        s.dia_cobro,
        s.estado,
        s.pin_perfil,
        DATE_FORMAT(s.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
        DATE_FORMAT(s.proximo_cobro, '%Y-%m-%d') AS proximo_cobro
      FROM suscripciones s
      JOIN cuentas cu ON cu.id = s.cuenta_id
      JOIN servicios sv ON sv.id = cu.servicio_id
      WHERE s.usuario_id = ? AND s.cliente_id = ?
      ORDER BY s.id DESC
      `,
      [usuarioId, clienteId]
    );

    res.json({ items: rows });
  } catch (e: any) {
    res.status(500).json({ message: "ERROR_LISTANDO_SUSCRIPCIONES", detail: e?.message });
  }
});

/**
 * POST /clientes
 */
router.post("/", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);
    const { nombre, telefono = null, direccion = null, notas = null } = req.body;

    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ message: "Nombre inválido" });
    }

    const [result] = await pool.execute(
      `
      INSERT INTO clientes (usuario_id, nombre, telefono, direccion, notas)
      VALUES (?, ?, ?, ?, ?)
      `,
      [usuarioId, String(nombre).trim(), telefono, direccion, notas]
    );

    res.status(201).json({ id: (result as any).insertId });
  } catch (e: any) {
    res.status(500).json({ message: "ERROR_CREANDO_CLIENTE", detail: e?.message });
  }
});

/**
 * PUT /clientes/:id
 */
router.put("/:id", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);
    const id = asInt(req.params.id);
    const { nombre, telefono = null, direccion = null, notas = null } = req.body;

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ message: "Nombre inválido" });
    }

    const [result] = await pool.execute(
      `
      UPDATE clientes
      SET nombre = ?, telefono = ?, direccion = ?, notas = ?
      WHERE id = ? AND usuario_id = ?
      `,
      [String(nombre).trim(), telefono, direccion, notas, id, usuarioId]
    );

    if (!(result as any).affectedRows) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ message: "ERROR_ACTUALIZANDO_CLIENTE", detail: e?.message });
  }
});

/**
 * PATCH /clientes/:id/activo
 * ✅ Cuando cambia el estado del cliente:
 *   - se actualiza clientes.activo
 *   - se sincroniza cupo_ocupado en TODAS las cuentas donde exista suscripción del usuario
 *     contando SOLO suscripciones ACTIVA/PAUSADA con cliente ACTIVO.
 */
router.patch("/:id/activo", auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const usuarioId = getUserId(req);
    const id = asInt(req.params.id);
    const { activo } = req.body;

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const value = activo ? 1 : 0;

    await conn.beginTransaction();

    // 1) Asegurar que el cliente existe y es del usuario (y bloquear fila)
    const [cliRows] = await conn.query(
      `SELECT id, activo FROM clientes WHERE id = ? AND usuario_id = ? LIMIT 1 FOR UPDATE`,
      [id, usuarioId]
    );

    const cli = (cliRows as any[])[0];
    if (!cli) {
      await conn.rollback();
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    // 2) Actualizar activo
    await conn.query(`UPDATE clientes SET activo = ? WHERE id = ? AND usuario_id = ?`, [
      value,
      id,
      usuarioId,
    ]);

    // 3) Obtener cuentas afectadas (donde este cliente tenga suscripciones)
    const [ctaIdsRows] = await conn.query(
      `
      SELECT DISTINCT s.cuenta_id
      FROM suscripciones s
      WHERE s.usuario_id = ? AND s.cliente_id = ?
      `,
      [usuarioId, id]
    );

    const cuentaIds = (ctaIdsRows as any[]).map((r) => Number(r.cuenta_id)).filter(Number.isFinite);

    // 4) Sincronizar cupo_ocupado por cada cuenta afectada
    //    cupo_ocupado = COUNT(suscripciones ACTIVA/PAUSADA con cliente activo=1)
    for (const cuentaId of cuentaIds) {
      const [occRows] = await conn.query(
        `
        SELECT COUNT(*) AS ocupado
        FROM suscripciones s
        INNER JOIN clientes cl ON cl.id = s.cliente_id AND cl.activo = 1
        WHERE s.usuario_id = ? AND s.cuenta_id = ?
          AND s.estado IN ('ACTIVA','PAUSADA')
        `,
        [usuarioId, cuentaId]
      );

      const ocupadoReal = Number((occRows as any[])[0]?.ocupado ?? 0);

      await conn.query(
        `UPDATE cuentas
         SET cupo_ocupado = ?
         WHERE id = ? AND usuario_id = ?`,
        [ocupadoReal, cuentaId, usuarioId]
      );
    }

    await conn.commit();

    res.json({ ok: true, activo: value, cupos_recalculados: cuentaIds.length });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    res.status(500).json({ message: "ERROR_TOGGLE_CLIENTE", detail: e?.message });
  } finally {
    conn.release();
  }
});

export default router;
