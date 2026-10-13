import { createRoot } from 'react-dom/client'
import './styles/capacity/vw-level4-tokens.css'
import './core/theme/vw-legacy-compat.css'
import './styles/capacity/cf-global.css'
// Canonical NST bundle; compatibility styles above contain only legacy extensions.
import './styles/nst-design-system/nst-design-system.css'
import './core/theme/vw-design-tokens.css'
import './styles/nst-design-system/components.css'
import './styles/nst-design-system/theme-blue.css'
import './index.css'
import './core/theme/vw-antd.css'
import './core/theme/vw-antd-primitives.css'
import './core/theme/ideation-skin.css'
import './shared/components/dash/dash-kit.css'
import './shared/components/ux/empty-state.css'
import App from './App.tsx'

// StrictMode removed: SiteDetailPage has 117+ hooks in a single component,
// causing "Rendered more hooks than during previous render" under StrictMode's
// double-render. This is dev-only; production builds are unaffected.
// TODO: refactor SiteDetailPage into smaller sub-components to re-enable.
createRoot(document.getElementById('root')!).render(
  <App />,
)
