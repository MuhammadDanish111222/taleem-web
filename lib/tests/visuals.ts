import type { TokenProvider } from "@/lib/api/ask";
import type { PaperPresentationModel } from "@/lib/tests/paper";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const cache = new Map<string, Promise<Blob>>();

export async function loadTestPaperVisual(
  paper: PaperPresentationModel,
  questionId: string,
  visualId: string,
  getToken: TokenProvider,
  signal?: AbortSignal,
): Promise<Blob> {
  const parameters = new URLSearchParams({
    questionId,
    visualId,
    boardId: paper.response.board_id,
    classId: paper.response.class_id,
    subjectId: paper.response.subject_id,
  });
  const key = parameters.toString();
  const cached = cache.get(key);
  if (cached) return cached;
  const task = (async () => {
    const token = await getToken();
    const response = await fetch(`/api/tests/visual?${key}`, {
      method: "GET",
      cache: "no-store",
      signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (!response.ok || !contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error("TEST_PAPER_VISUAL_UNAVAILABLE");
    }
    return response.blob();
  })();
  cache.set(key, task);
  try { return await task; }
  catch (error) { cache.delete(key); throw error; }
}
