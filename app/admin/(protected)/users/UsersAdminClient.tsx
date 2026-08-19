"use client";

import { useCallback, useEffect, useState } from "react";
import { StudentUserDto } from "@/lib/users/types";

async function getCsrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to obtain security token");
  return (await response.json()).csrfToken;
}

export default function UsersAdminClient() {
  const [users, setUsers] = useState<StudentUserDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [changingUid, setChangingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    cursor ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await fetch(`/api/admin/users${query}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load users");
      setUsers((current) => (cursor ? [...current, ...body.users] : body.users));
      setNextCursor(body.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load users");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeSubscription = async (user: StudentUserDto) => {
    setChangingUid(user.uid);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          uid: user.uid,
          subscriptionActive: !user.subscriptionActive,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update subscription");
      setUsers((current) =>
        current.map((item) => (item.uid === user.uid ? body.user : item)),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update subscription");
    } finally {
      setChangingUid(null);
    }
  };

  return (
    <div className="p-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Users</h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Student identity and one subscription switch. No chat history is stored.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-800">
                <tr>
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-5 py-3.5">Sign-in</th>
                  <th className="px-5 py-3.5">Created</th>
                  <th className="px-5 py-3.5">Subscription</th>
                  <th className="px-5 py-3.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-900">
                {users.map((user) => (
                  <tr key={user.uid} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {user.displayName || user.email || "Anonymous user"}
                      </div>
                      <div className="mt-1 max-w-xs truncate font-mono text-xs text-slate-500">
                        {user.uid}
                      </div>
                    </td>
                    <td className="px-5 py-4 capitalize font-medium text-slate-800">
                      {user.authProvider}
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          user.subscriptionActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {user.subscriptionActive ? "On" : "Off"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        disabled={changingUid === user.uid}
                        onClick={() => void changeSubscription(user)}
                        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                          user.subscriptionActive
                            ? "bg-red-100 text-red-800 hover:bg-red-200"
                            : "bg-emerald-700 text-white hover:bg-emerald-600"
                        }`}
                      >
                        {changingUid === user.uid
                          ? "Saving…"
                          : user.subscriptionActive
                            ? "Turn off"
                            : "Turn on"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && users.length === 0 && (
            <div className="p-12 text-center text-sm font-medium text-slate-500">
              No student profiles exist yet.
            </div>
          )}
          {loading && (
            <div className="p-12 text-center text-sm font-medium text-slate-500">Loading users…</div>
          )}
        </div>

        {nextCursor && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void load(nextCursor)}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
