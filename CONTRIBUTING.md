# Contributing to Copilot Budget Command Calculator

Thanks for your interest in improving this tool. This guide covers how to report issues, set up locally, follow conventions, and submit pull requests.

## Reporting bugs and requesting features

- **Bug reports**: [Open a bug report](https://github.com/xrvk/copilot-budget-command-calculator/issues/new?template=bug_report.yml) with steps to reproduce, expected behavior, and your connection mode (demo or live).
- **Feature requests**: [Open a feature request](https://github.com/xrvk/copilot-budget-command-calculator/issues/new?template=feature_request.yml) describing the problem and your proposed solution.
- **Questions**: [Start a discussion](https://github.com/xrvk/copilot-budget-command-calculator/discussions) for general questions about usage or billing concepts.

Please search [existing issues](https://github.com/xrvk/copilot-budget-command-calculator/issues) before filing a new one.

## Local setup

### Prerequisites

- **Node.js 22+** (the Dockerfile and recommended dev environment use Node 22)
- **npm** (ships with Node)

### First-time setup

```bash
git clone <repo-url>
cd copilot-budget-command-calculator
npm install --legacy-peer-deps
```

### Start the dev server

```bash
npm run dev              # Vite on http://localhost:5002 (strictPort — will fail if 5002 is taken)
```

### Live API credentials (optional)

Without credentials the app starts in **demo mode** with sample data. To connect to a real enterprise:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your enterprise URL and a classic PAT:

```
VITE_DEV_ENTERPRISE_URL=https://github.com/enterprises/your-slug
VITE_DEV_PAT=ghp_...
```

This file is gitignored. The Import panel will auto-connect on page load when these are set.

### Worktree setup

If you use `git worktree`, symlink `node_modules` and `.env.local` from the main checkout into new worktrees:

```bash
ln -s /path/to/main-repo/node_modules <worktree>/node_modules
ln -s /path/to/main-repo/.env.local   <worktree>/.env.local
```

## Read the docs first

The `docs/` directory contains essential billing domain knowledge. **Read these before touching any budget calculation or constraint logic:**

| Document | What it covers |
|----------|----------------|
| `docs/COPILOT_BUDGET_TIPS.md` | Customer-facing tips (rendered in the Tips tab) |

## Stack at a glance

| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript |
| Bundler | Vite |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix primitives) |
| Icons | Phosphor Icons (`@phosphor-icons/react`) |
| Theme | next-themes (dark/light) |
| Testing | Vitest + Testing Library + happy-dom |
| Linting | ESLint v10, flat config (`eslint.config.js`) |
| Path alias | `@/` → `src/` |

## Project structure

```
src/
├── components/
│   ├── ui/                    # shadcn/ui primitives (do not modify)
│   ├── BudgetCalculator/      # Tier Planner tab (5-step wizard)
│   ├── BudgetPlanner.tsx      # Budget Planner tab
│   ├── PromoAicOptimizer.tsx  # Promo Optimizer tab
│   ├── ApiTools.tsx           # API Tools tab
│   ├── Tips.tsx               # Tips tab
│   └── ImportPanel.tsx        # Connect/disconnect/refresh UI
├── hooks/                     # Shared React hooks (credentials, teams, theme)
├── lib/                       # Pure helpers: API client, constants, utilities
├── __tests__/                 # Unit and integration tests
├── styles/                    # Global style tokens
└── workers/                   # Web workers
packages/
└── calculator-core/           # Pure budget math (workspace package)
docs/                          # Billing domain documentation
```

### Tabs

Each tab is a standalone component. Tab state syncs to the URL hash (e.g. `/#budget-planner`).

| Hash | Component | Purpose |
|------|-----------|---------|
| `#budget-planner` | `BudgetPlanner.tsx` | Model max monthly spend across cost centers; import/edit/push live data |
| `#tier-planner` | `BudgetCalculator/` | Calculate optimal ULB and enterprise budget from license mix |
| `#promo-optimizer` | `PromoAicOptimizer.tsx` | Optimize seat purchases to maximize AI Credits during promo periods |
| `#api-tools` | `ApiTools.tsx` | Generate and execute GitHub Billing API scripts |
| `#tips` | `Tips.tsx` | Customer guidance rendered from markdown |

## Code conventions

### React patterns

- **No `useEffect` to sync props/context to state.** Use the state-during-render pattern instead (compare previous value via `useState`, call setter during render). See `numeric-input.tsx` and `PromoAicOptimizer.tsx` for examples.
- **No `Math.random()` or other impure functions during render.** Use `useId()` for deterministic IDs.
- **No `ref.current` reads in the render path.** Refs are for effects and event handlers only. If you must write to a ref during render, add an `eslint-disable` comment with justification.
- All lint rules (`react-hooks/set-state-in-effect`, `react-hooks/purity`, `react-hooks/refs`, `prefer-const`) are at **error** severity.

### Styling

- **Tailwind utility classes only.** No CSS modules.
- Inline `style={}` is acceptable only for values Tailwind cannot express at build time (e.g. a progress bar width computed from a variable).
- Use **semantic color tokens** (`text-success`, `text-warning`, `text-destructive`, `bg-muted`, etc.).

### Icons and components

- **Phosphor Icons**: use `weight="duotone"` for UI chrome, `weight="fill"` for status indicators.
- **shadcn/ui** components live in `src/components/ui/`. Do not modify them directly.
- **`NumericInput`** (`src/components/ui/numeric-input.tsx`) for all numeric input fields. Supports `allowFloat`, `min`, `onValueChange`.

### UI text

- **No em dashes (`—`) in UI text.** Use periods, colons, parentheses, or middle dots (`·`) instead. Em dashes are fine in long-form prose (Tips tab) and code comments.

### Terminology (CELA guidance)

Customer-facing copy must follow these rules. Internal code identifiers and comments may still use established terms.

| Use | Avoid |
|-----|-------|
| "usage-based billing" | "token-based billing" |
| "additional spend" / "additional usage" | "overage" |
| "included credits" / "included usage" | "entitlements" (exception: "Enterprise Entitlement Pool" is an established label) |
| "metered billing" / "metered charges" | "pay-as-you-go" / "PAYG" |
| "potential additional spend" | "exposure" |

### API usage

- Use the typed wrappers in `src/lib/api.ts` (`patchBudget`, `createBudget`, `fetchBudgets`, etc.). They throw `ApiError` on failure.
- Step components should use these wrappers, not raw `apiFetch` calls.
- `apiFetch` (from `useEnterpriseCredentials`) is passed as the first argument to every API helper.

### Drift detection

When adding a new API-backed editable field, follow the existing `fieldIsDirty` pattern:

```ts
const fieldIsDirty =
  credentials !== null &&
  entBudgetId !== null &&
  apiValue !== null &&
  localValue !== apiValue
```

All dirty flags feed into `pendingCount`. When `pendingCount > 0`, a sticky "Review & Apply" bar appears. Applying PATCHes the API and calls `setBudgetMeta()` to clear the drift. Discarding resets local values to their `api*` counterparts.

## Testing

```bash
npm test              # vitest run (single pass)
npm run test:watch    # vitest --watch (re-runs on save)
```

- Write **unit tests for pure helpers** (calculations, utilities, formatters).
- Tests live in `src/__tests__/`.
- Test environment: happy-dom.
- **API connection tests** (`api-connection.test.ts`) auto-skip in CI (no credentials). They run locally when `.env.local` provides valid credentials.
- Coverage excludes `src/components/ui/` (shadcn/ui primitives).

## CI

The CI workflow (`.github/workflows/ci.yml`) runs **lint, test, and build in parallel** on every PR and push to `main`. All three must pass.

**Docs-only changes** (files matching `*.md`, `docs/`, `LICENSE`) **skip CI entirely** via the `changes` detection job.

## Pull requests

Every PR must follow the template in `.github/PULL_REQUEST_TEMPLATE.md`:

- **Value**: Lead with customer-facing impact. If there is no direct customer impact, describe the value for internal audiences (GitHub teams, customer-facing teams, or contributors).
- **How it works**: Summarize the approach and key decisions. Focus on how pieces fit together, not a file-by-file changelog.

## Self-hosting

The app is a static SPA with no server-side runtime. Build and serve with Docker:

```bash
docker build -t copilot-budget .
docker run -p 8080:80 copilot-budget
```

No build-time environment variables are required. Credentials are entered in the browser at runtime via the Import panel, or the app runs in demo mode.
