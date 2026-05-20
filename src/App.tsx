import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Code, Gauge, Moon, Sun, SunHorizon, Lightbulb, ChartBar, Calculator, Rocket, Play, CaretDown, X, Question, CurrencyCircleDollar, Check, BookOpen } from '@phosphor-icons/react'
import BudgetPlanner from '@/components/BudgetPlanner'
import { OnboardingPopup } from '@/components/OnboardingPopup'
import { OnboardingGate } from '@/components/OnboardingGate'
import { DocsPage } from '@/components/DocsPage'
import { TabErrorFallback } from '@/components/TabErrorFallback'
import { useEnterpriseCredentials } from '@/hooks/use-enterprise-credentials'
import { useThemePreference, type ThemePreference } from '@/hooks/use-theme-preference'
import { getHashTab, setHash, migrateQueryToHash } from '@/lib/hash-routing'
import { shouldShowOnboarding } from '@/lib/onboarding'
import { SCRIPT_TYPES, type ScriptType } from '@/lib/constants'

const BudgetCalculator = lazy(() => import('@/components/BudgetCalculator'))
const BillingReport = lazy(() => import('@/components/BillingReport'))
const PromoAicOptimizer = lazy(() => import('@/components/PromoAicOptimizer'))
const ApiTools = lazy(() => import('@/components/ApiTools'))
const Tips = lazy(() => import('@/components/Tips'))

const VALID_TABS = ['budget-planner', 'tier-planner', 'billing-report', 'promo-optimizer', 'tips', 'docs', ...SCRIPT_TYPES] as const

const NAV_TABS = [
  { value: 'budget-planner', label: 'Budget Planner', icon: ChartBar },
  { value: 'tier-planner', label: 'Tier Planner', icon: Calculator },
  { value: 'billing-report', label: 'Billing Report', icon: CurrencyCircleDollar },
  { value: 'promo-optimizer', label: 'Promo Optimizer', icon: Rocket },
  { value: 'api-tools', label: 'API Tools', icon: Code },
  { value: 'tips', label: 'Tips & Best Practices', icon: Lightbulb },
] as const

