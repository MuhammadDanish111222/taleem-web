import { requireAdminSession } from "@/lib/auth/session";

export default async function AdminDashboardPage() {
  const decodedToken = await requireAdminSession();

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Dashboard
        </h1>
        
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Welcome, {decodedToken.name || decodedToken.email}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            This is the Taleem AI Admin Dashboard. You have successfully authenticated and authorized as an admin.
          </p>
          
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Placeholder Stat Cards */}
            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Users</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">--</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Active Sessions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">--</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">System Status</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">Healthy</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
