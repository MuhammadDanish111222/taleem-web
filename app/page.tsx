import CatalogueHero from "../components/catalogue/CatalogueHero";

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

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-12">
          {["Books", "Notes", "Past Papers", "AI Tools"].map((title) => (
            <div key={title} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center space-y-2 opacity-75">
              <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
              <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Upcoming</span>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
