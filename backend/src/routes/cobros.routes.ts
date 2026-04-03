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

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Calcula meses gratis según promo.
 * - acumulable=1: aplica por bloques (floor(paga/pagaMeses)*regala)
 * - acumulable=0: aplica solo una vez si cumple (>= pagaMeses)
 */
function calcMesesGratis(
  pagaMeses: number,
  regalaMeses: number,
  acumulable: number,
  mesesPagados: number
) {
  if (!pagaMeses || !regalaMeses) return 0;
  if (mesesPagados < pagaMeses) return 0;
  if (acumulable === 1) return Math.floor(mesesPagados / pagaMeses) * regalaMeses;
  return regalaMeses; // no acumulable
}

/**
 * GET /cobros/para-cobrar?q=&servicioId=&diaCobro=
 * Devuelve suscripciones ACTIVA del usuario con datos para cobranza.
 * ✅ NO incluye clientes inactivos (no ocupan cupo, no se cobran)
 * ✅ NO incluye cuentas inactivas
 * ✅ NO incluye servicios inactivos
 */
router.get("/para-cobrar", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);

    const q = String(req.query.q ?? "").trim();
    const servicioId = String(req.query.servicioId ?? "").trim();
    const diaCobro = String(req.query.diaCobro ?? "").trim();

    // ✅ Filtros base (operativos)
    const where: string[] = [
      "s.usuario_id = ?",
      "s.estado = 'ACTIVA'",
      "cl.activo = 1",
      "cu.activa = 1",
      "sv.activo = 1",
    ];
    const args: any[] = [usuarioId];

    if (servicioId) {
      where.push("sv.id = ?");
      args.push(asInt(servicioId));
    }
    if (diaCobro) {
      where.push("s.dia_cobro = ?");
      args.push(asInt(diaCobro));
    }
    if (q) {
      where.push("(cl.nombre LIKE ? OR cu.correo LIKE ? OR COALESCE(cl.telefono,'') LIKE ?)");
      args.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const [rows] = await pool.query(
      `
      SELECT
        s.id AS suscripcion_id,
        cl.id AS cliente_id,
        cl.nombre AS cliente_nombre,
        cl.telefono,

        sv.id AS servicio_id,
        sv.nombre_servicio AS servicio,
        cu.correo AS cuenta_correo,

        s.precio_mensual,
        s.dia_cobro,
        DATE_FORMAT(s.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
        DATE_FORMAT(s.proximo_cobro, '%Y-%m-%d') AS proximo_cobro,

        DATEDIFF(CURDATE(), COALESCE(s.proximo_cobro, CURDATE())) AS atraso_dias,
        s.estado
      FROM suscripciones s
      JOIN clientes cl
        ON cl.id = s.cliente_id
       AND cl.usuario_id = s.usuario_id
      JOIN cuentas cu
        ON cu.id = s.cuenta_id
       AND cu.usuario_id = s.usuario_id
      JOIN servicios sv
        ON sv.id = cu.servicio_id
       AND sv.usuario_id = s.usuario_id
      WHERE ${where.join(" AND ")}
      ORDER BY
        DATEDIFF(CURDATE(), COALESCE(s.proximo_cobro, CURDATE())) DESC,
        COALESCE(s.proximo_cobro, CURDATE()) ASC,
        s.id DESC
      `,
      args
    );

    return res.json({ items: rows });
  } catch (e: any) {
    return res.status(500).json({
      message: "ERROR_LISTANDO_PARA_COBRAR",
      detail: e?.message,
    });
  }
});

/**
 * (OPCIONAL) Alias por si su frontend llama /cobros/pendientes
 */
router.get("/pendientes", auth, async (req, res) => {
  req.url = "/para-cobrar";
  return router.handle(req, res, () => {});
});

/**
 * GET /cobros?from=YYYY-MM-DD&to=YYYY-MM-DD&q=&servicioId=&includeInactivos=0|1
 * Historial de cobros (auditoría).
 * - Por defecto: incluye TODO (recomendado)
 * - Si includeInactivos=0: filtra a solo activos (operativo)
 */
