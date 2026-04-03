import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearToken } from "../auth/auth.store";
import { useMe } from "../auth/useMe";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import "../styles/AppShell.css";

export default function AppShell() {
  const { me } = useMe();
  const nav = useNavigate();
  const loc = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const onLogout = () => {
    clearToken();
    nav("/login", { replace: true });
  };

  // Cierra menú al cambiar de ruta (móvil)
  useEffect(() => {
    setMenuOpen(false);
  }, [loc.pathname]);

  // ESC para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`app ${menuOpen ? "menuOpen" : ""} ${collapsed ? "sidebarCollapsed" : ""}`}>
      <div className="bg" aria-hidden />

      {/* Overlay móvil */}
      <button className="menuOverlay" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />

      {/* Sidebar (desktop fijo / móvil drawer) */}
      <aside className="sidebarShell" aria-label="Menú lateral">
        <Sidebar pathname={loc.pathname} collapsed={collapsed} onToggleCollapse={() => setCollapsed(v => !v)} />
      </aside>

      <div className="main">
        {/* Top sticky wrapper (NO tocar Topbar.tsx) */}
        <div className="topbarSticky">
          <div className="topbarRow">
            {/* Botón hamburguesa SOLO en móvil */}
            <button
              className="menuBtn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuOpen}
            >
              <span />
              <span />
              <span />
            </button>

            <div className="topbarGrow">
              <Topbar me={me} onLogout={onLogout} />
            </div>
          </div>
        </div>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
