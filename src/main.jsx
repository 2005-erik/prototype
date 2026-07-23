import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext'
import { ProjectNavProvider } from './contexts/ProjectNavContext'
import { ToastProvider } from './components/ui/Toast'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <ProjectNavProvider>
          <App />
        </ProjectNavProvider>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
)
