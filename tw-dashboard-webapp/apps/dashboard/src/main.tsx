import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { z } from 'zod';
import { Dashboard } from './page.tsx';
import './style.css';
const root = createRootRoute();
const search = z.object({
  perspective: z.coerce.number().int().optional(),
  radius: z.coerce.number().min(1).max(100).catch(20),
  window: z.enum(['24h', '7d', '30d']).catch('24h'),
  view: z.enum(['players', 'map', 'status']).catch('players'),
  selected: z.coerce.number().int().optional(),
  center: z.coerce.number().int().optional(),
  search: z.string().catch(''),
  sort: z.enum(['distance', 'points', 'name', 'attack', 'growth', 'conquests']).catch('distance'),
  direction: z.enum(['asc', 'desc']).catch('asc'),
  page: z.coerce.number().int().min(0).catch(0),
  excludeTribe: z.boolean().catch(false),
  watched: z.boolean().catch(false),
  relationship: z.enum(['unknown', 'friendly', 'neutral', 'hostile']).optional(),
});
export type Search = z.infer<typeof search>;
const route = createRoute({
  getParentRoute: () => root,
  path: '/',
  validateSearch: (s) => search.parse(s),
  component: Dashboard,
});
const router = createRouter({ routeTree: root.addChildren([route]) });
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      refetchInterval: 60000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  },
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
