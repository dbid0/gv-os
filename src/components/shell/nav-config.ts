import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Clapperboard,
  LayoutDashboard,
  Mail,
  Megaphone,
  Plug,
  Receipt,
  Settings,
  Sunrise,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation, as data.
 *
 * Deliberately a config file rather than JSX scattered through the sidebar, so
 * tomorrow's ideation session can rearrange the whole information architecture
 * by editing one list.
 *
 * `status` is honest about what exists. Anything not "ready" renders visibly
 * disabled rather than linking to a blank page, because a nav item that goes
 * nowhere teaches people not to trust the nav.
 */

export type NavStatus = "ready" | "planned";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  status: NavStatus;
  /** One line on what this section is for. Shown as a tooltip when collapsed. */
  description: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navigation: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Daily brief",
        href: "/brief",
        icon: Sunrise,
        status: "ready",
        description: "What needs your attention this morning",
      },
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        status: "ready",
        description: "The numbers at a glance",
      },
    ],
  },
  {
    label: "Revenue",
    items: [
      {
        label: "Sales",
        href: "/sales",
        icon: BarChart3,
        status: "ready",
        description: "Deals, commissions, and the rep leaderboard",
      },
      {
        label: "Clients",
        href: "/clients",
        icon: Building2,
        status: "ready",
        description: "The active roster and each engagement",
      },
      {
        label: "Accounting",
        href: "/accounting",
        icon: Receipt,
        status: "ready",
        description: "Payments, fees, splits, payouts",
      },
    ],
  },
  {
    label: "Marketing",
    items: [
      {
        label: "Email",
        href: "/email",
        icon: Mail,
        status: "ready",
        description: "Every client's Kit account — sequences, tags, plan health",
      },
      {
        label: "Content",
        href: "/content",
        icon: Clapperboard,
        status: "planned",
        description: "Reels and posts per creator, hooks, and what converts",
      },
      {
        label: "Ads",
        href: "/ads",
        icon: Megaphone,
        status: "planned",
        description: "Spend and performance by offer",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Team",
        href: "/team",
        icon: Users,
        status: "ready",
        description: "The roster — roles, lanes, and each member's workload",
      },
      {
        label: "Calendar",
        href: "/calendar",
        icon: CalendarDays,
        status: "ready",
        description: "Tasks across every offer, on the month they're due",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        status: "ready",
        description: "Goals, currency, and split rules",
      },
      {
        label: "Integrations",
        href: "/settings/integrations",
        icon: Plug,
        status: "ready",
        description: "Connected tools — keys sealed, per-client scoped",
      },
      // Notifications lives at the bottom — the top-right bell is the primary
      // surface; this is the full-history fallback.
      {
        label: "Notifications",
        href: "/notifications",
        icon: Bell,
        status: "ready",
        description: "Rule-driven alerts — drift, signed agreements, the daily digest",
      },
    ],
  },
];

export const allNavItems: NavItem[] = navigation.flatMap((group) => group.items);
