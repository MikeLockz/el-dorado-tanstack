import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export function AppLayout() {
  const location = useRouterState({ select: (state) => state.location.href });

  return (
    <div className="app-shell">
      <header>
        <div style={{ flex: '1 1 auto' }}>
          <strong>El Dorado</strong>
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Deterministic trick-taking in the browser</div>
        </div>
        <nav>
          <NavLink current={location} to="/">
            Home
          </NavLink>
          <NavLink current={location} to="/join">
            Join
          </NavLink>
          <NavLink current={location} to="/game/$gameId" params={{ gameId: 'preview' }} match={(href) => href.startsWith('/game/')}>
            Game
          </NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

interface NavLinkProps {
  to: '/' | '/join' | '/game/$gameId';
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
      data-active={isActive ? 'true' : 'false'}
      style={{ fontWeight: isActive ? 600 : 500 }}
      preload="intent"
    >
      {children}
    </Link>
  );
}
