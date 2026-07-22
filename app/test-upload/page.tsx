"use client";

import React, { useState } from "react";
import { notFound } from "next/navigation";

export default function TestUploadPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const [targetEndpoint, setTargetEndpoint] = useState<"real" | "diagnostic">("real");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Firestore Inspection State
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const handleUpload = async (fileToUpload: File) => {
    setLoading(true);
    setResult(null);
    setError(null);
    setInspectData(null);

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);

      let url = "/api/test-upload";
      const headers: Record<string, string> = {};

      if (targetEndpoint === "real") {
        url = "/api/admin/content/upload";

        // Required Metadata fields for real route
        formData.append("operation", "create_resource");
        formData.append("type", "book");
        formData.append("title", "Physics Class 9 Textbook");
        formData.append("boardId", "fbise");
        formData.append("classId", "class-9");
        formData.append("subjectId", "physics");
        formData.append("language", "en");
        formData.append("curriculumVersion", "2024");
        formData.append("displayOrder", "1");

        // Set CSRF Cookie
        document.cookie = "__csrf=test-csrf-token; path=/;";

        // Required headers for real route
        headers["X-CSRF-Token"] = "test-csrf-token";
        headers["Idempotency-Key"] = `idem-test-${Date.now()}`;
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status} Error`);
      }
      setResult({ status: res.status, data });
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleInspectFirestore = async (transactionId: string, resourceId: string) => {
    setInspectLoading(true);
    try {
      const res = await fetch(
        `/api/test-upload/inspect?transactionId=${encodeURIComponent(
          transactionId
        )}&resourceId=${encodeURIComponent(resourceId)}`
      );
      const data = await res.json();
      setInspectData(data);
    } catch (err: any) {
      alert("Failed to inspect Firestore: " + err.message);
    } finally {
      setInspectLoading(false);
    }
  };

  const handlePresetFakePdf = () => {
    const fakeBlob = new Blob(["HTML5 text content... invalid PDF file"], {
      type: "application/pdf",
    });
    const fakeFile = new File([fakeBlob], "fake_document.pdf", {
      type: "application/pdf",
    });
    setSelectedFile(fakeFile);
    handleUpload(fakeFile);
  };

  const handlePresetValidPdfHeader = () => {
    const validHeaderStr = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n";
    const pdfBlob = new Blob([validHeaderStr], { type: "application/pdf" });
    const validFile = new File([pdfBlob], "test_doc.pdf", {
      type: "application/pdf",
    });
    setSelectedFile(validFile);
    handleUpload(validFile);
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-slate-800 pb-6 flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
              <span className="bg-indigo-600 text-white text-xs px-3 py-1 rounded-full uppercase tracking-wider font-semibold">
                UI Tester
              </span>
              Secure PDF Upload Pipeline Tester
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              Test both the isolated diagnostic parser AND the real end-to-end production API route (`/api/admin/content/upload`).
            </p>
          </div>

          {/* Endpoint Toggle */}
          <div className="bg-slate-800 p-1.5 rounded-xl border border-slate-700 flex gap-2">
            <button
              type="button"
              onClick={() => setTargetEndpoint("real")}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
                targetEndpoint === "real"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🚀 Real Production Route (/api/admin/content/upload)
            </button>
            <button
              type="button"
              onClick={() => setTargetEndpoint("diagnostic")}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
                targetEndpoint === "diagnostic"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🧪 Isolated Diagnostic Route (/api/test-upload)
            </button>
          </div>
        </div>

        {/* Current Mode Info */}
        <div className="bg-indigo-950/40 border border-indigo-500/30 p-4 rounded-xl text-xs text-indigo-200 flex items-center justify-between">
          <span>
            Active Endpoint:{" "}
            <strong className="text-white font-mono">
              {targetEndpoint === "real"
                ? "/api/admin/content/upload (Full Pipeline: UploadService + Firestore + Drive)"
                : "/api/test-upload (Diagnostic Only: multipartUpload.ts + pdfValidation.ts)"}
            </strong>
          </span>
        </div>

        {/* Quick Presets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={handlePresetFakePdf}
            disabled={loading}
            className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition text-left space-y-2 group disabled:opacity-50"
          >
            <div className="flex justify-between items-center">
              <span className="font-bold text-amber-400 group-hover:underline">
                ⚡ Test Preset 1: Fake / Invalid PDF
              </span>
              <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                Expect 422 Rejection
              </span>
            </div>
            <p className="text-xs text-amber-200/70">
              Sends non-PDF header (`HTML5...`). Validates magic bytes rejection without hanging.
            </p>
          </button>

          <button
            type="button"
            onClick={handlePresetValidPdfHeader}
            disabled={loading}
            className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition text-left space-y-2 group disabled:opacity-50"
          >
            <div className="flex justify-between items-center">
              <span className="font-bold text-emerald-400 group-hover:underline">
                ⚡ Test Preset 2: Valid PDF Header
              </span>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">
                Expect Magic Bytes OK
              </span>
            </div>
            <p className="text-xs text-emerald-200/70">
              Sends `%PDF-1.4...` header. Verifies chunk magic bytes accumulator.
            </p>
          </button>
        </div>

        {/* Custom File Upload Box */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 space-y-4 shadow-xl">
          <h2 className="text-lg font-bold text-slate-200">
            Or Choose Any Custom File to Test
          </h2>
          <div className="flex items-center gap-4">
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSelectedFile(file);
                  handleUpload(file);
                }
              }}
              className="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="p-6 bg-slate-800/40 rounded-xl border border-slate-700/50 flex items-center justify-center gap-3 text-indigo-400">
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="font-medium text-sm">Processing upload request...</span>
          </div>
        )}

        {/* Diagnostic Results Card */}
        {result && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-700/60 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                📊 Response Result
              </h3>
              <span
                className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${
                  result.status >= 200 && result.status < 300
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : result.status === 422
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    : "bg-red-500/20 text-red-400 border border-red-500/40"
                }`}
              >
                HTTP Status: {result.status}
              </span>
            </div>

            {/* Response Highlights */}
            {result.data?.transactionId && (
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-emerald-400 font-bold text-sm">
                    🎉 Production Pipeline Success! Transaction Committed
                  </span>
                  {result.data?.transactionId && result.data?.resourceId && (
                    <button
                      type="button"
                      onClick={() =>
                        handleInspectFirestore(
                          result.data.transactionId,
                          result.data.resourceId
                        )
                      }
                      disabled={inspectLoading}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition flex items-center gap-1.5"
                    >
                      {inspectLoading ? "Loading..." : "🔍 Inspect Firestore Docs"}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-xs text-slate-300">
                  <div>
                    <span className="text-slate-500 block">Transaction ID:</span>
                    <span className="text-emerald-300 truncate block">
                      {result.data.transactionId}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Resource ID:</span>
                    <span className="text-emerald-300 truncate block">
                      {result.data.resourceId}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Version ID:</span>
                    <span className="text-emerald-300 truncate block">
                      {result.data.versionId}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Firestore Documents Live Inspection */}
            {inspectData && (
              <div className="p-4 bg-slate-900 border border-indigo-500/40 rounded-lg space-y-3">
                <h4 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                  📜 Firestore Documents Inspection (`upload_transactions` & `resources`)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-slate-400 font-semibold block mb-1">
                      Doc: `upload_transactions/{result.data?.transactionId}`
                    </span>
                    <pre className="bg-slate-950 p-3 rounded text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-60 border border-slate-800">
                      {JSON.stringify(inspectData.transaction, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 font-semibold block mb-1">
                      Doc: `resources/{result.data?.resourceId}`
                    </span>
                    <pre className="bg-slate-950 p-3 rounded text-[11px] font-mono text-indigo-300 overflow-x-auto max-h-60 border border-slate-800">
                      {JSON.stringify(inspectData.resource, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Raw JSON */}
            <div>
              <span className="text-xs text-slate-400 mb-2 block font-medium">
                Raw JSON Response:
              </span>
              <pre className="bg-slate-950 p-4 rounded-lg text-xs font-mono text-indigo-300 overflow-x-auto border border-slate-800">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm font-medium">
            ⚠️ Response Error: {error}
          </div>
        )}
      </div>
    </main>
  );
}
