import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw, Clock } from 'lucide-react';
import { useSocketStore } from '../../stores/socketStore';

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onRefresh, isRefreshing = false }) => {
  const location = useLocation();
  const isConnected = useSocketStore((state) => state.isConnected);
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const getBreadcrumb = () => {
    switch (location.pathname) {
      case '/':
        return 'Overview';
      case '/booths':
        return 'Booths Fleet';
      case '/sessions':
        return 'Sessions Archive';
      case '/gallery':
        return 'Gallery & Digital Delivery';
      case '/support':
        return 'Support & Remediation';
      default:
        return 'Dashboard';
    }
  };

  return (
    <header className="h-16 px-8 bg-slate-950/60 backdrop-blur-xl border-b border-slate-800/80 flex items-center justify-between sticky top-0 z-40">
      {/* Title & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Operations
        </span>
        <span className="text-slate-600">/</span>
        <h1 className="text-sm font-bold text-white tracking-wide font-['Outfit',sans-serif]">
          {getBreadcrumb()}
        </h1>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        {/* Clock */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs font-mono text-slate-300">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>{timeStr || 'Loading...'}</span>
        </div>

        {/* Real-time indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-300 font-mono text-[11px]">
            {isConnected ? 'Socket Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Manual Refresh Button */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
            title="Refresh current page data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        )}
      </div>
    </header>
  );
};
