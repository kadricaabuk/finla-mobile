import { Redirect } from "expo-router";

/** Eski rota — giden faturalara yönlendir. */
export default function InvoicesRoute() {
  return <Redirect href="/outgoing-invoices" />;
}
