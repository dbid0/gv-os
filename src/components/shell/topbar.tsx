"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";

import { allNavItems } from "@/components/shell/nav-config";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useIsHydrated } from "@/lib/client-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { env } from "@/env";

export function Topbar() {
  const pathname = usePathname();
  const current = allNavItems.find((item) => item.href === pathname);

  return (
    <header className="bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-medium">{current?.label ?? "GV OS"}</h1>
        {current && (
          <p className="text-muted-foreground truncate text-xs">
            {current.description}
          </p>
        )}
      </div>

      {/* A preview build reading staging data must never be mistaken for prod. */}
      {env.NEXT_PUBLIC_APP_ENV !== "production" && (
        <Badge variant="outline" className="ml-1 shrink-0 text-[10px] uppercase">
          {env.NEXT_PUBLIC_APP_ENV}
        </Badge>
      )}

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The resolved theme is unknown until the client renders; showing an icon
  // before that would be a hydration mismatch.
  const hydrated = useIsHydrated();

  const cycle = () => {
    setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark");
  };

  const Icon = !hydrated
    ? Monitor
    : theme === "dark"
      ? Moon
      : theme === "light"
        ? Sun
        : Monitor;

  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label="Toggle theme">
      <Icon className="size-4" />
    </Button>
  );
}

function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Account menu" />}
      >
        <Avatar className="size-7">
          <AvatarFallback className="text-[11px]">GV</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">Signed out</p>
          <p className="text-muted-foreground text-xs">Auth lands in the next step</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>Settings</DropdownMenuItem>
        <DropdownMenuItem disabled>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
