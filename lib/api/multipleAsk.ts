import type { TokenProvider } from "@/lib/api/ask";

export type MultipleAskInputKind = "image" | "pdf" | "text";
export type MultipleAskMode = "short" | "long" | "mcq" | "not_clear";
export type MultipleAskWorkflowStatus =
  | "queued"
  | "validating"
  | "validated"
  | "extracting"
  | "needs_correction"
  | "ready_to_answer"
  | "answering"
  | "partially_completed"
  | "completed"
  | "invalid"
  | "too_many_questions"
  | "limit_reached"
  | "failed"
  | "cancelled";

export interface MultipleAskScope {
  boardId: string;
  classId: string;
  subjectId: string;
  chapterId?: string | null;
}
export interface MultipleAskOption {
  label: string;
  text: string;
}
export interface MultipleAskResult {
  answerSource: "approved_bank" | "syllabus_grounded" | "general_knowledge";
  blocks: Array<Record<string, unknown>>;
  citations: Array<Record<string, unknown>>;
  visualIds: string[];
  approvedRevisionId: string | null;
}
export interface MultipleAskItem {
  itemId: string;
  itemIndex: number;
  displayLabel: string | null;
  sectionContext: string | null;
  itemStatus:
    | "pending_extraction"
    | "needs_correction"
    | "ready_to_answer"
    | "answering"
    | "answered"
    | "failed"
    | "cancelled";
  normalizedQuestion: string | null;
  answerMode: MultipleAskMode | null;
  mcqOptions: MultipleAskOption[];
  terminalErrorCode?: string | null;
  unclearReason: string | null;
  extractionVersion: number;
  correctionVersion: number;
  correctedAt: string | null;
  result: MultipleAskResult | null;
}
export interface MultipleAskStatus {
  jobId: string;
  workflowStatus: MultipleAskWorkflowStatus;
  inputKind: MultipleAskInputKind;
  scope: MultipleAskScope;
  createdAt: string;
  updatedAt: string;
  retentionExpiresAt: string | null;
  terminalErrorCode: string | null;
  queue: {
    status: string | null;
    stage: string | null;
    progress: number | null;
  };
  items: MultipleAskItem[];
  summary: {
    total: number;
    short: number;
    long: number;
    mcq: number;
    notClear: number;
  };
}
export interface MultipleAskJobStart {
  jobId: string;
  workflowStatus: MultipleAskWorkflowStatus;
  queueStatus: string;
}

export class MultipleAskApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "MultipleAskApiError";
  }
}

async function request(
  path: string,
  init: RequestInit,
  getToken: TokenProvider,
): Promise<unknown> {
  let token: string;
  try {
    token = await getToken();
  } catch {
    throw new MultipleAskApiError("AUTHENTICATION_EXPIRED", 401, false);
  }
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string };
  } | null;
  if (!response.ok)
    throw new MultipleAskApiError(
      body?.error?.code ?? "MULTIPLE_ASK_UNAVAILABLE",
      response.status,
      response.status >= 500,
    );
  return body;
}

function asStart(value: unknown): MultipleAskJobStart {
  const body = value as Partial<MultipleAskJobStart>;
  if (
    !body ||
    typeof body.jobId !== "string" ||
    typeof body.workflowStatus !== "string" ||
    typeof body.queueStatus !== "string"
  )
    throw new MultipleAskApiError("INVALID_RESPONSE", 503, true);
  return body as MultipleAskJobStart;
}

function asStatus(value: unknown): MultipleAskStatus {
  const body = value as Partial<MultipleAskStatus>;
  if (
    !body ||
    typeof body.jobId !== "string" ||
    typeof body.workflowStatus !== "string" ||
    !Array.isArray(body.items) ||
    !body.scope ||
    !body.queue ||
    !body.summary
  )
    throw new MultipleAskApiError("INVALID_RESPONSE", 503, true);
  const raw = body as MultipleAskStatus & {
    summary: MultipleAskStatus["summary"] & { not_clear?: number };
  };
  return {
    ...raw,
    summary: {
      ...raw.summary,
      notClear: raw.summary.notClear ?? raw.summary.not_clear ?? 0,
    },
    items: [...raw.items].sort((a, b) => a.itemIndex - b.itemIndex),
  };
}