function App() {
  const { preference, setPreference } = useThemePreference()
  const { isDemo, demoVariant, connectDemo, disconnectDemo, dataReadiness } = useEnterpriseCredentials()
  const [highlightImport, setHighlightImport] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [autoConnect, setAutoConnect] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)

  const showOnboardingGate = dataReadiness.mode === 'live-incomplete'

  // ?banner=0 permanently hides the demo banner
  const hideBannerPermanently = new URLSearchParams(window.location.search).get('banner') === '0'
  const showDemoBanner = isDemo && !hideBannerPermanently && !bannerDismissed

  const [activeTab, setActiveTab] = useState(() => {
    // Migrate legacy ?tab= query strings to hash-based routing
    const migrated = migrateQueryToHash()
    const raw = migrated ?? getHashTab()

    // Handle api-tools → default script mapping
    if (raw === 'api-tools') {
      const hashParams = new URLSearchParams(window.location.hash.slice(window.location.hash.indexOf('?') + 1))
      const tool = hashParams.get('tool')
      return SCRIPT_TYPES.includes(tool as ScriptType) ? (tool as ScriptType) : 'user-budget'
    }
    return VALID_TABS.includes(raw as typeof VALID_TABS[number]) ? raw! : 'budget-planner'
  })

  // When activeTab is a script type, show the API Tools tab as selected
  const displayTab = SCRIPT_TYPES.includes(activeTab as ScriptType) ? 'api-tools' : activeTab

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const mainRef = useRef<HTMLElement>(null)
  const prevTabRef = useRef<string>('budget-planner')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleTabChange = useCallback((tab: string) => {
    // Clicking the API Tools tab trigger maps to the default script
    const newTab = tab === 'api-tools' ? 'user-budget' : tab
    setActiveTab((prev) => {
      if (newTab === 'docs' && prev !== 'docs') {
        prevTabRef.current = prev
      }
      return newTab
    })
    setHash(newTab)
    mainRef.current?.scrollIntoView()
  }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Gauge size={24} weight="bold" className="text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Copilot Budget Command Calculator</h1>
          </div>
        </div>
      </header>

      <Tabs value={displayTab} onValueChange={handleTabChange}>
        {showOnboardingGate ? (
          <main className="w-full flex-1 min-h-[calc(100vh-8rem)]">
            <OnboardingGate />
          </main>
        ) : (
        <>
        <div className={`sticky top-0 z-50 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 transition-[box-shadow,border-color] duration-200 ${
          scrolled ? 'shadow-md border-b border-transparent' : 'border-b border-border'
        }`}>
          <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 sm:py-2.5 flex items-center">
            {/* Mobile tab selector */}
            <div className="flex sm:hidden items-center flex-1 min-w-0">
              <Popover open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 -ml-2 hover:bg-accent/50 active:bg-accent/70 transition-colors min-w-0">
                    <span className="text-[15px] font-medium truncate">
                      {NAV_TABS.find(t => t.value === displayTab)?.label}
                    </span>
                    <CaretDown size={14} weight="bold" className="shrink-0 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-1.5">
                  {NAV_TABS.map(tab => {
                    const Icon = tab.icon
                    const isActive = displayTab === tab.value
                    return (
                      <button
                        key={tab.value}
                        onClick={() => {
                          handleTabChange(tab.value)
                          setMobileMenuOpen(false)
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        }`}
                      >
                        <Icon size={18} weight="duotone" />
                        {tab.label}
                      </button>
                    )
                  })}
                </PopoverContent>
              </Popover>
            </div>

            {/* Desktop tab bar */}
            <TabsList className="hidden sm:inline-grid sm:grid-cols-6 lg:w-auto">
              <TabsTrigger value="budget-planner" className="gap-2">
                <ChartBar size={18} weight="duotone" />
                Budget Planner
              </TabsTrigger>
              <TabsTrigger value="tier-planner" className="gap-2">
                <Calculator size={18} weight="duotone" />
                Tier Planner
              </TabsTrigger>
              <TabsTrigger value="billing-report" className="gap-2">
                <CurrencyCircleDollar size={18} weight="duotone" />
                Billing Report
              </TabsTrigger>
              <TabsTrigger value="promo-optimizer" className="gap-2">
                <Rocket size={18} weight="duotone" />
                Promo Optimizer
              </TabsTrigger>
              <TabsTrigger value="api-tools" className="gap-2">
                <Code size={18} weight="duotone" />
                API Tools
              </TabsTrigger>
              <TabsTrigger value="tips" className="gap-2">
                <Lightbulb size={18} weight="duotone" />
                Tips & Best Practices
              </TabsTrigger>
            </TabsList>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleTabChange('docs')}
                className="h-9 w-9 shrink-0"
                aria-label="Open documentation"
              >
                <BookOpen size={20} weight="duotone" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowOnboarding(true)}
                className="h-9 w-9 shrink-0"
                aria-label="Show welcome guide"
              >
                <Question size={20} weight="duotone" />
              </Button>
              <Popover open={themeMenuOpen} onOpenChange={setThemeMenuOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    aria-label="Change theme"
                  >
                    {preference === 'light' && <Sun size={20} weight="bold" />}
                    {preference === 'dark' && <Moon size={20} weight="bold" />}
                    {preference === 'auto' && <SunHorizon size={20} weight="bold" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-40 p-1.5">
                  {([
                    { value: 'light' as ThemePreference, label: 'Light', Icon: Sun },
                    { value: 'dark' as ThemePreference, label: 'Dark', Icon: Moon },
                    { value: 'auto' as ThemePreference, label: 'Auto', Icon: SunHorizon },
                  ]).map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      onClick={() => {
                        setPreference(value)
                        setThemeMenuOpen(false)
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        preference === value
                          ? 'bg-accent/20 text-foreground'
                          : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'
                      }`}
                    >
                      <Icon size={16} weight="duotone" />
                      <span className="flex-1 text-left">{label}</span>
                      {preference === value && <Check size={14} weight="bold" className="text-primary" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {showDemoBanner && (
            <div className="border-t border-accent/30 bg-accent/10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Play size={14} weight="fill" className="text-accent" />
                  <span className="font-medium text-accent">Demo Mode</span>
                  <span className="hidden sm:inline text-muted-foreground">·</span>
                  <div className="hidden sm:inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 p-0.5">
                    <button
                      onClick={() => { if (demoVariant !== 'cc') connectDemo('cc') }}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                        demoVariant === 'cc' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      With CCs
                    </button>
                    <button
                      onClick={() => { if (demoVariant !== 'nocc') connectDemo('nocc') }}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                        demoVariant === 'nocc' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      No CCs
                    </button>
                  </div>
                  <span className="hidden sm:inline text-muted-foreground text-xs">Viewing sample data for acme-corp</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      handleTabChange('budget-planner')
                      setHighlightImport(true)
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    Connect your enterprise →
                  </button>
                  <button
                    onClick={() => {
                      setBannerDismissed(true)
                      disconnectDemo()
                      // If dev credentials exist, auto-connect directly
                      if (import.meta.env.VITE_DEV_ENTERPRISE_URL && import.meta.env.VITE_DEV_PAT) {
                        handleTabChange('budget-planner')
                        setAutoConnect(true)
                      }
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Dismiss demo banner"
                  >
                    <X size={14} weight="bold" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <main ref={mainRef} className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 scroll-mt-14 flex-1 min-h-[calc(100vh-8rem)]">
          {activeTab === 'docs' ? (
            <DocsPage onBack={() => handleTabChange(prevTabRef.current)} />
          ) : (
          <>
          <TabsContent value="budget-planner" className="space-y-6">
            <ErrorBoundary FallbackComponent={TabErrorFallback}>
              <BudgetPlanner
                onNavigateToTips={() => handleTabChange('tips')}
                onNavigateToTierPlanner={() => handleTabChange('tier-planner')}
                highlightImport={highlightImport}
                onHighlightImportDone={() => setHighlightImport(false)}
                autoConnect={autoConnect}
                onAutoConnectDone={() => setAutoConnect(false)}
              />
            </ErrorBoundary>
          </TabsContent>

          <Suspense fallback={
            <div className="space-y-6 py-4">
              <div className="h-8 w-48 rounded-md skeleton-shimmer" />
              <div className="h-40 rounded-xl skeleton-shimmer" />
              <div className="h-64 rounded-xl skeleton-shimmer" />
            </div>
          }>
          <TabsContent value="tier-planner" className="space-y-6">
            <ErrorBoundary FallbackComponent={TabErrorFallback}>
              <BudgetCalculator
                onNavigateToTab={(tab) => handleTabChange(tab)}
                onNavigateToImport={() => {
                  handleTabChange('budget-planner')
                  setHighlightImport(true)
                }}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="billing-report" className="space-y-6">
            <ErrorBoundary FallbackComponent={TabErrorFallback}>
              <BillingReport />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="promo-optimizer" className="space-y-6">
            <ErrorBoundary FallbackComponent={TabErrorFallback}>
              <PromoAicOptimizer />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="api-tools" className="space-y-6">
            <ErrorBoundary FallbackComponent={TabErrorFallback}>
              <ApiTools
                initialScript={SCRIPT_TYPES.includes(activeTab as ScriptType) ? (activeTab as ScriptType) : undefined}
                onScriptChange={(script) => handleTabChange(script)}
              />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="tips" className="space-y-6">
            <ErrorBoundary FallbackComponent={TabErrorFallback}>
              <Tips onNavigateToTab={(tab) => handleTabChange(tab)} onShowOnboarding={() => setShowOnboarding(true)} />
            </ErrorBoundary>
          </TabsContent>
          </Suspense>
          </>
          )}
        </main>
        </>
        )}
      </Tabs>

      <p className="text-center text-xs text-muted-foreground mt-auto pt-6 pb-2">
        Developed by{' '}
        <a
          href="https://github.com/xrvk"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary hover:underline underline-offset-2 transition-colors"
        >
          @xrvk
        </a>
        {' · '}
        <a
          href="https://github.com/xrvk/copilot-budget-command-calculator"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary hover:underline underline-offset-2 transition-colors"
        >
          Source
        </a>
      </p>
      <footer className="w-full border-t border-border bg-muted/30 py-3">
        <p className="text-center text-xs text-muted-foreground px-4">
          This is an independent, personal project by a GitHub Solutions Engineer. It is not an official GitHub product and does not represent GitHub's views.
          Provided "as is" for planning purposes only; not financial or billing advice.
          Past usage patterns may not predict future usage. Always verify against{' '}
          <a href="https://docs.github.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">GitHub's official documentation</a>{' '}
          before applying changes.
        </p>
      </footer>

      {showOnboarding && (
        <OnboardingPopup
          onClose={() => setShowOnboarding(false)}
          onNavigate={handleTabChange}
        />
      )}
    </div>
  )
}

export default App
