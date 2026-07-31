import { z } from "zod";

const usageSchema = z
  .object({
    feature: z.literal("single_question"),
    used: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative().nullable(),
    remaining: z.number().int().nonnegative().nullable(),
    resetsAt: z.string().datetime({ offset: true }),
  })
  .strict();

const answerBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string() }).strict(),
  z.object({ type: z.literal("equation"), latex: z.string() }).strict(),
  z
    .object({ type: z.literal("visual_ref"), visualId: z.string().min(1) })
    .strict(),
]);

const citationSchema = z
  .object({
    citationId: z.string(),
    chapterId: z.string().nullable(),
    topicNo: z.string().nullable(),
    topicTitle: z.string().nullable(),
    pageStart: z.number().int().nullable(),
    pageEnd: z.number().int().nullable(),
  })
  .strict();

const visualSchema = z
  .object({
    visualId: z.string().min(1),
    title: z.string(),
    description: z.string(),
    displayPolicy: z.enum(["always", "llm_decide"]),
    displayOrder: z.number().int().nonnegative(),
  })
  .strict();

const askResponseSchema = z
  .object({
    requestId: z.string().uuid(),
    answerSource: z
      .enum(["approved_bank", "syllabus_grounded", "general_knowledge"])
      .nullable(),
    answerMode: z.enum(["short", "long"]),
    answerStyle: z.literal("exam_style"),
    blocks: z.array(answerBlockSchema),
    citations: z.array(citationSchema),
    visuals: z.array(visualSchema),
    generalAiLabel: z.string().nullable(),
    promptVersion: z.string().nullable(),
    corpusVersion: z.string().nullable(),
    approvedRevisionId: z.string().uuid().nullable(),
    usage: usageSchema,
    terminalStatus: z.enum([
      "answered",
      "no_answer",
      "limit_reached",
      "error",
    ]),
    errorCode: z.string().nullable(),
  })
  .strict();

const errorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .strict(),
    usage: usageSchema.optional(),
  })
  .strict();

export type AskUsage = z.infer<typeof usageSchema>;
export type AskResponse = z.infer<typeof askResponseSchema>;
export type AskAnswerBlock = z.infer<typeof answerBlockSchema>;
export type AskCitation = z.infer<typeof citationSchema>;
export type AskVisual = z.infer<typeof visualSchema>;

export interface AskRequest {
  requestId: string;
  boardId: string;
  classId: string;
  subjectId: string;
  chapterId?: string;
  question: string;
  answerMode: "short" | "long";
  answerStyle: "exam_style";
}

export type TokenProvider = () => Promise<string>;

const RETRYABLE_CODES = new Set([
  "AI_SERVICE_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_FAILURE",
]);

export class AskApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly usage?: AskUsage,
  ) {
    super(message);
    this.name = "AskApiError";
  }
}

async function authenticatedFetch(
  input: string,
  init: RequestInit,
  getToken: TokenProvider,
): Promise<Response> {
  let token: string;
  try {
    token = await getToken();
  } catch {
    throw new AskApiError(
      "AUTHENTICATION_EXPIRED",
      "Your sign-in has expired. Please sign in again.",
      401,
      false,
    );
  }

  return fetch(input, {
    ...init,
    cache: "no-store",
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

async function parseJsonResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = errorSchema.safeParse(body);
    const code =
      response.status === 401
        ? "AUTHENTICATION_EXPIRED"
        : parsedError.success
          ? parsedError.data.error.code
          : "AI_SERVICE_UNAVAILABLE";
    const message =
      response.status === 401
        ? "Your sign-in has expired. Please sign in again."
        : parsedError.success
          ? parsedError.data.error.message
          : "Ask service is temporarily unavailable.";
    throw new AskApiError(
      code,
      message,
      response.status,
      response.status >= 500 || RETRYABLE_CODES.has(code),
      parsedError.success ? parsedError.data.usage : undefined,
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AskApiError(
      "CONFIGURATION_ERROR",
      "The Ask service returned an invalid response.",
      503,
      true,
    );
  }
  return parsed.data;
}

export async function loadAskUsage(
  getToken: TokenProvider,
  signal?: AbortSignal,
): Promise<AskUsage> {
  const response = await authenticatedFetch(
    "/api/ai/usage",
    { method: "GET", signal },
    getToken,
  );
  return parseJsonResponse(response, usageSchema);
}

export async function askQuestion(
  request: AskRequest,
  getToken: TokenProvider,
  signal?: AbortSignal,
): Promise<AskResponse> {
  const response = await authenticatedFetch(
    "/api/ai/ask",
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    getToken,
  );
  return parseJsonResponse(response, askResponseSchema);
}

const ALLOWED_VISUAL_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export async function loadAskVisual(
  visualId: string,
  requestId: string,
  getToken: TokenProvider,
  signal?: AbortSignal,
): Promise<Blob> {
  const path = `/api/ai/visual/${encodeURIComponent(visualId)}?requestId=${encodeURIComponent(requestId)}`;
  const response = await authenticatedFetch(
    path,
    { method: "GET", signal },
    getToken,
  );
  if (!response.ok) {
    throw new AskApiError(
      response.status === 401
        ? "AUTHENTICATION_EXPIRED"
        : "VISUAL_UNAVAILABLE",
      "This reviewed visual is unavailable.",
      response.status,
      response.status >= 500,
    );
  }
  const contentType = response.headers.get("content-type")?.split(";")[0].trim();
  if (!contentType || !ALLOWED_VISUAL_TYPES.has(contentType)) {
    throw new AskApiError(
      "VISUAL_UNAVAILABLE",
      "This reviewed visual is unavailable.",
      502,
      false,
    );
  }
  return response.blob();
}
