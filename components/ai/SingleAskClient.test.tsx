// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SingleAskClient } from "./SingleAskClient";
import { useCatalogueSelection } from "@/lib/state/catalogueSelection";
import {
  AskApiError,
  AskRequest,
  AskResponse,
  askQuestion,
  loadAskUsage,
} from "@/lib/api/ask";

vi.mock("@/lib/firebase/client", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("firebase-token"),
    },
  },
}));

vi.mock("@/lib/api/ask", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/ask")>();
  return {
    ...actual,
    askQuestion: vi.fn(),
    loadAskUsage: vi.fn(),
    loadAskVisual: vi.fn(),
  };
});

vi.mock("./useSupportWhatsapp", () => ({
  useSupportWhatsapp: () => ({
    url: "https://wa.me/923001234567?text=Help",
    label: "Contact Sir Danish on WhatsApp",
  }),
}));

vi.mock("@/components/selectors/BoardSelector", () => ({
  BoardSelector: () => <div>Board selected</div>,
}));
vi.mock("@/components/selectors/ClassSelector", () => ({
  ClassSelector: () => <div>Class selected</div>,
}));
vi.mock("@/components/selectors/SubjectSelector", () => ({
  SubjectSelector: () => <div>Subject selected</div>,
}));
vi.mock("@/components/selectors/ChapterSelector", () => ({
  ChapterSelector: () => <div>Chapter optional</div>,
}));

const usage = {
  feature: "single_question" as const,
  used: 1,
  limit: 5,
  remaining: 4,
  resetsAt: "2026-07-31T19:00:00Z",
};

function answer(
  requestId: string,
  text = "Velocity is displacement per unit time.",
): AskResponse {
  return {
    requestId,
    answerSource: "syllabus_grounded",
    answerMode: "short",
    answerStyle: "exam_style",
    blocks: [{ type: "paragraph", text }],
    citations: [],
    visuals: [],
    generalAiLabel: null,
    promptVersion: "prompt-v1",
    corpusVersion: "corpus-v1",
    approvedRevisionId: null,
    usage: { ...usage, used: 2, remaining: 3 },
    terminalStatus: "answered",
    errorCode: null,
  };
}

const askMock = vi.mocked(askQuestion);
const usageMock = vi.mocked(loadAskUsage);
const uuidMock = vi.fn();

describe("SingleAskClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: uuidMock });
    uuidMock
      .mockReturnValueOnce("123e4567-e89b-42d3-a456-426614174000")
      .mockReturnValueOnce("223e4567-e89b-42d3-a456-426614174000");
    useCatalogueSelection.setState({
      boardId: "punjab",
      classId: "class-9",
      subjectId: "physics",
      chapterId: "motion",
    });
    usageMock.mockResolvedValue(usage);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads usage once and updates it from the Ask response without polling", async () => {
    askMock.mockImplementation(async (request) => answer(request.requestId));
    render(<SingleAskClient />);
    await screen.findByText("4 of 5 remaining");
    expect(usageMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Question in English"), {
      target: { value: "What is velocity?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask Taleem AI" }));

    await screen.findByText("Textbook-grounded answer");
    expect(screen.getByText("3 of 5 remaining")).toBeInTheDocument();
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(askMock.mock.calls[0][0]).toEqual({
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      boardId: "punjab",
      classId: "class-9",
      subjectId: "physics",
      chapterId: "motion",
      question: "What is velocity?",
      answerMode: "short",
      answerStyle: "exam_style",
    });

    await act(async () => Promise.resolve());
    expect(usageMock).toHaveBeenCalledTimes(1);
  });

  it("allows only one in-flight submission", async () => {
    askMock.mockImplementation(() => new Promise(() => undefined));
    render(<SingleAskClient />);
    await screen.findByText("4 of 5 remaining");
    fireEvent.change(screen.getByLabelText("Question in English"), {
      target: { value: "Define acceleration." },
    });
    const askButton = screen.getByRole("button", { name: "Ask Taleem AI" });
    fireEvent.click(askButton);
    fireEvent.click(askButton);

    expect(askMock).toHaveBeenCalledTimes(1);
    expect(askButton).toBeDisabled();
    expect(
      screen.queryByLabelText(/upload|file|image|attachment/i),
    ).not.toBeInTheDocument();
  });

  it("rejects non-English or encoded attachment-like content before the BFF", async () => {
    render(<SingleAskClient />);
    await screen.findByText("4 of 5 remaining");
    const input = screen.getByLabelText("Question in English");
    fireEvent.change(input, { target: { value: "رفتار کیا ہے؟" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask Taleem AI" }));
    expect(await screen.findByText("Typed English text only")).toBeInTheDocument();
    expect(askMock).not.toHaveBeenCalled();

    fireEvent.change(input, {
      target: { value: "data:image/png;base64,AAAA" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask Taleem AI" }));
    expect(askMock).not.toHaveBeenCalled();
  });

  it("cancels safely and retries the same network operation with the same request ID", async () => {
    let firstOperation: AskRequest | null = null;
    askMock
      .mockImplementationOnce(
        (request, _getToken, signal) =>
          new Promise((_resolve, reject) => {
            firstOperation = request;
            signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      )
      .mockImplementationOnce(async (request) => answer(request.requestId));

    render(<SingleAskClient />);
    await screen.findByText("4 of 5 remaining");
    fireEvent.change(screen.getByLabelText("Question in English"), {
      target: { value: "Define momentum." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask Taleem AI" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel request" }),
    );
    await screen.findByText("Request cancelled");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same request" }),
    );

    await screen.findByText("Textbook-grounded answer");
    expect(askMock).toHaveBeenCalledTimes(2);
    expect(firstOperation).not.toBeNull();
    expect(askMock.mock.calls[1][0].requestId).toBe(
      firstOperation!.requestId,
    );
    expect(uuidMock).toHaveBeenCalledTimes(1);
  });

  it("prevents a stale cancelled response from overwriting a newer answer", async () => {
    let resolveFirst!: (value: AskResponse) => void;
    askMock
      .mockImplementationOnce(
        () =>
          new Promise<AskResponse>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(async (request) =>
        answer(request.requestId, "The newer answer."),
      );

    render(<SingleAskClient />);
    await screen.findByText("4 of 5 remaining");
    const input = screen.getByLabelText("Question in English");
    fireEvent.change(input, { target: { value: "First question?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask Taleem AI" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel request" }),
    );
    fireEvent.change(input, { target: { value: "Second question?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask Taleem AI" }));

    await screen.findByText("The newer answer.");
    act(() => {
      resolveFirst(
        answer(
          "123e4567-e89b-42d3-a456-426614174000",
          "The stale answer.",
        ),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("The newer answer.")).toBeInTheDocument();
      expect(screen.queryByText("The stale answer.")).not.toBeInTheDocument();
    });
  });

  it("shows the exact limit message and configured WhatsApp action", async () => {
    askMock.mockRejectedValue(
      new AskApiError(
        "USAGE_LIMIT_REACHED",
        "Daily question limit reached",
        429,
        false,
        { ...usage, used: 5, remaining: 0 },
      ),
    );
    render(<SingleAskClient />);
    await screen.findByText("4 of 5 remaining");
    fireEvent.change(screen.getByLabelText("Question in English"), {
      target: { value: "What is force?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask Taleem AI" }));

    expect(
      await screen.findByText(
        "Your daily question limit has been exceeded. Contact Sir Danish for more usage.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Contact Sir Danish on WhatsApp" }),
    ).toHaveAttribute("href", "https://wa.me/923001234567?text=Help");
    expect(screen.getByText("0 of 5 remaining")).toBeInTheDocument();
  });
});
