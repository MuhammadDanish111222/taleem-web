import { notFound } from "next/navigation";
import Link from "next/link";
import { getResource } from "@/lib/repositories/firestore/resourceRepository";
import { ResourceError } from "@/lib/resources/errors";
import { PdfReader } from "@/components/content/PdfReader";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    resourceId: string;
  }>;
};

export default async function ResourceReaderPage({ params }: PageProps) {
  const { resourceId } = await params;

  let resource;
  try {
    resource = await getResource(resourceId);
  } catch (err) {
    if (err instanceof ResourceError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  // Publication status recheck invariant: non-published states 404 immediately
  if (resource.status !== "published") {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header / Navigation Bar */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full capitalize">
                {resource.type.replace("_", " ")}
              </span>
              <span className="text-xs text-gray-400">&bull;</span>
              <span className="text-xs font-medium text-gray-500 uppercase">{resource.boardId}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{resource.title}</h1>
          </div>

          <div className="flex items-center space-x-4">
            <a
              href={`/api/content/${resourceId}/download`}
              download
              className="py-2 px-4 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm flex items-center space-x-2"
            >
              <span>Download PDF</span>
            </a>
          </div>
        </div>

        {/* Reader Container */}
        <section>
          <PdfReader
            previewUrl={`/api/content/${resourceId}/preview`}
            title={resource.title}
          />
        </section>
      </div>
    </main>
  );
}
