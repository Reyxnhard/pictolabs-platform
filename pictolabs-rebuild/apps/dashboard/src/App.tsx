import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/auth/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { BoothsPage } from './pages/BoothsPage';
import { SessionsPage } from './pages/SessionsPage';
import { GalleryPage } from './pages/GalleryPage';
import { SupportSearchPage } from './pages/SupportSearchPage';
import { ProvisioningTestPage } from './pages/ProvisioningTestPage';
import { useAuthStore } from './stores/useAuthStore';

export const App: React.FC = () => {
  const initializeAuth = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public Login & Test Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/provisioning-test" element={<ProvisioningTestPage />} />


          {/* Protected Operational Dashboard Routes */}
          <Route
            path="/*"
            element={
              <RequireAuth>
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
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
