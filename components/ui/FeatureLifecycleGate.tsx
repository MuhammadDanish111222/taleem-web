import type { ReactNode } from "react";
import { notFound } from "next/navigation";

export interface FeatureLifecycleGateProps {
  state: "enabled" | "coming_soon" | "disabled";
  children: ReactNode;
}

export function FeatureLifecycleGate({ state, children }: FeatureLifecycleGateProps) {
  if (state === "disabled") {
    notFound();
  }
  if (state === "coming_soon") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Coming Soon
          </h2>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            This feature is currently under active development and will be available soon.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
