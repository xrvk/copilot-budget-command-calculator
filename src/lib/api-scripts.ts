export function buildTeamSyncShellScript(ent: string, base: string, teamSlug: string, ccName: string, token: string) {
  const safeTeam = teamSlug || 'YOUR_TEAM_SLUG'
  const safeCc = ccName || 'Power Users'
  return `#!/usr/bin/env bash
# Continuous Sync: Enterprise Team → Cost Center
# Syncs members of an enterprise team into a cost center so budgets stay aligned.
# Run on a schedule (cron) or invoke manually after team membership changes.
#
# Docs:
#   Enterprise Teams: https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-teams/enterprise-team-members?apiVersion=2026-03-10
#   Cost Centers:     https://docs.github.com/en/enterprise-cloud@latest/rest/billing/cost-centers?apiVersion=2026-03-10

set -euo pipefail

API_TOKEN="\${API_TOKEN:-${token}}"
ENTERPRISE="${ent}"
TEAM_SLUG="${safeTeam}"
COST_CENTER_NAME="${safeCc}"
API_BASE="${base}"

HEADERS=(-H "Accept: application/vnd.github+json" \\
         -H "Authorization: Bearer $API_TOKEN" \\
         -H "X-GitHub-Api-Version: 2026-03-10")

echo "=== Team → Cost Center Sync ==="
echo "Enterprise: $ENTERPRISE"
echo "Team:       $TEAM_SLUG"
echo "Cost Center: $COST_CENTER_NAME"
echo ""

# -------------------------------------------------------
# Step 1: Fetch all team members (paginated)
# -------------------------------------------------------
echo "Fetching team members..."
TEAM_MEMBERS=()
PAGE=1
while true; do
  RESPONSE=$(curl -s -L "\${HEADERS[@]}" \\
    "$API_BASE/enterprises/$ENTERPRISE/teams/$TEAM_SLUG/memberships?per_page=100&page=$PAGE")
  
  LOGINS=$(echo "$RESPONSE" | jq -r '.[].login // empty' 2>/dev/null)
  [ -z "$LOGINS" ] && break
  
  while IFS= read -r login; do
    TEAM_MEMBERS+=("$login")
  done <<< "$LOGINS"
  
  COUNT=$(echo "$RESPONSE" | jq 'length')
  [ "$COUNT" -lt 100 ] && break
  ((PAGE++))
done

echo "  Found \${#TEAM_MEMBERS[@]} team members"

if [ \${#TEAM_MEMBERS[@]} -eq 0 ]; then
  echo "No members found — nothing to sync."
  exit 0
fi

# -------------------------------------------------------
# Step 2: Find or create the cost center
# -------------------------------------------------------
echo "Looking up cost center '$COST_CENTER_NAME'..."

CC_LIST=$(curl -s -L "\${HEADERS[@]}" \\
  "$API_BASE/enterprises/$ENTERPRISE/settings/billing/cost-centers?per_page=100&state=active")

CC_ID=$(echo "$CC_LIST" | jq -r --arg name "$COST_CENTER_NAME" \\
  '(.costCenters // .cost_centers // [])[] | select(.name == $name) | .id' 2>/dev/null | head -1)

if [ -z "$CC_ID" ] || [ "$CC_ID" = "null" ]; then
  echo "  Not found — creating..."
  CC_RESPONSE=$(curl -s -L -X POST "\${HEADERS[@]}" \\
    -H "Content-Type: application/json" \\
    "$API_BASE/enterprises/$ENTERPRISE/settings/billing/cost-centers" \\
    -d "{\\"name\\": \\"$COST_CENTER_NAME\\"}")
  CC_ID=$(echo "$CC_RESPONSE" | jq -r '.id')
  echo "  Created: $CC_ID"
else
  echo "  Found: $CC_ID"
fi

# -------------------------------------------------------
# Step 3: Get current cost center members
# -------------------------------------------------------
echo "Fetching current cost center resources..."
CC_RESOURCES=$(curl -s -L "\${HEADERS[@]}" \\
  "$API_BASE/enterprises/$ENTERPRISE/settings/billing/cost-centers/$CC_ID/resource")

CURRENT_USERS=$(echo "$CC_RESOURCES" | jq -r '.users[]? // empty' 2>/dev/null)

# -------------------------------------------------------
# Step 4: Diff and sync
# -------------------------------------------------------
# Users to add: in team but not in cost center
TO_ADD=()
for login in "\${TEAM_MEMBERS[@]}"; do
  if ! echo "$CURRENT_USERS" | grep -qx "$login"; then
    TO_ADD+=("$login")
  fi
done

# Users to remove: in cost center but not in team
TO_REMOVE=()
while IFS= read -r login; do
  [ -z "$login" ] && continue
  FOUND=false
  for member in "\${TEAM_MEMBERS[@]}"; do
    [ "$member" = "$login" ] && FOUND=true && break
  done
  [ "$FOUND" = false ] && TO_REMOVE+=("$login")
done <<< "$CURRENT_USERS"

echo ""
echo "Sync summary:"
echo "  Add:    \${#TO_ADD[@]} users"
echo "  Remove: \${#TO_REMOVE[@]} users"
echo "  Unchanged: $(( \${#TEAM_MEMBERS[@]} - \${#TO_ADD[@]} )) users"

if [ \${#TO_ADD[@]} -gt 0 ]; then
  echo ""
  echo "Adding \${#TO_ADD[@]} users..."
  ADD_JSON=$(printf '%s\\n' "\${TO_ADD[@]}" | jq -R . | jq -s '{ users: ., organizations: [], repositories: [] }')
  curl -s -L -X POST "\${HEADERS[@]}" \\
    -H "Content-Type: application/json" \\
    "$API_BASE/enterprises/$ENTERPRISE/settings/billing/cost-centers/$CC_ID/resource" \\
    -d "$ADD_JSON" > /dev/null
  echo "  ✓ Added: \${TO_ADD[*]}"
fi

if [ \${#TO_REMOVE[@]} -gt 0 ]; then
  echo ""
  echo "Removing \${#TO_REMOVE[@]} users..."
  REMOVE_JSON=$(printf '%s\\n' "\${TO_REMOVE[@]}" | jq -R . | jq -s '{ users: ., organizations: [], repositories: [] }')
  curl -s -L -X DELETE "\${HEADERS[@]}" \\
    -H "Content-Type: application/json" \\
    "$API_BASE/enterprises/$ENTERPRISE/settings/billing/cost-centers/$CC_ID/resource" \\
    -d "$REMOVE_JSON" > /dev/null
  echo "  ✓ Removed: \${TO_REMOVE[*]}"
fi

echo ""
echo "=== Sync complete ==="
echo "Cost center '$COST_CENTER_NAME' now has \${#TEAM_MEMBERS[@]} members matching team '$TEAM_SLUG'."`
}

