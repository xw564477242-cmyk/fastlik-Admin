import React from 'react'
import ReactDOM from 'react-dom/client'
import Root from './Root'
import ErrorBoundary from './ErrorBoundary'
import './production-console.css'
import './error-boundary.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><Root /></ErrorBoundary></React.StrictMode>,
)
