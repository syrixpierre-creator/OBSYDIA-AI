import { requireUser } from "@/lib/auth";
import { ensureWallet } from "@/lib/wallet";
import { cardPaymentsAvailable } from "@/lib/payments-status";
import { PageHeader } from "@/components/app/app-shell";
import { CatalogBrowser } from "@/components/app/catalog-browser";

export const metadata = { title: "Buy Numbers" };

export default async function BuyPage() {
  const user = await requireUser();
  const [wallet, card] = await Promise.all([ensureWallet(user.id), cardPaymentsAvailable()]);
  return (
    <>
      <PageHeader title="Buy Numbers" description="Choose a service and a country, check the live price and availability, then buy." />
      <CatalogBrowser mode="buy" balanceCents={wallet.balanceCents} cardEnabled={card.directOrder} />
    </>
  );
}
