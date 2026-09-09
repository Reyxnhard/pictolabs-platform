import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Monitor, Film, Image as ImageIcon, ShieldCheck, LifeBuoy } from 'lucide-react';
import { useSocketStore } from '../../stores/socketStore';

export const Sidebar: React.FC = () => {
  const isConnected = useSocketStore((state) => state.isConnected);

  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/booths', label: 'Booths Fleet', icon: Monitor },
    { to: '/sessions', label: 'Sessions Archive', icon: Film },
    { to: '/gallery', label: 'Gallery & Delivery', icon: ImageIcon },
    { to: '/support', label: 'Support & Search', icon: LifeBuoy },
  ];

  return (
    <aside className="w-64 bg-slate-950/80 backdrop-blur-xl border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div>
        <div className="p-6 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20 font-['Outfit',sans-serif] text-lg">
              P
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-wider text-white font-['Outfit',sans-serif]">
                  PICTOLABS
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                OPERATIONS
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600/20 to-purple-600/10 text-white border border-indigo-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer System Status & Owner Avatar */}
      <div className="p-4 border-t border-slate-800/80 space-y-3">
        {/* Real-time Gateway status */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
          <span className="text-slate-400">Gateway Pulse</span>
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold ${
              isConnected ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            {isConnected ? 'LIVE SYNC' : 'CONNECTING'}
          </span>
        </div>

        {/* Owner Profile */}
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-900/40">
          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-indigo-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-white truncate">Owner Admin</p>
            <p className="text-[10px] text-slate-400 font-mono truncate">Fleet Superadmin</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
