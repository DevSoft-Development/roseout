import Link from "next/link";

type SearchParams = Record<string, string | string[] | undefined>;

type WorkspaceHubItem = {
  title: string;
  description: string;
  href: string;
};

function buildHref(href: string, searchParams: SearchParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (["tab", "section", "host"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `${href}?${suffix}` : href;
}

export default function WorkspaceHub({
  eyebrow,
  title,
  description,
  items,
  searchParams,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: WorkspaceHubItem[];
  searchParams: SearchParams;
}) {
  return (
    <main className="min-h-screen bg-[#050607] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50">{description}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={buildHref(item.href, searchParams)}
              className="group rounded-[1.5rem] border border-white/10 bg-[#0a0c10] p-5 transition hover:border-[#e1062a]/40 hover:bg-white/[0.04]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black">{item.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-white/45">{item.description}</p>
                </div>
                <span className="mt-1 text-xl font-black text-[#ff6b86] transition group-hover:translate-x-1">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
