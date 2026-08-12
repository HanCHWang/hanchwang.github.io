import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const configPath = path.join(root, "src/data/publications.config.json");
const generatedPath = path.join(root, "src/data/publications.generated.json");
const apiBase = "https://pub.orcid.org/v3.0";

const categoryByType = new Map([
  ["journal-article", "journal"],
  ["journal-issue", "journal"],
  ["conference-paper", "conference"],
  ["conference-abstract", "conference"],
  ["conference-output", "conference"],
  ["conference-poster", "conference"],
  ["conference-proceedings", "conference"],
  ["book-chapter", "book-chapter"],
  ["book", "book-chapter"],
  ["preprint", "preprint"],
  ["working-paper", "preprint"]
]);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function textValue(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  return node.value || "";
}

function getDate(publicationDate) {
  const year = textValue(publicationDate?.year);
  const month = textValue(publicationDate?.month);
  const day = textValue(publicationDate?.day);

  return {
    year,
    month,
    day,
    display: [year, month, day].filter(Boolean).join("-")
  };
}

function normalizeExternalIds(externalIds) {
  const ids = externalIds?.["external-id"] || [];
  return ids
    .map((id) => ({
      type: String(id["external-id-type"] || "").toLowerCase(),
      value: id["external-id-value"] || "",
      url: textValue(id["external-id-url"]),
      relationship: id["external-id-relationship"] || ""
    }))
    .filter((id) => id.type && id.value);
}

function identifierUrl(identifier) {
  if (!identifier) return "";
  if (identifier.url) return identifier.url;

  if (identifier.type === "doi") {
    return `https://doi.org/${identifier.value}`;
  }

  if (identifier.type === "arxiv") {
    return `https://arxiv.org/abs/${identifier.value}`;
  }

  return "";
}

function getPrimaryId(work, externalIds) {
  const doi = externalIds.find((id) => id.type === "doi");
  const arxiv = externalIds.find((id) => id.type === "arxiv");
  const isbn = externalIds.find((id) => id.type === "isbn");
  const fallback = doi || arxiv || isbn;

  if (fallback) {
    return `${fallback.type}:${fallback.value.toLowerCase()}`;
  }

  return `orcid:${work["put-code"]}`;
}

function normalizeContributors(contributors) {
  return (contributors?.contributor || [])
    .map((contributor) => {
      const creditName = textValue(contributor["credit-name"]);
      const given = textValue(contributor["contributor-orcid"]?.["given-names"]);
      const family = textValue(contributor["contributor-orcid"]?.["family-name"]);
      return creditName || [given, family].filter(Boolean).join(" ");
    })
    .filter(Boolean);
}

function normalizeWork(work) {
  const externalIds = normalizeExternalIds(work["external-ids"]);
  const doi = externalIds.find((id) => id.type === "doi");
  const arxiv = externalIds.find((id) => id.type === "arxiv");
  const type = work.type || "other";
  const date = getDate(work["publication-date"]);
  const links = {};

  if (doi) links.doi = identifierUrl(doi);
  if (arxiv) links.arxiv = identifierUrl(arxiv);
  if (textValue(work.url)) links.url = textValue(work.url);

  return {
    id: getPrimaryId(work, externalIds),
    source: "orcid",
    putCode: work["put-code"],
    type,
    category: categoryByType.get(type) || "other",
    title: textValue(work.title?.title),
    subtitle: textValue(work.title?.subtitle),
    authors: normalizeContributors(work.contributors),
    venue: textValue(work["journal-title"]),
    year: date.year,
    date: date.display,
    volume: "",
    issue: "",
    pages: "",
    publisher: "",
    links,
    identifiers: externalIds
  };
}

function normalizedTitle(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function itemScore(item) {
  return [
    item.links?.doi ? 1 : 0,
    Number(item.year || 0),
    item.date ? item.date.split("-").length : 0,
    item.authors?.length || 0
  ];
}

function preferItem(candidate, existing) {
  const candidateScore = itemScore(candidate);
  const existingScore = itemScore(existing);

  for (let index = 0; index < candidateScore.length; index += 1) {
    if (candidateScore[index] !== existingScore[index]) {
      return candidateScore[index] > existingScore[index];
    }
  }

  return false;
}

function deduplicateBy(items, getKey) {
  const deduplicated = new Map();

  for (const item of items) {
    const key = getKey(item);
    const existing = deduplicated.get(key);

    if (!existing || preferItem(item, existing)) {
      deduplicated.set(key, item);
    }
  }

  return [...deduplicated.values()];
}

function deduplicateItems(items) {
  const uniqueIds = deduplicateBy(items, (item) => item.id);
  return deduplicateBy(uniqueIds, (item) => normalizedTitle(item.title));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "evolved-ellipse-publication-fetcher/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }

  return response.json();
}

async function main() {
  const config = await readJson(configPath);
  const orcidId = config.orcidId || process.env.ORCID_ID || "";

  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcidId)) {
    console.log("No valid ORCID iD configured. Skipping publication fetch.");
    console.log("Set src/data/publications.config.json or ORCID_ID to enable it.");
    return;
  }

  const works = await fetchJson(`${apiBase}/${orcidId}/works`);
  const putCodes = [
    ...new Set(
      (works.group || [])
        .flatMap((group) => group["work-summary"] || [])
        .map((summary) => summary["put-code"])
        .filter(Boolean)
    )
  ];

  const fetchedItems = [];

  for (const putCode of putCodes) {
    const work = await fetchJson(`${apiBase}/${orcidId}/work/${putCode}`);
    const item = normalizeWork(work);
    if (item.title) fetchedItems.push(item);
  }

  const items = deduplicateItems(fetchedItems);

  items.sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || a.title.localeCompare(b.title));

  await mkdir(path.dirname(generatedPath), { recursive: true });
  await writeFile(
    generatedPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "orcid",
        orcidId,
        items
      },
      null,
      2
    )}\n`
  );

  console.log(`Fetched ${items.length} publication(s) from ORCID ${orcidId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
