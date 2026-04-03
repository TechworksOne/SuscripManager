import { Router } from "express";
import { pool } from "../db";
import { auth } from "../middlewares/auth";

const router = Router();

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}

function computeNextDueFromToday(diaPago: number) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const today = now.getDate();

  // si hoy ya pasó el día de pago => próximo mes
  let targetYear = year;
  let targetMonth = month;

  if (today > diaPago) {
    targetMonth = month + 1;
    if (targetMonth === 13) {
      targetMonth = 1;
      targetYear = year + 1;
    }
  }

  const dim = daysInMonth(targetYear, targetMonth);
  const day = Math.min(diaPago, dim);

  const dt = new Date(targetYear, targetMonth - 1, day);
  return ymd(dt);
}

async function getCuentaForUser(usuarioId: number, id: number) {
  const [rows] = await pool.query(
    `
    SELECT
      c.id,
      c.usuario_id,
      c.dia_pago,
      DATE_FORMAT(c.proximo_pago, '%Y-%m-%d') AS proximo_pago
    FROM cuentas c
    WHERE c.id = ? AND c.usuario_id = ?
    LIMIT 1
    `,
    [id, usuarioId]
  );

  const arr = rows as any[];
  return arr.length ? arr[0] : null;
}

/**
 * GET /cuentas?activo=1|0
 * ✅ cupo_ocupado calculado en tiempo real desde suscripciones ACTIVA/PAUSADA
 * ✅ SOLO CUENTA si el cliente está ACTIVO (clientes.activo = 1)
 */
router.get("/", auth, async (req: any, res) => {
  const usuarioId = req.user.id;
  const activoQ = req.query.activo;

  const params: any[] = [usuarioId];
  let where = "WHERE c.usuario_id = ?";

  if (activoQ === "1" || activoQ === "0") {
    where += " AND c.activa = ?";
    params.push(Number(activoQ));
  }

  const [rows] = await pool.query(
    `
    SELECT
      c.id,
      c.servicio_id,
      s.nombre_servicio,
      c.correo,
      c.password_correo,
      c.password_app,
      c.cupo_total,

      -- ✅ OCUPADO REAL (solo clientes activos)
      COALESCE(occ.ocupado, 0) AS cupo_ocupado,

      -- opcional: bandera lista para UI
      CASE
        WHEN COALESCE(occ.ocupado, 0) < COALESCE(c.cupo_total, 0) THEN 1
        ELSE 0
      END AS cupo_disponible,

      c.activa,
      c.notas,

      c.tarjeta_nombre,
      c.tarjeta_last4,
      c.dia_pago,
      DATE_FORMAT(c.proximo_pago, '%Y-%m-%d') AS proximo_pago,

      c.created_at,
      c.updated_at
    FROM cuentas c
    INNER JOIN servicios s ON s.id = c.servicio_id

    -- ✅ tabla derivada: ocupación por cuenta (ACTIVA/PAUSADA) + cliente ACTIVO
    LEFT JOIN (
      SELECT
        s.cuenta_id,
        COUNT(*) AS ocupado
      FROM suscripciones s
      INNER JOIN clientes cl ON cl.id = s.cliente_id AND cl.activo = 1
      WHERE s.estado IN ('ACTIVA', 'PAUSADA')
      GROUP BY s.cuenta_id
    ) occ ON occ.cuenta_id = c.id

    ${where}
    ORDER BY c.id DESC
    `,
    params
  );

  res.json({ items: rows });
});

/**
 * POST /cuentas
 */
