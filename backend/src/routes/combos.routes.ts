import { Router } from "express";
import { auth } from "../middlewares/auth";
import { pool as db } from "../db";

const router = Router();

type ComboTipo = "BUNDLE" | "PROMO" | "MIXTO";
type PricingModo = "FIJO" | "PORCENTAJE" | "MONTO";
type Estado = "ACTIVO" | "INACTIVO";

const TIPOS: ComboTipo[] = ["BUNDLE", "PROMO", "MIXTO"];
const MODOS: PricingModo[] = ["FIJO", "PORCENTAJE", "MONTO"];
const ESTADOS: Estado[] = ["ACTIVO", "INACTIVO"];

const toInt = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
};
const toNum = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const pick = <T extends string>(v: any, allowed: T[], def: T) =>
  typeof v === "string" && allowed.includes(v as T) ? (v as T) : def;

/**
 * GET /combos?tipo=&estado=&q=
 */
router.get("/", auth, async (req, res) => {
  try {
    const tipo = req.query.tipo as string | undefined;
    const estado = req.query.estado as string | undefined;
    const q = (req.query.q as string | undefined)?.trim();

    const where: string[] = [];
    const params: any[] = [];

    if (tipo && TIPOS.includes(tipo as ComboTipo)) {
      where.push("c.tipo = ?");
      params.push(tipo);
    }
    if (estado && ESTADOS.includes(estado as Estado)) {
      where.push("c.estado = ?");
      params.push(estado);
    }
    if (q) {
      where.push("c.nombre LIKE ?");
      params.push(`%${q}%`);
    }

    const sql = `
      SELECT
        c.id, c.nombre, c.tipo, c.estado,
        c.pricing_modo, c.pricing_valor,
        c.promo_paga_meses, c.promo_regala_meses, c.promo_acumulable,
        c.created_at, c.updated_at
      FROM combos c
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY c.estado ASC, c.tipo ASC, c.nombre ASC
    `;

    const [rows] = await db.query(sql, params);
    const combos = Array.isArray(rows) ? rows : [];
    if (!combos.length) return res.json({ items: [] });

    const ids = combos.map((c: any) => c.id);
    const placeholders = ids.map(() => "?").join(",");

    // ✅ FIX BD: servicios.nombre_servicio (no existe servicios.nombre)
    const [svcRows] = await db.query(
      `
      SELECT
        cs.combo_id,
        s.id AS servicio_id,
        s.nombre_servicio AS servicio_nombre
      FROM combo_servicios cs
      JOIN servicios s ON s.id = cs.servicio_id
      WHERE cs.combo_id IN (${placeholders})
      ORDER BY cs.combo_id ASC
      `,
      ids
    );

    const map = new Map<number, { id: number; nombre: string }[]>();
    (Array.isArray(svcRows) ? svcRows : []).forEach((r: any) => {
      const arr = map.get(r.combo_id) ?? [];
      arr.push({ id: Number(r.servicio_id), nombre: String(r.servicio_nombre ?? "") });
      map.set(r.combo_id, arr);
    });

    const out = combos.map((c: any) => ({
      ...c,
      promo_acumulable: !!c.promo_acumulable,
      servicios: map.get(c.id) ?? [],
    }));

    res.json({ items: out });
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "Error listando combos" });
  }
});

/**
 * POST /combos
 */
router.post("/", auth, async (req, res) => {
  const conn = await (db.getConnection?.() ?? null);
  try {
    const body = req.body ?? {};

    const nombre = String(body.nombre ?? "").trim();
    const tipo = pick<ComboTipo>(body.tipo, TIPOS, "BUNDLE");
    const estado = pick<Estado>(body.estado, ESTADOS, "ACTIVO");
    const pricing_modo = pick<PricingModo>(body.pricing_modo, MODOS, "FIJO");
    const pricing_valor = toNum(body.pricing_valor, 0);

    const promo_paga_meses =
      body.promo_paga_meses != null ? toInt(body.promo_paga_meses) : null;
    const promo_regala_meses =
      body.promo_regala_meses != null ? toInt(body.promo_regala_meses) : null;
    const promo_acumulable =
      body.promo_acumulable == null ? 1 : body.promo_acumulable ? 1 : 0;

    const servicios_ids: number[] = Array.isArray(body.servicios_ids)
      ? body.servicios_ids.map((x: any) => toInt(x)).filter((x: number) => x > 0)
      : [];

    if (!nombre) return res.status(400).json({ message: "nombre es requerido" });
    if (pricing_valor < 0)
      return res.status(400).json({ message: "pricing_valor inválido" });

    if ((tipo === "PROMO" || tipo === "MIXTO") && (!promo_paga_meses || !promo_regala_meses)) {
      return res.status(400).json({ message: "Promo requiere paga_meses y regala_meses" });
    }
    if ((tipo === "BUNDLE" || tipo === "MIXTO") && servicios_ids.length === 0) {
      return res.status(400).json({ message: "Seleccione al menos 1 servicio" });
    }

    const q = conn ? conn.query.bind(conn) : db.query.bind(db);
    if (conn) await conn.beginTransaction();

    const [r] = await q(
      `
      INSERT INTO combos
        (nombre, tipo, estado, pricing_modo, pricing_valor,
         promo_paga_meses, promo_regala_meses, promo_acumulable)
      VALUES (?,?,?,?,?,?,?,?)
      `,
      [
        nombre,
        tipo,
        estado,
        pricing_modo,
        pricing_valor,
        promo_paga_meses,
        promo_regala_meses,
        promo_acumulable,
      ]
    );

    const comboId = (r as any).insertId;

    if (servicios_ids.length) {
      const values = servicios_ids.map(() => "(?, ?)").join(",");
      const params = servicios_ids.flatMap((sid) => [comboId, sid]);
      await q(`INSERT IGNORE INTO combo_servicios (combo_id, servicio_id) VALUES ${values}`, params);
    }

    if (conn) await conn.commit();
    res.status(201).json({ ok: true, id: comboId });
  } catch (e: any) {
    if (conn) await conn.rollback();
    res.status(500).json({ message: e?.message || "Error creando combo" });
  } finally {
    conn?.release?.();
  }
});

