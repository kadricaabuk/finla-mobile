import InvoicesScreen from "@/components/invoices/invoices-screen";

/** Gelen faturalar (adıma kesilen). */
export default function IncomingInvoicesRoute() {
  return <InvoicesScreen invoiceDirection="incoming" />;
}
