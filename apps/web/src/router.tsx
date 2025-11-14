import { Route, RootRoute, createRouter } from '@tanstack/react-router';
import { AppLayout } from '@/components/AppLayout';
import { GameRoute } from '@/pages/GameRoute';
import { JoinPage } from '@/pages/JoinPage';
import { LandingPage } from '@/pages/LandingPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { StatsPage } from '@/pages/StatsPage';

const rootRoute = new RootRoute({
  component: AppLayout,
});

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
});

const joinRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/join',
  component: JoinPage,
});

const gameRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/game/$gameId',
  component: GameRoute,
});

const profileRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfilePage,
});

const statsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/stats/$userId',
  component: StatsPage,
});

const routeTree = rootRoute.addChildren([indexRoute, joinRoute, gameRoute, profileRoute, statsRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
