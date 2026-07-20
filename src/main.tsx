import React from 'react'
import ReactDOM from 'react-dom/client'
import Root from './Root'
import './styles.css'
import './interactive.css'
import './subsystem-apps.css'
import './treasury-operations.css'
import './tenant-operations.css'
import './white-label-delivery.css'
import './login.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Root /></React.StrictMode>,
)
