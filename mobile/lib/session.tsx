import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { login, setAuthToken, type ApiUser } from "./api";
import { DEFAULT_PERSONAS } from "./seed";
import type { AppRole } from "./types";

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: AppRole;
  demo?: boolean;
}

interface SessionCtx {
  user: SessionUser | null;
  restoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInDemo: (role: AppRole) => Promise<void>;
  signOut: () => Promise<void>;
}

const KEY = "clims.session.v2";
const Ctx = createContext<SessionCtx | null>(null);

/** Backend role names (RBAC catalog) that this app serves. */
const ROLE_MAP: Record<string, AppRole> = {
  vht: "vht",
  "hotspot manager": "hm",
  "delivery agent": "rider",
  rider: "rider",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  vht: "Village health team",
  hm: "Hotspot manager",
  rider: "Delivery rider",
};

export function appRoleOf(u: ApiUser): AppRole | null {
  const names = [u.role?.name, ...(u.roles || []).map((r) => r.name)].filter(Boolean) as string[];
  for (const n of names) {
    const r = ROLE_MAP[n.trim().toLowerCase()];
    if (r) return r;
  }
  return null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        if (raw && live) {
          const s = JSON.parse(raw) as { user: SessionUser; token: string | null; exp: number };
          if (s.user && (s.user.demo || s.exp > Date.now())) {
            setAuthToken(s.token);
            setUser(s.user);
          }
        }
      } catch {
        // A corrupt or unreadable session just means signing in again.
      } finally {
        if (live) setRestoring(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const persist = useCallback(async (u: SessionUser, token: string | null, exp: number) => {
    setAuthToken(token);
    setUser(u);
    await SecureStore.setItemAsync(KEY, JSON.stringify({ user: u, token, exp })).catch(() => {});
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await login(email, password);
      const role = appRoleOf(res.user);
      if (!role) {
        throw new Error(
          "This app is for VHTs, hotspot managers and riders. Use the CLIMS website for your role.",
        );
      }
      const u = res.user;
      const name = [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || u.username;
      await persist(
        { id: u.id, name, username: u.username, email: u.email, phone: u.phone_number || "", role },
        res.token,
        Date.now() + res.expires_in * 1000,
      );
    },
    [persist],
  );

  const signInDemo = useCallback(
    async (role: AppRole) => {
      const name = DEFAULT_PERSONAS[role];
      const username = name.toLowerCase().replace(/\s+/g, ".");
      const phone = { vht: "+256 776 902 331", hm: "+256 772 418 903", rider: "+256 701 334 920" }[
        role
      ];
      await persist(
        { id: `demo-${role}`, name, username, email: "", phone, role, demo: true },
        null,
        0,
      );
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(KEY).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ user, restoring, signIn, signInDemo, signOut }),
    [user, restoring, signIn, signInDemo, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession must be used inside SessionProvider");
  return c;
}

/** The signed-in user; only call below the signed-in layout. */
export function useMe() {
  const { user } = useSession();
  if (!user) throw new Error("useMe called while signed out");
  return user;
}
