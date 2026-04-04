import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GoogleMapsProvider } from './hooks/useGoogleMaps'

// Apply saved theme on initial load (light is default)
const savedTheme = localStorage.getItem('gs_theme');
if (savedTheme === 'dark') {
  document.body.classList.add('dark');
} else {
  document.body.classList.add('light');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleMapsProvider>
      <App />
    </GoogleMapsProvider>
  </StrictMode>,
)
