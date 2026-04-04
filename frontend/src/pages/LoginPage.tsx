import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, Loader2, Users, DollarSign, Zap, ShieldCheck } from "lucide-react";
import { apiFetch } from "../api/http";
import { setToken } from "../auth/auth.store";
import "../styles/login.css";

type LoginResp = { token: string };

const FEATURES = [
  {
    icon: Users,
    title: "Clientes y cuentas",
    desc: "Asigne varias cuentas a un cliente y mantenga todo ordenado.",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10 border-indigo-500/20",
  },
  {
    icon: DollarSign,
    title: "Cobros claros",
    desc: "Sepa quién pagó, quién debe y cuánto entra por mes.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    icon: Zap,
    title: "Promociones automáticas",
    desc: "Configure combos y el sistema aplica meses gratis cuando corresponde.",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  {
    icon: ShieldCheck,
    title: "Datos privados",
    desc: "Cada administrador ve únicamente su información.",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
  },
];

export default function LoginPage() {
  const nav = useNavigate();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string>("");
  const [visible, setVisible]   = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(t);
  }, []);

  const canSubmit = useMemo(
    () => email.trim().length > 3 && password.length > 0 && !loading,
    [email, password, loading],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<LoginResp>("/auth/login", {
        method: "POST",
        // @ts-ignore
        skipAuth: true,
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      nav("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err?.message || "No fue posible iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      {/* Ambient light blobs */}
      <div className="auth-orb auth-orb-1" aria-hidden="true" />
      <div className="auth-orb auth-orb-2" aria-hidden="true" />

      {/* Main layout */}
      <div
        className={`auth-content grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 items-stretch transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
      >
        {/* Left panel: promo */}
        <section
          className="hidden lg:flex flex-col justify-between rounded-3xl border border-white/7 bg-white/2.5 backdrop-blur-xl overflow-hidden p-8"
          aria-hidden="true"
        >
          <div>
            {/* Status badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/65 text-[11px] font-medium mb-7">
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                style={{ boxShadow: "0 0 6px rgba(52,211,153,.75)" }}
              />
              Gestión de suscripciones en streaming
            </div>

            {/* Headline */}
            <h2 className="text-[2rem] font-bold leading-[1.1] tracking-tight text-white mb-3">
              Administre sus clientes
              <br />
              <span className="text-white/45">y sus cuentas sin enredos.</span>
            </h2>

            {/* Subtitle */}
            <p className="text-[13px] text-white/50 leading-relaxed mb-8 max-w-[50ch]">
              Registre servicios, asigne cuentas, controle cupos y cobros, y maneje
              promociones tipo "pague 3 meses y el 4to va gratis".
            </p>

            {/* Feature grid */}
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
                <div
                  key={title}
                  className="p-4 rounded-2xl border border-white/6 bg-white/3 hover:bg-white/5.5 transition-colors duration-200"
                >
                  <div className={`w-8 h-8 rounded-xl border flex items-center justify-center mb-3 ${bg}`}>
                    <Icon size={15} strokeWidth={1.9} className={color} />
                  </div>
                  <p className="text-[12.5px] font-semibold text-white/85 mb-1 leading-snug">{title}</p>
                  <p className="text-[11.5px] text-white/40 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Panel footer */}
          <div className="mt-8 pt-5 border-t border-white/6 flex items-center justify-between">
            <span className="text-[11px] text-white/25">SubsManager v0.1</span>
            <span className="text-[11px] text-white/25">Acceso seguro</span>
          </div>
        </section>

        {/* Right panel: login card */}
        <form
          className="flex flex-col rounded-3xl border border-white/10 bg-black/32 backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,.55)] overflow-hidden"
          onSubmit={onSubmit}
          noValidate
        >
          {/* Card header */}
          <div className="px-8 pt-8 pb-6 border-b border-white/7">
            {/* Brand row */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/12 bg-white/6 flex items-center justify-center">
                <img
                  src="/assets/brand/subsmanager-icon.png"
                  alt="SubsManager"
                  className="w-full h-full object-cover"
                  style={{ transform: "scale(1.85)", transformOrigin: "center" }}
                  draggable={false}
                />
              </div>
              <div>
                <p className="text-[14px] font-bold text-white tracking-tight leading-none">SubsManager</p>
                <p className="text-[11px] text-white/40 mt-0.75">Acceso de administrador</p>
              </div>
            </div>

            {/* Welcome text */}
            <h1 className="text-[22px] font-bold text-white tracking-tight leading-tight">
              Bienvenido de nuevo
            </h1>
            <p className="text-[13px] text-white/45 mt-1.5">Ingrese sus credenciales para continuar</p>
          </div>

          {/* Card body */}
          <div className="px-8 pt-7 pb-8 flex flex-col gap-5 flex-1">

            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">
                Correo electrónico
              </label>
              <div className={`input-focus-wrap flex items-center rounded-xl border transition-all duration-200 ${error ? "border-red-500/40 bg-red-500/6" : "border-white/10 bg-white/5"}`}>
                <span className="pl-3.5 text-white/30 shrink-0">
                  <Mail size={14} strokeWidth={1.8} />
                </span>
                <input
                  className="w-full px-3 py-3.5 bg-transparent border-0 outline-none text-white/90 text-[14px]"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
                  type="email"
                  placeholder="admin@correo.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">
                Contraseña
              </label>
              <div className={`input-focus-wrap flex items-center rounded-xl border transition-all duration-200 ${error ? "border-red-500/40 bg-red-500/6" : "border-white/10 bg-white/5"}`}>
                <span className="pl-3.5 text-white/30 shrink-0">
                  <Lock size={14} strokeWidth={1.8} />
                </span>
                <input
                  className="w-full px-3 py-3.5 bg-transparent border-0 outline-none text-white/90 text-[14px]"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
                  type={showPass ? "text" : "password"}
                  placeholder="········"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="pr-3.5 pl-2 text-white/30 hover:text-white/65 transition-colors duration-150 shrink-0"
                  aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPass ? <EyeOff size={14} strokeWidth={1.8} /> : <Eye size={14} strokeWidth={1.8} />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="login-error-in flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-red-500/25 bg-red-500/8 text-red-300 text-[13px] leading-relaxed">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" className="mt-px text-red-400 shrink-0" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-premium mt-1 w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl font-semibold text-[14.5px] text-white transition-all duration-200"
            >
              {loading && <Loader2 size={15} strokeWidth={2.5} className="animate-spin" />}
              <span>{loading ? "Entrando…" : "Entrar al sistema"}</span>
            </button>

            {/* Footer note */}
            <p className="text-center text-[11px] text-white/20 pt-1">
              Plataforma privada · Solo acceso autorizado
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
