import InvoicesScreen from "@/components/invoices/invoices-screen";

export default function IncomingInvoicesRoute() {
  return (
    <InvoicesScreen
      direction="incoming"
      title="Gelen Faturalar"
      emptyHint="Bu dönemde gelen fatura bulunamadı."
      activeScreen="incoming-invoices"
      shellOwnerId="screen-incoming-invoices"
      titleTestId="incoming-invoices-title"
    />
  );
}
