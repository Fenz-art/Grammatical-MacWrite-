import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { resolveConfiguredLLMSettings } from "./llmProviders";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  providerStatus: publicProcedure.query(() => {
    const settings = resolveConfiguredLLMSettings();
    return {
      configured: settings.providers.some(provider => provider.enabled),
      fallbackConfigured: settings.providers.filter(provider => provider.enabled).length > 1,
    };
  }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
