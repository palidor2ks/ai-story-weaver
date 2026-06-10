// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://www.polipulseapp.com";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ornnzinjrcyigazecctf.supabase.co";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybm56aW5qcmN5aWdhemVjY3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyOTAwMjgsImV4cCI6MjA4MTg2NjAyOH0.hijd7BMAA5g-C4vH5OHkPbpsIu657ySbv84EWWdiaSI";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/auth", changefreq: "monthly", priority: "0.6" },
  { path: "/political-compass-test", changefreq: "weekly", priority: "0.95" },
  { path: "/candidates", changefreq: "weekly", priority: "0.9" },
  { path: "/parties", changefreq: "weekly", priority: "0.8" },
  { path: "/donors", changefreq: "weekly", priority: "0.8" },
  { path: "/committees", changefreq: "weekly", priority: "0.8" },
  { path: "/how-scoring-works", changefreq: "monthly", priority: "0.6" },
  { path: "/blog", changefreq: "weekly", priority: "0.7" },
  { path: "/blog/political-ideology-tests-comparison", changefreq: "monthly", priority: "0.8" },
  { path: "/jobs", changefreq: "monthly", priority: "0.6" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/data-deletion", changefreq: "yearly", priority: "0.3" },
  { path: "/top-spenders", changefreq: "weekly", priority: "0.7" },
  { path: "/feed", changefreq: "daily", priority: "0.7" },
  { path: "/onboarding", changefreq: "monthly", priority: "0.5" },
  { path: "/results", changefreq: "monthly", priority: "0.5" },
  { path: "/quiz-library", changefreq: "weekly", priority: "0.6" },
  { path: "/verify-email", changefreq: "yearly", priority: "0.2" },
  { path: "/unsubscribe", changefreq: "yearly", priority: "0.2" },
];

// Data-fetch failures are collected (not swallowed): if any table fails, main() keeps the
// existing sitemap.xml instead of overwriting it with a degraded one, and exits non-zero so
// the build / preflight report the errors instead of shipping a gutted sitemap.
const fetchFailures: string[] = [];

async function fetchRows(table: string, select: string, extra = ""): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${extra}`;
  try {
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) {
      fetchFailures.push(`${table}: HTTP ${res.status}`);
      console.error(`sitemap: ERROR fetching ${table}: HTTP ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (e) {
    fetchFailures.push(`${table}: ${(e as Error).message}`);
    console.error(`sitemap: ERROR fetching ${table}: ${(e as Error).message}`);
    return [];
  }
}

function xml(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n")
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

async function main() {
  const entries: SitemapEntry[] = [...staticEntries];

  // Parties
  const parties = await fetchRows("party_platforms", "id");
  for (const p of parties) {
    if (p?.id) entries.push({ path: `/party/${p.id}`, changefreq: "weekly", priority: "0.7" });
  }

  // Committees
  const committees = await fetchRows(
    "candidate_committees",
    "fec_committee_id",
    "&fec_committee_id=not.is.null"
  );
  const seen = new Set<string>();
  for (const c of committees) {
    const id = c?.fec_committee_id;
    if (id && !seen.has(id)) {
      seen.add(id);
      entries.push({ path: `/committee/${id}`, changefreq: "weekly", priority: "0.6" });
    }
  }

  // Published polls
  const polls = await fetchRows("polls", "slug", "&status=eq.published");
  for (const p of polls) {
    if (p?.slug) {
      entries.push({ path: `/p/${p.slug}`, changefreq: "weekly", priority: "0.6" });
      entries.push({ path: `/p/${p.slug}/results`, changefreq: "weekly", priority: "0.5" });
    }
  }

  // Candidates
  const candidates = await fetchRows("candidates", "id");
  for (const c of candidates) {
    if (c?.id) entries.push({ path: `/candidate/${c.id}`, changefreq: "weekly", priority: "0.6" });
  }

  // Intentionally omitted from sitemap (auth-only, admin-only, or private):
  //   /donor/:id              — RLS authenticated-only, >1M rows, not indexable
  //   /profile                — user's own profile, requires auth
  //   /quiz                   — requires auth + completed onboarding
  //   /admin, /admin/*        — admin-only surfaces, not for public crawlers
  //   /admin/users/:id        — admin-only
  //   /admin/x-composer       — admin-only
  //   /r/card/:candidateId    — share-card render endpoint (image generation only, not for users)

  if (fetchFailures.length > 0) {
    console.error(`sitemap: NOT writing sitemap.xml — ${fetchFailures.length} data fetch error(s):`);
    for (const f of fetchFailures) console.error(`sitemap:   - ${f}`);
    console.error(`sitemap: keeping the existing sitemap.xml (last good) instead of a degraded one.`);
    process.exit(1);
  }

  writeFileSync(resolve("public/sitemap.xml"), xml(entries));
  console.log(`sitemap.xml written (${entries.length} entries)`);
}

main();
