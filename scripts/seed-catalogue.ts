import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function seed() {
  try {
    const { getAdminFirestore } = await import('../lib/firebase/admin');
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
      { name: "Punjab Board", slug: "punjab", active: true, display_order: 1 },
      { name: "Federal Board", slug: "federal", active: true, display_order: 2 }
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

    for (const board of boards) {
      console.log(`Seeding board: ${board.name}`);
      await db.doc(`boards/${board.slug}`).set({
        name: board.name,
        slug: board.slug,
        active: board.active,
        display_order: board.display_order
      }, { merge: true });

      for (const cls of classesData) {
        console.log(`  Seeding class: ${cls.name} under ${board.name}`);
        await db.doc(`boards/${board.slug}/classes/${cls.slug}`).set({
          name: cls.name,
          slug: cls.slug,
          active: cls.active,
          display_order: cls.display_order
        }, { merge: true });

        for (let sIdx = 0; sIdx < cls.subjects.length; sIdx++) {
          const subject = cls.subjects[sIdx];
          console.log(`    Seeding subject: ${subject.name} under ${cls.name}`);
          await db.doc(`boards/${board.slug}/classes/${cls.slug}/subjects/${subject.slug}`).set({
            name: subject.name,
            slug: subject.slug,
            active: true,
            display_order: sIdx + 1
          }, { merge: true });

          for (let cIdx = 0; cIdx < sampleChapters.length; cIdx++) {
            const chapter = sampleChapters[cIdx];
            await db.doc(`boards/${board.slug}/classes/${cls.slug}/subjects/${subject.slug}/chapters/${chapter.slug}`).set({
              title: chapter.title,
              slug: chapter.slug,
              chapter_number: cIdx + 1,
              active: true,
              display_order: cIdx + 1
            }, { merge: true });
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
