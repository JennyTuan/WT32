import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import {
  changePassword as apiChangePassword,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  type CurrentUser,
} from "./authApi";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: CurrentUser };

type AuthContextValue = {
  state: AuthState;
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<CurrentUser>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  const refresh = useCallback(async () => {
    try {
      const user = await fetchMe();
      setState(user ? { status: "authenticated", user } : { status: "anonymous", user: null });
    } catch {
      setState({ status: "anonymous", user: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const user = await apiLogin(username, password);
    setState({ status: "authenticated", user });
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setState({ status: "anonymous", user: null });
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const user = await apiChangePassword(currentPassword, newPassword);
    setState({ status: "authenticated", user });
    return user;
  }, []);

  const value: AuthContextValue = {
    state,
    user: state.status === "authenticated" ? state.user : null,
    isLoading: state.status === "loading",
    isAuthenticated: state.status === "authenticated",
    login,
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
