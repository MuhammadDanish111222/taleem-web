import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function seed() {
  try {
    const { getAdminFirestore } = await import('../lib/firebase/admin');
    const { catalogueService, DomainError } = await import('../lib/services/admin/catalogueService');
    const db = getAdminFirestore();
    
    console.log("Seeding site settings...");
    await db.doc('site_settings/default').set({
      site_name: "Taleem AI"
    }, { merge: true });
    
    console.log("Seeding academy settings...");
    await db.doc('academy_settings/default').set({
      academy_name: "",
      whatsapp_number: "",
      whatsapp_message_template: "",
      visible: false
    }, { merge: true });

    const boards = [
      { 
        name: "Punjab Board", 
        slug: "punjab", 
        active: true, 
        display_order: 1,
        examinationBoards: [
          { name: "BISE Lahore", slug: "lhr" },
          { name: "BISE Rawalpindi", slug: "rwp" },
          { name: "BISE Gujranwala", slug: "guj" },
          { name: "BISE Multan", slug: "mtn" },
          { name: "BISE Faisalabad", slug: "fsd" },
          { name: "BISE Sahiwal", slug: "swl" },
          { name: "BISE Bahawalpur", slug: "bwp" },
          { name: "BISE D.G. Khan", slug: "dgk" },
          { name: "BISE Sargodha", slug: "sgd" }
        ]
      },
      { 
        name: "Federal Board", 
        slug: "federal", 
        active: true, 
        display_order: 2,
        examinationBoards: [
          { name: "FBISE Islamabad", slug: "fbise" }
        ]
      }
    ];

    const classes9_10_subjects = [
      { name: "Physics", slug: "physics" },
      { name: "Chemistry", slug: "chemistry" },
      { name: "Biology", slug: "biology" },
      { name: "Mathematics", slug: "mathematics" },
      { name: "English", slug: "english" }
    ];

    const classes11_12_subjects = [
      { name: "Physics", slug: "physics" },
      { name: "Chemistry", slug: "chemistry" },
      { name: "Mathematics", slug: "mathematics" },
      { name: "English", slug: "english" },
      { name: "Computer Science", slug: "computer-science" }
    ];

    const sampleChapters = [
      { title: "Introduction", slug: "introduction" },
      { title: "Fundamental Concepts", slug: "fundamental-concepts" },
      { title: "Applications", slug: "applications" }
    ];

    const classesData = [
      { name: "Class 9", slug: "9", active: true, display_order: 1, subjects: classes9_10_subjects },
      { name: "Class 10", slug: "10", active: true, display_order: 2, subjects: classes9_10_subjects },
      { name: "Class 11", slug: "11", active: true, display_order: 3, subjects: classes11_12_subjects },
      { name: "Class 12", slug: "12", active: true, display_order: 4, subjects: classes11_12_subjects }
    ];

    async function upsertCatalogueItem(mutation: any) {
      try {
        await catalogueService.handleMutation(mutation);
      } catch (err) {
        if (err instanceof DomainError && err.code === "CONFLICT") {
          // If already exists, update
          const updateMutation = { ...mutation, operation: "update" as const };
          delete updateMutation.examinationBoardId;
          delete updateMutation.chapterId;
          await catalogueService.handleMutation(updateMutation);
        } else {
          throw err;
        }
      }
    }

    for (const board of boards) {
      console.log(`Seeding board: ${board.name}`);
      await upsertCatalogueItem({
        operation: "create",
        level: "board",
        boardId: board.slug,
        name: board.name,
      });

      console.log(`  Seeding examination boards under ${board.name}`);
      for (const eb of board.examinationBoards) {
        await upsertCatalogueItem({
          operation: "create",
          level: "examinationBoard",
          boardId: board.slug,
          examinationBoardId: eb.slug,
          name: eb.name,
        });
      }

      for (const cls of classesData) {
        console.log(`  Seeding class: ${cls.name} under ${board.name}`);
        await upsertCatalogueItem({
          operation: "create",
          level: "class",
          boardId: board.slug,
          classId: cls.slug,
          name: cls.name,
        });

        for (let sIdx = 0; sIdx < cls.subjects.length; sIdx++) {
          const subject = cls.subjects[sIdx];
          console.log(`    Seeding subject: ${subject.name} under ${cls.name}`);
          await upsertCatalogueItem({
            operation: "create",
            level: "subject",
            boardId: board.slug,
            classId: cls.slug,
            subjectId: subject.slug,
            name: subject.name,
          });

          for (let cIdx = 0; cIdx < sampleChapters.length; cIdx++) {
            const chapter = sampleChapters[cIdx];
            await upsertCatalogueItem({
              operation: "create",
              level: "chapter",
              boardId: board.slug,
              classId: cls.slug,
              subjectId: subject.slug,
              chapterId: chapter.slug,
              title: chapter.title,
              chapter_number: cIdx + 1,
              parentNodeId: null,
            });
          }
        }
      }
    }

    console.log("Seed completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}

seed();
