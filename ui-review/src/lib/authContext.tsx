/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import {
  changePassword as apiChangePassword,
  emergencyLogin as apiEmergencyLogin,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  type CurrentUser,
} from "./authApi";

const EMERGENCY_USERNAME = "emergency";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: CurrentUser };

type AuthContextValue = {
  state: AuthState;
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isEmergencySession: boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  login: (username: string, password: string) => Promise<CurrentUser>;
  emergencyLogin: () => Promise<CurrentUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<CurrentUser>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });
  const [sessionExpired, setSessionExpired] = useState(false);
  const wasAuthenticatedRef = useRef(false);

  const applyState = useCallback((next: AuthState, reason: "init" | "login" | "logout" | "refresh") => {
    setState(next);
    if (next.status === "authenticated") {
      wasAuthenticatedRef.current = true;
      setSessionExpired(false);
    } else if (next.status === "anonymous") {
      if (wasAuthenticatedRef.current && reason !== "logout") {
        setSessionExpired(true);
      }
      wasAuthenticatedRef.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const user = await fetchMe();
      applyState(
        user ? { status: "authenticated", user } : { status: "anonymous", user: null },
        "refresh",
      );
    } catch {
      applyState({ status: "anonymous", user: null }, "refresh");
    }
  }, [applyState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      const user = await apiLogin(username, password);
      applyState({ status: "authenticated", user }, "login");
      return user;
    },
    [applyState],
  );

  const emergencyLogin = useCallback(async () => {
    const user = await apiEmergencyLogin();
    applyState({ status: "authenticated", user }, "login");
    return user;
  }, [applyState]);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      applyState({ status: "anonymous", user: null }, "logout");
    }
  }, [applyState]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const user = await apiChangePassword(currentPassword, newPassword);
      applyState({ status: "authenticated", user }, "login");
      return user;
    },
    [applyState],
  );

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value: AuthContextValue = {
    state,
    user: state.status === "authenticated" ? state.user : null,
    isLoading: state.status === "loading",
    isAuthenticated: state.status === "authenticated",
    isEmergencySession:
      state.status === "authenticated" && state.user.username === EMERGENCY_USERNAME,
    sessionExpired,
    clearSessionExpired,
    login,
    emergencyLogin,
    logout,
    changePassword,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function useCurrentUser(): CurrentUser | null {
  return useAuth().user;
}
