# GitHub Copilot Budget Guide

> Understand how Copilot's billing system works, then use the tools in this app to calculate, review, and apply your budget configuration.
>
> **Related docs:** [Usage-Based Billing 101](usage-based-billing-101.md) · [System Overview](system-overview.md) · [Game Theory Analysis](game-optimization.md)
>
> **GitHub Docs:** [Usage-based billing for organizations and enterprises](https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/billing/usage-based-billing-for-organizations-and-enterprises) · [Models and pricing](https://docs.github.com/en/enterprise-cloud@latest/copilot/reference/copilot-billing/models-and-pricing)

---

## Getting Started

Follow these steps in order for the best experience:

1. **Understand** (this page) — Learn how billing works and what each control does.
2. **Connect** → **Budget Planner** tab — Import your enterprise's live data so the other tools can reference your actual settings.
3. **Calculate** → **Tier Planner** tab — See recommended values and detect any budgets constraining your users.
4. **Optimize** (optional) → **Promo Optimizer** tab — During promotional pricing, optimize seat purchases to maximize included credits.

---

## 🎓 How Copilot Billing Works

GitHub Copilot enterprise billing has two layers that work very differently — confusing them is the most common source of unexpected bills, blocked developers, and misaligned expectations.

### 1. Two things you pay for

Every GitHub Copilot license comes with included AI Credits (AICs) — a pre-paid usage allowance for AI requests. Using those AICs costs nothing extra; they're included with your license.

| Tier | License | AICs Included | $ Value |
|------|----------|---------------|---------|
| Business | $19 | 1,900 | $19 |
| Enterprise | $39 | 3,900 | $39 |

### 2. The shared pool

All AICs from every seat combine into one enterprise-wide pool. It doesn't matter which team purchased which license — everyone draws from the same reservoir. The pool resets each billing cycle; unused credits do not roll over.

> **Example:** 80 Business + 20 Enterprise seats → 230,000 AICs pooled together ($2,300 in included credits). Every developer draws from the same reservoir.

### 3. What happens when it runs out

When the pool hits zero, Copilot usage doesn't automatically stop. Additional usage is charged via metered billing — a per-AIC fee beyond your included credits. The "budgets" and "spending limits" in GitHub's billing settings exist to manage this additional spend — not the pool itself.

> Your licenses include pre-paid AI Credits (included credits). Spending limits cap what happens after those included credits run out.

### 4. The four controls

| Control | When It's Active | What It Does |
|---------|-----------------|--------------|
| **Enterprise Spending Limit** | Post-pool only | Hard ceiling on additional charges once the pool runs dry. Zero effect while pool capacity remains. |
| **Cost Center Budget** | Post-pool only | Per-team cap on additional charges. Useful for chargeback, but cannot protect a team's share of the pre-paid pool. |
| **Universal User Budget** | Always | Caps each person's total monthly consumption (pool + metered). Primary fairness control. |
| **Individual User Budget** | Always | A higher personal cap for specific named users who demonstrably need more. |

### 5. Cost center exclusion

One toggle fundamentally changes how the Enterprise Spending Limit and Cost Center Budgets interact:

- **Exclusion OFF (default):** The Enterprise Spending Limit is the single umbrella covering all post-pool additional charges. Cost center budgets act as sub-limits within it. Best for organizations where a small number of enterprise admins manage all budgets centrally.
- **Exclusion ON:** Enterprise and cost center budgets become fully independent meters. Best for organizations where departments own their own AI spend. Requires that every cost center has a budget configured, or those teams' charges are uncapped.

> **Who can change this:** Only enterprise owners and enterprise admins. In M&A organizations with many admins, any one of them can flip this toggle without the others knowing. Coordinate before changing.
>
> Decide on this setting before sizing any budgets — it changes the math for everything else.

---

## 💡 5 Essential Tips

### 1. Always set a Universal User Budget

Without one, a single user or agent can consume the entire enterprise pool overnight. The Universal User Budget is your primary fairness control — it caps how much of the shared pool any one person can draw per month.

### 2. Set it above "fair share" to enable pooling

Capping at exactly 1× the per-license value defeats the purpose of pooling. Heavier users get blocked while light users waste credits. The optimal ULB lets heavier users borrow from lighter users' unused portions. If credits are left over at month-end, raise it. The goal is near-zero remaining credits with no one blocked mid-month.

> **Import your data in the Budget Planner first**, then use the **Tier Planner** tab to calculate the optimal ULB for your specific seat mix.

### 3. Always enable "Stop usage" on spending limits

The "Stop usage" feature (`prevent_further_usage` API flag) turns a spending limit into a hard stop. Without it, every budget is advisory — usage and charges continue past the limit uncapped.

### 4. Size the Enterprise Spending Limit from your seat mix

The Enterprise Spending Limit is a post-pool safety net, not a total budget. It's derived from your ULB settings and pool size: total max consumption minus pool value equals your potential additional spend. Add a buffer, and that's your Enterprise Spending Limit. It does nothing while the pool has capacity.

> **Import your data in the Budget Planner first**, then use the **Tier Planner** tab to derive this automatically from your configuration.

### 5. Budgets only track from their creation date

A budget created mid-cycle is blind to prior usage — its counter starts at zero. Create budgets at the start of a new billing cycle whenever possible. If creating mid-cycle, set the initial limit conservatively.

---

## 🎯 Advanced Tips

### 1. Raise Individual User Budgets before upgrading license tiers

An Individual Budget on a Business license lets a user borrow from the pool at no extra cost. During standard pricing, upgrading adds $20/seat for a net-zero AIC gain. Only consider an upgrade if the user consistently maxes out their Individual Budget month after month.

### 2. Gate Individual Budget increases on prior-month usage data

Individual Budgets don't expand the pool — they raise the per-user ceiling, accelerating depletion for everyone. Require usage data before granting increases. Power user status should be demonstrated, not self-reported.

### 3. Share pool depletion metrics with your team monthly

Publish a simple end-of-month summary (e.g. "Pool was 74% consumed, no one was blocked"). Users who can see the pool is healthy are less likely to inflate usage defensively or rush to consume credits early in the cycle.

### 4. Coordinate changes across enterprise admins

Only enterprise owners and enterprise admins can change enterprise-level billing settings. In organizations with multiple admins (common in M&A), designate one person as the budget coordinator. All admins should notify the coordinator before changing the exclusion toggle, enterprise limits, or CC budgets. Audit the full configuration monthly.

### 5. The Tier Planner recommendation is a forecast, not a worst-case projection

CCC's "suggested" enterprise budget comes from a forecast derived from your last billing CSV: `max(sum(min(userActual, ULB)) − pool, sum(userActual) − pool)`. The second term is a floor that matches GitHub's billing-preview actual additional spend, so the headline never undercuts the bill you already saw. The first term reflects how proposed ULBs would cap heavy users going forward.

If you want a hard cap that can't be exceeded under any spike, set the budget higher than the forecast and enable `prevent_further_usage`. The forecast is a planning anchor, not a ceiling.

---

## Ready to Configure Your Budgets?

**New to Copilot budgeting?** Start by importing your enterprise data in the **Budget Planner** tab. Once connected, the **Tier Planner** will calculate optimal ULBs, enterprise budget, and cost center budgets for your configuration.

**Already connected?** Open the **Tier Planner** tab to see recommended values alongside your actual budgets. It will flag any settings that are constraining your users below their ULBs.

> **Note:** All AIC values depend on the pricing period (promotional vs. standard). Use the Tier Planner tab to see values for your specific configuration.
