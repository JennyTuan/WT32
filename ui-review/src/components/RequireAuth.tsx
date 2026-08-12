import { type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../lib/authContext";
import { isRouteAllowedInEmergency } from "../lib/emergencyAccess";

type RequireAuthProps = {
    children?: ReactNode;
    loginPath?: string;
};

export default function RequireAuth({ children, loginPath = "/login" }: RequireAuthProps) {
    const { state, isEmergencySession } = useAuth();
    const location = useLocation();

    if (state.status === "loading") {
        return (
            <div className="flex h-full w-full items-center justify-center text-[13px] text-[#90A4AE]">
                正在加载用户信息…
            </div>
        );
    }

    if (state.status !== "authenticated") {
        return <Navigate to={loginPath} state={{ from: location.pathname + location.search }} replace />;
    }

    // First-login forced change-password gate.
    if (state.user.password_reset_required && location.pathname !== "/change-password") {
        return <Navigate to="/change-password" replace />;
    }

    // Emergency session: hard route guard. UI controls also gray these out,
    // but a direct URL must not bypass the restriction.
    if (isEmergencySession && !isRouteAllowedInEmergency(location.pathname)) {
        return <Navigate to="/patients" replace />;
    }

    return <>{children ?? <Outlet />}</>;
}
