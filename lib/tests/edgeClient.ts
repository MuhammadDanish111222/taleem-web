import "server-only";

const EDGE_TIMEOUT_MS = 12_000;

export class TestGeneratorUpstreamError extends Error {
  constructor(public status: number, public payload: unknown) { super("TEST_GENERATOR_UPSTREAM"); }
}

export async function callTestGeneratorEdge(token: string, body: unknown): Promise<unknown> {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("TEST_GENERATOR_UNAVAILABLE");
  const response = await fetch(`${baseUrl}/functions/v1/generate-test-paper`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(EDGE_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new TestGeneratorUpstreamError(response.status, payload);
  return payload;
}

/** Server-only companion to generation: resolves a paper-safe visual reference. */
export async function callTestPaperVisualReference(token: string, body: unknown): Promise<unknown> {
  return callTestGeneratorEdge(token, body);
}
