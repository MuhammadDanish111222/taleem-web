import { describe, it, expect, vi, beforeEach } from "vitest";
import { catalogueService, DomainError } from "@/lib/services/admin/catalogueService";
import { CatalogueRepository } from "@/lib/repositories/firestore/catalogueRepository";

// Mock Firebase Admin
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: vi.fn(),
}));

describe("CatalogueService & Node Parentage Validation", () => {
  let repo: CatalogueRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = (catalogueService as any).repo;
  });

  describe("validateNodeParentage unit rules", () => {
    it("should reject self-parenting (nodeId === parentNodeId)", async () => {
      await expect(
        repo.validateNodeParentage("punjab", "9", "physics", "intro", "intro")
      ).rejects.toThrow("Self-parenting is forbidden");
    });

    it("should reject non-existent parent node", async () => {
      vi.spyOn(repo, "getChapterRef").mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false }),
      } as any);

      await expect(
        repo.validateNodeParentage("punjab", "9", "physics", "child-node", "non-existent-parent")
      ).rejects.toThrow("Parent node 'non-existent-parent' does not exist");
    });

    it("should reject cross-subject parenting when parent node is not found in target subject ref", async () => {
      // getChapterRef uses the target subject path. If parent belongs to a different subject, fetching it at this path returns exists: false
      vi.spyOn(repo, "getChapterRef").mockImplementation((boardId, classId, subjectId, chapterId) => {
        if (subjectId === "physics" && chapterId === "math-ch1") {
          return { get: vi.fn().mockResolvedValue({ exists: false }) } as any;
        }
        return { get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ parentNodeId: null }) }) } as any;
      });

      await expect(
        repo.validateNodeParentage("punjab", "9", "physics", "phys-ch1", "math-ch1")
      ).rejects.toThrow("Parent node 'math-ch1' does not exist in board 'punjab', class '9', subject 'physics'");
    });

    it("should reject 3-node cycle (A -> B -> C -> A)", async () => {
      // Chain: Proposed parent C points to B, B points to A, A is the node being updated to point to C
      const nodeDocs: Record<string, any> = {
        "node-c": { parentNodeId: "node-b" },
        "node-b": { parentNodeId: "node-a" },
        "node-a": { parentNodeId: null },
      };

      vi.spyOn(repo, "getChapterRef").mockImplementation((b, c, s, id) => {
        const doc = nodeDocs[id];
        return {
          get: vi.fn().mockResolvedValue({
            exists: !!doc,
            data: () => doc,
          }),
        } as any;
      });

      // Updating node-a to set parentNodeId = node-c would complete the cycle node-a -> node-c -> node-b -> node-a
      await expect(
        repo.validateNodeParentage("punjab", "9", "physics", "node-a", "node-c")
      ).rejects.toThrow("Cycle detected: node 'node-a' is an ancestor of proposed parent 'node-c'");
    });

    it("should accept valid parentage", async () => {
      const nodeDocs: Record<string, any> = {
        "node-parent": { parentNodeId: null },
      };

      vi.spyOn(repo, "getChapterRef").mockImplementation((b, c, s, id) => {
        const doc = nodeDocs[id];
        return {
          get: vi.fn().mockResolvedValue({
            exists: !!doc,
            data: () => doc,
          }),
        } as any;
      });

      await expect(
        repo.validateNodeParentage("punjab", "9", "physics", "node-child", "node-parent")
      ).resolves.toBeUndefined();
    });
  });

  describe("Examination Board mutations via catalogueService", () => {
    it("should support create, update, toggle, and reorder for examinationBoard level", async () => {
      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
      };

      vi.spyOn(repo, "runTransaction").mockImplementation(async (cb: any) => cb(mockTx));
      vi.spyOn(repo, "getBoardRef").mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: true }),
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({}),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({}),
          }),
        }),
      } as any);
      vi.spyOn(repo, "getNextDisplayOrder").mockResolvedValue(1);

      // 1. Create Examination Board
      mockTx.get.mockResolvedValueOnce({ exists: false }); // doc does not exist yet
      await catalogueService.handleMutation({
        operation: "create",
        level: "examinationBoard",
        boardId: "punjab",
        examinationBoardId: "lhr",
        name: "BISE Lahore",
      });

      expect(mockTx.set).toHaveBeenCalledTimes(1);
      const setPayload = mockTx.set.mock.calls[0][1];
      expect(setPayload.name).toBe("BISE Lahore");
      expect(setPayload.slug).toBe("lhr");

      // 2. Update Examination Board
      mockTx.get.mockResolvedValueOnce({ exists: true });
      await catalogueService.handleMutation({
        operation: "update",
        level: "examinationBoard",
        boardId: "punjab",
        examinationBoardId: "lhr",
        name: "BISE Lahore (Updated)",
      });

      expect(mockTx.update).toHaveBeenCalledTimes(1);

      // 3. Toggle Examination Board
      mockTx.get.mockResolvedValueOnce({ exists: true });
      await catalogueService.handleMutation({
        operation: "toggle",
        level: "examinationBoard",
        boardId: "punjab",
        examinationBoardId: "lhr",
        active: false,
      });

      expect(mockTx.update).toHaveBeenCalledTimes(2);

      // 4. Reorder Examination Boards
      mockTx.get.mockResolvedValueOnce({
        docs: [
          { id: "lhr", data: () => ({ display_order: 0 }) },
          { id: "rwp", data: () => ({ display_order: 1 }) },
        ],
      });

      await catalogueService.handleMutation({
        operation: "reorder",
        level: "examinationBoard",
        boardId: "punjab",
        orderedIds: ["rwp", "lhr"],
      });

      expect(mockTx.update).toHaveBeenCalledTimes(4); // 2 previous + 2 reorder updates
    });
  });
});
