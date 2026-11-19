import axios, { isAxiosError } from "axios";

/**
 * API base. Defaults to production; for local development set EXPO_PUBLIC_API_URL in
 * mobile/.env.local (or infra/env/dev.env for Compose), e.g. http://192.168.1.50:8080/api/v1.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://clims.health.go.ug/api/v1").replace(/\/$/, "");

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

export const setAuthToken = (token: string | null) => {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
};

export interface ApiRole {
  id: string;
  name: string;
}
export interface ApiUser {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  phone_number: string;
  status: string;
  role: ApiRole | null;
  roles: ApiRole[];
}

export async function login(email: string, password: string) {
  const { data } = await api.post<{ data: { token: string; expires_in: number; user: ApiUser } }>(
    "/auth/login",
    { email: email.trim(), password },
  );
  return data.data;
}

/** A sentence a field worker can act on, from any login failure. */
export function loginErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const s = err.response?.status;
    if (s === 401) return "That email and password don't match. Check them and try again.";
    if (s === 403) return "Your account is switched off. Call your district focal person.";
    if (s === 429) return "Too many attempts. Wait a minute, then try again.";
    if (s === 422 || s === 400) return "Enter the email address your account was created with.";
    if (!err.response) return "Can't reach CLIMS. Check your network and try again.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Try again.";
}
