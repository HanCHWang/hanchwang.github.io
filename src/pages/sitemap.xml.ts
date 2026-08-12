import researchPillars from "../data/research-pillars.json";

const site = "https://hanchwang.github.io";

const staticPages = [
  { path: "/", priority: "1.0" },
  { path: "/research/", priority: "0.9" },
  { path: "/publications/", priority: "0.9" },
  { path: "/supervision/", priority: "0.7" },
  { path: "/blog/", priority: "0.7" },
  { path: "/blog/why-hanchwang/", priority: "0.6" },
  { path: "/misc/", priority: "0.5" },
];

const researchPages = researchPillars.items.map((pillar) => ({
  path: `/research/${pillar.slug}/`,
  priority: "0.8",
}));

const pages = [...staticPages, ...researchPages];

export function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${new URL(page.path, site).toString()}</loc>
    <changefreq>monthly</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
