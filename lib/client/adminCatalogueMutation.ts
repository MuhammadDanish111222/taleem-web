import { CatalogueMutation } from "@/lib/validation/catalogue";

export class MutationError extends Error {
  constructor(message: string, public status: number, public details?: any) {
    super(message);
    this.name = "MutationError";
  }
}

export async function adminCatalogueMutation(mutation: CatalogueMutation) {
  // 1. Fetch CSRF token
  const csrfRes = await fetch("/api/auth/csrf", {
    cache: "no-store",
  });
  
  if (!csrfRes.ok) {
    throw new MutationError("Failed to fetch CSRF token", csrfRes.status);
  }
  
  const { csrfToken } = await csrfRes.json();
  
  // 2. Perform mutation
  const method = mutation.operation === "create" ? "POST" : "PATCH";
  
  const res = await fetch("/api/admin/catalogue", {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    credentials: "same-origin",
    body: JSON.stringify(mutation),
  });

  if (!res.ok) {
    let message = "An error occurred";
    let details;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
      if (data.details) details = data.details;
    } catch (e) {
      // Ignore
    }
    throw new MutationError(message, res.status, details);
  }

  return res.json();
}