export function buildTeamSyncGitHubAction(ent: string, base: string, teamSlug: string, ccName: string) {
  const safeTeam = teamSlug || 'YOUR_TEAM_SLUG'
  const safeCc = ccName || 'Power Users'
  return `# .github/workflows/team-cost-center-sync.yml
# Syncs an enterprise team's members into a cost center on a schedule.
# Adds new members and removes users who left the team.
#
# Required secret:
#   ENTERPRISE_PAT — classic PAT with admin:enterprise + read:enterprise scopes
#
# Docs:
#   Enterprise Teams: https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-teams/enterprise-team-members
#   Cost Centers:     https://docs.github.com/en/enterprise-cloud@latest/rest/billing/cost-centers

name: Sync Team → Cost Center

on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 06:00 UTC
  workflow_dispatch:       # Manual trigger

env:
  ENTERPRISE: "${ent}"
  TEAM_SLUG: "${safeTeam}"
  COST_CENTER_NAME: "${safeCc}"
  API_BASE: "${base}"

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Fetch team members (paginated)
        id: team
        env:
          GH_TOKEN: \${{ secrets.ENTERPRISE_PAT }}
        run: |
          ALL_LOGINS=""
          PAGE=1
          while true; do
            RESPONSE=$(curl -s -L \\
              -H "Accept: application/vnd.github+json" \\
              -H "Authorization: Bearer $GH_TOKEN" \\
              -H "X-GitHub-Api-Version: 2026-03-10" \\
              "$API_BASE/enterprises/$ENTERPRISE/teams/$TEAM_SLUG/memberships?per_page=100&page=$PAGE")

            LOGINS=$(echo "$RESPONSE" | jq -r '.[].login // empty' 2>/dev/null)
            [ -z "$LOGINS" ] && break

            ALL_LOGINS=$(printf '%s\\n%s' "$ALL_LOGINS" "$LOGINS")
            COUNT=$(echo "$RESPONSE" | jq 'length')
            [ "$COUNT" -lt 100 ] && break
            ((PAGE++))
          done

          ALL_LOGINS=$(echo "$ALL_LOGINS" | sed '/^$/d')
          echo "members<<EOF" >> $GITHUB_OUTPUT
          echo "$ALL_LOGINS" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
          MEMBER_COUNT=$(echo "$ALL_LOGINS" | wc -l | tr -d ' ')
          echo "count=$MEMBER_COUNT" >> $GITHUB_OUTPUT
          echo "Found $MEMBER_COUNT team members"

      - name: Find or create cost center
        id: cc
        env:
          GH_TOKEN: \${{ secrets.ENTERPRISE_PAT }}
        run: |
          CC_LIST=$(curl -s -L \\
            -H "Accept: application/vnd.github+json" \\
            -H "Authorization: Bearer $GH_TOKEN" \\
            -H "X-GitHub-Api-Version: 2026-03-10" \\
            "$API_BASE/enterprises/$ENTERPRISE/settings/billing/cost-centers?per_page=100&state=active")

          CC_ID=$(echo "$CC_LIST" | jq -r --arg name "$COST_CENTER_NAME" \\
            '(.costCenters // .cost_centers // [])[] | select(.name == $name) | .id' | head -1)

          if [ -z "$CC_ID" ] || [ "$CC_ID" = "null" ]; then
            echo "Creating cost center '$COST_CENTER_NAME'..."
            CC_ID=$(curl -s -L -X POST \\
              -H "Accept: application/vnd.github+json" \\
              -H "Authorization: Bearer $GH_TOKEN" \\
              -H "X-GitHub-Api-Version: 2026-03-10" \\
              -H "Content-Type: application/json" \\
              "$API_BASE/enterprises/$ENTERPRISE/settings/billing/cost-centers" \\
              -d "{\\"name\\": \\"$COST_CENTER_NAME\\"}" | jq -r '.id')
          fi
          echo "cc_id=$CC_ID" >> $GITHUB_OUTPUT
          echo "Cost center ID: $CC_ID"

      - name: Fetch current cost center members
        id: current
        env:
          GH_TOKEN: \${{ secrets.ENTERPRISE_PAT }}
        run: |
          CC_ID="\${{ steps.cc.outputs.cc_id }}"
          CC_RESOURCES=$(curl -s -L \\
            -H "Accept: application/vnd.github+json" \\
            -H "Authorization: Bearer $GH_TOKEN" \\
            -H "X-GitHub-Api-Version: 2026-03-10" \\
            "$API_BASE/enterprises/$ENTERPRISE/settings/billing/cost-centers/$CC_ID/resource")

          CURRENT=$(echo "$CC_RESOURCES" | jq -r '.users[]? // empty' 2>/dev/null)
          echo "users<<EOF" >> $GITHUB_OUTPUT
          echo "$CURRENT" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Sync members (add new, remove stale)
        env:
          GH_TOKEN: \${{ secrets.ENTERPRISE_PAT }}
        run: |
          CC_ID="\${{ steps.cc.outputs.cc_id }}"
          TEAM_MEMBERS='\${{ steps.team.outputs.members }}'
          CURRENT_MEMBERS='\${{ steps.current.outputs.users }}'

          # Users to add: in team but not in cost center
          TO_ADD=$(comm -23 <(echo "$TEAM_MEMBERS" | sort) <(echo "$CURRENT_MEMBERS" | sort) | sed '/^$/d')
          # Users to remove: in cost center but not in team
          TO_REMOVE=$(comm -13 <(echo "$TEAM_MEMBERS" | sort) <(echo "$CURRENT_MEMBERS" | sort) | sed '/^$/d')

          ADD_COUNT=$(echo "$TO_ADD" | sed '/^$/d' | wc -l | tr -d ' ')
          REMOVE_COUNT=$(echo "$TO_REMOVE" | sed '/^$/d' | wc -l | tr -d ' ')

          echo "Sync summary: add $ADD_COUNT, remove $REMOVE_COUNT"

          if [ -n "$TO_ADD" ]; then
            ADD_JSON=$(echo "$TO_ADD" | jq -R . | jq -s '{ users: ., organizations: [], repositories: [] }')
            curl -s -L -X POST \\
              -H "Accept: application/vnd.github+json" \\
              -H "Authorization: Bearer $GH_TOKEN" \\
              -H "X-GitHub-Api-Version: 2026-03-10" \\
              -H "Content-Type: application/json" \\
              "$API_BASE/enterprises/$ENTERPRISE/settings/billing/cost-centers/$CC_ID/resource" \\
              -d "$ADD_JSON" > /dev/null
            echo "✓ Added $ADD_COUNT users"
          fi

          if [ -n "$TO_REMOVE" ]; then
            REMOVE_JSON=$(echo "$TO_REMOVE" | jq -R . | jq -s '{ users: ., organizations: [], repositories: [] }')
            curl -s -L -X DELETE \\
              -H "Accept: application/vnd.github+json" \\
              -H "Authorization: Bearer $GH_TOKEN" \\
              -H "X-GitHub-Api-Version: 2026-03-10" \\
              -H "Content-Type: application/json" \\
              "$API_BASE/enterprises/$ENTERPRISE/settings/billing/cost-centers/$CC_ID/resource" \\
              -d "$REMOVE_JSON" > /dev/null
            echo "✓ Removed $REMOVE_COUNT stale users"
          fi

          echo "✓ Sync complete — cost center '$COST_CENTER_NAME' now matches team '$TEAM_SLUG'"`
}

