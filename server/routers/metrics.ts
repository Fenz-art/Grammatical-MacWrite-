import { protectedProcedure, router } from "../_core/trpc";
import { getFleetTransformMetrics } from "../transformMetrics";

export const metricsRouter = router({
  snapshot: protectedProcedure.query(() => getFleetTransformMetrics()),
});
