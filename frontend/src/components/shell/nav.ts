import {
  BarChart3,
  BookOpen,
  CheckCheck,
  FlaskConical,
  Inbox,
  LifeBuoy,
  MessageSquareQuote,
  Server,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Desk",
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/approvals", label: "Approvals", icon: CheckCheck },
      { href: "/escalations", label: "Escalations", icon: LifeBuoy },
      { href: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    title: "Quality",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/knowledge", label: "Knowledge", icon: BookOpen },
      { href: "/feedback", label: "Feedback", icon: MessageSquareQuote },
      { href: "/evals", label: "Evals", icon: FlaskConical },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/ops", label: "Ops", icon: Server, adminOnly: true },
      { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
    ],
  },
];

export function navFor(role: Role | undefined) {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || role === "admin") })).filter((g) => g.items.length > 0);
}
