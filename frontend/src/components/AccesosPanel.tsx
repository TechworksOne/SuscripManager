/**
 * AccesosPanel
 * ─────────────────────────────────────────────────────────
 * Muestra los accesos/perfiles de una cuenta con capacidad
 * de crear, editar y eliminar accesos individualmente.
 *
 * Props:
 *   cuentaId      – ID de la cuenta maestra
 *   cupoTotal     – cupo_total de la cuenta (para el resumen)
 *   onClose       – callback para cerrar el panel
 *   pushToast     – función de notificaciones del padre
 */
import { useEffect, useState } from "react";
import {
  Edit2,
  Loader2,
  Plus,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import type {
  ActualizarAccesoPayload,
  CrearAccesoPayload,
  CuentaAcceso,
} from "../api/accesos";
import {
  actualizarAcceso,
  crearAcceso,
  eliminarAcceso,
  getAccesosByCuenta,
} from "../api/accesos";
import { desasignarAccesoSuscripcion } from "../api/accesos";

// ── shared class strings ─────────────────────────────────
const inputCls =
  "w-full h-10 px-3 rounded-xl border border-white/10 bg-white/5 text-white/90 text-sm font-semibold placeholder:text-white/35 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition-all duration-150 disabled:opacity-50";

type ToastType = "success" | "error" | "info";

interface Props {
  cuentaId:  number;
  cupoTotal: number;
  onClose:   () => void;
  pushToast: (type: ToastType, msg: string) => void;
}

// ── Form state type ──────────────────────────────────────
interface FormState {
  nombre_acceso:   string;
  correo_acceso:   string;
  password_acceso: string;
  pin_acceso:      string;
}

const emptyForm = (): FormState => ({
  nombre_acceso:   "",
  correo_acceso:   "",
  password_acceso: "",
  pin_acceso:      "",
});

export default function AccesosPanel({ cuentaId, cupoTotal, onClose, pushToast }: Props) {
  const [items,   setItems]   = useState<CuentaAcceso[]>([]);
  const [loading, setLoading] = useState(true);

  // form modal
  const [formOpen,   setFormOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<CuentaAcceso | null>(null);
  const [form,       setForm]       = useState<FormState>(emptyForm());
  const [saving,     setSaving]     = useState(false);

  // busy rows
  const [deletingId,    setDeletingId]    = useState<number | null>(null);
  const [desasignandoId, setDesasignandoId] = useState<number | null>(null);

  // reveal passwords
  const [revealPwd, setRevealPwd] = useState<Record<number, boolean>>({});

  async function loadAccesos() {
    setLoading(true);
    try {
      const r = await getAccesosByCuenta(cuentaId);
      setItems(r.items);
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo cargar accesos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAccesos(); }, [cuentaId]); // eslint-disable-line

  // ── KPIs ──────────────────────────────────────────────
  const totalAccesos   = items.length;
  const ocupados       = items.filter((a) => a.estado === "OCUPADO").length;
  const disponibles    = items.filter((a) => a.estado === "DISPONIBLE").length;

  // ── Open form ────────────────────────────────────────
  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(a: CuentaAcceso) {
    setEditTarget(a);
    setForm({
      nombre_acceso:   a.nombre_acceso   ?? "",
      correo_acceso:   a.correo_acceso   ?? "",
      password_acceso: a.password_acceso ?? "",
      pin_acceso:      a.pin_acceso      ?? "",
    });
    setFormOpen(true);
  }

  // ── Submit form ──────────────────────────────────────
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload: CrearAccesoPayload | ActualizarAccesoPayload = {
        nombre_acceso:   form.nombre_acceso.trim()   || null,
        correo_acceso:   form.correo_acceso.trim()   || null,
        password_acceso: form.password_acceso.trim() || null,
        pin_acceso:      form.pin_acceso.trim()      || null,
        tipo_acceso:     "cuenta",
      };

      if (editTarget) {
        await actualizarAcceso(editTarget.id, payload);
        pushToast("success", "Acceso actualizado");
      } else {
        await crearAcceso(cuentaId, payload);
        pushToast("success", "Acceso creado");
      }

      setFormOpen(false);
      await loadAccesos();
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────
  async function onDelete(a: CuentaAcceso) {
    if (deletingId === a.id) return;
    if (a.estado === "OCUPADO") {
      pushToast("info", "Desasigna la suscripción antes de eliminar este acceso.");
      return;
    }
    setDeletingId(a.id);
    try {
      await eliminarAcceso(a.id);
      pushToast("success", "Acceso eliminado");
      await loadAccesos();
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Desasignar ───────────────────────────────────────
  async function onDesasignar(a: CuentaAcceso) {
    if (!a.suscripcion_id) return;
    if (desasignandoId === a.id) return;
    setDesasignandoId(a.id);
    try {
      await desasignarAccesoSuscripcion(a.suscripcion_id);
      pushToast("success", "Acceso liberado");
      await loadAccesos();
    } catch (e: any) {
      pushToast("error", e?.message || "No se pudo desasignar");
    } finally {
      setDesasignandoId(null);
    }
  }

  // ── Render ───────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 grid place-items-center p-3">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-white/10 bg-[#080c18]/97 backdrop-blur-xl shadow-2xl shadow-black/60">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/8 shrink-0">
          <div>
            <p className="font-black text-lg text-white/95">Accesos / Perfiles</p>
            <p className="text-sm text-white/40 font-medium mt-0.5">
              Gestiona los accesos internos de esta cuenta maestra.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-white/55 hover:text-white/90 hover:bg-white/8 transition-all flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* KPI bar */}
        <div className="flex gap-3 px-5 py-3 border-b border-white/6 bg-white/[0.015] shrink-0">
          {[
            { label: "Cupo total",   value: cupoTotal,    color: "text-white/70" },
            { label: "Ocupados",     value: ocupados,     color: "text-amber-300" },
            { label: "Disponibles",  value: disponibles,  color: "text-emerald-300" },
            { label: "Accesos BD",   value: totalAccesos, color: "text-sky-300" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="flex-1 min-w-0 rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-center"
            >
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mt-0.5">
                {label}
              </p>
            </div>
          ))}
          <button
            type="button"
            onClick={openCreate}
            className="shrink-0 h-full px-4 rounded-xl bg-indigo-500/12 border border-indigo-500/25 text-indigo-300 font-extrabold text-sm hover:bg-indigo-500/18 hover:border-indigo-500/35 hover:-translate-y-0.5 transition-all flex items-center gap-1.5 self-stretch"
          >
            <Plus className="w-4 h-4" />
            Nuevo
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-7 h-7 text-indigo-400/60 animate-spin" />
              <p className="text-white/35 text-sm font-semibold">Cargando accesos…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/8 border border-indigo-500/15 flex items-center justify-center">
                <span className="text-2xl">🔐</span>
              </div>
              <p className="text-white/70 font-bold">Sin accesos registrados</p>
              <p className="text-white/35 text-sm max-w-xs leading-relaxed">
                Crea los perfiles/accesos de esta cuenta para asignarlos a clientes.
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-1 h-9 px-5 rounded-xl bg-indigo-500/12 border border-indigo-500/22 text-indigo-300 font-bold text-sm hover:bg-indigo-500/18 transition-all"
              >
                <Plus className="w-3.5 h-3.5 inline mr-1.5" />
                Crear primer acceso
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {items.map((a) => {
                const ocupado      = a.estado === "OCUPADO";
                const isBusyDel    = deletingId    === a.id;
                const isBusyDesasig = desasignandoId === a.id;
                const revPwd = !!revealPwd[a.id];

                return (
                  <div
                    key={a.id}
                    className={`rounded-2xl border flex flex-col sm:flex-row items-start gap-3 p-3.5 transition-all duration-150 ${
                      ocupado
                        ? "border-amber-500/20 bg-amber-500/[0.04]"
                        : "border-white/8 bg-white/[0.025]"
                    }`}
                  >
                    {/* Left: info */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-white/90">
                          {a.nombre_acceso || `Acceso #${a.id}`}
                        </span>

                        {/* Estado badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                            ocupado
                              ? "bg-amber-500/12 border-amber-500/25 text-amber-300"
                              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              ocupado ? "bg-amber-400" : "bg-emerald-400"
                            }`}
                          />
                          {a.estado}
                        </span>

                        {/* Tipo badge */}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-white/8 bg-white/5 text-white/45 uppercase tracking-wider">
                          {a.tipo_acceso}
                        </span>
                      </div>

                      {/* Datos del acceso */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-xs">
                        {a.correo_acceso && (
                          <span className="text-white/55">
                            <span className="text-white/30">Correo: </span>
                            {a.correo_acceso}
                          </span>
                        )}
                        {a.pin_acceso && (
                          <span className="text-white/55">
                            <span className="text-white/30">PIN: </span>
                            {a.pin_acceso}
                          </span>
                        )}
                        {a.password_acceso && (
                          <span className="text-white/55 flex items-center gap-1">
                            <span className="text-white/30">Pass: </span>
                            {revPwd ? a.password_acceso : "••••••••"}
                            <button
                              type="button"
                              onClick={() => setRevealPwd((p) => ({ ...p, [a.id]: !p[a.id] }))}
                              className="text-white/30 hover:text-white/60 transition-colors text-[10px] underline"
                            >
                              {revPwd ? "ocultar" : "ver"}
                            </button>
                          </span>
                        )}
                      </div>

                      {/* Cliente asignado */}
                      {ocupado && a.cliente_nombre && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-xs text-amber-300/80 font-semibold">
                            {a.cliente_nombre}
                          </span>
                          {a.proximo_cobro && (
                            <span className="text-[10px] text-white/30 font-medium">
                              · cobro {a.proximo_cobro}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-1.5 shrink-0 self-start">
                      {/* Desasignar (solo si ocupado) */}
                      {ocupado && a.suscripcion_id && (
                        <button
                          type="button"
                          onClick={() => onDesasignar(a)}
                          disabled={isBusyDesasig}
                          title="Liberar acceso (desasignar suscripción)"
                          className="h-8 px-2.5 rounded-lg border border-amber-500/22 bg-amber-500/8 text-amber-300/80 hover:bg-amber-500/14 hover:text-amber-300 transition-all flex items-center gap-1 text-[11px] font-bold disabled:opacity-50"
                        >
                          {isBusyDesasig
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Unlink className="w-3 h-3" />}
                          Liberar
                        </button>
                      )}

                      {/* Editar */}
                      <button
                        type="button"
                        onClick={() => openEdit(a)}
                        title="Editar acceso"
                        className="h-8 w-8 rounded-lg border border-white/8 bg-white/5 text-white/45 hover:text-white/80 hover:bg-white/8 transition-all flex items-center justify-center"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Eliminar */}
                      <button
                        type="button"
                        onClick={() => onDelete(a)}
                        disabled={isBusyDel || ocupado}
                        title={ocupado ? "Libera el acceso antes de eliminar" : "Eliminar acceso"}
                        className="h-8 w-8 rounded-lg border border-white/8 bg-white/5 text-white/45 hover:text-red-400/80 hover:bg-red-500/8 hover:border-red-500/20 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {isBusyDel
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/8 bg-black/10 text-xs text-white/30 font-medium shrink-0">
          Los accesos libres (DISPONIBLE) pueden asignarse a una suscripción desde el panel de Cobranza.
        </div>
      </div>

      {/* ── Form modal (inner) ─────────────────────────── */}
      {formOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] grid place-items-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#080c18]/98 shadow-2xl shadow-black/70">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <p className="font-black text-base text-white/95">
                {editTarget ? "Editar acceso" : "Nuevo acceso"}
              </p>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="w-8 h-8 rounded-xl border border-white/10 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/8 transition-all flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="p-5 flex flex-col gap-3.5">
              {/* Nombre */}
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-white/45 mb-1.5">
                  Nombre del acceso
                </p>
                <input
                  className={inputCls}
                  value={form.nombre_acceso}
                  onChange={(e) => setForm((f) => ({ ...f, nombre_acceso: e.target.value }))}
                  placeholder="Perfil 1, Familiar 2…"
                />
              </div>

              {/* Correo */}
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-white/45 mb-1.5">
                  Correo del acceso
                  <span className="ml-1 text-white/25 font-medium normal-case tracking-normal">
                    (opcional)
                  </span>
                </p>
                <input
                  className={inputCls}
                  value={form.correo_acceso}
                  onChange={(e) => setForm((f) => ({ ...f, correo_acceso: e.target.value }))}
                  placeholder="acceso@mail.com"
                  type="email"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Password */}
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-white/45 mb-1.5">
                    Contraseña
                    <span className="ml-1 text-white/25 font-medium normal-case tracking-normal">
                      (opcional)
                    </span>
                  </p>
                  <input
                    className={inputCls}
                    value={form.password_acceso}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password_acceso: e.target.value }))
                    }
                    placeholder="••••••••"
                  />
                </div>

                {/* PIN */}
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-white/45 mb-1.5">
                    PIN
                    <span className="ml-1 text-white/25 font-medium normal-case tracking-normal">
                      (opcional)
                    </span>
                  </p>
                  <input
                    className={inputCls}
                    value={form.pin_acceso}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pin_acceso: e.target.value.replace(/\D/g, "").slice(0, 6),
                      }))
                    }
                    inputMode="numeric"
                    placeholder="1234"
                    maxLength={6}
                  />
                </div>
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="h-10 px-5 rounded-xl border border-white/10 bg-white/5 text-white/60 font-bold text-sm hover:bg-white/8 hover:text-white/85 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-10 px-5 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 font-extrabold text-sm hover:bg-indigo-500/22 hover:border-indigo-500/35 transition-all disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {saving ? "Guardando…" : editTarget ? "Guardar cambios" : "Crear acceso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
