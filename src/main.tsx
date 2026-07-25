import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

const isProfessionalReaderRoute =
  window.location.pathname === '/v2' ||
  window.location.pathname.startsWith('/v2/')

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (isProfessionalReaderRoute) {
  document.title = 'PageEcho — Bimodal Reader'
  import('./v2/AppV2').then(({ default: AppV2 }) => {
    root.render(
      <React.StrictMode>
        <AppV2 />
      </React.StrictMode>,
    )
  })
} else {
  import('./App').then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  })
}
