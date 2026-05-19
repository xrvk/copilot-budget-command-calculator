import { useState, useMemo, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { NumericInput } from '@/components/ui/numeric-input'
import { toast } from 'sonner'
import { Copy, Code, Info, Buildings, User, ArrowsClockwise, ClockCountdown, ListChecks } from '@phosphor-icons/react'

/** Octicons workflow-16 icon (MIT-licensed from primer/octicons) */
function WorkflowIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M0 1.75C0 .784.784 0 1.75 0h3.5C6.216 0 7 .784 7 1.75v3.5A1.75 1.75 0 0 1 5.25 7H4v4a1 1 0 0 0 1 1h4v-1.25C9 9.784 9.784 9 10.75 9h3.5c.966 0 1.75.784 1.75 1.75v3.5A1.75 1.75 0 0 1 14.25 16h-3.5A1.75 1.75 0 0 1 9 14.25v-.75H5A2.5 2.5 0 0 1 2.5 11V7h-.75A1.75 1.75 0 0 1 0 5.25Zm1.75-.25a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25Zm9 9a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25Z" />
    </svg>
  )
}
import { parseEnterpriseUrl } from '@/lib/utils'
import { useEnterpriseCredentials } from '@/hooks/use-enterprise-credentials'
import { DEMO_API_TOOLS } from '@/lib/demo-data'
import { type ScriptType } from '@/lib/constants'
import { buildTeamSyncShellScript, buildTeamSyncGitHubAction, buildListBudgetsScript, buildCycleResetScript, buildCycleResetGitHubAction } from '@/lib/api-scripts'

type ScriptMeta = { title: string; description: string; badge: string }

const scriptMeta: Record<ScriptType, ScriptMeta> = {
  'user-budget': {
    title: 'Individual User-Level Budgets',
    description: 'Bulk-update individual ULBs for your power user group. Paste usernames to generate a ready-to-run script',
    badge: 'User Scope',
  },
  'team-sync': {
    title: 'Enterprise Team → Cost Center Sync',
    description: 'Sync enterprise team members into a cost center via shell script or GitHub Actions workflow',
    badge: 'Automation',
  },
  'cycle-reset': {
    title: 'Cycle-Reset Budget',
    description: 'Reset an enterprise budget to its full-cycle value at the start of a new billing period',
    badge: 'Automation',
  },
  'list-budgets': {
    title: 'List All Budgets',
    description: 'Retrieve all configured budgets for your enterprise (paginated, 10 per page)',
    badge: 'Read',
  },
}


const scriptCardMeta: { id: ScriptType; icon: typeof Buildings }[] = [
  { id: 'user-budget', icon: User },
  { id: 'team-sync', icon: ArrowsClockwise },
  { id: 'cycle-reset', icon: ClockCountdown },
  { id: 'list-budgets', icon: Code },
]

const scriptActions: Record<ScriptType, { steps: string[]; note?: string }> = {
  'user-budget': {
    steps: [
      'GET /budgets — fetches all existing budgets to check for duplicates',
      'For each username: PATCH /budgets/{id} if a user budget already exists (preserves alert settings)',
      'For each username: POST /budgets if no existing budget found (creates with prevent_further_usage: true)',
    ],
    note: 'Existing budgets are updated, not replaced. Alert recipients and thresholds are preserved on PATCH',
  },
  'team-sync': {
    steps: [
      'GET /teams/{slug}/memberships — fetches all team members (paginated)',
      'GET /cost-centers — looks up the target cost center by name',
      'POST /cost-centers — creates the cost center if it doesn\'t exist',
      'GET /cost-centers/{id}/resource — fetches current cost center members',
      'POST /cost-centers/{id}/resource — adds new team members to the cost center',
      'DELETE /cost-centers/{id}/resource — removes users no longer on the team',
    ],
    note: 'Two-way sync: members who joined the team are added, members who left are removed. No budget changes',
  },
  'cycle-reset': {
    steps: [
      'GET /budgets — fetches the current budget amount for verification',
      'PATCH /budgets/{id} — updates the budget to the specified full-cycle amount',
    ],
    note: 'Only changes the budget amount. Alert settings, enforcement mode, and scope are untouched',
  },
  'list-budgets': {
    steps: [
      'GET /budgets?per_page=10 — retrieves the first page of budgets',
      'GET /budgets?scope=user — optional filter for user-scoped budgets only',
    ],
    note: 'Read-only. No budgets are created, modified, or deleted',
  },
}