router.post("/", auth, async (req: any, res) => {
  const usuarioId = req.user.id;

  const {
    servicio_id,
    correo,
    password_correo,
    password_app,
    cupo_total,
    notas,

    tarjeta_nombre,
    tarjeta_last4,
    dia_pago,
  } = req.body || {};

  if (!servicio_id || !correo || !password_correo) {
    return res
      .status(400)
      .json({ message: "servicio_id, correo y password_correo son requeridos" });
  }

  const cupo = Number(cupo_total ?? 1);
  if (!Number.isFinite(cupo) || cupo < 1 || cupo > 50) {
    return res.status(400).json({ message: "cupo_total inválido" });
  }

  const dia =
    dia_pago === null || dia_pago === undefined || dia_pago === ""
      ? null
      : Number(dia_pago);
  if (dia !== null) {
    if (!Number.isFinite(dia) || dia < 1 || dia > 31)
      return res.status(400).json({ message: "dia_pago inválido" });
  }

  const last4 = tarjeta_last4 ? String(tarjeta_last4) : null;
  if (last4 !== null) {
    const cleaned = last4.replace(/\D/g, "");
    if (cleaned.length !== 4)
      return res.status(400).json({ message: "tarjeta_last4 debe tener 4 dígitos" });
  }

  // Validar servicio pertenece al usuario
  const [serv] = await pool.query(
    `SELECT id FROM servicios WHERE id = ? AND usuario_id = ? LIMIT 1`,
    [Number(servicio_id), usuarioId]
  );
  if (!serv || (Array.isArray(serv) && serv.length === 0)) {
    return res.status(400).json({ message: "Servicio inválido o no pertenece a su usuario" });
  }

  // proximo_pago inicial (si hay dia_pago)
  const proximoPago = dia ? computeNextDueFromToday(dia) : null;

  try {
    const [result] = await pool.query(
      `
      INSERT INTO cuentas
        (usuario_id, servicio_id, correo, password_correo, password_app, cupo_total, cupo_ocupado, activa, notas,
         tarjeta_nombre, tarjeta_last4, dia_pago, proximo_pago)
      VALUES
        (?, ?, ?, ?, ?, ?, 0, 1, ?,
         ?, ?, ?, ?)
      `,
      [
        usuarioId,
        Number(servicio_id),
        String(correo).trim(),
        String(password_correo),
        password_app ? String(password_app) : null,
        cupo,
        notas ? String(notas) : null,

        tarjeta_nombre ? String(tarjeta_nombre).trim() : null,
        last4 ? last4.replace(/\D/g, "") : null,
        dia,
        proximoPago,
      ]
    );

    // @ts-ignore
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err: any) {
    if (err?.code === "ER_DUP_ENTRY" || err?.errno === 1062) {
      const [rows] = await pool.query(
        `
        SELECT id
        FROM cuentas
        WHERE usuario_id = ? AND servicio_id = ? AND correo = ?
        LIMIT 1
        `,
        [usuarioId, Number(servicio_id), String(correo).trim()]
      );

      const existingId = Array.isArray(rows) && rows.length ? (rows as any)[0].id : null;

      return res.status(409).json({
        message: "Ya existe una cuenta con ese correo para este servicio.",
        reason: "DUPLICATE_CUENTA",
        existingId,
      });
    }

    console.error(err);
    return res.status(500).json({ message: "Error creando cuenta" });
  }
});

/**
 * PUT /cuentas/:id
 */
