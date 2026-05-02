import {
  useMainAppShell,
  type MainShellSideMenuBindings,
} from "@/contexts/main-app-shell-context";
import { useIsFocused } from "@react-navigation/native";
import { useLayoutEffect } from "react";

/**
 * Registers SideMenu handlers for the focused route. Unregister runs only when
 * the screen loses focus — not when `bindings` change. Otherwise React runs the
 * previous effect cleanup and briefly clears shell state, so handlers become
 * no-ops for a frame (feels like “tap twice”).
 */
export function useRegisterMainShellSideMenu(
  ownerId: string,
  bindings: MainShellSideMenuBindings,
): void {
  const { registerSideMenu, unregisterSideMenu } = useMainAppShell();
  const focused = useIsFocused();

  useLayoutEffect(() => {
    if (!focused) return undefined;
    return () => unregisterSideMenu(ownerId);
  }, [focused, ownerId, unregisterSideMenu]);

  useLayoutEffect(() => {
    if (!focused) return;
    registerSideMenu(ownerId, bindings);
  }, [focused, ownerId, bindings, registerSideMenu]);
}
