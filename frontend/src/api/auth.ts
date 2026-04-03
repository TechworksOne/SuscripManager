// src/api/auth.ts
import { apiFetch } from "./http";

export type LoginResponse = {
  token: string;
  user: { id: number; email: string; nombre: string };
};

export async function login(email: string, password: string) {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    skipAuth: true, // <- ahora sí es válido
    body: JSON.stringify({ email, password }),
  });
}

export async function me() {
  return apiFetch<{ user: { id: number; email: string; nombre: string } }>("/auth/me", {
    method: "GET",
  });
}
