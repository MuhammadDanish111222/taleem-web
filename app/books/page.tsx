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

export default async function BooksPage({ searchParams }: PageProps) {
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
        type: "book",
      });
      initialData = res.data;
      initialNextCursor = res.nextCursor;
    } catch {
      // If validation / hierarchy check fails server-side, fallback to empty client loading
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <ContentBrowser
        resourceType="book"
        title="Textbooks & Books"
        description="Browse and read online textbooks for your board and grade."
        initialData={initialData}
        initialNextCursor={initialNextCursor}
        initialSearchParams={params}
      />
    </main>
  );
}
