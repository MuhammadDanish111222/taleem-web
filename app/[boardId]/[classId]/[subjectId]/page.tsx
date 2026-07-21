import { notFound } from "next/navigation";
import { 
  getBoardServer, 
  getClassServer, 
  getSubjectServer, 
  getChaptersServer 
} from "../../../../lib/firestore/catalogue.server";

type PageParams = Promise<{
  boardId: string;
  classId: string;
  subjectId: string;
}>;

export default async function SubjectPage({ params }: { params: PageParams }) {
  const { boardId, classId, subjectId } = await params;

  // Validate the exact active hierarchy
  const board = await getBoardServer(boardId);
  if (!board) notFound();

  const classDoc = await getClassServer(boardId, classId);
  if (!classDoc) notFound();

  const subject = await getSubjectServer(boardId, classId, subjectId);
  if (!subject) notFound();

  const chapters = await getChaptersServer(boardId, classId, subjectId);

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center space-x-4 mb-2">
            <span className="text-sm font-medium text-blue-600 uppercase tracking-wider">{board.name}</span>
            <span className="text-gray-300">&bull;</span>
            <span className="text-sm font-medium text-gray-500">{classDoc.name}</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-4">
            {subject.icon && <span className="text-3xl" aria-hidden="true">{subject.icon}</span>}
            {subject.name}
          </h1>
        </header>

        <section>
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Chapters</h2>
          {chapters.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {chapters.map((chapter) => (
                <div 
                  key={chapter.slug} 
                  className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-start space-x-4"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
                    {chapter.chapter_number}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-lg font-medium text-gray-900">{chapter.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white p-12 rounded-lg shadow-sm border border-gray-100 text-center">
              <p className="text-gray-500">No active chapters found for this subject.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
