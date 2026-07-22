import { BoardSelector } from '../../components/selectors/BoardSelector';
import { ClassSelector } from '../../components/selectors/ClassSelector';
import { SubjectSelector } from '../../components/selectors/SubjectSelector';
import { ChapterSelector } from '../../components/selectors/ChapterSelector';

import { notFound } from "next/navigation";

export default function TestCataloguePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="p-8 max-w-2xl mx-auto space-y-6 bg-gray-50 min-h-screen text-gray-900">
      <h1 className="text-3xl font-bold mb-2">Catalogue Selectors Test</h1>
      <p className="text-gray-600 mb-8">
        Test the cascading dropdowns. Selecting a parent loads the children. Changing a parent clears the dependent children. 
      </p>
      
      <div className="space-y-6 p-6 bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-2 border-dashed border-indigo-200 rounded-lg">
          <h2 className="text-sm font-bold text-indigo-600 mb-2">Selector 1</h2>
          <BoardSelector />
        </div>
        
        <div className="p-4 border-2 border-dashed border-pink-200 rounded-lg">
          <h2 className="text-sm font-bold text-pink-600 mb-2">Selector 2 (Deduplication Test)</h2>
          <BoardSelector />
          <p className="text-xs text-gray-500 mt-2">
            Notice that loading Selector 2 does not cause a second Firestore request in the network tab.
          </p>
        </div>

        <ClassSelector />
        <SubjectSelector />
        <ChapterSelector />
      </div>
    </main>
  );
}
