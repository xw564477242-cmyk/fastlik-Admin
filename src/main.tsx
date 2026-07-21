import React from 'react'
import ReactDOM from 'react-dom/client'
import Root from './Root'
import ErrorBoundary from './ErrorBoundary'
import './styles.css'
import './interactive.css'
import './subsystem-apps.css'
import './treasury-operations.css'
import './tenant-operations.css'
import './white-label-delivery.css'
import './login.css'
import './responsive.css'
import './wallet-business.css'
import './business-dashboards.css'
import './wallet-business-fixes.css'
import './card-processor-acceptance.css'
import './sprint06-business.css'
import './sprint07-business.css'
import './sprint09-business.css'
import './error-boundary.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><Root /></ErrorBoundary></React.StrictMode>,
)
