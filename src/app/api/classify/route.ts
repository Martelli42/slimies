import { NextResponse } from "next/server";

import { readJson, requireUser, zodError } from "@/lib/api";
import { getClassifier } from "@/lib/classify";
import { classifyInputSchema } from "@/lib/validation";

/**
 * Standalone evaluator endpoint. Useful for the "describe what you did" flow
 * and as the seam where a different provider can be swapped in — the response
 * shape is stable regardless of which classifier is configured.
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = classifyInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const result = await getClassifier().classify({
    text: parsed.data.text,
    durationMinutes: parsed.data.durationMinutes,
    activityType: parsed.data.activityType ?? null,
  });

  return NextResponse.json(result);
}
