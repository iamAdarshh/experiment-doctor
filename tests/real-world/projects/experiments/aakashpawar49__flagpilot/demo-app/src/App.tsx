import { useState } from 'react'
import { SignupForm } from './SignupForm'
import { useExperiment, useFlagsmith, useFlagsmithLoading } from '@flagsmith/flagsmith/react'

export default function App() {
  const [signedUp, setSignedUp] = useState<string | null>(null)
  const loading = useFlagsmithLoading()
  const flagsmith = useFlagsmith()
  const experimentFlag = useExperiment('signup_form_experiment')
  const heroFlag = useExperiment('hero_headline_variant')
  const variant = (experimentFlag?.value as string | undefined) ?? 'control'
  const heroVariant = (heroFlag?.value as string | undefined) ?? 'control'

  return (
    <div className="page">
      <header className="nav">
        <span className="logo">Lumen</span>
        <nav>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#signup" className="nav-cta" onClick={() => flagsmith.trackEvent('cta_clicked')}>
            Start free
          </a>
        </nav>
      </header>

      <main className="hero">
        <section className="pitch">
          <p className="eyebrow">Team analytics for engineering leads</p>
          {loading?.isLoading ? (
             <h1>See where your team's week actually goes.</h1>
          ) : (
            <h1>
              {heroVariant === 'benefit_led' 
                ? 'Ship faster with complete visibility into focus time and review bottlenecks.' 
                : 'See where your team\'s week actually goes.'}
            </h1>
          )}
          <p className="sub">
            Lumen connects to GitHub, Linear and your calendar, then shows focus time, review load and
            blockers in one weekly report. No surveys, no time tracking.
          </p>
          <ul className="proof" id="features">
            <li>Weekly focus-time report per engineer</li>
            <li>PR review load and wait times</li>
            <li>Meeting drag across the team</li>
          </ul>
        </section>

        <section className="signup" id="signup">
          {signedUp ? (
            <div className="done">
              <h2>Welcome to Lumen, {signedUp}.</h2>
              <p>Check your inbox to connect your first integration.</p>
            </div>
          ) : loading?.isLoading ? (
            <div className="form">
              <h2>Create your account</h2>
              <p className="muted">Loading signup experience...</p>
            </div>
          ) : (
            <SignupForm onSuccess={setSignedUp} variant={variant} />
          )}
        </section>
      </main>
    </div>
  )
}
