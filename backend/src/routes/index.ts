import { Router } from "express";

import authRoutes from "./auth.routes";
import clientesRoutes from "./clientes.routes";
import cobrosRoutes from "./cobros.routes";
import combosRoutes from "./combos.routes";
import cuentasRoutes from "./cuentas.routes";
import dashboardRoutes from "./dashboard.routes";
import serviciosRoutes from "./servicios.routes";
import suscripcionesRoutes from "./suscripciones.routes";
import { auth } from "../middlewares/auth";
import { triggerDailyReportNow } from "../services/cron.service";

const router = Router();

// opcional, pero útil
router.get("/", (_req, res) => {
  res.json({ ok: true, message: "API SubsManager v2 funcionando" });
});

// ✅ Disparar reporte diario manualmente (útil para probar)
router.post("/admin/test-email", auth, async (_req, res) => {
  try {
    await triggerDailyReportNow();
    res.json({ ok: true, message: "Reporte enviado — revisa tu correo" });
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Error enviando reporte" });
  }
});

// ✅ Mantener exactamente las rutas actuales (SIN /api)
router.use("/auth", authRoutes);
router.use("/clientes", clientesRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/servicios", serviciosRoutes);
router.use("/cuentas", cuentasRoutes);
router.use("/suscripciones", suscripcionesRoutes);
router.use("/cobros", cobrosRoutes);
router.use("/cobranza", cobrosRoutes);
router.use("/combos", combosRoutes);

export default router;
