// Routes that remain accessible during an emergency-login session.
// Whitelist is intentional: any new route is restricted unless explicitly added.
//
// Allowed scope per PRD:
//   - patient/scan full flow (incl. 4D post-processing chain and viewer)
//   - mobile mode scan flow
//   - service mode hardware items LIMITED to tube warmup + air calibration
//   - login/change-password/home (so users can navigate and re-authenticate)

const EMERGENCY_ALLOWED_EXACT = new Set<string>([
  "/",
  "/login",
  "/change-password",

  "/patients",
  "/protocol-select",
  "/scout-scan",
  "/scan-confirm",
  "/scout-execute",
  "/sequence-confirm",
  "/helical-confirm",
  "/helical-execute",
  "/gated-helical-confirm",
  "/gated-axial-confirm",
  "/fourd-confirm",
  "/fourd-rescan-select",
  "/image-load",
  "/phase-filter",
  "/image-viewer",

  "/mobile/manual-scan",
  "/mobile/mock-scan",
  "/mobile/image-viewer",

  "/service/tube-warmup",
  "/service/air-calibration",
]);

export function isRouteAllowedInEmergency(route: string): boolean {
  return EMERGENCY_ALLOWED_EXACT.has(route);
}
