import CatalogueHero from "../components/catalogue/CatalogueHero";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24 bg-gray-50">
      <div className="w-full max-w-5xl space-y-12">
        <header className="text-center space-y-4">
          <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">Taleem AI</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            AI-powered education platform tailored for Punjab and Federal Boards (Classes 9-12).
          </p>
        </header>

        <section>
          <CatalogueHero />
        </section>

        <section className="grid grid-cols-1 gap-6 pt-12 md:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Books", href: "/books", description: "Read and download published textbooks." },
            { title: "Notes", href: "/notes", description: "Find chapter notes and revision material." },
            { title: "Past Papers", href: "/past-papers", description: "Practice published examination papers." },
            { title: "Single Ask", href: "/ai/ask", description: "Type one study question and get a clearly sourced answer." },
            { title: "Multiple Ask", href: "/ai/multiple-ask", description: "Upload one paper or paste questions for an ordered batch of answers." },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 hover:border-blue-300 hover:shadow-md transition flex flex-col text-center space-y-2"
            >
              <h3 className="text-lg font-semibold text-gray-800">{item.title}</h3>
              <p className="text-sm text-gray-500">{item.description}</p>
              <span className="text-sm font-semibold text-blue-600">Open →</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
