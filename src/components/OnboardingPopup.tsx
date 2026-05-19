import { useCallback, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChartBar,
  Calculator,
  CurrencyCircleDollar,
  Rocket,
  Code,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
  X,
  Gauge,
  ArrowsOut,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { setOnboardingDismissed } from '@/lib/onboarding'
import type { ComponentType, ReactNode } from 'react'
import type { IconProps } from '@phosphor-icons/react'

interface SlideData {
  tab: string
  title: string
  icon: ComponentType<IconProps>
  question: string
  purpose: ReactNode
  color: string
}

const PROMO_BLOG_URL = 'https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/'

const SLIDES: SlideData[] = [
  {
    tab: 'tips',
    title: 'Tips & Best Practices',
    icon: Lightbulb,
    question: 'How does Copilot billing actually work?',
    purpose: (
      <ul>
        <li>How the shared AI Credit pool works</li>
        <li>What happens when included credits run out</li>
        <li>The four budget controls at your disposal</li>
        <li>Cost center exclusion and when to use it</li>
      </ul>
    ),
    color: 'text-amber-500',
  },
  {
    tab: 'budget-planner',
    title: 'Budget Planner',
    icon: ChartBar,
    question: 'How much can my enterprise spend on Copilot each month?',
    purpose: (
      <ul>
        <li>Connect to GitHub APIs to sync live budget settings and cost centers</li>
        <li>Upload a billing CSV to see per-user consumption in a sorted bar chart</li>
        <li>Auto-detect power users and apply seat counts directly to the Tier Planner</li>
        <li>Edit enterprise and cost center budgets, then push updates back to GitHub</li>
        <li><strong>Live mode requires both a live API connection and a recent billing CSV.</strong> Stay in demo mode to explore the UI with sample data.</li>
      </ul>
    ),
    color: 'text-blue-500',
  },
  {
    tab: 'tier-planner',
    title: 'Tier Planner',
    icon: Calculator,
    question: 'Given my budgets so far, how do I optimize them to ensure my developers are not blocked?',
    purpose: (
      <ul>
        <li>Imports your CB/CE seat counts automatically</li>
        <li>Recommends optimal ULBs and enterprise budgets</li>
        <li>Detects when budgets constrain developers below their limits</li>
        <li>Set consumption goals and compare tiers</li>
      </ul>
    ),
    color: 'text-emerald-500',
  },
  {
    tab: 'billing-report',
    title: 'Billing Report',
    icon: CurrencyCircleDollar,
    question: 'How do I allocate Copilot costs across teams and departments?',
    purpose: (
      <ul>
        <li>Generate per-user and per-department billing allocation reports</li>
        <li>Use CSV data or live cost center spend as input</li>
        <li>CSV uploaded in Budget Planner auto-fills the report</li>
        <li>Export results for internal chargeback or finance review</li>
      </ul>
    ),
    color: 'text-cyan-500',
  },
  {
    tab: 'promo-optimizer',
    title: 'Promo Optimizer',
    icon: Rocket,
    question: 'How do I maximize AI Credits during the promotional pricing period?',
    purpose: (
      <ul>
        <li>
          Applies during the{' '}
          <a
            href={PROMO_BLOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-500 underline underline-offset-2 hover:text-orange-400 font-medium"
          >
            promotional pricing period
          </a>
        </li>
        <li>Calculate the optimal CB/CE seat mix</li>
        <li>Compare upgrade vs. new-seat strategies</li>
        <li>See exactly how many bonus credits each option yields</li>
      </ul>
    ),
    color: 'text-orange-500',
  },
  {
    tab: 'api-tools',
    title: 'API Tools',
    icon: Code,
    question: 'How do I automate budget and team management at scale?',
    purpose: (
      <ul>
        <li>Bulk user-level budget updates</li>
        <li>Team-to-cost-center syncing</li>
        <li>Billing cycle resets</li>
        <li>Available as shell commands and GitHub Actions workflows</li>
      </ul>
    ),
    color: 'text-violet-500',
  },
]

interface OnboardingPopupProps {
  onClose: () => void
  onNavigate: (tab: string) => void
}

export function OnboardingPopup({ onClose, onNavigate }: OnboardingPopupProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const checkboxId = useId()

  const slide = SLIDES[currentSlide]
  const isFirst = currentSlide === 0
  const isLast = currentSlide === SLIDES.length - 1
  const Icon = slide.icon

  const handleClose = useCallback(() => {
    if (dontShowAgain) {
      setOnboardingDismissed(true)
    }
    onClose()
  }, [dontShowAgain, onClose])

  const handleGoToTab = useCallback(() => {
    setMinimized(true)
    onNavigate(slide.tab)
  }, [onNavigate, slide.tab])

  const handleNext = useCallback(() => {
    if (isLast) {
      handleClose()
    } else {
      setCurrentSlide(s => s + 1)
    }
  }, [isLast, handleClose])

  const handlePrev = useCallback(() => {
    if (!isFirst) {
      setCurrentSlide(s => s - 1)
    }
  }, [isFirst])

  if (minimized) {
    return createPortal(
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-primary-foreground shadow-lg hover:bg-primary/90 transition-all animate-in slide-in-from-bottom-4 fade-in duration-300"
        aria-label="Resume welcome guide"
      >
        <Gauge size={18} weight="bold" />
        <span className="text-sm font-medium">Resume guide</span>
        <span className="text-xs opacity-70">({currentSlide + 1}/{SLIDES.length})</span>
        <ArrowsOut size={14} weight="bold" className="ml-1 opacity-70" />
      </button>,
      document.body
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Copilot Budget Command Calculator"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors z-10"
          aria-label="Close"
        >
          <X size={18} weight="bold" />
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Gauge size={20} weight="bold" className="text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              Welcome to Copilot Budget Command Calculator
            </span>
          </div>
        </div>

        {/* Slide content */}
        <div className="px-8 py-6 min-h-[280px] flex flex-col">
          {/* Tab icon + title */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-xl bg-accent/50 flex items-center justify-center ${slide.color}`}>
              <Icon size={28} weight="duotone" />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {currentSlide + 1} of {SLIDES.length}
              </div>
              <h2 className="text-xl font-bold">{slide.title}</h2>
            </div>
          </div>

          {/* Question callout */}
          <div className="rounded-lg bg-accent/30 border border-accent/50 px-4 py-3 mb-4">
            <p className="text-sm font-semibold italic text-foreground/90">
              &ldquo;{slide.question}&rdquo;
            </p>
          </div>

          {/* Purpose bullets */}
          <div className="text-sm text-muted-foreground leading-relaxed flex-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_li]:pl-0.5">
            {slide.purpose}
          </div>

          {/* Go to tab link */}
          <button
            onClick={handleGoToTab}
            className={`mt-4 inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:underline underline-offset-2 ${slide.color}`}
          >
            Go to {slide.title}
            <ArrowRight size={14} weight="bold" />
          </button>
        </div>

        {/* Footer */}
        <div className="px-8 pb-6 pt-2 flex items-center justify-between border-t border-border/50">
          {/* Don't show again */}
          <label htmlFor={checkboxId} className="flex items-center gap-2 cursor-pointer select-none">
            <input
              id={checkboxId}
              type="checkbox"
              checked={dontShowAgain}
              onChange={e => setDontShowAgain(e.target.checked)}
              className="rounded border-muted-foreground/40 h-4 w-4 accent-primary"
            />
            <span className="text-sm text-muted-foreground">Don&apos;t show again</span>
          </label>

          {/* Navigation */}
          <div className="flex items-center gap-3">
            {/* Dot indicators */}
            <div className="flex items-center gap-1.5 mr-2">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${
                    i === currentSlide
                      ? 'bg-primary w-4'
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            {/* Prev / Next buttons */}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={isFirst}
              className="gap-1"
            >
              <ArrowLeft size={14} weight="bold" />
              Back
            </Button>
            <Button size="sm" onClick={handleNext} className="gap-1">
              {isLast ? 'Get Started' : 'Next'}
              {!isLast && <ArrowRight size={14} weight="bold" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
