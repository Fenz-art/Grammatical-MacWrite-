import { z } from "zod";
import { createTransformationHistory, deleteTransformationHistory, listTransformationHistory, updateTransformationHistory } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const modeSchema = z.enum(["proofread", "improve", "natural", "rewrite"]);

export const historyRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().max(120).optional() }).optional())
    .query(({ ctx, input }) => listTransformationHistory(ctx.user.openId, input?.search)),
  create: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      sessionId: z.string().uuid(),
      mode: modeSchema,
      title: z.string().trim().min(1).max(180),
      inputText: z.string().max(500_000),
      outputHtml: z.string().max(500_000),
      outputText: z.string().max(500_000),
      blockCount: z.number().int().min(1).max(500),
    }))
    .mutation(({ ctx, input }) => createTransformationHistory({ ...input, userOpenId: ctx.user.openId })),
  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), outputHtml: z.string().max(500_000), outputText: z.string().max(500_000) }))
    .mutation(async ({ ctx, input }) => {
      await updateTransformationHistory(ctx.user.openId, input.id, input.outputHtml, input.outputText);
      return { success: true } as const;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await deleteTransformationHistory(ctx.user.openId, input.id);
      return { success: true } as const;
    }),
});

export type HistoryRouter = typeof historyRouter;

export default historyRouter;

// History records use the authenticated account identifier as the ownership boundary.
// The client never supplies or can override userOpenId.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _historyRouterMarker = historyRouter;
