import { Routes, Route, Navigate } from "react-router-dom";
import PrivateRoute from "./auth/PrivateRoute";
import AppShell from "./layouts/AppShell";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ServiciosPage from "./pages/ServiciosPage";
import CuentasPage from "./pages/CuentasPage";
import ClientesPage from "./pages/ClientesPage";
import CombosPage from "./pages/CombosPage";
import CobranzaPage from "./pages/CobranzaPage";
import HistorialCobrosPage from "./pages/HistorialCobrosPage";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      {/* Público */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protegido */}
      <Route element={<PrivateRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/servicios" element={<ServiciosPage />} />
          <Route path="/cuentas" element={<CuentasPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/combos" element={<CombosPage />} />

          {/* Operación */}
          <Route path="/cobranza" element={<CobranzaPage />} />

          {/* Auditoría */}
          <Route path="/historial-cobros" element={<HistorialCobrosPage />} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
