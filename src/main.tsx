import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import Home from './pages/Home'
import Room from './pages/Room'
import Sandbox from './pages/Sandbox'
import Solo from './pages/Solo'
import QuickCounter from './pages/QuickCounter'
import MatchAnalysis from './pages/MatchAnalysis'
import Friends from './pages/Friends'

const qc = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:id" element={<Room />} />
          <Route path="/sandbox" element={<Sandbox />} />
          <Route path="/solo" element={<Solo />} />
          <Route path="/quick-counter" element={<QuickCounter />} />
          <Route path="/match" element={<MatchAnalysis />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