export function buildListBudgetsScript(ent: string, base: string, token: string) {
  return `# List All Budgets for an Enterprise
# Docs: https://docs.github.com/en/enterprise-cloud@latest/rest/billing/budgets?apiVersion=2026-03-10

API_TOKEN="${token}"

# List all budgets (first page)
curl -L \\
  -H "Accept: application/vnd.github+json" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "X-GitHub-Api-Version: 2026-03-10" \\
  "${base}/enterprises/${ent}/settings/billing/budgets?page=1&per_page=10"

# -------------------------------------------------------
# Filter by scope (enterprise, organization, cost_center, user)
# -------------------------------------------------------

# Only user-scoped budgets
curl -L \\
  -H "Accept: application/vnd.github+json" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "X-GitHub-Api-Version: 2026-03-10" \\
  "${base}/enterprises/${ent}/settings/billing/budgets?scope=user"`
}

export function buildCycleResetScript(ent: string, base: string, token: string, budgetId: string, fullCycleAmount: number) {
  const safeBudgetId = budgetId || 'YOUR_BUDGET_ID'
  return `#!/usr/bin/env bash
# Cycle-Reset: Set Enterprise Budget to Full-Cycle Value
# Run this at the start of each billing cycle to reset budgets
# that were adjusted mid-cycle back to their full-cycle values.
#
# Docs: https://docs.github.com/en/enterprise-cloud@latest/rest/billing/budgets?apiVersion=2026-03-10

set -euo pipefail

API_TOKEN="\${API_TOKEN:-${token}}"
ENTERPRISE="${ent}"
BUDGET_ID="${safeBudgetId}"
FULL_CYCLE_AMOUNT=${fullCycleAmount}
API_BASE="${base}"

HEADERS=(-H "Accept: application/vnd.github+json" \\
         -H "Authorization: Bearer $API_TOKEN" \\
         -H "X-GitHub-Api-Version: 2026-03-10" \\
         -H "Content-Type: application/json")

echo "=== Cycle-Reset: Enterprise Budget ==="
echo "Enterprise:       $ENTERPRISE"
echo "Budget ID:        $BUDGET_ID"
echo "Full-Cycle Value: \\$$FULL_CYCLE_AMOUNT"
echo ""

# -------------------------------------------------------
# Step 1: Fetch current budget for verification
# -------------------------------------------------------
echo "Fetching current budget..."
CURRENT=$(curl -s -L "\${HEADERS[@]}" \\
  "$API_BASE/enterprises/$ENTERPRISE/settings/billing/budgets?per_page=100" \\
  | jq -r --arg id "$BUDGET_ID" '.budgets[] | select(.id == $id) | .budget_amount')

if [ -z "$CURRENT" ] || [ "$CURRENT" = "null" ]; then
  echo "✗ Budget not found. Verify the budget ID."
  exit 1
fi

echo "Current amount: \\$$CURRENT"

if [ "$CURRENT" = "$FULL_CYCLE_AMOUNT" ]; then
  echo "✓ Already at full-cycle value. No change needed."
  exit 0
fi

# -------------------------------------------------------
# Step 2: PATCH budget to full-cycle value
# -------------------------------------------------------
echo "Updating to \\$$FULL_CYCLE_AMOUNT..."
RESPONSE=$(curl -s -w "\\n%{http_code}" -L \\
  -X PATCH "\${HEADERS[@]}" \\
  "$API_BASE/enterprises/$ENTERPRISE/settings/billing/budgets/$BUDGET_ID" \\
  -d "{\\"budget_amount\\": $FULL_CYCLE_AMOUNT}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
  echo "✓ Enterprise budget reset to \\$$FULL_CYCLE_AMOUNT (full-cycle value)"
else
  BODY=$(echo "$RESPONSE" | sed '$d')
  echo "✗ Update failed: HTTP $HTTP_CODE"
  echo "  $BODY"
  exit 1
fi`
}