export default function ApiTools({ initialScript, onScriptChange }: { initialScript?: ScriptType; onScriptChange?: (script: ScriptType) => void }) {
  const { enterpriseUrl: sharedUrl, pat: sharedPat, isDemo, budgetMeta, credentials } = useEnterpriseCredentials()
  const [scriptType, setScriptType] = useState<ScriptType>(initialScript ?? 'user-budget')
  // Sync initialScript prop → local state (state-during-render pattern)
  const [prevInitialScript, setPrevInitialScript] = useState(initialScript)
  if (initialScript !== prevInitialScript) {
    setPrevInitialScript(initialScript)
    if (initialScript) setScriptType(initialScript)
  }
  // Keep a ref to the latest callback to avoid stale closures in the effect below
  const onScriptChangeRef = useRef(onScriptChange)
  useEffect(() => {
    onScriptChangeRef.current = onScriptChange
  }, [onScriptChange])
  // Skip the first render so we don't fire onScriptChange on mount
  const isFirstRender = useRef(true)
  const [enterpriseUrl, setEnterpriseUrl] = useState(sharedUrl || '')

  // Sync enterprise URL from shared credentials (state-during-render pattern)
  const [prevSharedUrl, setPrevSharedUrl] = useState(sharedUrl)
  if (sharedUrl !== prevSharedUrl) {
    setPrevSharedUrl(sharedUrl)
    if (sharedUrl) setEnterpriseUrl(sharedUrl)
  }

  const [apiToken, setApiToken] = useState('')
  const [usernames, setUsernames] = useState('')
  const [userBudgetAmount, setUserBudgetAmount] = useState(39)
  // Team sync inputs
  const [teamSlug, setTeamSlug] = useState('')
  const [ccName, setCcName] = useState('')
  const [syncFormat, setSyncFormat] = useState<'bash' | 'yaml'>('bash')
  // Cycle-reset inputs
  const [resetBudgetId, setResetBudgetId] = useState(budgetMeta.entBudgetId ?? '')
  const [resetFullCycleAmount, setResetFullCycleAmount] = useState(0)
  const [resetFormat, setResetFormat] = useState<'bash' | 'yaml'>('bash')

  // Auto-fill cycle-reset budget ID from connected enterprise (state-during-render)
  const [prevEntBudgetId, setPrevEntBudgetId] = useState(budgetMeta.entBudgetId)
  if (budgetMeta.entBudgetId !== prevEntBudgetId) {
    setPrevEntBudgetId(budgetMeta.entBudgetId)
    if (budgetMeta.entBudgetId && !resetBudgetId) {
      setResetBudgetId(budgetMeta.entBudgetId)
    }
  }

  // Pre-fill sample inputs in demo mode (state-during-render pattern)
  const [prevIsDemo, setPrevIsDemo] = useState(isDemo)
  if (isDemo !== prevIsDemo) {
    setPrevIsDemo(isDemo)
    if (isDemo) {
      setUsernames(DEMO_API_TOOLS.usernames)
      setUserBudgetAmount(DEMO_API_TOOLS.userBudgetAmount)
      setTeamSlug(DEMO_API_TOOLS.teamSlug)
      setCcName(DEMO_API_TOOLS.ccName)
    } else {
      setUsernames('')
      setUserBudgetAmount(39)
      setTeamSlug('')
      setCcName('')
    }
  }

  // Parse enterprise URL to extract slug and detect GHE
  const { base, ent } = useMemo(() => parseEnterpriseUrl(enterpriseUrl), [enterpriseUrl])

  // Token value for scripts — use provided token or placeholder
  const tokenValue = apiToken.trim() || sharedPat?.trim() || 'your-api-token-here'
  const tokenIsSet = tokenValue !== 'your-api-token-here'

  const userBudgetScript = useMemo(() => {
    const users = usernames
      .split(',')
      .map(u => u.trim())
      .filter(u => u.length > 0)

    if (users.length === 0) {
      return `# Set Individual User-Level Budgets
# Docs: https://docs.github.com/en/enterprise-cloud@latest/rest/billing/budgets?apiVersion=2026-03-10
#
# Creates new user budgets or updates existing ones via API.
# Enter comma-separated usernames above to generate the script.`
    }

    if (users.length === 1) {
      return `# Set Individual User-Level Budget for ${users[0]}
# Docs: https://docs.github.com/en/enterprise-cloud@latest/rest/billing/budgets?apiVersion=2026-03-10

API_TOKEN="${tokenValue}"

echo "Setting budget for ${users[0]} to \\$${userBudgetAmount}..."

# Check if budget already exists
BUDGET_ID=$(curl -s -L \\
  -H "Accept: application/vnd.github+json" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "X-GitHub-Api-Version: 2026-03-10" \\
  "${base}/enterprises/${ent}/settings/billing/budgets?per_page=100" \\
  | jq -r --arg login "${users[0]}" '.budgets[] | select(.budget_scope == "user" and .budget_entity_name == $login) | .id')

if [ -n "$BUDGET_ID" ] && [ "$BUDGET_ID" != "null" ]; then
  # PATCH existing — preserves alert settings
  RESPONSE=$(curl -s -w "\\n%{http_code}" -L \\
    -X PATCH \\
    -H "Accept: application/vnd.github+json" \\
    -H "Authorization: Bearer $API_TOKEN" \\
    -H "X-GitHub-Api-Version: 2026-03-10" \\
    -H "Content-Type: application/json" \\
    "${base}/enterprises/${ent}/settings/billing/budgets/$BUDGET_ID" \\
    -d '{"budget_amount": ${userBudgetAmount}}')
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ ${users[0]} — budget updated to \\$${userBudgetAmount} (alerts preserved)"
  else
    echo "✗ PATCH failed: HTTP $HTTP_CODE"
  fi
else
  # POST new budget
  RESPONSE=$(curl -s -w "\\n%{http_code}" -L \\
    -X POST \\
    -H "Accept: application/vnd.github+json" \\
    -H "Authorization: Bearer $API_TOKEN" \\
    -H "X-GitHub-Api-Version: 2026-03-10" \\
    -H "Content-Type: application/json" \\
    "${base}/enterprises/${ent}/settings/billing/budgets" \\
    -d '{
      "budget_amount": ${userBudgetAmount},
      "prevent_further_usage": true,
      "budget_scope": "user",
      "budget_entity_name": "${users[0]}",
      "user": "${users[0]}",
      "budget_type": "BundlePricing",
      "budget_product_sku": "premium_requests",
      "budget_alerting": { "will_alert": false, "alert_recipients": [] }
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ ${users[0]} — budget created at \\$${userBudgetAmount}"
  else
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "✗ Failed: HTTP $HTTP_CODE: $BODY"
  fi
fi`
    }

    const userList = users.map(u => `  "${u}"`).join('\n')

    return `# Set Individual User-Level Budgets (${users.length} users)
# Docs: https://docs.github.com/en/enterprise-cloud@latest/rest/billing/budgets?apiVersion=2026-03-10
#
# Creates new user budgets or updates existing ones.
# Existing budgets are PATCHed (alert settings preserved).
#
# Rate limiting: Adapts automatically using GitHub's x-ratelimit-remaining
# headers. Small batches run at full speed; large batches pace as needed.
# Retries on 429 with Retry-After. PAT classic limit: 5,000 requests/hour.
#
# Platform cap: 10,000 total budgets per enterprise (includes enterprise
# budget, CC budgets, universal ULB, and all individual ULBs).

API_TOKEN="${tokenValue}"
BUDGET_AMOUNT=${userBudgetAmount}

USERS=(
${userList}
)

CREATED=()
UPDATED=()
FAILED=()

echo "Setting budgets for \${#USERS[@]} users to \\$$BUDGET_AMOUNT each..."
echo "================================================"

# --- Rate limit helper ---
# Reads x-ratelimit-remaining/reset from response headers and paces requests.
# No delay for small batches; auto-throttles as limit budget depletes.
HEADER_FILE=$(mktemp)
check_rate_limit() {
  local remaining reset now wait_time
  remaining=$(grep -i '^x-ratelimit-remaining:' "$HEADER_FILE" | tr -d '\\r' | awk '{print $2}')
  reset=$(grep -i '^x-ratelimit-reset:' "$HEADER_FILE" | tr -d '\\r' | awk '{print $2}')
  if [ -n "$remaining" ] && [ "$remaining" -lt 10 ] 2>/dev/null; then
    now=$(date +%s)
    if [ -n "$reset" ] && [ "$reset" -gt "$now" ] 2>/dev/null; then
      wait_time=$(( reset - now + 1 ))
      echo "  ⏳ Rate limit low ($remaining remaining). Waiting $wait_time seconds..."
      sleep "$wait_time"
    fi
  elif [ -n "$remaining" ] && [ "$remaining" -lt 50 ] 2>/dev/null; then
    sleep 1
  fi
}

# --- Retry helper ---
# Retries on 429 using Retry-After header with fallback to 60s.
retry_on_429() {
  local http_code="$1"
  if [ "$http_code" = "429" ]; then
    local retry_after
    retry_after=$(grep -i '^retry-after:' "$HEADER_FILE" | tr -d '\\r' | awk '{print $2}')
    retry_after=\${retry_after:-60}
    echo "  ⏳ Rate limited (429). Retrying in $retry_after seconds..."
    sleep "$retry_after"
    return 0  # signal: should retry
  fi
  return 1  # signal: no retry needed
}

# --- Fetch all existing budgets (paginated) ---
echo "Fetching existing budgets..."
ALL_BUDGETS='{"budgets":[]}'
PAGE=1
while true; do
  PAGE_RESPONSE=$(curl -s -w "\\n%{http_code}" -D "$HEADER_FILE" -L \\
    -H "Accept: application/vnd.github+json" \\
    -H "Authorization: Bearer $API_TOKEN" \\
    -H "X-GitHub-Api-Version: 2026-03-10" \\
    "${base}/enterprises/${ent}/settings/billing/budgets?per_page=100&page=$PAGE")
  PAGE_HTTP=$(echo "$PAGE_RESPONSE" | tail -1)
  PAGE_DATA=$(echo "$PAGE_RESPONSE" | sed '$d')
  if [ "$PAGE_HTTP" = "429" ]; then
    RETRY_WAIT=$(grep -i '^retry-after:' "$HEADER_FILE" | tr -d '\\r' | awk '{print $2}')
    RETRY_WAIT=\${RETRY_WAIT:-60}
    echo "  ⏳ Rate limited fetching budgets. Waiting $RETRY_WAIT seconds..."
    sleep "$RETRY_WAIT"
    continue
  fi
  if [ "$PAGE_HTTP" != "200" ]; then
    echo "  ✗ Failed to fetch budgets (HTTP $PAGE_HTTP). Proceeding with what we have."
    break
  fi
  ALL_BUDGETS=$(echo "$ALL_BUDGETS" "$PAGE_DATA" | jq -s '{ budgets: (.[0].budgets + .[1].budgets) }')
  HAS_NEXT=$(echo "$PAGE_DATA" | jq '.has_next_page')
  if [ "$HAS_NEXT" != "true" ]; then
    break
  fi
  PAGE=$((PAGE + 1))
  check_rate_limit
done
TOTAL_EXISTING=$(echo "$ALL_BUDGETS" | jq '.budgets | length')
echo "Found $TOTAL_EXISTING existing budgets."

for LOGIN in "\${USERS[@]}"; do
  BUDGET_ID=$(echo "$ALL_BUDGETS" | jq -r --arg login "$LOGIN" \\
    '.budgets[] | select(.budget_scope == "user" and .budget_entity_name == $login) | .id')

  if [ -n "$BUDGET_ID" ] && [ "$BUDGET_ID" != "null" ]; then
    # PATCH existing — preserves alert settings
    while true; do
      PATCH_CODE=$(curl -s -o /dev/null -D "$HEADER_FILE" -w "%{http_code}" -L \\
        -X PATCH \\
        -H "Accept: application/vnd.github+json" \\
        -H "Authorization: Bearer $API_TOKEN" \\
        -H "X-GitHub-Api-Version: 2026-03-10" \\
        -H "Content-Type: application/json" \\
        "${base}/enterprises/${ent}/settings/billing/budgets/$BUDGET_ID" \\
        -d "{\\"budget_amount\\": $BUDGET_AMOUNT}")
      if retry_on_429 "$PATCH_CODE"; then continue; fi
      break
    done
    if [ "$PATCH_CODE" = "200" ]; then
      echo "  ↻ $LOGIN — updated to \\$$BUDGET_AMOUNT (alerts preserved)"
      UPDATED+=("$LOGIN")
    else
      echo "  ✗ $LOGIN — PATCH failed (HTTP $PATCH_CODE)"
      FAILED+=("$LOGIN ($PATCH_CODE)")
    fi
  else
    # POST new budget
    while true; do
      POST_CODE=$(curl -s -o /dev/null -D "$HEADER_FILE" -w "%{http_code}" -L \\
        -X POST \\
        -H "Accept: application/vnd.github+json" \\
        -H "Authorization: Bearer $API_TOKEN" \\
        -H "X-GitHub-Api-Version: 2026-03-10" \\
        -H "Content-Type: application/json" \\
        "${base}/enterprises/${ent}/settings/billing/budgets" \\
        -d "{
          \\"budget_amount\\": $BUDGET_AMOUNT,
          \\"prevent_further_usage\\": true,
          \\"budget_scope\\": \\"user\\",
          \\"budget_entity_name\\": \\"$LOGIN\\",
          \\"user\\": \\"$LOGIN\\",
          \\"budget_type\\": \\"BundlePricing\\",
          \\"budget_product_sku\\": \\"premium_requests\\",
          \\"budget_alerting\\": { \\"will_alert\\": false, \\"alert_recipients\\": [] }
        }")
      if retry_on_429 "$POST_CODE"; then continue; fi
      break
    done
    if [ "$POST_CODE" = "200" ]; then
      echo "  ✓ $LOGIN — budget created at \\$$BUDGET_AMOUNT"
      CREATED+=("$LOGIN")
    else
      echo "  ✗ $LOGIN — POST failed (HTTP $POST_CODE)"
      FAILED+=("$LOGIN ($POST_CODE)")
    fi
  fi

  check_rate_limit
done

rm -f "$HEADER_FILE"

echo ""
echo "================================================"
echo "SUMMARY"
echo "================================================"
echo "Total:     \${#USERS[@]}"
echo "Created:   \${#CREATED[@]}"
echo "Updated:   \${#UPDATED[@]}"
echo "Failed:    \${#FAILED[@]}"

if [ \${#CREATED[@]} -gt 0 ]; then
  echo ""
  echo "✓ Created:"
  for u in "\${CREATED[@]}"; do
    echo "  - $u (\\$$BUDGET_AMOUNT)"
  done
fi

if [ \${#UPDATED[@]} -gt 0 ]; then
  echo ""
  echo "↻ Updated (alerts preserved):"
  for u in "\${UPDATED[@]}"; do
    echo "  - $u (\\$$BUDGET_AMOUNT)"
  done
fi

if [ \${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "✗ Failed:"
  for u in "\${FAILED[@]}"; do
    echo "  - $u"
  done
fi`
  }, [usernames, userBudgetAmount, base, ent, tokenValue])

  const currentScript = useMemo(() => {
    switch (scriptType) {
      case 'user-budget': return userBudgetScript
      case 'team-sync': return syncFormat === 'yaml'
        ? buildTeamSyncGitHubAction(ent, base, teamSlug, ccName)
        : buildTeamSyncShellScript(ent, base, teamSlug, ccName, tokenValue)
      case 'list-budgets': return buildListBudgetsScript(ent, base, tokenValue)
      case 'cycle-reset': return resetFormat === 'yaml'
        ? buildCycleResetGitHubAction(ent, base, resetBudgetId, resetFullCycleAmount)
        : buildCycleResetScript(ent, base, tokenValue, resetBudgetId, resetFullCycleAmount)
    }
  }, [scriptType, userBudgetScript, ent, base, teamSlug, ccName, syncFormat, tokenValue, resetFormat, resetBudgetId, resetFullCycleAmount])

  // Notify parent when script changes so URL stays in sync (skip mount)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    onScriptChangeRef.current?.(scriptType)
  }, [scriptType])

  const current = scriptMeta[scriptType]

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentScript)
    toast.success('Script copied to clipboard')
  }

  const parsedUserCount = usernames.split(',').map(u => u.trim()).filter(u => u.length > 0).length
  const tokenLooksInvalid = apiToken.trim().length > 0 && !/^(ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})$/.test(apiToken.trim())
  const scriptInputContext = useMemo(() => {
    switch (scriptType) {
      case 'user-budget':
        return 'Set user list and per-user budget amount'
      case 'team-sync':
        return 'Choose format and provide team + cost center details'
      case 'cycle-reset':
        return 'Set output format, budget ID, and full-cycle amount'
      case 'list-budgets':
        return 'No extra inputs needed. Use base configuration and copy the script'
    }
  }, [scriptType])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">API Tools & Scripts</h2>
        <p className="text-muted-foreground mt-2">
          Create and manage Copilot budgets via the REST API
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {scriptCardMeta.map(({ id, icon: Icon }) => {
          const s = scriptMeta[id]
          const isSelected = scriptType === id
          return (
            <Card
              key={id}
              data-testid={`script-card-${id}`}
              className={`cursor-pointer border-2 transition-colors ${isSelected ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'}`}
              onClick={() => setScriptType(id)}
            >
              <CardHeader className="p-3 sm:p-6 pb-3">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <Icon size={20} weight="duotone" className="text-accent" />
                  <Badge
                    variant="outline"
                    className="text-[10px] sm:text-xs"
                  >{s.badge}</Badge>
                </div>
                <CardTitle className="text-sm sm:text-base leading-tight">{s.title}</CardTitle>
                <CardDescription className="text-xs mt-1 leading-relaxed">{s.description}</CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code size={20} weight="duotone" />
                {current.title}
              </CardTitle>
              <CardDescription className="mt-2">
                Shell script using curl. Copy and customize for your enterprise
              </CardDescription>
            </div>
            <Button onClick={copyToClipboard} variant="outline" className="gap-2">
              <Copy size={18} weight="duotone" />
              Copy
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <div className="space-y-4 rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base configuration</p>
                <p className="text-xs text-muted-foreground">Used by every script type</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="enterprise-url">Enterprise URL or Slug</Label>
                <Input
                  id="enterprise-url"
                  placeholder="https://github.com/enterprises/my-corp"
                  value={enterpriseUrl}
                  onChange={(e) => setEnterpriseUrl(e.target.value)}
                  className="mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {enterpriseUrl.trim()
                    ? `→ API: ${base}/enterprises/${ent}/...`
                    : 'Paste your enterprise URL, GHE.com URL, or just the slug'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-token">API Token (optional. Auto-fills in script)</Label>
                <Input
                  id="api-token"
                  type="password"
                  placeholder={tokenIsSet ? '••••••••••••••' : 'ghp_... (classic PAT)'}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className={`mono text-sm ${tokenLooksInvalid ? 'border-destructive' : ''}`}
                  autoComplete="off"
                />
                {tokenLooksInvalid ? (
                  <p className="text-xs text-destructive">
                    Token should start with <code className="bg-muted px-1 rounded">ghp_</code> (classic) or <code className="bg-muted px-1 rounded">github_pat_</code> (fine-grained)
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {tokenIsSet
                      ? '✓ Token will be embedded in the generated script'
                      : sharedPat ? '✓ Using token from Import connection' : 'Paste a PAT to auto-fill it in the script, or replace the placeholder manually'}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4 rounded-lg border-2 border-primary/20 bg-card p-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Script-specific inputs</p>
                <p className="text-xs text-muted-foreground">{scriptInputContext}</p>
              </div>

              {scriptType === 'user-budget' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="user-list">Usernames (comma-separated)</Label>
                    <Input
                      id="user-list"
                      placeholder="dev-lead-1, architect-1, principal-eng"
                      value={usernames}
                      onChange={(e) => setUsernames(e.target.value)}
                      className="mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      {parsedUserCount === 0
                        ? 'Enter GitHub usernames to generate the API script'
                        : `${parsedUserCount} user${parsedUserCount === 1 ? '' : 's'} will receive individual budgets`}
                    </p>
                    {parsedUserCount >= 500 && (
                      <p className="text-xs text-warning mt-1">
                        Large batch: script auto-paces using API rate limit headers. Each individual ULB counts toward the 10,000 total budget limit per enterprise.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user-budget-amount">Budget Amount per User ($)</Label>
                    <NumericInput
                      id="user-budget-amount"
                      min={1}
                      value={userBudgetAmount}
                      onValueChange={setUserBudgetAmount}
                      commas
                      className="mono text-sm w-32"
                    />
                  </div>
                </>
              )}

              {scriptType === 'team-sync' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Output Format</Label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSyncFormat('bash')}
                        className={`flex-1 text-xs px-3 py-1.5 rounded border transition-colors ${
                          syncFormat === 'bash'
                            ? 'bg-accent/20 border-accent/40 font-medium'
                            : 'bg-muted/40 border-border hover:bg-muted'
                        }`}
                      >
                        🖥 Shell Script. Run manually or via cron
                      </button>
                      <button
                        onClick={() => setSyncFormat('yaml')}
                        className={`flex-1 text-xs px-3 py-1.5 rounded border transition-colors ${
                          syncFormat === 'yaml'
                            ? 'bg-accent/20 border-accent/40 font-medium'
                            : 'bg-muted/40 border-border hover:bg-muted'
                        }`}
                      >
                        <span className="inline-flex items-center justify-center gap-1"><WorkflowIcon className="shrink-0" /> GitHub Actions. Scheduled weekly</span>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="team-slug">Enterprise Team Slug</Label>
                    <Input
                      id="team-slug"
                      placeholder="ent:power-users"
                      value={teamSlug}
                      onChange={(e) => setTeamSlug(e.target.value)}
                      className="mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      The slug of the enterprise team to sync from (e.g. <code className="bg-muted px-1 rounded">ent:my-team-name</code>)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cc-name">Cost Center Name</Label>
                    <Input
                      id="cc-name"
                      placeholder="Power Users"
                      value={ccName}
                      onChange={(e) => setCcName(e.target.value)}
                      className="mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Target cost center. Created automatically if it does not exist.
                    </p>
                  </div>
                </>
              )}

              {scriptType === 'cycle-reset' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Output Format</Label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setResetFormat('bash')}
                        className={`flex-1 text-xs px-3 py-1.5 rounded border transition-colors ${
                          resetFormat === 'bash'
                            ? 'bg-accent/20 border-accent/40 font-medium'
                            : 'bg-muted/40 border-border hover:bg-muted'
                        }`}
                      >
                        🖥 Shell Script. Run manually at cycle start
                      </button>
                      <button
                        onClick={() => setResetFormat('yaml')}
                        className={`flex-1 text-xs px-3 py-1.5 rounded border transition-colors ${
                          resetFormat === 'yaml'
                            ? 'bg-accent/20 border-accent/40 font-medium'
                            : 'bg-muted/40 border-border hover:bg-muted'
                        }`}
                      >
                        <span className="inline-flex items-center justify-center gap-1"><WorkflowIcon className="shrink-0" /> GitHub Actions. Monthly cron</span>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-budget-id" className="flex items-center gap-2">
                      Budget ID
                      {credentials && !isDemo && budgetMeta.entBudgetId && resetBudgetId === budgetMeta.entBudgetId && (
                        <Badge variant="outline" className="text-[10px] border-success/50 text-success gap-1 py-0">
                          Synced
                        </Badge>
                      )}
                    </Label>
                    <Input
                      id="reset-budget-id"
                      placeholder="budget_abc123..."
                      value={resetBudgetId}
                      onChange={(e) => setResetBudgetId(e.target.value)}
                      className="mono text-sm"
                    />
                    {credentials && !isDemo && budgetMeta.entBudgetId && resetBudgetId !== budgetMeta.entBudgetId ? (
                      <button
                        onClick={() => setResetBudgetId(budgetMeta.entBudgetId!)}
                        className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                      >
                        Use connected enterprise budget ID →
                      </button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        The ID of the enterprise Copilot budget. Find it via the <button onClick={() => setScriptType('list-budgets')} className="underline text-primary">List All Budgets</button> script.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-amount" className="flex items-center gap-2">
                      Full-Cycle Budget Amount ($)
                      {credentials && !isDemo && budgetMeta.apiEnterpriseBudget !== null && resetFullCycleAmount === budgetMeta.apiEnterpriseBudget && (
                        <Badge variant="outline" className="text-[10px] border-success/50 text-success gap-1 py-0">
                          Synced
                        </Badge>
                      )}
                    </Label>
                    <NumericInput
                      id="reset-amount"
                      min={0}
                      value={resetFullCycleAmount}
                      onValueChange={setResetFullCycleAmount}
                      commas
                      className="mono text-sm w-32"
                    />
                    {credentials && !isDemo && budgetMeta.apiEnterpriseBudget !== null && resetFullCycleAmount !== budgetMeta.apiEnterpriseBudget ? (
                      <button
                        onClick={() => setResetFullCycleAmount(budgetMeta.apiEnterpriseBudget!)}
                        className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                      >
                        Use current enterprise budget (${budgetMeta.apiEnterpriseBudget.toLocaleString()}) →
                      </button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        The enterprise budget for a full billing cycle. Get this from the Tier Planner's full-cycle recommendation.
                      </p>
                    )}
                  </div>
                </>
              )}

              {scriptType === 'list-budgets' && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Use Enterprise URL and token from the Base configuration, then copy the script.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ListChecks size={16} weight="duotone" className="text-muted-foreground" />
              What this script does
            </div>
            <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
              {scriptActions[scriptType].steps.map((step, i) => {
                const [method, ...rest] = step.split(' — ')
                return (
                  <li key={i}>
                    <code className="bg-muted px-1 rounded text-[11px]">{method}</code>
                    {rest.length > 0 && <span> — {rest.join(' — ')}</span>}
                  </li>
                )
              })}
            </ol>
            {scriptActions[scriptType].note && (
              <p className="text-xs text-muted-foreground/80 italic pt-1">
                {scriptActions[scriptType].note}
              </p>
            )}
          </div>

          <Textarea
            value={currentScript}
            readOnly
            className="mono text-sm h-[500px] font-mono resize-none"
          />

          <Separator className="my-6" />

          <div className="space-y-4">
            <h3 className="font-semibold">Setup</h3>
            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              {!tokenIsSet && <li>Enter your API token above or replace <code className="mono bg-muted px-1 rounded">your-api-token-here</code> in the script</li>}
              {tokenIsSet && <li className="text-success">✓ API token is set, already embedded in the script</li>}
              {ent === 'your-enterprise-slug' && <li>Enter your enterprise URL above. It auto-populates in the script.</li>}
              <li>Customize budget amounts, entity names, and alert recipients</li>
              <li>Run: <code className="mono bg-muted px-1 rounded">bash script.sh</code></li>
            </ol>

            <Alert>
              <Info size={18} weight="fill" />
              <AlertDescription className="text-sm">
                <span className="font-semibold">Auth:</span> This API requires enterprise admin, org admin, or billing manager role.
                Fine-grained PATs and GitHub App tokens are not supported.
                Scripts use API version <code className="mono bg-muted px-1 rounded text-xs">2026-03-10</code>.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
