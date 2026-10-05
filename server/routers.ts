import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { transformRouter } from "./routers/transform";
import { historyRouter } from "./routers/history";
import { metricsRouter } from "./routers/metrics";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  transform: transformRouter,
  history: historyRouter,
  metrics: metricsRouter,
});

export type AppRouter = typeof appRouter;
