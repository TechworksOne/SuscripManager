import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/http";
import { setToken } from "../auth/auth.store";
import "../styles/login.css";

type LoginResp = { token: string };

export default function LoginPage() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length > 0 && !loading;
  }, [email, password, loading]);

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
      <div className="auth-layout">
        {/* Panel marketing (solo desktop) */}
        <section className="promo" aria-hidden="true">
          <div className="promo-inner">
            <div className="promo-badge">
              <span>●</span>
              <span>Gestión de suscripciones</span>
            </div>

            <h2 className="promo-title">
              Administre sus clientes
              <br />y sus cuentas sin enredos.
            </h2>

            <p className="promo-sub">
              Registre servicios (Netflix, Spotify, etc.), asigne cuentas a clientes, controle cupos
              y cobros, y maneje promociones como “pague 3 meses y el 4to va gratis”.
            </p>

            <div className="promo-grid">
              <div className="promo-card">
                <b>Clientes y cuentas</b>
                <span>Asigne varias cuentas a un cliente y mantenga todo ordenado.</span>
              </div>

              <div className="promo-card">
                <b>Cobros claros</b>
                <span>Sepa quién pagó, quién debe y cuánto entra por mes.</span>
              </div>

              <div className="promo-card">
                <b>Promociones automáticas</b>
                <span>Configure combos y el sistema aplica meses gratis cuando corresponde.</span>
              </div>

              <div className="promo-card">
                <b>Datos privados</b>
                <span>Cada administrador ve únicamente su información.</span>
              </div>
            </div>
          </div>
        </section>

        {/* Card Login */}
        <form className="auth-card" onSubmit={onSubmit}>
          <div className="auth-head">
            <div className="brand">
              {/* ✅ Logo real */}
              <img
                src="/assets/brand/subsmanager-icon.png"
                alt="SubsManager"
                className="brandLogo"
                draggable={false}
              />

              <div>
                <h1>SubsManager</h1>
                <p>Acceso de administrador</p>
              </div>
            </div>
          </div>

          <div className="auth-body">
            <div className="field">
              <div className="label">Email</div>
              <div className="input-wrap">
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="admin@correo.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="field">
              <div className="label">Contraseña</div>
              <div className="input-wrap">
                <input
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  title={showPass ? "Ocultar" : "Mostrar"}
                >
                  {showPass ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M2.1 3.51 3.5 2.1 21.9 20.49 20.49 21.9l-2.25-2.25A11.1 11.1 0 0 1 12 21C6.6 21 2.2 17.9 0 12c.84-2.21 2.11-4.1 3.7-5.56L2.1 3.51ZM12 19c1.7 0 3.3-.44 4.68-1.23l-1.6-1.6A4.99 4.99 0 0 1 7.83 8.92L6.33 7.42A9.16 9.16 0 0 0 2.2 12C3.99 16.38 7.7 19 12 19Zm0-14c5.4 0 9.8 3.1 12 9a14.9 14.9 0 0 1-3.1 4.92l-1.45-1.45A12.66 12.66 0 0 0 21.8 14C20.01 9.62 16.3 7 12 7c-.87 0-1.72.1-2.53.3L8.04 5.87C9.29 5.3 10.61 5 12 5Zm0 4a3 3 0 0 1 3 3c0 .34-.06.67-.16.98l-3.82-3.82c.31-.1.64-.16.98-.16Zm-3 3a3 3 0 0 1 3-3c.34 0 .67.06.98.16L9.16 13c-.1-.31-.16-.64-.16-.98Z"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 5c5.4 0 9.8 3.1 12 9-2.2 5.9-6.6 9-12 9S2.2 18.9 0 14c2.2-5.9 6.6-9 12-9Zm0 16c4.3 0 8-2.62 9.8-7-1.8-4.38-5.5-7-9.8-7-4.3 0-8 2.62-9.8 7 1.8 4.38 5.5 7 9.8 7Zm0-12a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="row">
              <div className="helper">v0.1</div>
            </div>

            {error && <div className="error">{error}</div>}

            <button className="btn" type="submit" disabled={!canSubmit}>
              {loading && <span className="spinner" />}
              {loading ? "Validando..." : "Entrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