router.get("/", auth, async (req, res) => {
  try {
    const usuarioId = getUserId(req);

    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    const q = String(req.query.q ?? "").trim();
    const servicioId = String(req.query.servicioId ?? "").trim();

    const includeInactivos = String(req.query.includeInactivos ?? "1") === "1";

    const where: string[] = ["c.usuario_id = ?"];
    const args: any[] = [usuarioId];

    if (from) {
      where.push("DATE(c.fecha) >= ?");
      args.push(from);
    }
    if (to) {
      where.push("DATE(c.fecha) <= ?");
      args.push(to);
    }
    if (servicioId) {
      where.push("sv.id = ?");
      args.push(asInt(servicioId));
    }
    if (q) {
      where.push("(cl.nombre LIKE ? OR cu.correo LIKE ? OR sv.nombre_servicio LIKE ?)");
      args.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    // ✅ Si quiere vista “solo activos” (operativa)
    if (!includeInactivos) {
      where.push("cl.activo = 1");
      where.push("cu.activa = 1");
      where.push("sv.activo = 1");
    }

    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        DATE_FORMAT(c.fecha, '%Y-%m-%d %H:%i:%s') AS fecha,
        c.monto,
        c.metodo,
        c.meses_pagados,
        c.boleta,
        c.nota,
        c.periodo_inicio,
        cl.nombre AS cliente_nombre,
        sv.nombre_servicio AS servicio,
        cu.correo AS cuenta_correo
      FROM cobros c
      JOIN suscripciones s
        ON s.id = c.suscripcion_id
       AND s.usuario_id = c.usuario_id
      JOIN clientes cl
        ON cl.id = s.cliente_id
       AND cl.usuario_id = s.usuario_id
      JOIN cuentas cu
        ON cu.id = s.cuenta_id
       AND cu.usuario_id = s.usuario_id
      JOIN servicios sv
        ON sv.id = cu.servicio_id
       AND sv.usuario_id = s.usuario_id
      WHERE ${where.join(" AND ")}
      ORDER BY c.id DESC
      `,
      args
    );

    return res.json({ items: rows });
  } catch (e: any) {
    return res.status(500).json({
      message: "ERROR_LISTANDO_COBROS",
      detail: e?.message,
    });
  }
});

/**
 * POST /cobros/lote
 * body: {
 *   suscripcionIds: number[],
 *   mesesPagados: number,
 *   metodo: "EFECTIVO"|"TRANSFERENCIA"|"OTRO",
 *   boleta?: string,
 *   nota?: string,
 *   comboId?: number
 * }
 *
 * ✅ Regla operativa:
 * - Solo se cobra si:
 *   - suscripción ACTIVA
 *   - cliente activo (cl.activo=1)
 *   - cuenta activa (cu.activa=1)
 *   - servicio activo (sv.activo=1)
 *
 * - Aplica Combo si se manda comboId (precio FIJO o % sobre suma)
 * - Aplica promo de meses gratis si el combo la trae
 * - Inserta 1 cobro por suscripción (auditoría) y actualiza proximo_cobro
 */
router.post("/lote", auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const usuarioId = getUserId(req);

    const suscripcionIdsRaw = req.body?.suscripcionIds;
    const mesesPagados = asInt(req.body?.mesesPagados);
    const metodo = String(req.body?.metodo ?? "EFECTIVO").trim().toUpperCase();
    const boleta = req.body?.boleta ? String(req.body.boleta).trim() : null;
    const nota = req.body?.nota ? String(req.body.nota).trim() : null;
    const comboId = req.body?.comboId ? asInt(req.body.comboId) : null;

    if (!Array.isArray(suscripcionIdsRaw) || suscripcionIdsRaw.length === 0) {
      return res.status(400).json({ message: "suscripcionIds requerido" });
    }

    const suscripcionIds = suscripcionIdsRaw
      .map(asInt)
      .filter((x: number) => Number.isFinite(x) && x > 0);

    if (suscripcionIds.length === 0)
      return res.status(400).json({ message: "suscripcionIds inválido" });

    if (!Number.isFinite(mesesPagados) || mesesPagados < 1 || mesesPagados > 12) {
      return res.status(400).json({ message: "mesesPagados inválido (1..12)" });
    }
    if (!["EFECTIVO", "TRANSFERENCIA", "OTRO"].includes(metodo)) {
      return res.status(400).json({ message: "metodo inválido" });
    }

    await conn.beginTransaction();

    // ✅ Traer suscripciones cobrables (lock) + servicio_id + precio_mensual + proximo_cobro
    const [subs]: any = await conn.query(
      `
      SELECT
        s.id,
        s.precio_mensual,
        s.proximo_cobro,
        s.estado,
        cu.servicio_id
      FROM suscripciones s
      JOIN cuentas cu
        ON cu.id = s.cuenta_id
       AND cu.usuario_id = s.usuario_id
      JOIN clientes cl
        ON cl.id = s.cliente_id
       AND cl.usuario_id = s.usuario_id
      JOIN servicios sv
        ON sv.id = cu.servicio_id
       AND sv.usuario_id = s.usuario_id
      WHERE s.usuario_id = ?
        AND s.estado = 'ACTIVA'
        AND cl.activo = 1
        AND cu.activa = 1
        AND sv.activo = 1
        AND s.id IN (${suscripcionIds.map(() => "?").join(",")})
      FOR UPDATE
      `,
      [usuarioId, ...suscripcionIds]
    );

    if (!subs || subs.length !== suscripcionIds.length) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Una o más suscripciones no están cobrables (cliente/cuenta/servicio inactivo o suscripción no activa)",
      });
    }

    const sumMensual = subs.reduce(
      (acc: number, s: any) => acc + Number(s.precio_mensual || 0),
      0
    );

    // 2) Si hay combo, validarlo y calcular pricing + promo
    let montoTotal = sumMensual * mesesPagados;
    let mesesGratis = 0;

    if (comboId) {
      const [[combo]]: any = await conn.query(
        `
        SELECT
          id, tipo, estado,
          pricing_modo, pricing_valor,
          promo_paga_meses, promo_regala_meses, promo_acumulable
        FROM combos
        WHERE id = ? AND usuario_id = ? AND estado = 'ACTIVO'
        LIMIT 1
        `,
        [comboId, usuarioId]
      );

      if (!combo) {
        await conn.rollback();
        return res.status(400).json({ message: "Combo inválido o inactivo" });
      }

      // validar que todas las suscripciones pertenezcan a servicios del combo
      const servicioIds = Array.from(
        new Set(subs.map((s: any) => Number(s.servicio_id)))
      );

      const [rowsServ]: any = await conn.query(
        `
        SELECT cs.servicio_id
        FROM combo_servicios cs
        WHERE cs.combo_id = ? AND cs.usuario_id = ?
        `,
        [comboId, usuarioId]
      );

      const allowed = new Set((rowsServ || []).map((r: any) => Number(r.servicio_id)));

      const ok = servicioIds.every((sid) => allowed.has(sid));
      if (!ok) {
        await conn.rollback();
        return res
          .status(400)
          .json({ message: "El combo no aplica a uno o más servicios seleccionados" });
      }

      // pricing bundle (% o fijo) sobre la suma mensual
      const modo = String(combo.pricing_modo || "FIJO").toUpperCase();
      const val = asNum(combo.pricing_valor);

      if (modo === "FIJO") {
        if (!Number.isFinite(val) || val <= 0) {
          await conn.rollback();
          return res.status(400).json({ message: "Combo con pricing_valor inválido" });
        }
        montoTotal = val * mesesPagados;
      } else if (modo === "PORCENTAJE") {
        if (!Number.isFinite(val) || val <= 0 || val >= 100) {
          await conn.rollback();
          return res.status(400).json({ message: "Combo con porcentaje inválido" });
        }
        montoTotal = sumMensual * (1 - val / 100) * mesesPagados;
      }

      // promo meses gratis (si aplica)
      const paga = asInt(combo.promo_paga_meses);
      const regala = asInt(combo.promo_regala_meses);
      const acumulable = asInt(combo.promo_acumulable);

      mesesGratis = calcMesesGratis(paga, regala, acumulable, mesesPagados);
    }

    // 3) Repartir montoTotal proporcional al precio_mensual (auditoría por suscripción)
    //    si sumMensual = 0, se reparte igual.
    const basePeso = sumMensual > 0 ? sumMensual : subs.length;

    // baseFecha por suscripción: si pago temprano -> desde proximo_cobro; si atrasado/null -> desde hoy
    // y se suma mesesPagados + mesesGratis
    const mesesEfectivos = mesesPagados + (mesesGratis || 0);

    const created: any[] = [];

    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];
      const peso = sumMensual > 0 ? Number(s.precio_mensual || 0) : 1;

      const montoItem =
        i === subs.length - 1
          ? Number(montoTotal) -
            created.reduce((acc, c) => acc + Number(c.monto || 0), 0) // ajustar centavos al final
          : Number((montoTotal * (peso / basePeso)).toFixed(2));

      const [[baseRow]]: any = await conn.query(
        `
        SELECT
          CASE
            WHEN proximo_cobro IS NULL THEN CURDATE()
            WHEN proximo_cobro < CURDATE() THEN CURDATE()
            ELSE proximo_cobro
          END AS base_fecha
        FROM suscripciones
        WHERE id = ? AND usuario_id = ?
        LIMIT 1
        `,
        [s.id, usuarioId]
      );

      const baseFecha = baseRow?.base_fecha;

      const [[per]]: any = await conn.query(
        `SELECT DATE_FORMAT(?, '%Y-%m') AS periodo_inicio`,
        [baseFecha]
      );

      const periodoInicio = per?.periodo_inicio || null;

      const [ins]: any = await conn.execute(
        `
        INSERT INTO cobros (
          usuario_id, suscripcion_id, fecha, monto, metodo, meses_pagados, boleta, nota, periodo_inicio
        )
        VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)
        `,
        [
          usuarioId,
          s.id,
          montoItem,
          metodo,
          mesesPagados, // meses pagados reales
          metodo === "TRANSFERENCIA" ? boleta : null,
          nota,
          periodoInicio,
        ]
      );

      await conn.execute(
        `
        UPDATE suscripciones
        SET
          proximo_cobro = DATE_ADD(?, INTERVAL ? MONTH),
          estado_cobro = 'AL_DIA'
        WHERE id = ? AND usuario_id = ?
        `,
        [baseFecha, mesesEfectivos, s.id, usuarioId]
      );

      created.push({ id: ins.insertId, suscripcionId: s.id, monto: montoItem });
    }

    await conn.commit();

    return res.status(201).json({
      ok: true,
      mesesPagados,
      mesesGratis,
      mesesEfectivos,
      montoTotal: Number(montoTotal.toFixed(2)),
      items: created,
    });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    return res.status(500).json({
      message: "ERROR_REGISTRANDO_COBRO_LOTE",
      detail: e?.message,
    });
  } finally {
    conn.release();
  }
});

/**
 * POST /cobros (single)
 * Se deja como está (para casos unitarios).
 * ✅ Pero igual validamos que sea cobrable (cliente/cuenta/servicio activos).
 */
router.post("/", auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const usuarioId = getUserId(req);

    const suscripcionId = asInt(req.body?.suscripcionId);
    const mesesPagados = asInt(req.body?.mesesPagados);
    const metodo = String(req.body?.metodo ?? "EFECTIVO").trim().toUpperCase();
    const boleta = req.body?.boleta ? String(req.body.boleta).trim() : null;
    const nota = req.body?.nota ? String(req.body.nota).trim() : null;

    if (!Number.isFinite(suscripcionId) || suscripcionId <= 0) {
      return res.status(400).json({ message: "suscripcionId inválido" });
    }
    if (!Number.isFinite(mesesPagados) || mesesPagados < 1 || mesesPagados > 12) {
      return res.status(400).json({ message: "mesesPagados inválido (1..12)" });
    }
    if (!["EFECTIVO", "TRANSFERENCIA", "OTRO"].includes(metodo)) {
      return res.status(400).json({ message: "metodo inválido" });
    }

    await conn.beginTransaction();

    const [[s]]: any = await conn.query(
      `
      SELECT
        s.id,
        s.precio_mensual,
        s.proximo_cobro,
        s.estado
      FROM suscripciones s
      JOIN clientes cl
        ON cl.id = s.cliente_id
       AND cl.usuario_id = s.usuario_id
      JOIN cuentas cu
        ON cu.id = s.cuenta_id
       AND cu.usuario_id = s.usuario_id
      JOIN servicios sv
        ON sv.id = cu.servicio_id
       AND sv.usuario_id = s.usuario_id
      WHERE s.id = ?
        AND s.usuario_id = ?
        AND s.estado = 'ACTIVA'
        AND cl.activo = 1
        AND cu.activa = 1
        AND sv.activo = 1
      LIMIT 1
      FOR UPDATE
      `,
      [suscripcionId, usuarioId]
    );

    if (!s) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Suscripción no cobrable (cliente/cuenta/servicio inactivo o suscripción no activa)",
      });
    }

    const precio = Number(s.precio_mensual || 0);
    const monto = precio * mesesPagados;

    const [[baseRow]]: any = await conn.query(
      `
      SELECT
        CASE
          WHEN proximo_cobro IS NULL THEN CURDATE()
          WHEN proximo_cobro < CURDATE() THEN CURDATE()
          ELSE proximo_cobro
        END AS base_fecha
      FROM suscripciones
      WHERE id = ? AND usuario_id = ?
      LIMIT 1
      `,
      [suscripcionId, usuarioId]
    );

    const baseFecha = baseRow?.base_fecha;

    const [[per]]: any = await conn.query(
      `SELECT DATE_FORMAT(?, '%Y-%m') AS periodo_inicio`,
      [baseFecha]
    );

    const periodoInicio = per?.periodo_inicio || null;

    const [ins]: any = await conn.execute(
      `
      INSERT INTO cobros (
        usuario_id, suscripcion_id, fecha, monto, metodo, meses_pagados, boleta, nota, periodo_inicio
      )
      VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)
      `,
      [
        usuarioId,
        suscripcionId,
        monto,
        metodo,
        mesesPagados,
        metodo === "TRANSFERENCIA" ? boleta : null,
        nota,
        periodoInicio,
      ]
    );

    await conn.execute(
      `
      UPDATE suscripciones
      SET
        proximo_cobro = DATE_ADD(?, INTERVAL ? MONTH),
        estado_cobro = 'AL_DIA'
      WHERE id = ? AND usuario_id = ?
      `,
      [baseFecha, mesesPagados, suscripcionId, usuarioId]
    );

    await conn.commit();

    return res.status(201).json({ ok: true, id: ins.insertId, monto });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    return res.status(500).json({
      message: "ERROR_REGISTRANDO_COBRO",
      detail: e?.message,
    });
  } finally {
    conn.release();
  }
});

export default router;
