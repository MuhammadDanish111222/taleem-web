import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBoardServer,
  getChaptersServer,
  getClassServer,
  getSubjectServer,
} from "@/lib/firestore/catalogue.server";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{
    boardId: string;
    classId: string;
    subjectId: string;
    chapterId: string;
  }>;
}) {
  const { boardId, classId, subjectId, chapterId } = await params;
  const [board, classDoc, subject, chapters] = await Promise.all([
    getBoardServer(boardId),
    getClassServer(boardId, classId),
    getSubjectServer(boardId, classId, subjectId),
    getChaptersServer(boardId, classId, subjectId),
  ]);
  const chapter = chapters.find((item) => item.slug === chapterId);
  if (!board || !classDoc || !subject || !chapter) notFound();

  const query = new URLSearchParams({ boardId, classId, subjectId, chapterId }).toString();
  const destinations = [
    { title: "Chapter notes", description: "Read or download notes for this chapter.", href: `/notes?${query}` },
    { title: "Books", description: "Open textbooks and chapter-specific books.", href: `/books?${query}` },
    { title: "Past papers", description: "Find chapter-linked examination material.", href: `/past-papers?${query}` },
  ];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="rounded-xl border border-gray-100 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
            {board.name} · {classDoc.name} · {subject.name}
          </p>
          <h1 className="mt-3 text-4xl font-bold text-gray-900">
            Chapter {chapter.chapter_number}: {chapter.title}
          </h1>
          <Link href={`/${boardId}/${classId}/${subjectId}`} className="mt-4 inline-block text-sm font-medium text-blue-600">
            ← All chapters
          </Link>
        </header>
        <section className="grid gap-5 md:grid-cols-3">
          {destinations.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md">
              <h2 className="text-lg font-semibold text-gray-900">{item.title}</h2>
              <p className="mt-2 text-sm text-gray-500">{item.description}</p>
              <span className="mt-5 inline-block text-sm font-semibold text-blue-600">Open →</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
