import React, { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useSocketStore } from '../../stores/socketStore';

interface AppShellProps {
  children: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  onRefresh,
  isRefreshing,
}) => {
  const connect = useSocketStore((state) => state.connect);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className="flex min-h-screen bg-[#070b14] text-slate-100 selection:bg-indigo-500 selection:text-white antialiased font-['Inter',sans-serif]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onRefresh={onRefresh} isRefreshing={isRefreshing} />
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