router.put("/:id", auth, async (req: any, res) => {
  const usuarioId = req.user.id;
  const id = Number(req.params.id);

  const {
    servicio_id,
    correo,
    password_correo,
    password_app,
    cupo_total,
    notas,

    tarjeta_nombre,
    tarjeta_last4,
    dia_pago,
  } = req.body || {};

  if (!Number.isFinite(id)) return res.status(400).json({ message: "ID inválido" });

  const cupo = Number(cupo_total ?? 1);
  if (!Number.isFinite(cupo) || cupo < 1 || cupo > 50) {
    return res.status(400).json({ message: "cupo_total inválido" });
  }

  const dia =
    dia_pago === null || dia_pago === undefined || dia_pago === ""
      ? null
      : Number(dia_pago);
  if (dia !== null) {
    if (!Number.isFinite(dia) || dia < 1 || dia > 31)
      return res.status(400).json({ message: "dia_pago inválido" });
  }

  const last4 = tarjeta_last4 ? String(tarjeta_last4) : null;
  if (last4 !== null) {
    const cleaned = last4.replace(/\D/g, "");
    if (cleaned.length !== 4)
      return res.status(400).json({ message: "tarjeta_last4 debe tener 4 dígitos" });
  }

  // Si cambió dia_pago, recalculamos proximo_pago solo si estaba vacío o si ya venció.
  const current = await getCuentaForUser(usuarioId, id);
  if (!current) return res.status(404).json({ message: "Cuenta no encontrada" });

  const today = ymd(new Date());
  const currentProximo = current.proximo_pago ? String(current.proximo_pago) : null;

  let proximoPago: string | null = currentProximo;

  if (dia) {
    const needsRefresh = !currentProximo || currentProximo <= today;
    if (needsRefresh) proximoPago = computeNextDueFromToday(dia);
  } else {
    proximoPago = null;
  }

  try {
    await pool.query(
      `
      UPDATE cuentas
      SET
        servicio_id = ?,
        correo = ?,
        password_correo = ?,
        password_app = ?,
        cupo_total = ?,
        notas = ?,

        tarjeta_nombre = ?,
        tarjeta_last4 = ?,
        dia_pago = ?,
        proximo_pago = ?
      WHERE id = ? AND usuario_id = ?
      `,
      [
        Number(servicio_id),
        String(correo).trim(),
        String(password_correo),
        password_app ? String(password_app) : null,
        cupo,
        notas ? String(notas) : null,

        tarjeta_nombre ? String(tarjeta_nombre).trim() : null,
        last4 ? last4.replace(/\D/g, "") : null,
        dia,
        proximoPago,

        id,
        usuarioId,
      ]
    );

    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "ER_DUP_ENTRY" || err?.errno === 1062) {
      const [rows] = await pool.query(
        `
        SELECT id
        FROM cuentas
        WHERE usuario_id = ? AND servicio_id = ? AND correo = ? AND id <> ?
        LIMIT 1
        `,
        [usuarioId, Number(servicio_id), String(correo).trim(), id]
      );

      const conflictId = Array.isArray(rows) && rows.length ? (rows as any)[0].id : null;

      return res.status(409).json({
        message: "Ya existe otra cuenta con ese correo para este servicio.",
        reason: "DUPLICATE_CUENTA",
        conflictId,
      });
    }

    console.error(err);
    return res.status(500).json({ message: "Error actualizando cuenta" });
  }
});

/**
 * PATCH /cuentas/:id/activa
 */
router.patch("/:id/activa", auth, async (req: any, res) => {
  const usuarioId = req.user.id;
  const id = Number(req.params.id);
  const activa = !!req.body?.activa;

  if (!Number.isFinite(id)) return res.status(400).json({ message: "ID inválido" });

  await pool.query(`UPDATE cuentas SET activa = ? WHERE id = ? AND usuario_id = ?`, [
    activa ? 1 : 0,
    id,
    usuarioId,
  ]);

  res.json({ ok: true, activa: activa ? 1 : 0 });
});

/**
 * POST /cuentas/:id/pagado
 */
router.post("/:id/pagado", auth, async (req: any, res) => {
  const usuarioId = req.user.id;
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) return res.status(400).json({ message: "ID inválido" });

  const c = await getCuentaForUser(usuarioId, id);
  if (!c) return res.status(404).json({ message: "Cuenta no encontrada" });

  const dia = c.dia_pago ? Number(c.dia_pago) : null;
  if (!dia) return res.status(400).json({ message: "Configure dia_pago primero" });

  const today = ymd(new Date());
  const proximo = c.proximo_pago ? String(c.proximo_pago) : null;

  const todayDay = new Date().getDate();
  const pendiente = (proximo && proximo <= today) || (!proximo && dia === todayDay);

  if (!pendiente) {
    return res.status(409).json({ message: "La cuenta está al día. No se puede marcar pagado." });
  }

  const nuevoProximo = computeNextDueFromToday(dia);

  await pool.query(
    `
    UPDATE cuentas
    SET proximo_pago = ?
    WHERE id = ? AND usuario_id = ?
    `,
    [nuevoProximo, id, usuarioId]
  );

  return res.json({ ok: true, proximo_pago: nuevoProximo });
});

export default router;
