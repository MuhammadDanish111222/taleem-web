"use client";

import { useState } from "react";
import { adminCatalogueMutation } from "@/lib/client/adminCatalogueMutation";
import { clearCatalogueReadCache } from "@/lib/hooks/useCatalogueOptions";
import { useRouter } from "next/navigation";
import { CatalogueMutation } from "@/lib/validation/catalogue";

interface CatalogueItemFormProps {
  initialData?: any; // If present, mode is edit, otherwise create
  level: "board" | "class" | "subject" | "chapter";
  parentIds: { boardId?: string; classId?: string; subjectId?: string };
  onClose: () => void;
  onSuccess: () => void;
}

export default function CatalogueItemForm({ initialData, level, parentIds, onClose, onSuccess }: CatalogueItemFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [formData, setFormData] = useState({
    slug: initialData?.slug || "",
    name: initialData?.name || "",
    title: initialData?.title || "",
    chapter_number: initialData?.chapter_number || 1,
    icon: initialData?.icon || "",
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const operation = isEdit ? "update" : "create";
      
      let mutation: any = {
        operation,
        level,
        ...parentIds
      };

      if (!isEdit) {
         if (level === "board") mutation.boardId = formData.slug;
         if (level === "class") mutation.classId = formData.slug;
         if (level === "subject") mutation.subjectId = formData.slug;
         if (level === "chapter") mutation.chapterId = formData.slug;
      } else {
         if (level === "board") mutation.boardId = initialData.slug;
         if (level === "class") mutation.classId = initialData.slug;
         if (level === "subject") mutation.subjectId = initialData.slug;
         if (level === "chapter") mutation.chapterId = initialData.slug;
      }

      if (level === "board" || level === "class") {
        mutation.name = formData.name;
      } else if (level === "subject") {
        mutation.name = formData.name;
        if (formData.icon) mutation.icon = formData.icon;
      } else if (level === "chapter") {
        mutation.title = formData.title;
        mutation.chapter_number = Number(formData.chapter_number);
      }

      await adminCatalogueMutation(mutation as CatalogueMutation);
      clearCatalogueReadCache();
      router.refresh();
      onSuccess();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            {isEdit ? "Edit" : "Create"} {level.charAt(0).toUpperCase() + level.slice(1)}
          </h3>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Slug (Identifier)
            </label>
            <input
              type="text"
              required
              disabled={isEdit}
              pattern="^[a-z0-9-]+$"
              title="Lowercase alphanumeric and dashes only"
              value={isEdit ? initialData.slug : formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
            />
            {!isEdit && <p className="text-xs text-gray-500 mt-1">Cannot be changed after creation.</p>}
          </div>

          {(level === "board" || level === "class" || level === "subject") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          )}

          {level === "subject" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Icon (Optional)
              </label>
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          )}

          {level === "chapter" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Chapter Number
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.chapter_number}
                  onChange={(e) => setFormData({ ...formData, chapter_number: Number(e.target.value) })}
                  className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