export async function createUploadSession(
  input: MultipleAskScope & {
    requestId: string;
    inputKind: "image" | "pdf";
    contentType: string;
    sizeBytes: number;
  },
  getToken: TokenProvider,
  signal?: AbortSignal,
) {
  const body = (await request(
    "/api/ai/multiple-ask/upload-session",
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    getToken,
  )) as {
    sessionId?: string;
    uploadUrl?: string;
    uploadMethod?: "PUT";
    uploadHeaders?: Record<string, string>;
  };
  if (
    !body.sessionId ||
    !body.uploadUrl ||
    body.uploadMethod !== "PUT" ||
    !body.uploadHeaders
  )
    throw new MultipleAskApiError("INVALID_RESPONSE", 503, true);
  return {
    sessionId: body.sessionId,
    uploadUrl: body.uploadUrl,
    uploadMethod: body.uploadMethod,
    uploadHeaders: body.uploadHeaders,
  };
}

/** This deliberately does not use the BFF: bytes go straight to the one-time signed URL. */
export async function putToSignedUpload(
  uploadUrl: string,
  method: "PUT",
  headers: Record<string, string>,
  file: File,
  signal?: AbortSignal,
) {
  const response = await fetch(uploadUrl, {
    method,
    headers,
    body: file,
    signal,
  });
  if (!response.ok)
    throw new MultipleAskApiError(
      "UPLOAD_FAILED",
      response.status,
      response.status >= 500,
    );
}

export async function finalizeUpload(
  input: { requestId: string; sessionId: string },
  getToken: TokenProvider,
  signal?: AbortSignal,
) {
  return asStart(
    await request(
      "/api/ai/multiple-ask/finalize",
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      getToken,
    ),
  );
}
export async function submitPastedText(
  input: MultipleAskScope & { requestId: string; text: string },
  getToken: TokenProvider,
  signal?: AbortSignal,
) {
  return asStart(
    await request(
      "/api/ai/multiple-ask/text",
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      getToken,
    ),
  );
}
export async function getMultipleAskStatus(
  jobId: string,
  getToken: TokenProvider,
  signal?: AbortSignal,
) {
  return asStatus(
    await request(
      `/api/ai/multiple-ask/jobs/${encodeURIComponent(jobId)}`,
      { method: "GET", signal },
      getToken,
    ),
  );
}
export async function submitCorrection(
  jobId: string,
  itemId: string,
  input: {
    requestId: string;
    questionText: string;
    answerMode: Exclude<MultipleAskMode, "not_clear">;
    mcqOptions: MultipleAskOption[];
  },
  getToken: TokenProvider,
  signal?: AbortSignal,
) {
  return asStatus(
    await request(
      `/api/ai/multiple-ask/jobs/${encodeURIComponent(jobId)}/items/${encodeURIComponent(itemId)}/correction`,
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      getToken,
    ),
  );
}
export async function resumeMultipleAskJob(
  jobId: string,
  requestId: string,
  getToken: TokenProvider,
  signal?: AbortSignal,
) {
  return asStart(
    await request(
      `/api/ai/multiple-ask/jobs/${encodeURIComponent(jobId)}/resume`,
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      },
      getToken,
    ),
  );
}

export async function loadMultipleAskVisual(
  jobId: string,
  visualId: string,
  getToken: TokenProvider,
  signal?: AbortSignal,
): Promise<Blob> {
  let token: string;
  try {
    token = await getToken();
  } catch {
    throw new MultipleAskApiError("AUTHENTICATION_EXPIRED", 401, false);
  }
  const response = await fetch(
    `/api/ai/multiple-ask/jobs/${encodeURIComponent(jobId)}/visual/${encodeURIComponent(visualId)}`,
    {
      method: "GET",
      signal,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    .trim();
  if (
    !response.ok ||
    !contentType ||
    !new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]).has(
      contentType,
    )
  )
    throw new MultipleAskApiError(
      "VISUAL_UNAVAILABLE",
      response.status || 502,
      response.status >= 500,
    );
  return response.blob();
}

export const multipleAskTerminalStatuses = new Set<MultipleAskWorkflowStatus>([
  "partially_completed",
  "completed",
  "invalid",
  "too_many_questions",
  "limit_reached",
  "failed",
  "cancelled",
]);
