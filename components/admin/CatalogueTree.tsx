"use client";

import { useState } from "react";
import CatalogueItemForm from "./CatalogueItemForm";
import { adminCatalogueMutation } from "@/lib/client/adminCatalogueMutation";
import { clearCatalogueReadCache } from "@/lib/hooks/useCatalogueOptions";
import { useRouter } from "next/navigation";
import { CatalogueMutation } from "@/lib/validation/catalogue";

function CatalogueNode({
  level,
  item,
  parentIds,
  siblings,
  index,
  handleReorder,
  handleToggleActive,
  setFormConfig,
  loadingId,
}: any) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isChapter = level === "chapter";
  const displayName = isChapter ? `Ch ${item.chapter_number}: ${item.title}` : item.name;
  const childLevel = level === "board" ? "class" : level === "class" ? "subject" : level === "subject" ? "chapter" : null;
  const childrenKey = level === "board" ? "classes" : level === "class" ? "subjects" : level === "subject" ? "chapters" : null;
  const children = childrenKey ? item[childrenKey] : [];
  const examinationBoards = level === "board" ? item.examinationBoards || [] : [];

  const currentIds = { ...parentIds };
  if (level === "board") currentIds.boardId = item.slug;
  if (level === "examinationBoard") currentIds.examinationBoardId = item.slug;
  if (level === "class") currentIds.classId = item.slug;
  if (level === "subject") currentIds.subjectId = item.slug;
  if (level === "chapter") currentIds.chapterId = item.slug;

  const hasChildren = (children && children.length > 0) || examinationBoards.length > 0;

  return (
    <div className="mb-2">
      <div className={`flex items-center justify-between p-3.5 rounded-xl border ${item.active ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-200 border-dashed opacity-75'}`}>
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1 w-6 items-center">
            <button 
              onClick={() => handleReorder(level, siblings, parentIds, "up", index)}
              disabled={index === 0 || loadingId !== null}
              className="text-slate-400 hover:text-blue-600 disabled:opacity-30 leading-none font-bold"
              title="Move Up"
            >
              ▲
            </button>
            <button 
              onClick={() => handleReorder(level, siblings, parentIds, "down", index)}
              disabled={index === siblings.length - 1 || loadingId !== null}
              className="text-slate-400 hover:text-blue-600 disabled:opacity-30 leading-none font-bold"
              title="Move Down"
            >
              ▼
            </button>
          </div>
          
          {childLevel && (
             <button 
               onClick={() => setIsExpanded(!isExpanded)}
               className={`w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors ${!hasChildren && 'opacity-30 cursor-default hover:bg-transparent'}`}
               disabled={!hasChildren}
             >
               {hasChildren ? (
                 <svg 
                   className={`w-4 h-4 text-slate-700 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                   fill="none" viewBox="0 0 24 24" stroke="currentColor"
                 >
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                 </svg>
               ) : (
                 <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
               )}
             </button>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                {level}
              </span>
              <span className="font-bold text-slate-900 cursor-pointer hover:text-blue-700" onClick={() => hasChildren && setIsExpanded(!isExpanded)}>
                {displayName}
              </span>
              {!item.active && (
                <span className="text-xs font-semibold text-red-800 bg-red-100 px-2 py-0.5 rounded">
                  Inactive
                </span>
              )}
            </div>
            <div className="text-xs text-slate-600 mt-1 font-mono font-medium">
              {item.slug}
              {level === "board" && ` (${children.length} classes, ${examinationBoards.length} exam boards)`}
              {level !== "board" && hasChildren && ` (${children.length} ${childrenKey})`}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleToggleActive(level, item, parentIds)}
            disabled={loadingId === item.slug}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${item.active ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'}`}
          >
            {loadingId === item.slug ? "..." : item.active ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={() => setFormConfig({ isOpen: true, initialData: item, level, parentIds })}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 rounded-lg shadow-sm"
          >
            Edit
          </button>
          {childLevel && (
            <button
              onClick={() => {
                setFormConfig({ isOpen: true, level: childLevel as any, parentIds: currentIds });
                setIsExpanded(true); // Auto-expand when adding a child
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100 rounded-lg"
            >
              + Add {childLevel}
            </button>
          )}
          {level === "board" && (
            <button
              onClick={() => {
                setFormConfig({
                  isOpen: true,
                  level: "examinationBoard",
                  parentIds: { boardId: item.slug },
                });
                setIsExpanded(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-800 hover:bg-indigo-100 rounded-lg"
            >
              + Add exam board
            </button>
          )}
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="ml-9 mt-2 border-l-2 border-gray-100 dark:border-gray-700 pl-4">
          {level === "board" && examinationBoards.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                Examination boards
              </p>
              {examinationBoards.map((examBoard: any, examIndex: number) => (
                <CatalogueNode
                  key={examBoard.slug}
                  level="examinationBoard"
                  item={examBoard}
                  parentIds={{ boardId: item.slug }}
                  siblings={examinationBoards}
                  index={examIndex}
                  handleReorder={handleReorder}
                  handleToggleActive={handleToggleActive}
                  setFormConfig={setFormConfig}
                  loadingId={loadingId}
                />
              ))}
            </div>
          )}
          {children.map((child: any, childIdx: number) => (
            <CatalogueNode
              key={child.slug}
              level={childLevel as any}
              item={child}
              parentIds={currentIds}
              siblings={children}
              index={childIdx}
              handleReorder={handleReorder}
              handleToggleActive={handleToggleActive}
              setFormConfig={setFormConfig}
              loadingId={loadingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CatalogueTree({ initialTree }: { initialTree: any[] }) {
  const router = useRouter();
  const [formConfig, setFormConfig] = useState<{
    isOpen: boolean;
    initialData?: any;
    level: "board" | "examinationBoard" | "class" | "subject" | "chapter";
    parentIds: any;
  } | null>(null);

  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleToggleActive = async (level: any, item: any, parentIds: any) => {
    setLoadingId(item.slug);
    try {
      const mutation: any = {
        operation: "toggle",
        level,
        active: !item.active,
        ...parentIds
      };
      
      if (level === "board") mutation.boardId = item.slug;
      if (level === "examinationBoard") mutation.examinationBoardId = item.slug;
      if (level === "class") mutation.classId = item.slug;
      if (level === "subject") mutation.subjectId = item.slug;
      if (level === "chapter") mutation.chapterId = item.slug;

      await adminCatalogueMutation(mutation as CatalogueMutation);
      clearCatalogueReadCache();
      router.refresh();
    } catch (e) {
      alert("Failed to toggle status");
    } finally {
      setLoadingId(null);
    }
  };

  const handleReorder = async (level: any, items: any[], parentIds: any, direction: "up" | "down", index: number) => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === items.length - 1) return;

    const newItems = [...items];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    
    // Swap
    [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
    
    const orderedIds = newItems.map(i => i.slug);

    setLoadingId(`reorder-${items[index].slug}`);
    try {
      const mutation: any = {
        operation: "reorder",
        level,
        orderedIds,
        ...parentIds
      };

      await adminCatalogueMutation(mutation as CatalogueMutation);
      clearCatalogueReadCache();
      router.refresh();
    } catch (e) {
      alert("Failed to reorder");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="p-6 text-slate-900">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Catalogue Management</h2>
        <button
          onClick={() => setFormConfig({ isOpen: true, level: "board", parentIds: {} })}
          className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-600 font-semibold shadow-sm text-sm"
        >
          + Add Board
        </button>
      </div>

      <div className="space-y-3">
        {initialTree.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200 shadow-sm">
            <p className="text-sm font-medium text-slate-500">No boards exist. Create one to get started.</p>
          </div>
        ) : (
          initialTree.map((board, index) => (
            <CatalogueNode
              key={board.slug}
              level="board"
              item={board}
              parentIds={{}}
              siblings={initialTree}
              index={index}
              handleReorder={handleReorder}
              handleToggleActive={handleToggleActive}
              setFormConfig={setFormConfig}
              loadingId={loadingId}
            />
          ))
        )}
      </div>

      {formConfig?.isOpen && (
        <CatalogueItemForm
          initialData={formConfig.initialData}
          level={formConfig.level}
          parentIds={formConfig.parentIds}
          onClose={() => setFormConfig(null)}
          onSuccess={() => setFormConfig(null)}
        />
      )}
    </div>
  );
}
