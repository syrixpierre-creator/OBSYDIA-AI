import type { NavItem } from "@/components/app/app-shell";

export const userNav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "LayoutDashboard", exact: true },
  { href: "/dashboard/buy", label: "Buy Numbers", icon: "ShoppingCart" },
  { href: "/dashboard/orders", label: "My Orders", icon: "ShoppingBag" },
  { href: "/dashboard/transactions", label: "Transactions", icon: "Receipt" },
  { href: "/dashboard/funds", label: "Add Funds", icon: "PlusCircle" },
  { href: "/dashboard/api", label: "API Access", icon: "KeyRound" },
  { href: "/dashboard/support", label: "Support", icon: "LifeBuoy" },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings" },
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Statistics", icon: "Activity", exact: true },
  { href: "/admin/users", label: "Users", icon: "Users" },
  { href: "/admin/orders", label: "Orders", icon: "ShoppingBag" },
  { href: "/admin/transactions", label: "Transactions", icon: "CreditCard" },
  { href: "/admin/refunds", label: "Refunds", icon: "RotateCcw" },
  { href: "/admin/providers", label: "API Providers", icon: "Server" },
  { href: "/admin/catalog", label: "Countries & Services", icon: "Globe2" },
  { href: "/admin/pricing", label: "Pricing & Promotions", icon: "Tags" },
  { href: "/admin/support", label: "Support tickets", icon: "LifeBuoy" },
  { href: "/admin/logs", label: "System logs", icon: "ScrollText" },
  { href: "/admin/settings", label: "Settings & Stripe", icon: "Settings" },
];
