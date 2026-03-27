# CONVENTIONS.md — Coding Conventions

## File & Folder Naming

- Folders: `kebab-case` (e.g., `business-info/`, `tech-detection/`)
- Files: `kebab-case.ts` (e.g., `html-scanner.ts`, `rate-limiter.ts`)
- React components: `PascalCase.tsx` (e.g., `ReportViewer.tsx`)
- Next.js special files: `page.tsx`, `layout.tsx`, `route.ts` (lowercase, Next.js convention)

## TypeScript Conventions

- Strict mode enabled — no `any`, no `ts-ignore` without a comment explaining why
- All interfaces defined in `src/scrapers/types.ts` — do not redefine them elsewhere
- Use `interface` for object shapes, `type` for unions/intersections
- Async functions must have explicit return types: `async function foo(): Promise<FooResult>`
- Null vs undefined: use `null` for intentionally absent values, `undefined` only for optional fields

## Scraper Module Convention

Every scraper module must follow this pattern:

```typescript
// src/scrapers/[module]/index.ts

import { SomeResult, ScraperOptions } from '../types';

export async function scrapeModuleName(
  url: string,
  options?: ScraperOptions
): Promise<SomeResult> {
  try {
    // scraping logic
    return { /* result fields */ };
  } catch (error) {
    return {
      // return empty/default result — NEVER throw
      error: error instanceof Error ? error.message : 'Unknown error',
      partial: true,
    };
  }
}
```

Rules:
- One main exported function per module
- Never throw — catch errors and return partial results
- Accept `url: string` as first argument always
- 30-second timeout enforced via `AbortController` or `Promise.race`

## API Route Convention

```typescript
// src/app/api/[route]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  // 1. Authenticate
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Validate input
  // 3. Business logic
  // 4. Return response

  return NextResponse.json({ result });
}
```

## React Component Convention

```typescript
// src/components/ComponentName.tsx

interface ComponentNameProps {
  // explicit prop types — no implicit any
}

export function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  return (
    // JSX
  );
}
```

- Named exports preferred over default exports (except Next.js pages which require default)
- Props interface always named `[ComponentName]Props`
- No inline styles — use Tailwind classes only

## Import Order

```typescript
// 1. Node built-ins
import { readFile } from 'fs/promises';

// 2. External packages
import axios from 'axios';
import { chromium } from 'rebrowser-playwright';

// 3. Internal absolute imports (using @/ alias)
import { createServerClient } from '@/lib/supabase-server';
import type { BusinessInfoResult } from '@/scrapers/types';

// 4. Relative imports
import { extractPhone } from './contact-extractor';
```

## Error Handling

- Scrapers: catch and return partial results (never throw)
- API routes: return `NextResponse.json({ error: message }, { status: code })`
- React components: wrap in error boundaries, show fallback UI
- Never `console.log` sensitive data (URLs, user data, API keys)

## Git Commit Format

```
type(scope): short description

Types: feat, fix, refactor, test, docs, chore
Scope: scraper, api, ui, db, ai, cli

Examples:
feat(scraper): add TikTok ads library scraper
fix(api): handle job timeout gracefully in orchestrator
refactor(ui): extract ReportSection into shared component
```

## Environment Variable Naming

- Public (safe for browser): `NEXT_PUBLIC_*`
- Server-only: no prefix (e.g., `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`)
- All defined in `.env.local` (gitignored) and documented in `.env.example`

## Tailwind CSS Conventions

- Use Tailwind utility classes exclusively — no CSS modules, no inline styles
- Use `shadcn/ui` components as the base component library
- Color palette: use Tailwind's zinc/slate for neutrals, emerald for success states, red for errors
- Responsive: mobile-first (`sm:`, `md:`, `lg:` breakpoints)

## Supabase Conventions

- Never use the anon key for server-side writes — always use service role key
- Always enable RLS on new tables
- Use `lib/supabase.ts` (browser) vs `lib/supabase-server.ts` (server) — never mix
- JSONB columns: store as-is from scraper, never stringify manually

## Rate Limiting Convention

Every outbound HTTP request to an external site must go through a `bottleneck` limiter:

```typescript
import { getDomainLimiter } from '@/lib/rate-limiter';

const limiter = getDomainLimiter('google.com');
const result = await limiter.schedule(() => axios.get(url));
```

The `getDomainLimiter` function creates and caches one limiter per domain. Default: 1 req/2s. Overrides defined in `rate-limiter.ts` for high-risk domains.
