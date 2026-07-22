"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicResourceDto } from "@/lib/resources/types";
import { BoardSelector } from "@/components/selectors/BoardSelector";
import { ClassSelector } from "@/components/selectors/ClassSelector";
import { SubjectSelector } from "@/components/selectors/SubjectSelector";
import { ChapterSelector } from "@/components/selectors/ChapterSelector";
import { useCatalogueSelection } from "@/lib/state/catalogueSelection";

interface ContentBrowserProps {
  resourceType: "book" | "note" | "past_paper";
  title: string;
  description: string;
  initialData?: PublicResourceDto[];
  initialNextCursor?: string | null;
  initialSearchParams?: {
    boardId?: string;
    classId?: string;
    subjectId?: string;
    chapterId?: string;
    examinationBoardId?: string;
    paperYear?: string;
    paperSession?: string;
    paperType?: string;
  };
}

export function ContentBrowser({
  resourceType,
  title,
  description,
  initialData = [],
  initialNextCursor = null,
  initialSearchParams = {},
}: ContentBrowserProps) {
  const {
    boardId,
    classId,
    subjectId,
    chapterId,
    setBoard,
    setClass,
    setSubject,
    setChapter,
  } = useCatalogueSelection();

  // Past paper filter states
  const [examinationBoardId, setExaminationBoardId] = useState<string>(initialSearchParams.examinationBoardId || "");
  const [paperYear, setPaperYear] = useState<string>(initialSearchParams.paperYear || "");
  const [paperSession, setPaperSession] = useState<string>(initialSearchParams.paperSession || "");
  const [paperType, setPaperType] = useState<string>(initialSearchParams.paperType || "");

  const [resources, setResources] = useState<PublicResourceDto[]>(initialData);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync search params on initial load if provided
  useEffect(() => {
    if (initialSearchParams.boardId) setBoard(initialSearchParams.boardId);
    if (initialSearchParams.classId) setClass(initialSearchParams.classId);
    if (initialSearchParams.subjectId) setSubject(initialSearchParams.subjectId);
    if (initialSearchParams.chapterId) setChapter(initialSearchParams.chapterId);
  }, []);

  const fetchResources = async (cursor?: string) => {
    if (!boardId || !classId || !subjectId) return;

    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams();
      params.set("boardId", boardId);
      params.set("classId", classId);
      params.set("subjectId", subjectId);
      params.set("type", resourceType);

      if (chapterId) params.set("chapterId", chapterId);
      if (examinationBoardId) params.set("examinationBoardId", examinationBoardId);
      if (paperYear) params.set("paperYear", paperYear);
      if (paperSession) params.set("paperSession", paperSession);
      if (paperType) params.set("paperType", paperType);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/content?${params.toString()}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch content");
      }

      const data = await res.json();
      if (cursor) {
        setResources((prev) => [...prev, ...data.data]);
      } else {
        setResources(data.data);
      }
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (boardId && classId && subjectId) {
      fetchResources();
    } else {
      setResources([]);
      setNextCursor(null);
    }
  }, [boardId, classId, subjectId, chapterId, examinationBoardId, paperYear, paperSession, paperType]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <header className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-gray-600">{description}</p>
      </header>

      {/* Catalogue Filter Panel */}
      <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Select Curriculum & Hierarchy</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <BoardSelector />
          <ClassSelector />
          <SubjectSelector />
          <ChapterSelector />
        </div>

        {/* Past Paper Specific Filters */}
        {resourceType === "past_paper" && (
          <div className="pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Exam Board ID</label>
              <input
                type="text"
                value={examinationBoardId}
                onChange={(e) => setExaminationBoardId(e.target.value)}
                placeholder="e.g. fbise"
                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Paper Year</label>
              <input
                type="number"
                value={paperYear}
                onChange={(e) => setPaperYear(e.target.value)}
                placeholder="e.g. 2023"
                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Paper Session</label>
              <input
                type="text"
                value={paperSession}
                onChange={(e) => setPaperSession(e.target.value)}
                placeholder="e.g. annual"
                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Paper Type</label>
              <input
                type="text"
                value={paperType}
                onChange={(e) => setPaperType(e.target.value)}
                placeholder="e.g. subjective"
                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border"
              />
            </div>
          </div>
        )}
      </section>

      {/* Results Section */}
      <section className="space-y-4">
        {!boardId || !classId || !subjectId ? (
          <div className="bg-white p-12 text-center rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500">Please select a Board, Class, and Subject to view available {title.toLowerCase()}.</p>
          </div>
        ) : loading ? (
          <div className="bg-white p-12 text-center rounded-xl shadow-sm border border-gray-100 flex justify-center items-center space-x-3">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600">Loading resources...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 p-6 rounded-xl border border-red-200 text-red-700 text-center">
            <p className="font-semibold">{error}</p>
          </div>
        ) : resources.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500">No published resources found for the selected criteria.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {resources.map((item) => (
                <div
                  key={item.id}
                  className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow"
                >
                  <div className="space-y-3">
                    <span className="inline-block px-2.5 py-0.5 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full capitalize">
                      {item.type.replace("_", " ")}
                    </span>
                    <h3 className="text-lg font-bold text-gray-900 leading-snug">{item.title}</h3>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>Language: <span className="font-medium text-gray-700">{item.language}</span></p>
                      <p>Curriculum: <span className="font-medium text-gray-700">{item.curriculumVersion}</span></p>
                      {item.paperYear && (
                        <p>Year: <span className="font-medium text-gray-700">{item.paperYear}</span> {item.paperSession && `(${item.paperSession})`}</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 flex items-center justify-between gap-3 border-t border-gray-100 mt-4">
                    <Link
                      href={`/content/${item.id}`}
                      className="flex-1 text-center py-2 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      Read Online
                    </Link>
                    <a
                      href={`/api/content/${item.id}/download`}
                      download
                      className="flex-1 text-center py-2 px-3 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {nextCursor && (
              <div className="text-center pt-6">
                <button
                  onClick={() => fetchResources(nextCursor)}
                  disabled={loadingMore}
                  className="py-2.5 px-6 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loadingMore ? "Loading more..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
