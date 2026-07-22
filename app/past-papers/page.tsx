import { listPublicResources } from "@/lib/resources/public";
import { ContentBrowser } from "@/components/content/ContentBrowser";

type PageProps = {
  searchParams: Promise<{
    boardId?: string;
    classId?: string;
    subjectId?: string;
    chapterId?: string;
    examinationBoardId?: string;
    paperYear?: string;
    paperSession?: string;
    paperType?: string;
  }>;
};

export default async function PastPapersPage({ searchParams }: PageProps) {
  const params = await searchParams;

  let initialData = undefined;
  let initialNextCursor = null;

  if (params.boardId && params.classId && params.subjectId) {
    try {
      const parsedYear = params.paperYear ? parseInt(params.paperYear, 10) : undefined;
      const res = await listPublicResources({
        boardId: params.boardId,
        classId: params.classId,
        subjectId: params.subjectId,
        chapterId: params.chapterId,
        examinationBoardId: params.examinationBoardId,
        paperYear: isNaN(parsedYear!) ? undefined : parsedYear,
        paperSession: params.paperSession,
        paperType: params.paperType,
        type: "past_paper",
      });
      initialData = res.data;
      initialNextCursor = res.nextCursor;
    } catch {
      // Fallback
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <ContentBrowser
        resourceType="past_paper"
        title="Past Examination Papers"
        description="Filter and practice with previous year examination papers, solutions, and marking schemes."
        initialData={initialData}
        initialNextCursor={initialNextCursor}
        initialSearchParams={params}
      />
    </main>
  );
}
