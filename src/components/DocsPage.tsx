import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  ShieldCheck,
  Key,
  Play,
  ChartBar,
  Calculator,
  Code,
  Rocket,
  CurrencyCircleDollar,
  Info,
  Lightning,
  Users,
  Buildings,
  Target,
  FileArrowUp,
  Warning,
} from '@phosphor-icons/react'

interface DocsPageProps {
  onBack: () => void
}

const NAV_ITEMS = [
  { id: 'getting-started', label: 'Getting Started', icon: Play },
  { id: 'connecting', label: 'Connecting to Your Enterprise', icon: Key },
  { id: 'budget-planner', label: 'Budget Planner', icon: ChartBar },
  { id: 'tier-planner', label: 'Tier Planner', icon: Calculator },
  { id: 'promo-optimizer', label: 'Promo Optimizer', icon: Rocket },
  { id: 'billing-report', label: 'Billing Report', icon: CurrencyCircleDollar },
  { id: 'api-tools', label: 'API Tools', icon: Code },
  { id: 'limitations', label: 'Troubleshooting', icon: Warning },
] as const

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function DocsPage({ onBack }: DocsPageProps) {
  return (
    <div className="flex gap-8 max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Sticky sidebar navigation */}
      <aside className="hidden lg:block w-56 shrink-0">
        <nav className="sticky top-24 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="mb-4 -ml-2 gap-2 text-muted-foreground hover:text-foreground w-full justify-start"
          >
            <ArrowLeft size={14} weight="bold" />
            Back to app
          </Button>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Contents</p>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollToSection(id)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors py-1.5 px-2 rounded-md text-left"
            >
              <Icon size={14} weight="duotone" className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 max-w-3xl">
        {/* Mobile back button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-6 -ml-2 gap-2 text-muted-foreground hover:text-foreground lg:hidden"
        >
          <ArrowLeft size={16} weight="bold" />
          Back to app
        </Button>

        {/* Page title */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight mb-2">User Guide</h1>
          <p className="text-lg text-muted-foreground">
            Plan, model, and manage your enterprise's AI credit budgets.
          </p>
        </div>

        {/* Mobile table of contents */}
        <Card className="mb-10 lg:hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">On this page</CardTitle>
          </CardHeader>
          <CardContent>
            <nav className="grid grid-cols-1 gap-1">
              {NAV_ITEMS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => scrollToSection(id)}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors py-1 px-2 rounded hover:bg-accent/50 text-left"
                >
                  {label}
                </button>
              ))}
            </nav>
          </CardContent>
        </Card>

      {/* Getting Started */}
      <section id="getting-started" className="mb-12 scroll-mt-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Play size={18} weight="duotone" className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-semibold">Getting Started</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          Visualize your budget hierarchy, model scenarios, and push changes to your enterprise via the GitHub Billing API. No backend server required.
        </p>

        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Play size={16} weight="fill" className="text-accent" />
              Demo Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              The app always starts in <strong className="text-foreground">demo mode</strong> with sample data for a fictional enterprise called "acme-corp". No credentials are needed to explore.
            </p>
            <p>
              In demo mode, all buttons and interactions are fully functional. You can:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Edit budgets and see how drift detection works</li>
              <li>Walk through the entire Tier Planner workflow</li>
              <li>Generate API scripts with sample values pre-filled</li>
              <li>Switch between "With Cost Centers" and "No Cost Centers" demo variants to see how the app adapts</li>
              <li>Upload a CSV file for consumption analysis</li>
            </ul>
            <p>
              Demo mode is the best way to learn the tool before connecting to a real enterprise. Dismiss the demo banner or click "Connect your enterprise" to switch to live data.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4 border-warning/40 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileArrowUp size={16} weight="duotone" className="text-warning" />
              Data requirements for live mode
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              When you leave demo mode, the app requires <strong className="text-foreground">two inputs before the main UI unlocks</strong>:
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li><strong className="text-foreground">A live API connection</strong> (classic PAT) for accurate seat counts.</li>
              <li><strong className="text-foreground">A billing CSV</strong> exported from your enterprise billing settings for per-user consumption data.</li>
            </ol>
            <p>
              Both are needed because each input answers a different question. The API tells the app how many CB and CE seats the enterprise actually holds (the included-credit pool). The CSV tells the app how each user actually consumes (the basis for ULB and power-user recommendations). The CSV alone is not enough: it only lists users with activity, so seat holders with zero usage are missing and the pool gets understated.
            </p>
            <p>
              If you don't have usage data yet (for example, you're a brand-new UBB customer), stay in <strong className="text-foreground">demo mode</strong> to explore the configuration shape, or set a conservative enterprise budget directly in the GitHub UI and return here after one billing cycle with a CSV in hand.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Connecting to Your Enterprise */}
      <section id="connecting" className="mb-12 scroll-mt-20 pt-12 border-t border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Key size={18} weight="duotone" className="text-blue-500" />
          </div>
          <h2 className="text-2xl font-semibold">Connecting to Your Enterprise</h2>
        </div>

        <h3 className="text-lg font-semibold mb-2">Why an API token?</h3>
        <p className="text-muted-foreground mb-4">
          This app calls the GitHub Billing API directly from your browser to read and write budget settings, cost centers, and seat data. There is no backend server. Your token authenticates each request.
        </p>

        <h3 className="text-lg font-semibold mb-2">Required token type</h3>
        <p className="text-muted-foreground mb-4">
          You need a <strong className="text-foreground">Classic Personal Access Token (PAT)</strong> with the following scopes:
        </p>

        <div className="grid gap-3 mb-6">
          <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
            <Badge variant="secondary" className="mt-0.5 shrink-0 font-mono text-xs">manage_billing:enterprise</Badge>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Required</p>
              <p>Read and write access to enterprise billing budgets and cost centers. Lets the app import your budget configuration, create cost centers, update budget amounts, and sync team membership.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
            <Badge variant="secondary" className="mt-0.5 shrink-0 font-mono text-xs">read:org</Badge>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Recommended</p>
              <p>Resolves org members for constraint analysis (Step 5). Without it, the app can't determine which users belong to each org-scoped cost center. A warning appears if missing.</p>
            </div>
          </div>
        </div>

        <Alert className="mb-4">
          <ShieldCheck size={16} weight="duotone" className="text-emerald-500" />
          <AlertDescription className="text-sm">
            <strong>Security model:</strong> Your token is held in memory only for the duration of your browser tab. It is never persisted to disk, cookies, or local storage. All API calls go directly from your browser to <code className="font-mono text-[13px] bg-muted px-1 py-0.5 rounded">api.github.com</code> (or your GHE.com subdomain). Nothing is sent to any intermediary. Closing or refreshing the tab erases the token.
          </AlertDescription>
        </Alert>

        <p className="text-sm text-muted-foreground">
          For maximum security, self-host the app via Docker on your own infrastructure and create a dedicated PAT for each session, revoking it when done.
        </p>
      </section>

      {/* Budget Planner */}
      <section id="budget-planner" className="mb-12 scroll-mt-20 pt-12 border-t border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <ChartBar size={18} weight="duotone" className="text-blue-500" />
          </div>
          <h2 className="text-2xl font-semibold">Budget Planner</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          View and edit enterprise-wide budget settings and cost center allocations. When connected, the planner pulls live data from GitHub for inline editing.
        </p>

        <h3 className="text-lg font-semibold mb-2">Importing live data</h3>
        <p className="text-muted-foreground mb-4">
          Click "Connect your enterprise" or expand the Import panel at the top. Enter your enterprise URL and PAT. The app fetches all cost centers and budgets in one call, populating the table below.
        </p>

        <h3 className="text-lg font-semibold mb-2">Editing and applying changes</h3>
        <p className="text-muted-foreground mb-4">
          Edit any budget value inline. The app tracks <strong className="text-foreground">drift</strong>: when local edits differ from API state, a count badge and a sticky "Review & Apply" bar appear. Review all pending changes as a diff before pushing to GitHub.
        </p>

        <h3 className="text-lg font-semibold mb-2">CSV consumption analysis</h3>
        <Card className="mb-4">
          <CardContent className="pt-4 text-sm text-muted-foreground space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <FileArrowUp size={16} weight="duotone" className="text-blue-500" />
              <span className="font-medium text-foreground">What the CSV upload does</span>
            </div>
            <p>
              Upload a billing CSV (exported from GitHub's billing page) to see a sorted bar chart of per-user AI Credit consumption, ranked from highest to lowest.
            </p>
            <p>
              <strong className="text-foreground">Power user detection:</strong> Click any user row in the chart to set the "power user" cutoff. Everyone above that line is classified as a power user. The app calculates:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Number of power users and regular users</li>
              <li>Recommended ULB based on regular user consumption patterns</li>
              <li>Recommended power user budget based on top-tier consumption</li>
            </ul>
            <p>
              Click "Apply to Tier Planner" to send these values (plus a configurable growth buffer) to the Tier Planner inputs, pre-filling your configuration with real consumption data.
            </p>
          </CardContent>
        </Card>

        <Alert className="mb-4 border-warning/40 bg-warning/5">
          <Info size={16} weight="duotone" className="text-warning" />
          <AlertDescription className="text-sm space-y-2">
            <p>
              <strong className="text-foreground">"Max Monthly Spend" is a ceiling, not a forecast.</strong> The dollar value in the Spending Summary card shows the maximum your enterprise budget allows after the included credit pool is exhausted, assuming every counter hits its cap. Actual additional spend depends on real consumption patterns and is typically much lower.
            </p>
            <p>
              <strong className="text-foreground">CSV "CB / CE active users" are not seat counts.</strong> The billing CSV only includes users who consumed credits during the period. Seat holders with zero activity don't appear, so the implied included-credit pool is a floor, not the true seat total. The app uses your live API connection for accurate seat counts; the CSV only contributes the per-user consumption distribution.
            </p>
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Methodology</Badge>
              Why We Show "Users Exceeding ULB"
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              When you upload a billing CSV and the app suggests ULB values, it intentionally does not try to cover 100% of users. Here is why.
            </p>
            <p>
              <strong className="text-foreground">The base ULB covers ~95% of regular users.</strong>{' '}
              It is sized so the vast majority of your workforce can operate without hitting a cap. The remaining ~5% are outliers whose consumption pattern is closer to a power user. Covering them with the base ULB would give everyone excessive headroom and drain the shared pool faster.
            </p>
            <p>
              <strong className="text-foreground">The power user ULB sits mid-range in the power user group.</strong>{' '}
              About half of power users will exceed it. This is deliberate: the top power users have highly individual consumption patterns. A one-size-fits-all budget for the group would either be too generous (draining the pool) or too restrictive (blocking productive work). The exceeders section identifies who specifically needs a custom override.
            </p>
            <p>
              <strong className="text-foreground">What to do with exceeders:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li><strong className="text-foreground">Give them individual ULBs.</strong> Select the users and click Apply. Their budget is set to their actual usage plus the growth buffer.</li>
              <li><strong className="text-foreground">Raise the base or power ULB.</strong> Drag the dashed line on the chart upward to cover more users in that group.</li>
              <li><strong className="text-foreground">Do nothing.</strong> They hit the cap. With usage blocking on, they pause until next cycle. With it off, the excess counts toward your enterprise budget as metered spend.</li>
            </ul>
            <p>
              This approach gives you fine-grained control: most users get a sensible default, and the handful who genuinely need more get explicit approval via individual overrides.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Tier Planner */}
      <section id="tier-planner" className="mb-12 scroll-mt-20 pt-12 border-t border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Calculator size={18} weight="duotone" className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-semibold">Tier Planner</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          Configure every layer of Copilot's budget hierarchy, from the enterprise spending limit down to individual user budgets. The planner calculates optimal values from your seat counts and consumption targets, then executes each change via the API.
        </p>

        <Alert className="mb-4 border-warning/40 bg-warning/5">
          <Info size={16} weight="duotone" className="text-warning" />
          <AlertDescription className="text-sm">
            <strong className="text-foreground">Recommendations are forecast-based.</strong> When a billing CSV is uploaded, the Tier Planner projects realistic monthly additional spend from last month's per-user pattern and uses that as the headline. The forecast is floored at GitHub's billing-preview actual additional spend so the suggested budget never undercuts what you already paid.
          </AlertDescription>
        </Alert>

        <h3 className="text-lg font-semibold mb-3">Configuration inputs</h3>
        <p className="text-muted-foreground mb-3">
          These inputs drive all recommendations and calculations:
        </p>

        <div className="grid gap-3 mb-6">
          {[
            { icon: Users, label: 'Copilot Business seats', description: 'Number of Copilot Business licenses. Each contributes AI Credits to the Enterprise Entitlement Pool.' },
            { icon: Lightning, label: 'Copilot Enterprise seats', description: 'Number of Copilot Enterprise licenses. These contribute more AI Credits per seat than Business.' },
            { icon: Target, label: 'Universal ULB', description: 'The per-user consumption limit (in dollars) that applies to all users. Controls how much of the shared pool each user can draw. Does not create charges.' },
            { icon: Users, label: 'Power users', description: 'Users who need higher consumption limits (e.g., heavy Copilot Chat or agent users). These get individual budgets above the universal ULB.' },
            { icon: Lightning, label: 'Power user budget', description: 'The individual consumption limit for each power user. Should be higher than the universal ULB.' },
            { icon: Buildings, label: 'Enterprise buffer %', description: 'Safety margin on the recommended enterprise budget. Covers consumption spikes or growth.' },
          ].map(({ icon: Icon, label, description }) => (
            <div key={label} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
              <Icon size={18} weight="duotone" className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          When connected, seat counts auto-import from your enterprise. If you ran the CSV consumption analysis in the Budget Planner, those values also flow in automatically.
        </p>

        <h3 className="text-lg font-semibold mb-3">The 5-step workflow</h3>
        <p className="text-muted-foreground mb-4">
          Each step builds on the previous one. When connected, a green check means your API settings match the recommendation; a warning means action is needed. Expand any step to apply.
        </p>

        <div className="space-y-4 mb-6">
          <StepCard
            number={1}
            title="Enterprise Budget"
            description="Set or verify the enterprise spending limit. This caps additional spend (charges beyond the included AI Credit pool). The app calculates the minimum budget needed to support all users at their configured consumption levels, plus your buffer percentage."
          />
          <StepCard
            number={2}
            title="Cost Center Assignment"
            description="Create or select a cost center for your power users. This groups high-consumption users so their charges can be tracked (and optionally excluded from the enterprise budget). Create the cost center, assign an enterprise team, and set its budget."
          />
          <StepCard
            number={3}
            title="Universal ULB"
            description="Set the universal user-level budget. This consumption cap applies to all users by default, limiting how much of the shared pool each user can draw and preventing any single user from depleting the pool. Verifies or creates this budget via the API."
          />
          <StepCard
            number={4}
            title="Individual User Budgets"
            description="Bulk-create individual budgets for power users. These override the universal ULB for specific users, giving them higher consumption limits. Select an enterprise team, review the member list, and apply budgets in batch."
          />
          <StepCard
            number={5}
            title="Constraint Analysis"
            description="Cross-references each cost center's budget against its users' actual budgets to detect binding constraints. A budget is 'binding' when it's too low to support the configured ULBs, meaning users hit their cost center cap before reaching their individual limits. Alerts tell you exactly which budget to raise and by how much."
          />
        </div>

        <Alert>
          <Info size={16} weight="duotone" />
          <AlertDescription className="text-sm">
            Enterprises without cost centers see a streamlined 3-step wizard (Steps 2 and 5 are hidden and the remaining steps renumber automatically).
          </AlertDescription>
        </Alert>
      </section>

      {/* Promo Optimizer */}
      <section id="promo-optimizer" className="mb-12 scroll-mt-20 pt-12 border-t border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Rocket size={18} weight="duotone" className="text-purple-500" />
          </div>
          <h2 className="text-2xl font-semibold">Promo Optimizer</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          During promos, included AI Credits cost less per-credit than metered pricing. The Promo Optimizer calculates how many additional seats to purchase so included credits fully offset your enterprise budget, replacing metered charges with cheaper per-seat costs.
        </p>
        <p className="text-muted-foreground mb-6">
          When connected, it auto-fetches your current seat counts and shows a cost comparison with breakeven analysis.
        </p>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Methodology</Badge>
              How the Optimizer Thinks
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              The core idea is simple: every Copilot seat comes with included AI Credits that go into a shared enterprise pool. Those credits get consumed <em>before</em> any metered charges kick in. So if you can add enough seats to cover what your enterprise budget would otherwise pay at metered rates, you eliminate metered spend entirely, often at a fraction of the cost.
            </p>
            <p>
              <strong className="text-foreground">Step 1: Figure out how many credits your budget represents.</strong>{' '}
              At $0.01 per credit, a $5,000 enterprise budget covers 500,000 AICs of metered usage. That is the target the optimizer tries to match with included credits.
            </p>
            <p>
              <strong className="text-foreground">Step 2: Subtract what you already have.</strong>{' '}
              Your existing seats already contribute credits to the pool. The optimizer only looks at the gap: how many more credits do you need before included credits fully offset the budget?
            </p>
            <p>
              <strong className="text-foreground">Step 3: Find the cheapest way to fill the gap.</strong>{' '}
              During the promo period, Copilot Business seats include 3,000 AICs ($19/mo) and Copilot Enterprise seats include 7,000 AICs ($39/mo). The optimizer prioritizes the cheapest path:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li><strong className="text-foreground">CB to CE upgrades</strong> are tried first if you already have CE seats and unused GHEC slots. Each upgrade costs $20 incremental but adds 4,000 AICs, making it the best deal ($5 per 1K credits vs. $10 at metered pricing).</li>
              <li><strong className="text-foreground">New Copilot Business seats</strong> fill the remaining gap. Each costs $19 and adds 3,000 AICs ($6.33 per 1K credits, still cheaper than metered).</li>
            </ul>
            <p>
              <strong className="text-foreground">The result:</strong>{' '}
              You see how many seats to add, the monthly seat cost, and how that compares to what you would have paid at metered rates. In most cases, filling the gap with seats is 2-3x cheaper than paying per-credit.
            </p>
            <p className="text-xs text-muted-foreground italic">
              Note: The promo pricing numbers (3,000 and 7,000 AICs) apply through August 2026. After the promo period, standard allocations (1,900 and 3,900 AICs) apply, and the optimizer will be retired.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Billing Report */}
      <section id="billing-report" className="mb-12 scroll-mt-20 pt-12 border-t border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <CurrencyCircleDollar size={18} weight="duotone" className="text-amber-500" />
          </div>
          <h2 className="text-2xl font-semibold">Billing Report</h2>
        </div>

        <p className="text-muted-foreground mb-6">
          Generate per-user and per-department billing allocation reports from CSV data or live cost center spend. CSV data from the Budget Planner pre-fills automatically. Demo mode loads a 650-user enterprise-scale sample report.
        </p>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Methodology</Badge>
                How Billing Allocation Works
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>
                This report answers a simple question: "How much of our enterprise's metered charges should each user or department be responsible for?" It only allocates the actual invoice line item for usage beyond the pre-paid AI Credit pool. Pre-paid pool consumption is a sunk cost included in seat fees and is not allocated.
              </p>
              <p>
                <strong className="text-foreground">Step 1: Determine each user's entitlement.</strong>{' '}
                Every Copilot seat comes with included AI Credits. Copilot Business users get 1,900 AICs (or 3,000 during promo). Copilot Enterprise users get 3,900 AICs (or 7,000 during promo). Usage up to this amount is "free" since it comes from the pre-paid pool.
              </p>
              <p>
                <strong className="text-foreground">Step 2: Calculate additional usage.</strong>{' '}
                For each user: if they used more than their included credits, the difference is their additional usage. Users who stayed within their entitlement owe nothing: they only consumed from the pool already paid for via their seat fee. In formula form: additional_usage = max(0, actual_usage − included_credits).
              </p>
              <p>
                <strong className="text-foreground">Step 3: Scale charges to match the actual invoice.</strong>{' '}
                The key insight is that the enterprise's metered bill is usually less than the sum of all individual "additional usage" values, because underutilizing users leave unused credits in the shared pool that partially offset over-consumers. So we calculate a scaling factor: (enterprise metered bill / sum of all additional usage) and multiply each user's additional usage by it. This ensures charges sum exactly to the real invoice.
              </p>
              <p>
                <strong className="text-foreground">Why some users show $0:</strong>{' '}
                If a user consumed at or below their license entitlement, they did not contribute to metered charges. Their usage was fully covered by the pre-paid pool.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Feature</Badge>
                Azure Committed Discount (ACD)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                If your enterprise has an Azure Committed Discount, enter the percentage in the ACD % field. The discount is applied after scaling: discounted charge = raw charge x (1 - ACD%/100). ACD applies to both seat fees and metered charges in reality, but this report only discounts the metered charge allocation.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Feature</Badge>
                Cost Center Exclusion
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">Exclusion OFF (default):</strong> All metered charges flow to a single enterprise pool and are distributed proportionally across all over-consumers, regardless of cost center.
              </p>
              <p>
                <strong className="text-foreground">Exclusion ON:</strong> Enterprise and cost center charges are tracked independently. Each cost center's users are scaled against that cost center's metered charges, and non-CC users are scaled against enterprise-only charges.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Limitations</Badge>
                What the Report Cannot Capture
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <ul className="list-disc list-inside space-y-1.5 ml-1">
                <li><strong className="text-foreground">Pool fairness is invisible.</strong> If the pool is not fully depleted (metered bill = $0), there is nothing to charge back, even if departments consumed the shared pool very unevenly.</li>
                <li><strong className="text-foreground">Underutilizers subsidize over-consumers.</strong> When a user consumes below their entitlement, their unused AICs flow into the shared pool. The subsidizing department receives no credit for this.</li>
                <li><strong className="text-foreground">Non-user activity</strong> (e.g., Copilot Code Review on PRs from non-Copilot users) may appear in the enterprise total but not in individual user usage. This shows as "unattributed" in the report.</li>
                <li><strong className="text-foreground">Users not in a cost center</strong> are grouped under "Unattributed." Assign users to cost centers in your enterprise billing settings for complete attribution.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* API Tools */}
      <section id="api-tools" className="mb-12 scroll-mt-20 pt-12 border-t border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Code size={18} weight="duotone" className="text-orange-500" />
          </div>
          <h2 className="text-2xl font-semibold">API Tools</h2>
        </div>

        <p className="text-muted-foreground mb-6">
          Ready-to-run shell scripts and GitHub Actions workflows for budget operations that GitHub's UI doesn't offer. Enterprise URL and token auto-fill from your connection.
        </p>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Automation</Badge>
                Enterprise Team → Cost Center Sync
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">The gap:</strong> GitHub has no native way to keep an enterprise team's membership in sync with a cost center. When team members join or leave, the cost center doesn't update automatically.
              </p>
              <p>
                <strong className="text-foreground">What this does:</strong> Performs a two-way sync: fetches current team members, compares them against the cost center roster, adds new members, and removes departed ones. Available as a one-shot shell script or a scheduled GitHub Action for ongoing automation.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Automation</Badge>
                Cycle-Reset Budget
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">The gap:</strong> Billing cycles reset usage counters but do not reset budget amounts. If you lowered a budget mid-cycle (e.g., via the Tier Planner's cycle adjustment), the reduced amount persists unless you restore it.
              </p>
              <p>
                <strong className="text-foreground">What this does:</strong> Resets an enterprise budget to its full-cycle value. The GitHub Action version runs on a monthly cron schedule, automatically restoring your budget at the start of each billing period. Only the budget amount changes; alert settings, enforcement mode, and scope are untouched.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">User Scope</Badge>
                Individual User-Level Budgets
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">The gap:</strong> GitHub's UI only allows creating user-level budgets one at a time. For enterprises with dozens of power users, this is tedious and error-prone.
              </p>
              <p>
                <strong className="text-foreground">What this does:</strong> Bulk-creates or updates individual ULBs for a list of usernames. Existing budgets are patched (preserving alert settings), new ones are created with enforcement enabled. Paste your power user list and get a ready-to-run script.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Read</Badge>
                List All Budgets
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Retrieves all configured budgets for your enterprise. Useful for auditing or piping into other tools. Does not create, modify, or delete budgets.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Troubleshooting & Limitations */}
      <section id="limitations" className="scroll-mt-20 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/10">
            <Warning size={24} weight="duotone" className="text-warning" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Troubleshooting &amp; Limitations</h2>
            <p className="text-sm text-muted-foreground">Platform constraints, rate limiting, and best practices for safe operation.</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Platform Constraints */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Platform</Badge>
                Only Classic Tokens Work
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">
                ⚠ If you see 403 or 404 errors when connecting, your token is likely the wrong type.
              </p>
              <p>
                GitHub's enterprise billing endpoints only accept classic personal access tokens with the <code className="text-xs bg-muted px-1 py-0.5 rounded">manage_billing:enterprise</code> scope. Fine-grained tokens are not supported for these endpoints regardless of the permissions you grant them.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Platform</Badge>
                Large Enterprises May Hit Budget Ceilings
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">
                ⚠ Enterprises with ~5,000+ users deploying individual ULBs will hit the API rate limit (5,000 requests/hour) in a single session. Beyond ~9,000 users, the platform's budget creation ceiling (10,000 total) becomes a hard stop.
              </p>
              <p>
                The 10,000 budget cap includes the enterprise budget, all cost center budgets, the universal ULB, and every individual ULB. The rate limit hits first in practice: each budget create or update consumes one API call, so large batches may need multiple sessions. Use the Universal ULB for most users and reserve individual overrides for verified power users.
              </p>
              <p className="font-medium text-foreground">
                ⚠ Cost centers are capped at 250 per enterprise.
              </p>
              <p>
                The app retrieves all of them automatically, but no more can be created beyond this platform limit.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Platform</Badge>
                Cost Centers Are Shared Across All GitHub Products
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">
                ⚠ If your enterprise already uses cost centers for Actions, Codespaces, or Advanced Security, those same cost centers apply to Copilot too.
              </p>
              <p>
                Cost centers are enterprise-wide, not product-specific. A user can only belong to one cost center at a time across all products. Assigning someone to a new cost center moves them out of their current one automatically, which affects billing attribution for every product, not just Copilot.
              </p>
              <p className="font-medium text-foreground">
                ⚠ Reorganizing cost centers for Copilot budgeting will change how Actions, Codespaces, and other metered product charges are grouped too.
              </p>
              <p>
                If teams are structured differently for Copilot vs. other products (e.g., "Platform Engineering" owns Actions infrastructure but "Data Science" owns Copilot usage), you cannot split a user into two cost centers. Coordinate with your billing team before restructuring. Different products are tracked as separate line items within the same cost center, so you can still see per-product spend, but budget caps and attribution are per-user, per-cost-center, across everything.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">In-App</Badge>
                Buttons May Appear Unresponsive During Batch Operations
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">
                ⚠ After clicking Apply on large batches, the UI may appear frozen for up to 60 seconds. This is normal.
              </p>
              <p>
                The app sends changes one at a time to stay within GitHub's rate limits. If GitHub signals a rate limit, the app automatically pauses for 60 seconds and retries (up to twice). Larger batches (many ULBs or cost center budgets) naturally take longer to complete.
              </p>
            </CardContent>
          </Card>

          {/* User Guidance */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Guidance</Badge>
                Don't Navigate Away During Apply
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">
                ⚠ Closing the tab or navigating away mid-apply will leave your enterprise partially updated.
              </p>
              <p>
                Changes are written to the API one by one. If you interrupt, some will be saved and others won't. Wait for the operation to complete. If something goes wrong, disconnect and re-import to see the true current state before editing further.
              </p>
            </CardContent>
          </Card>

          {/* Error Recovery */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Guidance</Badge>
                If Something Goes Wrong
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">
                ⚠ When in doubt, disconnect and re-import. This reloads everything from GitHub and ensures the app matches reality.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-1">
                <li><strong className="text-foreground">403/404 on connect:</strong> Wrong token type or missing permissions. Create a new classic PAT with <code className="text-xs bg-muted px-1 py-0.5 rounded">manage_billing:enterprise</code>.</li>
                <li><strong className="text-foreground">422 on create:</strong> Platform ceiling reached (budget count or cost center limit). Remove unused items first.</li>
                <li><strong className="text-foreground">Rate limited (429):</strong> The app retries automatically. If it still fails, wait a few minutes.</li>
                <li><strong className="text-foreground">Network/timeout:</strong> Check your connection, then disconnect and re-import to refresh.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <div className="text-center pt-12 pb-8 border-t border-border/50">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft size={14} weight="bold" />
          Back to app
        </Button>
      </div>
      </div>
    </div>
  )
}

function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-primary">{number}</span>
      </div>
      <div>
        <p className="text-sm font-medium mb-1">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
