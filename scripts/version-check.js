#!/usr/bin/env node

/**
 * Version consistency checker for Cyber-Jianghu-Integration-Openclaw
 *
 * Ensures package.json and openclaw.plugin.json versions are synchronized.
 *
 * Usage:
 *   node scripts/version-check.js           # Check and warn
 *   node scripts/version-check.js --strict  # Exit with error if mismatch
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

function readJSON(filepath) {
  if (!existsSync(filepath)) {
    console.error(`[version-check] ERROR: File not found: ${filepath}`);
    return null;
  }
  try {
    const content = readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`[version-check] ERROR: Failed to parse ${filepath}: ${err.message}`);
    return null;
  }
}

function main() {
  const strict = process.argv.includes('--strict');

  const packageJsonPath = join(rootDir, 'package.json');
  const pluginJsonPath = join(rootDir, 'openclaw.plugin.json');

  const pkg = readJSON(packageJsonPath);
  const plugin = readJSON(pluginJsonPath);

  if (!pkg || !plugin) {
    console.error('[version-check] FAILED: Could not read configuration files');
    process.exit(1);
  }

  const pkgVersion = pkg.version;
  const pluginVersion = plugin.version;

  console.log(`[version-check] package.json version: ${pkgVersion}`);
  console.log(`[version-check] openclaw.plugin.json version: ${pluginVersion}`);

  if (pkgVersion !== pluginVersion) {
    const msg = `[version-check] VERSION MISMATCH: package.json (${pkgVersion}) != openclaw.plugin.json (${pluginVersion})`;
    console.error(msg);

    if (strict) {
      console.error('[version-check] Run: npm version patch|minor|major to sync versions');
      process.exit(1);
    } else {
      console.warn('[version-check] WARNING: Versions are out of sync!');
    }
  } else {
    console.log('[version-check] OK: Versions are synchronized');
  }

  // Check SKILL.md version if it has frontmatter
  const skillMdPath = join(rootDir, 'SKILL.md');
  if (existsSync(skillMdPath)) {
    const skillContent = readFileSync(skillMdPath, 'utf-8');
    const versionMatch = skillContent.match(/^version:\s*['"]?([\d.]+)['"]?/m);
    if (versionMatch) {
      const skillVersion = versionMatch[1];
      console.log(`[version-check] SKILL.md version: ${skillVersion}`);

      if (skillVersion !== pkgVersion) {
        const msg = `[version-check] SKILL.md VERSION MISMATCH: ${skillVersion} != ${pkgVersion}`;
        console.error(msg);

        if (strict) {
          process.exit(1);
        }
      }
    }
  }
}

main();
