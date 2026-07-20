"use client";

import { ReactNode } from "react";
import { useAuth } from "../lib/auth/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Calling this ensures anonymous sign-in fires on first load
  useAuth();
  
  return <>{children}</>;
}
