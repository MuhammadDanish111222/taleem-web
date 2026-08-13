// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerRenderer, GENERAL_AI_LABEL } from "./AnswerRenderer";
import type { AskResponse } from "@/lib/api/ask";
import { buildWhatsappSupport } from "./useSupportWhatsapp";

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

function response(
  overrides: Partial<AskResponse> = {},
): AskResponse {
  return {
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    answerSource: "approved_bank",
    answerMode: "short",
    answerStyle: "exam_style",
    blocks: [{ type: "paragraph", text: "A reviewed answer." }],
    citations: [
      {
        citationId: "citation-1",
        chapterId: "motion",
        topicNo: "1.1",
        topicTitle: "Velocity",
        pageStart: 3,
        pageEnd: 3,
      },
    ],
    visuals: [],
    generalAiLabel: null,
    promptVersion: null,
    corpusVersion: "corpus-v1",
    approvedRevisionId: "323e4567-e89b-42d3-a456-426614174000",
    usage: {
      feature: "single_question",
      used: 1,
      limit: 5,
      remaining: 4,
      resetsAt: "2026-07-31T19:00:00Z",
    },
    terminalStatus: "answered",
    errorCode: null,
    ...overrides,
  };
}

describe("AnswerRenderer", () => {
  afterEach(cleanup);

  it("labels approved answers and renders safe equations and citations", () => {
    const { container } = render(
      <AnswerRenderer
        answer={response({
          blocks: [
            { type: "paragraph", text: "Use the equation:" },
            { type: "equation", latex: "v=\\frac{d}{t}" },
          ],
        })}
        getToken={vi.fn()}
      />,
    );
    expect(screen.getByText("Approved answer")).toBeInTheDocument();
    expect(screen.getByText("Reviewed question bank")).toBeInTheDocument();
    expect(screen.getByText("Textbook references")).toBeInTheDocument();
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("renders model paragraph content as text with raw HTML disabled", () => {
    const malicious = '<img src="https://evil.example/x" onerror="alert(1)">';
    const { container } = render(
      <AnswerRenderer
        answer={response({
          blocks: [{ type: "paragraph", text: malicious }],
        })}
        getToken={vi.fn()}
      />,
    );
    expect(screen.getByText(malicious)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("renders long-answer headings and bullet lists as real structure", () => {
    render(
      <AnswerRenderer
        answer={response({
          answerMode: "long",
          blocks: [
            { type: "heading", text: "Core explanation", level: 2 },
            {
              type: "bullet_list",
              items: ["First textbook point", "Second textbook point"],
            },
            {
              type: "heading",
              text: "Worked example",
              level: 3,
            },
          ],
        })}
        getToken={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Core explanation", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText("First textbook point")).toBeInTheDocument();
    expect(screen.getByText("Second textbook point")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Worked example",
        level: 4,
      }),
    ).toBeInTheDocument();
  });

  it("uses the exact General AI warning and suppresses textbook citations and visuals", () => {
    const { container } = render(
      <AnswerRenderer
        answer={response({
          answerSource: "general_knowledge",
          generalAiLabel: GENERAL_AI_LABEL,
          blocks: [
            { type: "paragraph", text: "A general explanation." },
            { type: "visual_ref", visualId: "visual-one" },
          ],
          visuals: [
            {
              visualId: "visual-one",
              title: "Textbook diagram",
              description: "Must not render",
              displayPolicy: "always",
              displayOrder: 0,
            },
          ],
        })}
        getToken={vi.fn()}
      />,
    );
    expect(screen.getByText(GENERAL_AI_LABEL)).toBeInTheDocument();
    expect(
      screen.queryByText("Textbook references"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Textbook diagram")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("WhatsApp support URL", () => {
  it("uses only a public visible number and URL-encodes the configured message", () => {
    expect(
      buildWhatsappSupport({
        academy_name: "Taleem",
        whatsapp_number: "+92 (300) 123-4567",
        whatsapp_message_template: "Please help with my Ask limit & account.",
        visible: true,
      }),
    ).toEqual({
      url: "https://wa.me/923001234567?text=Please%20help%20with%20my%20Ask%20limit%20%26%20account.",
      label: "Contact Sir Danish on WhatsApp",
    });
  });

  it("does not expose a hidden or invalid support setting", () => {
    expect(
      buildWhatsappSupport({
        academy_name: "Taleem",
        whatsapp_number: "+92 300 1234567",
        whatsapp_message_template: "",
        visible: false,
      }),
    ).toBeNull();
  });
});
