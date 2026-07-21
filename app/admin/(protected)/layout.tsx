import { requireAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "./LogoutButton";
import { Suspense } from "react";

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Taleem Admin</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
            {decodedToken.email}
          </p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700/50 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Dashboard
          </Link>
          <Link
            href="/admin/catalogue"
            className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Catalogue
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
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
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading admin...</div>}>
      <AuthGuard>{children}</AuthGuard>
    </Suspense>
  );
}
