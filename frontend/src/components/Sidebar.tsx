import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Layers,
  CreditCard,
  Users,
  Package,
  Wallet,
  History,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import "../styles/sidebar.css";
import { setToken } from "../auth/auth.store";

type LucideIcon = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
}>;

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  accent: string;
}

const NAV: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard,
    accent: "#e2e8f0",
  },
  {
    to: "/servicios",
    label: "Servicios",
    Icon: Layers,
    accent: "#60a5fa",
  },
  {
    to: "/cuentas",
    label: "Cuentas",
    Icon: CreditCard,
    accent: "#22d3ee",
  },
  {
    to: "/clientes",
    label: "Clientes",
    Icon: Users,
    accent: "#a78bfa",
  },
  {
    to: "/cobranza",
    label: "Cobranza",
    Icon: Wallet,
    accent: "#fbbf24",
  },
  {
    to: "/combos",
    label: "Combos",
    Icon: Package,
    accent: "#34d399",
  },
  {
    to: "/historial-cobros",
    label: "Historial de cobros",
    Icon: History,
    accent: "#94a3b8",
  },
];

interface Props {
  pathname: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const nav = useNavigate();

  function handleLogout() {
    setToken("");
    try {
      localStorage.removeItem("token");
    } catch {}
    nav("/login", { replace: true });
  }

  return (
    <aside className="h-screen w-full flex flex-col overflow-hidden bg-[#07091280] backdrop-blur-2xl border-r border-white/[0.05]">
      {/* ── Brand ── */}
      <div
        className={[
          "flex items-center gap-3 py-[18px] border-b border-white/[0.05]",
          "transition-all duration-300",
          collapsed ? "px-[14px] justify-center" : "px-4",
        ].join(" ")}
      >
        {/* Logo mark */}
        <div className="flex-shrink-0 w-9 h-9 rounded-[10px] bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
          <span className="text-white font-extrabold text-[13px] select-none leading-none">
            S
          </span>
        </div>

        {/* Brand text */}
        {!collapsed && (
          <div className="overflow-hidden leading-tight">
            <p className="text-white font-semibold text-[14px] tracking-tight leading-snug m-0">
              SubsManager
            </p>
            <p className="text-white/30 text-[11px] m-0">
              Panel administrador
            </p>
          </div>
        )}
      </div>

      {/* ── Section label ── */}
      {!collapsed && (
        <p className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/20 select-none m-0">
          Navegación
        </p>
      )}
      {collapsed && <div className="pt-3" />}

      {/* ── Nav items ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-[2px] pb-2">
        {NAV.map(({ to, label, Icon, accent }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            style={{ "--accent": accent } as React.CSSProperties}
            className={({ isActive }) =>
              [
                "sbi",
                "flex items-center gap-[10px] w-full px-3 py-[9px] rounded-xl",
                "text-[13px] font-medium leading-none",
                "border border-transparent",
                "no-underline",
                "transition-colors duration-150",
                isActive ? "active" : "",
                collapsed ? "justify-center px-[10px]" : "",
              ]
                .filter(Boolean)
                .join(" ")
            }
          >
            <span className="sbi-icon flex-shrink-0 flex items-center justify-center">
              <Icon size={17} strokeWidth={1.8} />
            </span>
            {!collapsed && (
              <span className="truncate">{label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Divider ── */}
      <div className="mx-2 h-px bg-white/[0.05]" />

      {/* ── Footer ── */}
      <div className="px-2 pt-2 pb-3 flex flex-col gap-[2px]">
        {/* Collapse button — only desktop */}
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          className={[
            "hidden md:flex items-center gap-[10px] w-full px-3 py-[9px] rounded-xl",
            "text-[13px] font-medium text-white/25",
            "border border-transparent",
            "hover:bg-white/[0.04] hover:text-white/55 hover:border-white/[0.07]",
            "transition-all duration-150 cursor-pointer",
            collapsed ? "justify-center px-[10px]" : "",
          ].join(" ")}
        >
          {collapsed ? (
            <ChevronRight size={15} strokeWidth={2} />
          ) : (
            <>
              <ChevronLeft size={15} strokeWidth={2} />
              <span>Contraer</span>
            </>
          )}
        </button>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Cerrar sesión" : undefined}
          className={[
            "flex items-center gap-[10px] w-full px-3 py-[9px] rounded-xl",
            "text-[13px] font-medium text-white/25",
            "border border-transparent",
            "hover:bg-red-500/[0.08] hover:text-red-400/80 hover:border-red-500/[0.15]",
            "transition-all duration-150 cursor-pointer",
            collapsed ? "justify-center px-[10px]" : "",
          ].join(" ")}
        >
          <LogOut size={15} strokeWidth={1.75} />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}
