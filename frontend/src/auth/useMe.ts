import { useEffect, useState } from "react";
import { apiFetch } from "../api/http";
import type { Me } from "./auth.store";
import { getToken, setToken } from "./auth.store";

/**
 * useMe
 * - Lee token desde auth.store
 * - Si no hay token => me=null y loading=false
 * - Si hay token => pide /auth/me
 * - Si 401/Token inválido => limpia token y deja me=null
 */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const token = getToken();

        // Sin token = no hay sesión, no dispare /auth/me
        if (!token) {
          if (!alive) return;
          setMe(null);
          setLoading(false);
          return;
        }

        const data = await apiFetch<{ user: Me }>("/auth/me", {
          method: "GET",
        });

        if (!alive) return;
        setMe(data.user);
      } catch (err: any) {
        if (!alive) return;

        // Si el backend respondió 401 (Token requerido / inválido)
        // limpiamos token para que el frontend no se quede "creyendo" que hay sesión
        const msg = String(err?.message || "");
        const isAuthError =
          err?.status === 401 ||
          msg.includes("Token requerido") ||
          msg.includes("Token inválido") ||
          msg.includes("Unauthorized");

        if (isAuthError) {
          setToken(""); // o setToken(null) según su store
          setMe(null);
        } else {
          // Otros errores (server caído, CORS, etc.)
          setMe(null);
        }
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, []);

  return { me, loading };
}
