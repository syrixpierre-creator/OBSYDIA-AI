import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[120px]" />
      <Logo />
      <p className="text-gradient relative mt-10 text-7xl font-bold">404</p>
      <p className="relative mt-3 text-muted">This page doesn&apos;t exist or has moved.</p>
      <Button asChild className="relative mt-8"><Link href="/">Back home</Link></Button>
    </div>
  );
}
