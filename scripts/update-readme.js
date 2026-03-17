// scripts/update-readme.js
// Fetches your pinned repos from GitHub GraphQL API
// and rewrites the Projects section in README.md

import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const USERNAME = process.env.GITHUB_USERNAME || "senthil-prabhu-sudo";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("ERROR: GITHUB_TOKEN environment variable is not set.");
  process.exit(1);
}

// ── 1. GraphQL query: fetch pinned repos ─────────────────────────────────────
const query = `
  query {
    user(login: "${USERNAME}") {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            name
            description
            url
            stargazerCount
            forkCount
            primaryLanguage {
              name
            }
            repositoryTopics(first: 5) {
              nodes {
                topic { name }
              }
            }
            isArchived
            updatedAt
          }
        }
      }
    }
  }
`;

async function fetchPinnedRepos() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data.user.pinnedItems.nodes;
}

// ── 2. Determine status badge from repo metadata ──────────────────────────────
function getStatus(repo) {
  if (repo.isArchived) return { label: "Archived",    icon: "⚫" };
  const updated = new Date(repo.updatedAt);
  const daysSince = (Date.now() - updated) / (1000 * 60 * 60 * 24);
  if (daysSince < 14)  return { label: "Active",      icon: "🟢" };
  if (daysSince < 60)  return { label: "In Progress", icon: "🟡" };
  return                      { label: "Maintained",  icon: "🔵" };
}

// ── 3. Pick stack tags: language + topics (up to 4) ──────────────────────────
function getStack(repo) {
  const topics = repo.repositoryTopics.nodes
    .map((n) => n.topic.name)
    .slice(0, 3);
  const lang = repo.primaryLanguage?.name;
  const all = lang ? [lang, ...topics] : topics;
  // deduplicate, max 4 items
  return [...new Set(all)].slice(0, 4).join(" · ");
}

// ── 4. Build the markdown table ───────────────────────────────────────────────
function buildProjectsTable(repos) {
  if (!repos.length) {
    return "_No pinned repositories found. Pin some repos on your GitHub profile!_";
  }

  const header = [
    "| 🔨 Project | 📝 Description | 🛠️ Stack | ⭐ Stars | 📌 Status |",
    "|:---|:---|:---|:---:|:---:|",
  ];

  const rows = repos.map((repo) => {
    const name   = `[**${repo.name}**](${repo.url})`;
    const desc   = (repo.description || "_No description_").replace(/\|/g, "\\|");
    const stack  = getStack(repo) || "—";
    const stars  = repo.stargazerCount;
    const status = getStatus(repo);
    return `| ${name} | ${desc} | ${stack} | ${stars} | ${status.icon} ${status.label} |`;
  });

  return [...header, ...rows].join("\n");
}

// ── 5. Inject table into README between sentinel comments ─────────────────────
const START_MARKER = "<!-- PROJECTS:START -->";
const END_MARKER   = "<!-- PROJECTS:END -->";

function injectIntoReadme(readmePath, table) {
  const content = fs.readFileSync(readmePath, "utf8");

  const startIdx = content.indexOf(START_MARKER);
  const endIdx   = content.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `Could not find sentinel markers in README.md.\n` +
      `Make sure these lines exist:\n${START_MARKER}\n${END_MARKER}`
    );
  }

  const before  = content.slice(0, startIdx + START_MARKER.length);
  const after   = content.slice(endIdx);
  const updated = `${before}\n\n${table}\n\n${after}`;

  fs.writeFileSync(readmePath, updated, "utf8");
  console.log("README.md updated successfully.");
}

// ── 6. Main ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log(`Fetching pinned repos for @${USERNAME}...`);
    const repos = await fetchPinnedRepos();
    console.log(`Found ${repos.length} pinned repo(s).`);

    const table = buildProjectsTable(repos);
    console.log("\nGenerated table:\n" + table);

    const readmePath = path.resolve("README.md");
    injectIntoReadme(readmePath, table);
  } catch (err) {
    console.error("Failed to update README:", err.message);
    process.exit(1);
  }
})();
