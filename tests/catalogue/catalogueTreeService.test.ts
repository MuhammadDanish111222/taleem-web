import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSubjectNotesTree, getSubjectPastPapersGrouped } from "@/lib/services/catalogue/catalogueTreeService";
import * as adminFirebase from "@/lib/firebase/admin";

describe("CatalogueTreeService & Bounded Query Reads", () => {
  let mockGetFirestore: any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSubjectNotesTree should execute exactly 2 Firestore reads, prune empty branches in deep 3+ level trees, and render node with both resources and children", async () => {
    let queryCount = 0;

    // Seed data:
    // Node 1: "grammar" (root, parentNodeId: null, no direct resource)
    // Node 2: "kahani" (child of "grammar", parentNodeId: "grammar", no direct resource)
    // Node 3: "easy-notes" (child of "kahani", parentNodeId: "kahani", HAS resource res-1)
    // Node 4: "mukalme" (child of "grammar", parentNodeId: "grammar", NO resource -> should be pruned)
    // Node 5: "standalone-empty" (root, parentNodeId: null, NO resource -> should be pruned)
    // Node 6: "hybrid-chapter" (root, HAS direct resource res-2 AND HAS child "hybrid-sub")
    // Node 7: "hybrid-sub" (child of "hybrid-chapter", HAS direct resource res-3)

    const chaptersDocs = [
      { id: "grammar", data: () => ({ title: "Grammar", slug: "grammar", display_order: 1, active: true, parentNodeId: null }) },
      { id: "kahani", data: () => ({ title: "Kahani", slug: "kahani", display_order: 1, active: true, parentNodeId: "grammar" }) },
      { id: "easy-notes", data: () => ({ title: "Easy Notes", slug: "easy-notes", display_order: 1, active: true, parentNodeId: "kahani" }) },
      { id: "mukalme", data: () => ({ title: "Mukalme", slug: "mukalme", display_order: 2, active: true, parentNodeId: "grammar" }) },
      { id: "standalone-empty", data: () => ({ title: "Empty Chapter", slug: "standalone-empty", display_order: 2, active: true, parentNodeId: null }) },
      { id: "hybrid-chapter", data: () => ({ title: "Hybrid Chapter", slug: "hybrid-chapter", display_order: 3, active: true, parentNodeId: null }) },
      { id: "hybrid-sub", data: () => ({ title: "Hybrid Sub", slug: "hybrid-sub", display_order: 1, active: true, parentNodeId: "hybrid-chapter" }) },
    ];

    const resourcesDocs = [
      {
        id: "res-1",
        data: () => ({
          type: "note",
          title: "Easy Notes PDF",
          boardId: "punjab",
          classId: "9",
          subjectId: "urdu",
          chapterId: "easy-notes",
          status: "published",
          language: "ur",
          curriculumVersion: "2024",
          displayOrder: 1,
        }),
      },
      {
        id: "res-2",
        data: () => ({
          type: "note",
          title: "Hybrid Main PDF",
          boardId: "punjab",
          classId: "9",
          subjectId: "urdu",
          chapterId: "hybrid-chapter",
          status: "published",
          language: "ur",
          curriculumVersion: "2024",
          displayOrder: 1,
        }),
      },
      {
        id: "res-3",
        data: () => ({
          type: "note",
          title: "Hybrid Sub PDF",
          boardId: "punjab",
          classId: "9",
          subjectId: "urdu",
          chapterId: "hybrid-sub",
          status: "published",
          language: "ur",
          curriculumVersion: "2024",
          displayOrder: 1,
        }),
      },
    ];

    const mockDb = {
      collection: (path: string) => {
        return {
          where: function () {
            return this;
          },
          orderBy: function () {
            return this;
          },
          get: async () => {
            queryCount++;
            if (path.includes("chapters")) {
              return { docs: chaptersDocs };
            }
            if (path === "resources") {
              return { docs: resourcesDocs };
            }
            return { docs: [] };
          },
        };
      },
    };

    vi.spyOn(adminFirebase, "getAdminFirestore").mockReturnValue(mockDb as any);

    const tree = await getSubjectNotesTree("punjab", "9", "urdu", "published");

    // QUERY COUNT ASSERTION: Exactly 2 reads happen regardless of tree size
    expect(queryCount).toBe(2);

    // TREE PRUNING ASSERTIONS:
    // Root nodes present should ONLY be "grammar" and "hybrid-chapter". "standalone-empty" must NOT appear anywhere.
    expect(tree.map((n) => n.id)).toEqual(["grammar", "hybrid-chapter"]);

    // Under "grammar": "kahani" is present, "mukalme" is PRUNED.
    const grammarNode = tree.find((n) => n.id === "grammar")!;
    expect(grammarNode.children.map((c) => c.id)).toEqual(["kahani"]);

    // Under "kahani": "easy-notes" is present.
    const kahaniNode = grammarNode.children[0];
    expect(kahaniNode.children.map((c) => c.id)).toEqual(["easy-notes"]);
    expect(kahaniNode.children[0].resources[0].title).toBe("Easy Notes PDF");

    // Under "hybrid-chapter": Has direct resource AND has child "hybrid-sub".
    const hybridNode = tree.find((n) => n.id === "hybrid-chapter")!;
    expect(hybridNode.resources.length).toBe(1);
    expect(hybridNode.resources[0].title).toBe("Hybrid Main PDF");
    expect(hybridNode.children.length).toBe(1);
    expect(hybridNode.children[0].id).toBe("hybrid-sub");
    expect(hybridNode.children[0].resources[0].title).toBe("Hybrid Sub PDF");
  });

  it("getSubjectPastPapersGrouped should execute exactly 1 Firestore read and group correctly by examinationBoardId -> paperYear", async () => {
    let queryCount = 0;

    const resourcesDocs = [
      {
        id: "pp-1",
        data: () => ({
          type: "past_paper",
          title: "Lahore 2024 Annual Physics",
          boardId: "punjab",
          classId: "9",
          subjectId: "physics",
          chapterId: null,
          examinationBoardId: "lhr",
          paperYear: 2024,
          paperSession: "annual",
          paperType: null,
          status: "published",
          language: "en",
          curriculumVersion: "2024",
          displayOrder: 1,
        }),
      },
      {
        id: "pp-2",
        data: () => ({
          type: "past_paper",
          title: "Rawalpindi 2024 Annual Physics",
          boardId: "punjab",
          classId: "9",
          subjectId: "physics",
          chapterId: null,
          examinationBoardId: "rwp",
          paperYear: 2024,
          paperSession: "annual",
          paperType: null,
          status: "published",
          language: "en",
          curriculumVersion: "2024",
          displayOrder: 2,
        }),
      },
      {
        id: "pp-3",
        data: () => ({
          type: "past_paper",
          title: "Federal 2023 Past Paper (Single/No board)",
          boardId: "federal",
          classId: "9",
          subjectId: "physics",
          chapterId: null,
          examinationBoardId: null,
          paperYear: 2023,
          paperSession: "annual",
          paperType: null,
          status: "published",
          language: "en",
          curriculumVersion: "2024",
          displayOrder: 1,
        }),
      },
    ];

    const mockDb = {
      collection: (path: string) => {
        return {
          where: function () {
            return this;
          },
          orderBy: function () {
            return this;
          },
          get: async () => {
            queryCount++;
            return { docs: resourcesDocs };
          },
        };
      },
    };

    vi.spyOn(adminFirebase, "getAdminFirestore").mockReturnValue(mockDb as any);

    const grouped = await getSubjectPastPapersGrouped("punjab", "9", "physics");

    // QUERY COUNT ASSERTION: Exactly 1 bounded Firestore query call for past papers
    expect(queryCount).toBe(1);

    // Past Paper Grouping assertions
    expect(grouped.length).toBe(3); // 3 board groups: lhr, rwp, null (federal)

    const lhrGroup = grouped.find((g) => g.examinationBoardId === "lhr")!;
    expect(lhrGroup.years[0].year).toBe(2024);
    expect(lhrGroup.years[0].papers[0].title).toBe("Lahore 2024 Annual Physics");

    const nullBoardGroup = grouped.find((g) => g.examinationBoardId === null)!;
    expect(nullBoardGroup.years[0].year).toBe(2023);
    expect(nullBoardGroup.years[0].papers[0].title).toBe("Federal 2023 Past Paper (Single/No board)");
  });

  it("should prevent cross-board and cross-class leakage when subject IDs are identical (e.g. 'physics')", async () => {
    // Both Punjab Class 9 Physics and Federal Class 10 Physics share the slug 'physics'
    const punjabChapters = [
      { id: "punjab-phys-ch1", data: () => ({ title: "Punjab Phys Ch1", slug: "punjab-phys-ch1", display_order: 1, active: true, parentNodeId: null }) }
    ];
    const federalChapters = [
      { id: "federal-phys-ch1", data: () => ({ title: "Federal Phys Ch1", slug: "federal-phys-ch1", display_order: 1, active: true, parentNodeId: null }) }
    ];

    const punjabResources = [
      {
        id: "res-punjab",
        data: () => ({
          type: "note",
          title: "Punjab Physics Note",
          boardId: "punjab",
          classId: "9",
          subjectId: "physics",
          chapterId: "punjab-phys-ch1",
          status: "published",
          language: "en",
          curriculumVersion: "2024",
          displayOrder: 1,
        })
      }
    ];

    const mockDb = {
      collection: (path: string) => {
        let currentBoardId = "";
        let currentClassId = "";
        let currentSubjectId = "";
        const whereClauses: [string, string, any][] = [];

        return {
          where: function (field: string, op: string, val: any) {
            whereClauses.push([field, op, val]);
            return this;
          },
          orderBy: function () {
            return this;
          },
          get: async () => {
            if (path.includes("boards/punjab/classes/9/subjects/physics/chapters")) {
              return { docs: punjabChapters };
            }
            if (path.includes("boards/federal/classes/10/subjects/physics/chapters")) {
              return { docs: federalChapters };
            }
            if (path === "resources") {
              const matchesBoard = whereClauses.find(([f, o, v]) => f === "boardId" && v === "punjab");
              const matchesClass = whereClauses.find(([f, o, v]) => f === "classId" && v === "9");
              if (matchesBoard && matchesClass) {
                return { docs: punjabResources };
              }
              return { docs: [] };
            }
            return { docs: [] };
          }
        };
      }
    };

    vi.spyOn(adminFirebase, "getAdminFirestore").mockReturnValue(mockDb as any);

    // Fetch Punjab Class 9 Physics
    const punjabTree = await getSubjectNotesTree("punjab", "9", "physics", "published");
    expect(punjabTree.length).toBe(1);
    expect(punjabTree[0].id).toBe("punjab-phys-ch1");
    expect(punjabTree[0].resources[0].title).toBe("Punjab Physics Note");

    // Fetch Federal Class 10 Physics -> should NOT return Punjab chapters or resources
    const federalTree = await getSubjectNotesTree("federal", "10", "physics", "published");
    expect(federalTree.length).toBe(0); // No resources in mock for Federal, so pruned
  });
});

