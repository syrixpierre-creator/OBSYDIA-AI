import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...p} />;
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4 p-5 pb-0 sm:p-6 sm:pb-0", className)} {...p} />;
}
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-semibold tracking-tight", className)} {...p} />;
}
export function CardDescription({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-muted", className)} {...p} />;
}
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 sm:p-6", className)} {...p} />;
}
