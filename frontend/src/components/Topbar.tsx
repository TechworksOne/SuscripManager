import { useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import type { Me } from "../auth/auth.store";

const ROUTE_META: Record<string, { title: string; sub: string }> = {
  "/dashboard":       { title: "Dashboard",          sub: "Resumen operacional en tiempo real"         },
  "/servicios":       { title: "Servicios",           sub: "Gestión de servicios de streaming"          },
  "/cuentas":         { title: "Cuentas",             sub: "Cuentas y credenciales por servicio"        },
  "/clientes":        { title: "Clientes",            sub: "Base de clientes registrados"               },
  "/cobranza":        { title: "Cobranza",            sub: "Gestión y registro de cobros pendientes"    },
  "/historial-cobros":{ title: "Historial de cobros", sub: "Auditoría completa de pagos registrados"    },
};

export default function Topbar({ me, onLogout }: { me: Me | null; onLogout: () => void }) {
  const { pathname } = useLocation();
  const meta = ROUTE_META[pathname] ?? { title: "SubsManager", sub: "Panel de administración" };

  const initials = me?.nombre
    ? me.nombre.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "?";

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-xl shadow-lg shadow-black/10">
      {/* Left — page identity */}
      <div className="min-w-0 flex flex-col gap-0.5">
        <h2 className="text-[15px] font-bold tracking-tight text-white/85 leading-none m-0">{meta.title}</h2>
        <p className="text-[12px] text-white/28 leading-none m-0 truncate max-w-[55vw]">{meta.sub}</p>
      </div>

      {/* Right — actions + avatar */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Avatar + name */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/20">
            <span className="text-white text-[10px] font-extrabold leading-none select-none">{initials}</span>
          </div>
          {me && (
            <div className="hidden sm:flex flex-col gap-0.5 min-w-0">
              <span className="text-[12px] font-semibold text-white/65 leading-none truncate max-w-[140px]">{me.nombre}</span>
              <span className="text-[10px] text-white/25 leading-none truncate max-w-[140px]">{me.email}</span>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="w-8 h-8 flex items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/28 hover:bg-red-500/[0.08] hover:text-red-400/70 hover:border-red-500/[0.15] transition-all duration-150 cursor-pointer"
        >
          <LogOut size={13} strokeWidth={1.9} />
        </button>

      </div>
    </header>
  );
}
