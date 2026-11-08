import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { CatalogBrowser } from "@/components/app/catalog-browser";

export const metadata = { title: "Services & pricing" };
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const user = await getCurrentUser();
  return (
    <div className="relative">
      <Navbar loggedIn={Boolean(user)} />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[360px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[130px]" />
      <section className="container relative py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Catalog</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Services & live pricing</h1>
        <p className="mt-3 max-w-2xl text-muted">Prices and availability are synchronized automatically with our suppliers. Create an account to buy a number.</p>
        <div className="mt-10">
          <CatalogBrowser mode="public" />
        </div>
      </section>
      <Footer />
    </div>
  );
}