export function buildCycleResetGitHubAction(ent: string, base: string, budgetId: string, fullCycleAmount: number) {
  const safeBudgetId = budgetId || 'YOUR_BUDGET_ID'
  return `# .github/workflows/cycle-reset-copilot-budget.yml
#
# Resets the enterprise Copilot budget to its full-cycle value at the
# start of each billing cycle. Prevents inflated mid-cycle budgets
# from persisting into the next month.
#
# Required secrets:
#   BILLING_PAT — classic PAT with manage_billing:enterprise scope
#
# Required variables:
#   FULL_CYCLE_BUDGET — the full-cycle budget amount (e.g. 935)
#
# Adjust the cron schedule to match your billing cycle start date.

name: Reset Copilot Budget (cycle start)

on:
  schedule:
    # Runs at midnight UTC on the 1st of each month
    # Adjust to match your billing cycle start date
    - cron: '0 0 1 * *'
  workflow_dispatch:
    inputs:
      budget_amount:
        description: 'Override budget amount (leave empty for default)'
        required: false
        type: number

permissions: {}

jobs:
  reset-budget:
    runs-on: ubuntu-latest
    steps:
      - name: Reset enterprise budget
        env:
          GH_TOKEN: \${{ secrets.BILLING_PAT }}
        run: |
          AMOUNT=\${{ inputs.budget_amount || vars.FULL_CYCLE_BUDGET || '${fullCycleAmount}' }}
          BUDGET_ID="${safeBudgetId}"
          ENTERPRISE="${ent}"
          API_BASE="${base}"

          echo "Resetting enterprise budget to \\$$AMOUNT..."

          HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L \\
            -X PATCH \\
            -H "Accept: application/vnd.github+json" \\
            -H "Authorization: Bearer $GH_TOKEN" \\
            -H "X-GitHub-Api-Version: 2026-03-10" \\
            -H "Content-Type: application/json" \\
            "$API_BASE/enterprises/$ENTERPRISE/settings/billing/budgets/$BUDGET_ID" \\
            -d "{\\"budget_amount\\": $AMOUNT}")

          if [ "$HTTP_CODE" = "200" ]; then
            echo "✓ Budget reset to \\$$AMOUNT"
          else
            echo "✗ Failed: HTTP $HTTP_CODE"
            exit 1
          fi`
}
