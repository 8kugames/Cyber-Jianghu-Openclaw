#!/usr/bin/env node

/**
 * Sync version from package.json to openclaw.plugin.json
 * Used as npm postversion hook
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const pkgPath = join(rootDir, 'package.json');
const pluginPath = join(rootDir, 'openclaw.plugin.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const plugin = JSON.parse(readFileSync(pluginPath, 'utf-8'));

plugin.version = pkg.version;

writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n');

console.log(`[sync-version] Synced openclaw.plugin.json to v${pkg.version}`);
