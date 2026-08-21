import {
  BarChart3,
  Building2,
  CalendarDays,
  Clapperboard,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Receipt,
  Settings,
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
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        status: "ready",
        description: "What needs attention today",
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
        label: "Action list",
        href: "/action-list",
        icon: ListChecks,
        status: "ready",
        description: "Daily, weekly, and monthly tasks for the team",
      },
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
        status: "planned",
        description: "Tasks generated from the systems, synced to Google",
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
    ],
  },
];

export const allNavItems: NavItem[] = navigation.flatMap((group) => group.items);
