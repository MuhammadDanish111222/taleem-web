"use client";

import type { PaperPresentationModel } from "@/lib/tests/paper";
import type { TokenProvider } from "@/lib/api/ask";
import { PaperVisual } from "@/components/tests/PaperVisual";

export function PaperPreview({ paper, getToken }: { paper: PaperPresentationModel; getToken: TokenProvider }) {
  return (
    <article className="mx-auto max-w-4xl rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-10">
      <header className="border-b-2 border-slate-800 pb-5 text-center">
        <p className="text-sm font-bold tracking-[0.2em] text-slate-700">TALEEM</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">TEST PAPER</h1>
        <p className="mt-2 font-semibold text-slate-800">{paper.title}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-slate-700">
          <span>Time: {paper.response.duration_minutes} minutes</span><span>Total Marks: {paper.response.total_marks}</span>
        </div>
      </header>
      <div className="mt-5 grid gap-2 text-sm text-slate-700 sm:grid-cols-2"><span>Name: ______________________________</span><span>Roll No: __________________</span></div>
      <div className="mt-8 space-y-9">
        {paper.sections.map((section) => (
          <section key={section.key} aria-labelledby={`section-${section.key}`}>
            <div className="border-b border-slate-300 pb-2">
              <h2 id={`section-${section.key}`} className="font-bold text-slate-950">SECTION {section.key} — {section.title}</h2>
              <p className="mt-1 text-sm text-slate-700">{section.instruction} <span className="font-medium">{section.marksLabel}</span></p>
            </div>
            <ol className="mt-4 space-y-5">
              {section.questions.map((question) => (
                <li key={question.id} className="break-inside-avoid">
                  <p className="whitespace-pre-wrap leading-7 text-slate-950"><span className="font-semibold">Q{question.number}.</span> {question.question} <span className="text-sm text-slate-600">[{question.marks} marks]</span></p>
                  {question.options.length > 0 && <ol className="mt-2 space-y-1 pl-5 text-slate-800">{question.options.map((option) => <li key={option.key}>{option.key}. {option.text}</li>)}</ol>}
                  {question.visuals.map((visual) => <PaperVisual key={visual.visual_id} paper={paper} questionId={question.id} visual={visual} getToken={getToken} />)}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </article>
  );
}
