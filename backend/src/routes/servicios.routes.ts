import { Router } from "express";
import { pool } from "../db";
import { auth } from "../middlewares/auth";

const router = Router();

function getUserId(req: any) {
  const id = req.user?.id;
  if (!id) throw new Error("No autorizado");
  return Number(id);
}

/**
 * GET /servicios?activo=1|0|all
 */
router.get("/", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);

    const qActivo = String(req.query.activo ?? "1");
    const activo = qActivo === "all" ? null : qActivo === "0" ? 0 : 1;

    const sql = `
      SELECT id, nombre_servicio, costo_servicio, venta_por_cuenta, activo, created_at, updated_at
      FROM servicios
      WHERE usuario_id = ?
      ${activo === null ? "" : "AND activo = ?"}
      ORDER BY id DESC
    `;

    const params = activo === null ? [usuarioId] : [usuarioId, activo];
    const [rows] = await pool.query(sql, params);

    return res.json({ items: rows });
  } catch (e: any) {
    console.error("GET /servicios error:", e);
    return res.status(500).json({ message: "Error interno" });
  }
});

/**
 * POST /servicios
 * body: { nombre_servicio, costo_servicio, venta_por_cuenta }
 */
router.post("/", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);
    const { nombre_servicio, costo_servicio, venta_por_cuenta } = req.body ?? {};

    if (!nombre_servicio || String(nombre_servicio).trim().length < 2) {
      return res.status(400).json({ message: "Nombre de servicio inválido" });
    }

    const costo = Number(costo_servicio ?? 0);
    const venta = Number(venta_por_cuenta ?? 0);

    if (!Number.isFinite(costo) || costo < 0) {
      return res.status(400).json({ message: "Costo inválido" });
    }
    if (!Number.isFinite(venta) || venta < 0) {
      return res.status(400).json({ message: "Venta por cuenta inválida" });
    }

    const [result] = await pool.execute(
      `INSERT INTO servicios (usuario_id, nombre_servicio, costo_servicio, venta_por_cuenta, activo)
       VALUES (?, ?, ?, ?, 1)`,
      [usuarioId, String(nombre_servicio).trim(), costo, venta]
    );

    const id = (result as any).insertId;

    return res.status(201).json({
      id,
      nombre_servicio: String(nombre_servicio).trim(),
      costo_servicio: costo,
      venta_por_cuenta: venta,
      activo: 1,
    });
  } catch (e: any) {
    console.error("POST /servicios error:", e);
    return res.status(500).json({ message: "Error interno" });
  }
});

/**
 * PUT /servicios/:id
 */
router.put("/:id", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);
    const id = Number(req.params.id);
    const { nombre_servicio, costo_servicio, venta_por_cuenta } = req.body ?? {};

    if (!id || Number.isNaN(id)) return res.status(400).json({ message: "ID inválido" });
    if (!nombre_servicio || String(nombre_servicio).trim().length < 2) {
      return res.status(400).json({ message: "Nombre de servicio inválido" });
    }

    const costo = Number(costo_servicio ?? 0);
    const venta = Number(venta_por_cuenta ?? 0);

    if (!Number.isFinite(costo) || costo < 0) {
      return res.status(400).json({ message: "Costo inválido" });
    }
    if (!Number.isFinite(venta) || venta < 0) {
      return res.status(400).json({ message: "Venta por cuenta inválida" });
    }

    const [result] = await pool.execute(
      `UPDATE servicios
       SET nombre_servicio = ?, costo_servicio = ?, venta_por_cuenta = ?
       WHERE id = ? AND usuario_id = ?`,
      [String(nombre_servicio).trim(), costo, venta, id, usuarioId]
    );

    if (!(result as any).affectedRows) {
      return res.status(404).json({ message: "Servicio no encontrado" });
    }

    return res.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /servicios/:id error:", e);
    return res.status(500).json({ message: "Error interno" });
  }
});

/**
 * PATCH /servicios/:id/activo
 * body: { activo: true|false|1|0|"1"|"0" }
 */
router.patch("/:id/activo", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);
    const id = Number(req.params.id);

    if (!id || Number.isNaN(id)) return res.status(400).json({ message: "ID inválido" });

    const raw = (req.body ?? {}).activo;
    const activo = raw === true || raw === 1 || raw === "1" ? 1 : 0;

    const [result] = await pool.execute(
      `UPDATE servicios SET activo = ? WHERE id = ? AND usuario_id = ?`,
      [activo, id, usuarioId]
    );

    if (!(result as any).affectedRows) {
      return res.status(404).json({ message: "Servicio no encontrado" });
    }

    return res.json({ ok: true, activo });
  } catch (e: any) {
    console.error("PATCH /servicios/:id/activo error:", e);
    return res.status(500).json({ message: "Error interno" });
  }
});

export default router;
