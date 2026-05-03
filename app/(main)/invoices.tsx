import InvoicesScreen from "@/components/invoices/invoices-screen";
import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { Redirect } from "expo-router";

export default function InvoicesRoute() {
  const { features } = useMainAppShell();
  if (!features.outgoingInvoices) {
    return <Redirect href="/" />;
  }
  return <InvoicesScreen />;
}
