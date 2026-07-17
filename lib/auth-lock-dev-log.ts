/** Dev-only tracing for login / app-lock / biometric flows. */
export function logAuthLock(
  phase: string,
  payload?: Record<string, unknown>,
): void {
  // if (!__DEV__) return;
  // console.log("[finla auth-lock]", {
  //   ts: new Date().toISOString(),
  //   phase,
  //   ...payload,
  // });
}
