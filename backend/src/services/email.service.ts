import nodemailer from "nodemailer";

export interface PendingRow {
  cliente_nombre: string;
  servicio: string;
  cuenta_correo: string;
  precio_mensual: number;
  atraso_dias: number;
  proximo_cobro: string | null;
}

function money(n: number) {
  return Number(n ?? 0).toLocaleString("es-GT", {
    style: "currency",
    currency: "GTQ",
  });
}

function atrasoLabel(dias: number): string {
  if (dias > 0) return `${dias}d atrasado`;
  if (dias === 0) return "Vence hoy";
  return `En ${Math.abs(dias)}d`;
}

function atrasoColor(dias: number): string {
  if (dias > 7) return "#ef4444";   // rojo
  if (dias > 0) return "#f59e0b";   // ámbar
  if (dias === 0) return "#3b82f6"; // azul
  return "#10b981";                 // verde
}

function buildHtml(
  adminNombre: string,
  adminEmail: string,
  fecha: string,
  rows: PendingRow[]
): string {
  const totalMRR = rows.reduce((a, r) => a + Number(r.precio_mensual ?? 0), 0);
  const atrasados = rows.filter((r) => Number(r.atraso_dias) > 0).length;
  const vencenHoy = rows.filter((r) => Number(r.atraso_dias) === 0).length;

  const filas = rows
    .map((r) => {
      const dias = Number(r.atraso_dias ?? 0);
      const color = atrasoColor(dias);
      const label = atrasoLabel(dias);
      return `
        <tr style="border-bottom:1px solid #1e2d3d;">
          <td style="padding:10px 14px;font-size:13px;color:#e2e8f0;">${r.cliente_nombre}</td>
          <td style="padding:10px 14px;font-size:13px;color:#94a3b8;">${r.servicio}</td>
          <td style="padding:10px 14px;font-size:12px;color:#64748b;">${r.cuenta_correo}</td>
          <td style="padding:10px 14px;font-size:13px;color:#34d399;font-weight:700;text-align:right;">${money(r.precio_mensual)}</td>
          <td style="padding:10px 14px;text-align:center;">
            <span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${color}22;color:${color};border:1px solid ${color}55;">
              ${label}
            </span>
          </td>
        </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#070b14;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="margin-bottom:28px;">
      <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:16px;">
        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;">
          <span style="color:#fff;font-weight:900;font-size:14px;">S</span>
        </div>
        <span style="color:#e2e8f0;font-weight:800;font-size:16px;">SubsManager</span>
      </div>
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:900;color:#f8fafc;">
        Resumen de cobros — ${fecha}
      </h1>
      <p style="margin:0;font-size:13px;color:#64748b;">
        Hola ${adminNombre}, estos son los servicios pendientes de cobro para hoy.
      </p>
    </div>

    <!-- KPIs -->
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
      <div style="flex:1;min-width:140px;padding:14px 16px;border-radius:14px;border:1px solid #1e2d3d;background:#0d1829;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Total pendientes</div>
        <div style="font-size:26px;font-weight:900;color:#f8fafc;">${rows.length}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">servicios por cobrar</div>
      </div>
      <div style="flex:1;min-width:140px;padding:14px 16px;border-radius:14px;border:1px solid #14402a;background:#0a2018;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">MRR total</div>
        <div style="font-size:26px;font-weight:900;color:#34d399;">${money(totalMRR)}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">ingresos recurrentes</div>
      </div>
      <div style="flex:1;min-width:140px;padding:14px 16px;border-radius:14px;border:1px solid ${atrasados > 0 ? "#7f1d1d" : "#1e2d3d"};background:${atrasados > 0 ? "#1a0a0a" : "#0d1829"};">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Atrasados</div>
        <div style="font-size:26px;font-weight:900;color:${atrasados > 0 ? "#f87171" : "#64748b"};">${atrasados}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">prioridad alta</div>
      </div>
      <div style="flex:1;min-width:140px;padding:14px 16px;border-radius:14px;border:1px solid #1e3a5f;background:#0a1829;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Vencen hoy</div>
        <div style="font-size:26px;font-weight:900;color:#60a5fa;">${vencenHoy}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">cobrar ahora</div>
      </div>
    </div>

    <!-- Table -->
    ${
      rows.length === 0
        ? `<div style="padding:32px;text-align:center;border-radius:14px;border:1px solid #1e2d3d;background:#0d1829;color:#64748b;font-size:13px;">
             Sin pendientes por cobrar hoy. ¡Todo al día!
           </div>`
        : `
    <div style="border-radius:14px;border:1px solid #1e2d3d;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#0d1829;border-bottom:1px solid #1e2d3d;">
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#475569;">Cliente</th>
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#475569;">Servicio</th>
            <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#475569;">Cuenta</th>
            <th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#475569;">Monto</th>
            <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#475569;">Estado</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`
    }

    <!-- Footer -->
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #1e2d3d;">
      <p style="margin:0;font-size:12px;color:#334155;">
        Este correo fue generado automáticamente por <strong style="color:#6366f1;">SubsManager</strong>
        para el administrador <em>${adminNombre}</em> (${adminEmail}).
      </p>
    </div>

  </div>
</body>
</html>`;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass || pass === "tu_app_password_aqui") {
      throw new Error("SMTP_USER / SMTP_PASS no configurados en .env");
    }

    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  return transporter;
}

export async function sendDailyReport(
  adminNombre: string,
  adminEmail: string,
  fecha: string,
  rows: PendingRow[]
): Promise<void> {
  const t = getTransporter();
  const html = buildHtml(adminNombre, adminEmail, fecha, rows);

  const atrasados = rows.filter((r) => Number(r.atraso_dias) > 0).length;
  const subject =
    rows.length === 0
      ? `✅ SubsManager — Sin pendientes hoy (${fecha})`
      : atrasados > 0
      ? `🔴 SubsManager — ${rows.length} pendientes, ${atrasados} atrasados (${fecha})`
      : `📋 SubsManager — ${rows.length} cobros pendientes (${fecha})`;

  await t.sendMail({
    from: `"SubsManager" <${process.env.SMTP_USER}>`,
    to: adminEmail,
    subject,
    html,
  });

  console.log(`[email] Resumen enviado a ${adminEmail} (${rows.length} items)`);
}
