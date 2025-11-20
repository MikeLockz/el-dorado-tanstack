import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { loadProfilePreferences } from "@/lib/profilePreferences";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const location = useRouterState({ select: (state) => state.location.href });
  const statsTarget = loadProfilePreferences().userId ?? "demo";

  return (
    <div className="min-h-screen bg-[#05080f] text-foreground">
      <div className="relative min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,211,105,0.08),_transparent_55%),_linear-gradient(180deg,_rgba(9,14,25,0.95),_#05080f)]">
        <header className="sticky top-0 z-30 border-b border-white/5 bg-black/40 backdrop-blur">
          <div className="container flex flex-wrap items-center gap-4 py-4">
            <div className="flex-1">
              <p className="text-lg font-semibold">El Dorado</p>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Southwest Michigan's Game
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              <NavLink current={location} to="/">
                Home
              </NavLink>
              <NavLink current={location} to="/join">
                Join
              </NavLink>
              <NavLink
                current={location}
                to="/game/$gameId"
                params={{ gameId: "preview" }}
                match={(href) => href.startsWith("/game/")}
              >
                Game
              </NavLink>
              <NavLink current={location} to="/profile">
                Profile
              </NavLink>
              <NavLink
                current={location}
                to="/stats/$userId"
                params={{ userId: statsTarget || "demo" }}
                match={(href) => href.startsWith("/stats/")}
              >
                Stats
              </NavLink>
            </nav>
          </div>
        </header>
        <main className="container py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

interface NavLinkProps {
  to: "/" | "/join" | "/game/$gameId" | "/profile" | "/stats/$userId";
  params?: Record<string, string>;
  children: ReactNode;
  current: string;
  match?: (href: string) => boolean;
}

function NavLink({ to, params, children, current, match }: NavLinkProps) {
  const isActive = match ? match(current) : current === to;

  return (
    <Link
      to={to}
      params={params}
      data-active={isActive ? "true" : "false"}
      preload="intent"
      className={cn(
        buttonVariants({ variant: isActive ? "default" : "ghost", size: "sm" }),
        "rounded-full border border-white/10 bg-transparent text-sm font-semibold",
        isActive && "bg-primary text-primary-foreground"
      )}
    >
      {children}
    </Link>
  );
}
