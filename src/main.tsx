import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary, hasWebGL, NoWebGL } from './ui/Safety'

createRoot(document.getElementById('root')!).render(<ErrorBoundary>{hasWebGL() ? <App /> : <NoWebGL />}</ErrorBoundary>)
