"use client";

import { useRouter } from "next/navigation";
import { useCatalogueSelection } from "../../lib/state/catalogueSelection";
import { BoardSelector } from "../selectors/BoardSelector";
import { ClassSelector } from "../selectors/ClassSelector";
import { SubjectSelector } from "../selectors/SubjectSelector";

export default function CatalogueHero() {
  const router = useRouter();
  const { boardId, classId, subjectId } = useCatalogueSelection();

  const isReady = boardId && classId && subjectId;

  const handleGo = () => {
    if (isReady) {
      router.push(`/${boardId}/${classId}/${subjectId}`);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-4xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BoardSelector />
        <ClassSelector />
        <SubjectSelector />
      </div>
      <div className="flex justify-end mt-4">
        <button
          onClick={handleGo}
          disabled={!isReady}
          className={`px-8 py-3 rounded-md font-semibold transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none ${
            isReady
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
        >
          Go
        </button>
      </div>
    </div>
  );
}
