# AGENTS.md — Cyber-Jianghu OpenClaw Plugin

**Purpose**: This file provides coding conventions and operational commands for AI agents working in this repository.

---

## Project Overview

- **Type**: TypeScript ES Module OpenClaw plugin
- **Runtime**: Node.js 20+, ES2022 target
- **Registry**: npm package `@8kugames/cyber-jianghu-openclaw`
- **Purpose**: Integration layer between OpenClaw (LLM gateway) and Cyber-Jianghu Rust Agent (game logic engine)

---

## Build & Test Commands

### Type Check
```bash
npm run build
# Runs: tsc --noEmit
```

### Lint
```bash
npm run lint
# Runs: oxlint
```

### Test
```bash
npm test          # vitest run (single pass)
npm run test:watch # vitest (watch mode)
```

**Run a single test file**:
```bash
npx vitest run tests/my.test.ts
```

**Vitest config**: `vitest.config.ts` — tests live in `tests/**/*.test.ts`

### Release Workflow
```bash
npm run version  # Sync versions (prepublishOnly)
```

---

## Code Style

### Indentation & Formatting
- **Tabs** (not spaces) for indentation
- Trim trailing whitespace
- Max line length: ~100 chars (use judgment)

### Imports
- Use `.js` extension in all local imports (required for ESM):
  ```typescript
  import { WsClient } from "./ws-client.js";
  import type { TickMessage } from "./types.js";
  ```
- Use `import type` for type-only imports
- Order: external → internal → relative

### Naming Conventions

| Construct | Convention | Example |
|-----------|-------------|---------|
| Interfaces | PascalCase | `interface WorldState` |
| Types | PascalCase | `type ActionType = string` |
| Classes | PascalCase | `class WsClient` |
| Functions | camelCase | `function discoverPort()` |
| Variables | camelCase | `cachedAgentInfo` |
| JSON fields | snake_case | `tick_id`, `world_time` |
| Constants | camelCase | `DEFAULT_CONFIG` |

### TypeScript Guidelines

- **`strict: true`** is enforced — no `any`, no implicit `any`
- Use `@sinclair/typebox` `Type.Object()` for tool parameters (runtime validation)
- Use `unknown` for unvalidated external data; narrow with type guards
- Prefer `interface` over `type` for object shapes
- Use `Record<string, T>` for map/dictionary types
- Always use explicit return types on exported functions

### Error Handling

```typescript
// DO: Guard with instanceof
catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  throw new Error(`HTTP ${res.status}: ${msg}`);
}

// AVOID: Empty catch
catch { }

// AVOID: Catching non-Error
catch (e) { throw e; }
```

### Async/Await
- Use `async/await` over `.then()` chains
- Always `await` or handle promise rejection
- Use `Promise.resolve().then(async () => {...})` for fire-and-forget in event handlers

---

## Architecture Patterns

### File Organization
```
*.ts           — Root entry points (register.ts, ws-client.ts, http-client.ts, types.ts)
plugins/*/     — Plugin sub-modules (plugins/reporter/)
scripts/*      — Build utility scripts
tests/**/*.ts — Test files
```

### Path Aliases
```json
"paths": { "@/*": ["./*"] }
```
```typescript
import { HttpClient } from "@/http-client.js"; // resolves to ./http-client.js
```

### State Management
- Module-level singletons for clients (e.g., `singletonClient`, `cachedAgentInfo`)
- Provide reset functions for testing: `resetHttpClient()`
- Avoid deep global state; prefer dependency injection

### JSON Serialization
- All JSON uses **snake_case** to match Rust serde serialization
- TypeScript interfaces use **camelCase** for fields
- Use `JSON.stringify(obj, null, 2)` for debug output

---

## Comments

### Header Separator
```typescript
// ============================================================================
// Section Title
// ============================================================================
```

### JSDoc for Public APIs
```typescript
/**
 * Scan the configured port range and return the first port that responds to
 * a health check with `{ status: "ok" }`.
 */
async function discoverPort(host: string, config: HttpClientConfig): Promise<number | null>
```

---

## Git Conventions

- **Commits**: Conventional commits not enforced, but be descriptive
- **Branch naming**: Not enforced; use judgment (e.g., `feat/xxx`, `fix/xxx`)
- **Version tags**: `v*` format (e.g., `v0.3.3`) — triggers release workflow

---

## Dependency Notes

- **`@sinclair/typebox`**: Runtime type validation for tool parameters
- **`openclaw`**: Peer dependency (`^2026.3.13`) — plugin API compatibility
- **No runtime `fetch` polyfill needed** — Node 18+ native fetch is used

---

## Common Pitfalls

1. **ESM `.js` extensions**: Always include `.js` in local imports, even though files are `.ts`
2. **AbortSignal.timeout()**: Use for request timeouts (Node 18+)
3. **TypeBox in tool definitions**: Use `Type.String()`, `Type.Optional()`, etc. — not native TS types
4. **Empty test suite**: Tests directory is `tests/` (note: singular), pattern `**/*.test.ts`
