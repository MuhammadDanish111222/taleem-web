"use client";

import { useEffect, useState } from "react";
import type { TokenProvider } from "@/lib/api/ask";
import type { PaperPresentationModel } from "@/lib/tests/paper";
import { loadTestPaperVisual } from "@/lib/tests/visuals";

export function PaperVisual({
  paper,
  questionId,
  visual,
  getToken,
}: {
  paper: PaperPresentationModel;
  questionId: string;
  visual: { visual_id: string; title: string; description: string | null };
  getToken: TokenProvider;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let createdUrl: string | null = null;
    setImageUrl(null);
    setFailed(false);
    loadTestPaperVisual(paper, questionId, visual.visual_id, getToken, controller.signal)
      .then((blob) => {
        createdUrl = URL.createObjectURL(blob);
        setImageUrl(createdUrl);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });
    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [getToken, paper, questionId, visual.visual_id]);

  return (
    <figure className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      {imageUrl ? (
        // Image bytes are fetched from the authenticated same-origin BFF.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={visual.description || visual.title} className="mx-auto max-h-[32rem] w-auto rounded object-contain" />
      ) : failed ? (
        <p role="status">Visual unavailable: {visual.title}{visual.description ? ` — ${visual.description}` : ""}</p>
      ) : (
        <div role="status" aria-label="Loading question visual" className="h-48 animate-pulse rounded bg-slate-200" />
      )}
      {!failed && <figcaption className="mt-2"><span className="font-semibold">{visual.title}</span>{visual.description ? ` — ${visual.description}` : ""}</figcaption>}
    </figure>
  );
}
