import { listPublicResources } from "@/lib/resources/public";
import { ContentBrowser } from "@/components/content/ContentBrowser";

type PageProps = {
  searchParams: Promise<{
    boardId?: string;
    classId?: string;
    subjectId?: string;
    chapterId?: string;
  }>;
};

export default async function NotesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  let initialData = undefined;
  let initialNextCursor = null;

  if (params.boardId && params.classId && params.subjectId) {
    try {
      const res = await listPublicResources({
        boardId: params.boardId,
        classId: params.classId,
        subjectId: params.subjectId,
        chapterId: params.chapterId,
        type: "note",
      });
      initialData = res.data;
      initialNextCursor = res.nextCursor;
    } catch {
      // Fallback if invalid
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <ContentBrowser
        resourceType="note"
        title="Study Notes & Summaries"
        description="Comprehensive revision notes, chapter summaries, and solved exercises."
        initialData={initialData}
        initialNextCursor={initialNextCursor}
        initialSearchParams={params}
      />
    </main>
  );
}