/**
 * PUT /combos/:id
 */
router.put("/:id", auth, async (req, res) => {
  const conn = await (db.getConnection?.() ?? null);
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const body = req.body ?? {};
    const nombre = String(body.nombre ?? "").trim();
    const tipo = pick<ComboTipo>(body.tipo, TIPOS, "BUNDLE");
    const estado = pick<Estado>(body.estado, ESTADOS, "ACTIVO");
    const pricing_modo = pick<PricingModo>(body.pricing_modo, MODOS, "FIJO");
    const pricing_valor = toNum(body.pricing_valor, 0);

    const promo_paga_meses =
      body.promo_paga_meses != null ? toInt(body.promo_paga_meses) : null;
    const promo_regala_meses =
      body.promo_regala_meses != null ? toInt(body.promo_regala_meses) : null;
    const promo_acumulable =
      body.promo_acumulable == null ? 1 : body.promo_acumulable ? 1 : 0;

    const servicios_ids: number[] = Array.isArray(body.servicios_ids)
      ? body.servicios_ids.map((x: any) => toInt(x)).filter((x: number) => x > 0)
      : [];

    if (!nombre) return res.status(400).json({ message: "nombre es requerido" });
    if (pricing_valor < 0)
      return res.status(400).json({ message: "pricing_valor inválido" });

    if ((tipo === "PROMO" || tipo === "MIXTO") && (!promo_paga_meses || !promo_regala_meses)) {
      return res.status(400).json({ message: "Promo requiere paga_meses y regala_meses" });
    }
    if ((tipo === "BUNDLE" || tipo === "MIXTO") && servicios_ids.length === 0) {
      return res.status(400).json({ message: "Seleccione al menos 1 servicio" });
    }

    const q = conn ? conn.query.bind(conn) : db.query.bind(db);
    if (conn) await conn.beginTransaction();

    const [exist] = await q(`SELECT id FROM combos WHERE id = ? LIMIT 1`, [id]);
    if (!Array.isArray(exist) || exist.length === 0) {
      if (conn) await conn.rollback();
      return res.status(404).json({ message: "Combo no existe" });
    }

    await q(
      `
      UPDATE combos
      SET nombre=?, tipo=?, estado=?, pricing_modo=?, pricing_valor=?,
          promo_paga_meses=?, promo_regala_meses=?, promo_acumulable=?
      WHERE id=?
      `,
      [
        nombre,
        tipo,
        estado,
        pricing_modo,
        pricing_valor,
        promo_paga_meses,
        promo_regala_meses,
        promo_acumulable,
        id,
      ]
    );

    await q(`DELETE FROM combo_servicios WHERE combo_id = ?`, [id]);
    if (servicios_ids.length) {
      const values = servicios_ids.map(() => "(?, ?)").join(",");
      const params = servicios_ids.flatMap((sid) => [id, sid]);
      await q(`INSERT IGNORE INTO combo_servicios (combo_id, servicio_id) VALUES ${values}`, params);
    }

    if (conn) await conn.commit();
    res.json({ ok: true });
  } catch (e: any) {
    if (conn) await conn.rollback();
    res.status(500).json({ message: e?.message || "Error editando combo" });
  } finally {
    conn?.release?.();
  }
});

/**
 * PATCH /combos/:id/toggle
 */
router.patch("/:id/toggle", auth, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const [rows] = await db.query(`SELECT estado FROM combos WHERE id = ? LIMIT 1`, [id]);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return res.status(404).json({ message: "Combo no existe" });

    const next = row.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    await db.query(`UPDATE combos SET estado = ? WHERE id = ?`, [next, id]);

    res.json({ ok: true, estado: next });
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "Error toggling combo" });
  }
});

/**
 * DELETE /combos/:id  (lógico)
 */
router.delete("/:id", auth, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    await db.query(`UPDATE combos SET estado='INACTIVO' WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "Error eliminando combo" });
  }
});

export default router;
