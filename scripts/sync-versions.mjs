import fs from "node:fs/promises";
import { execSync } from "node:child_process";

async function readText(path) {
  return fs.readFile(path, "utf8");
}

async function writeText(path, text) {
  await fs.writeFile(path, text, "utf8");
}

function gitAdd(files) {
  try {
    execSync(`git add ${files.join(" ")}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function gitCommit(message) {
  try {
    execSync(`git commit -m "${message}"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function updateSkillVersion(skillText, version) {
  const first = skillText.indexOf("---");
  if (first !== 0) {
    throw new Error("SKILL.md must start with YAML front matter (---).");
  }
  const second = skillText.indexOf("\n---", 3);
  if (second === -1) {
    throw new Error("SKILL.md front matter must be closed by '---'.");
  }
  const endFence = second + "\n---".length;
  const frontMatter = skillText.slice(0, endFence);
  const rest = skillText.slice(endFence);

  if (!/^version:\s*/m.test(frontMatter)) {
    const inserted = frontMatter.replace(
      /^(description:.*)$/m,
      `$1\nversion: ${version}`,
    );
    return inserted + rest;
  }

  const updated = frontMatter.replace(
    /^version:\s*.*$/m,
    `version: ${version}`,
  );
  return updated + rest;
}

function formatJson(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function updateChangelog(changelogText, version) {
  const unreleasedPattern = /^## \[unreleased\] — (\d{4}-\d{2}-\d{2})$/m;
  if (!unreleasedPattern.test(changelogText)) {
    console.warn(
      `WARNING: No "## [unreleased] — YYYY-MM-DD" entry found in CHANGELOG.md`,
    );
    return changelogText;
  }
  const today = getToday();
  return changelogText.replace(
    /^## \[unreleased\] — .*$/m,
    `## [${version}] — ${today}`,
  );
}

async function main() {
  const pkg = JSON.parse(await readText("package.json"));
  const version = pkg.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(-.+)?$/.test(version)) {
    throw new Error(`Invalid package.json version: ${String(version)}`);
  }

  const skillPath = "SKILL.md";
  const skillText = await readText(skillPath);
  const nextSkillText = updateSkillVersion(skillText, version);
  if (nextSkillText !== skillText) {
    await writeText(skillPath, nextSkillText);
    console.log(`Updated ${skillPath} version to ${version}`);
  }

  const pluginPath = "openclaw.plugin.json";
  const plugin = JSON.parse(await readText(pluginPath));
  let pluginUpdated = false;
  if (plugin.version !== version) {
    plugin.version = version;
    await writeText(pluginPath, formatJson(plugin));
    pluginUpdated = true;
    console.log(`Updated ${pluginPath} version to ${version}`);
  }

  const changelogPath = "CHANGELOG.md";
  const changelogText = await readText(changelogPath);
  const nextChangelogText = updateChangelog(changelogText, version);
  if (nextChangelogText !== changelogText) {
    await writeText(changelogPath, nextChangelogText);
    console.log(`Updated ${changelogPath} unreleased entry to ${version}`);
  }

  const syncedFiles = [];
  if (nextSkillText !== skillText) syncedFiles.push("SKILL.md");
  if (pluginUpdated) syncedFiles.push("openclaw.plugin.json");
  if (nextChangelogText !== changelogText) syncedFiles.push("CHANGELOG.md");

  if (syncedFiles.length > 0) {
    if (gitAdd(syncedFiles) && gitCommit(`chore: sync versions to ${version}`)) {
      console.log(`Auto-committed: ${syncedFiles.join(", ")}`);
    } else {
      console.log(`MANUAL ACTION REQUIRED: git add ${syncedFiles.join(" ")} && git commit`);
    }
  }
}

await main();
