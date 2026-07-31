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
    <div className="p-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Users</h1>
            <p className="mt-1 text-sm text-slate-400">
              Student identity and one subscription switch. No chat history is stored.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-red-200">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700 text-sm">
              <thead className="bg-slate-800 text-left text-slate-300">
                <tr>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Sign-in</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 font-semibold">Subscription</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((user) => (
                  <tr key={user.uid}>
                    <td className="px-5 py-4">
                      <div className="font-medium text-white">
                        {user.displayName || user.email || "Anonymous user"}
                      </div>
                      <div className="mt-1 max-w-xs truncate font-mono text-xs text-slate-500">
                        {user.uid}
                      </div>
                    </td>
                    <td className="px-5 py-4 capitalize text-slate-300">
                      {user.authProvider}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          user.subscriptionActive
                            ? "bg-emerald-950 text-emerald-300"
                            : "bg-slate-800 text-slate-400"
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
                        className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                          user.subscriptionActive
                            ? "bg-red-950 text-red-200 hover:bg-red-900"
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
            <div className="p-12 text-center text-slate-400">
              No student profiles exist yet.
            </div>
          )}
          {loading && (
            <div className="p-12 text-center text-slate-400">Loading users…</div>
          )}
        </div>

        {nextCursor && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void load(nextCursor)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
