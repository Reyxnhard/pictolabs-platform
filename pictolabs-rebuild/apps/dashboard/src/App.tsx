import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { BoothsPage } from './pages/BoothsPage';
import { SessionsPage } from './pages/SessionsPage';
import { GalleryPage } from './pages/GalleryPage';
import { SupportSearchPage } from './pages/SupportSearchPage';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/booths" element={<BoothsPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/support" element={<SupportSearchPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;

