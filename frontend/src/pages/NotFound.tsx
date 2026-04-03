import { Link, useLocation } from "react-router-dom";
import "../styles/not-found.css";

export default function NotFound() {
  const loc = useLocation();

  return (
    <div className="notFoundPage">
      <div className="card">
        <div className="glow" />

        <div className="head">
          <div className="code">404</div>
          <div className="titles">
            <h1>Ruta no encontrada</h1>
            <p>
              La URL solicitada no existe o cambió. Para mantener el flujo operativo, vuelva al dashboard
              o use un acceso rápido.
            </p>
          </div>
        </div>

        <div className="body">
          <div className="hintBox">
            <div className="hintTitle">Accesos rápidos</div>
            <div className="routes">
              <Link className="routeChip" to="/dashboard">📊 Dashboard</Link>
              <Link className="routeChip" to="/cobranza">💰 Cobranza</Link>
              <Link className="routeChip" to="/historial-cobros">🧾 Historial</Link>
            </div>
          </div>
        </div>

        <div className="foot">
          <div className="meta">
            <div><b>URL:</b> {loc.pathname}</div>
            <div><b>Tip:</b> si esto pasó por un link viejo, actualice el menú/ruta.</div>
          </div>

          <div className="btnRow">
            <Link className="btn" to="/">Ir al inicio</Link>
            <Link className="btn primary" to="/dashboard">Volver al dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
