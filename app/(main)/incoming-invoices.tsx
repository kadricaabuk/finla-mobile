import InvoicesScreen from "@/components/invoices/invoices-screen";
import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { Redirect } from "expo-router";

/** Gelen faturalar (adıma kesilen). */
export default function IncomingInvoicesRoute() {
  const { features } = useMainAppShell();
  if (!features.incomingInvoices) {
    return <Redirect href="/" />;
  }
  return <InvoicesScreen invoiceDirection="incoming" />;
}
