import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MAX_TRANSFORM_BLOCK_CHARS } from "../../shared/pasteBlocks";
import { TRANSFORMATION_INTENSITIES, TRANSFORMATION_MODES } from "../../shared/transformations";
import { WRITING_PROFILE_IDS } from "../../shared/documentReview";
import { protectedProcedure, router } from "../_core/trpc";
import { admitTransformRequest } from "../transformAdmission";
import { transformEventStream } from "../transformStream";

const nonBlankText = z.string().refine(value => value.trim().length > 0, "Text must contain non-whitespace content");
const nonBlankTerm = z.string().refine(value => value.trim().length > 0, "Protected term must contain non-whitespace content");
const documentContextSchema = z.object({
  documentId: z.string().min(1).max(120),
  title: z.string().max(120).optional(),
  blockIndex: z.number().int().min(0).max(9_999),
  blockCount: z.number().int().min(1).max(10_000),
  totalCharacters: z.number().int().min(1).max(2_000_000),
  beforeExcerpt: z.string().max(520).optional(),
  afterExcerpt: z.string().max(520).optional(),
  profileId: z.enum(WRITING_PROFILE_IDS).optional(),
}).refine(value => value.blockIndex < value.blockCount, "Block index must be within the document");

export const transformInputSchema = z.object({
  requestId: z.string().min(1).max(120),
  text: nonBlankText.max(MAX_TRANSFORM_BLOCK_CHARS),
  mode: z.enum(TRANSFORMATION_MODES),
  intensity: z.enum(TRANSFORMATION_INTENSITIES).optional(),
  protectedTerms: z.array(nonBlankTerm.max(180)).max(50).optional(),
  codeCommentOnly: z.boolean().optional(),
  documentContext: documentContextSchema.optional(),
  clientRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const transformRouter = router({
  stream: protectedProcedure.input(transformInputSchema).subscription(async function* ({ input, signal, ctx }) {
    const admission = await admitTransformRequest(ctx.user.openId, input.requestId);
    if (!admission.allowed) {
      ctx.res.setHeader("Retry-After", String(Math.ceil(admission.retryAfterMs / 1_000)));
      throw new TRPCError({
        code: admission.code === "RATE_LIMITED" || admission.code === "CAPACITY_EXHAUSTED" ? "TOO_MANY_REQUESTS" : "SERVICE_UNAVAILABLE",
        message: admission.code,
      });
    }
    yield* transformEventStream(input, signal, undefined, { lease: admission.lease });
  }),
});
