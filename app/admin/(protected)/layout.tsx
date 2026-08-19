import { requireAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "./LogoutButton";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";

async function AuthGuard({ children }: { children: React.ReactNode }) {
  let decodedToken;
  try {
    decodedToken = await requireAdminSession();
  } catch (error: any) {
    if (error.message === "UNAUTHENTICATED") {
      redirect("/admin/login");
    } else if (error.message === "UNAUTHORIZED") {
      redirect("/forbidden");
    } else {
      redirect("/admin/login");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-slate-900">Taleem Admin</h2>
          <p className="text-sm font-medium text-slate-600 mt-1 truncate">
            {decodedToken.email}
          </p>
        </div>
        
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Dashboard
          </Link>
          <Link
            href="/admin/catalogue"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Catalogue
          </Link>
          <Link
            href="/admin/rag"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            RAG QA
          </Link>
          <Link
            href="/admin/ask/prompts"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            Ask Prompts
          </Link>
          <Link
            href="/admin/ai-settings"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            AI Settings
          </Link>
          <Link
            href="/admin/academy-settings"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            Academy Settings
          </Link>
          <Link
            href="/admin/ask/candidates"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            Ask Candidates
          </Link>
          <Link
            href="/admin/ask/bank"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            Approved Bank
          </Link>
          <Link
            href="/admin/blueprints"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            Test Blueprints
          </Link>
          <Link
            href="/admin/content"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            Content
          </Link>
          <Link
            href="/admin/users"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
          >
            Users
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-200">
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-50 text-slate-900">
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Keep the local-only gate outside the shared auth layout as well: a disabled
  // panel must be a 404 before any protected admin page does session work.
  if (!isAdminPanelEnabled()) notFound();
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading admin...</div>}>
      <AuthGuard>{children}</AuthGuard>
    </Suspense>
  );
}
