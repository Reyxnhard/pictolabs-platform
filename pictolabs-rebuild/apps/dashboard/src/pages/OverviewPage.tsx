import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { LifecycleBadge } from '../components/common/LifecycleBadge';
import type { Booth } from '../types/booth';
import type { SessionListItem, SessionTodayStats } from '../types/session';
import { boothsApi } from '../services/boothsApi';
import { sessionsApi } from '../services/sessionsApi';
import { useSocketStore } from '../stores/socketStore';
import { Monitor, AlertCircle, Wrench, Camera, ArrowRight, MapPin } from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [booths, setBooths] = useState<Booth[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);
  const [todayStats, setTodayStats] = useState<SessionTodayStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to real-time socket events
  const updatesCount = useSocketStore((state) => state.updatesCount);

  const fetchData = useCallback(async () => {
    try {
      const [boothData, sessionsData, statsData] = await Promise.all([
        boothsApi.getBooths(),
        sessionsApi.getSessions({ page: 1, limit: 5 }),
        sessionsApi.getTodayStats(),
      ]);
      setBooths(boothData);
      setRecentSessions(sessionsData.data);
      setTodayStats(statsData);
    } catch (err) {
      console.error('Failed to load overview data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, updatesCount]);

  // Compute KPI card counts
  const onlineCount = booths.filter((b) => b.status === 'ONLINE' && !b.isMaintenance).length;
  const offlineCount = booths.filter((b) => b.status === 'OFFLINE' && !b.isMaintenance).length;
  const maintenanceCount = booths.filter((b) => b.isMaintenance || b.status === 'MAINTENANCE').length;
  const sessionsCount = todayStats?.sessionsToday ?? recentSessions.length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Page Title & Status Subtitle */}
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight font-['Outfit',sans-serif]">
          Fleet Operations Overview
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Real-time health, connectivity, and session monitoring across all deployed photobooths.
        </p>
      </div>

      {/* 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          title="Online Booths"
          value={isLoading ? '...' : onlineCount}
          subtitle="< 60s heartbeat active"
          icon={Monitor}
          variant="emerald"
          onClick={() => navigate('/booths?status=ONLINE')}
        />
        <MetricCard
          title="Offline Booths"
          value={isLoading ? '...' : offlineCount}
          subtitle="> 5m heartbeat loss"
          icon={AlertCircle}
          variant="rose"
          onClick={() => navigate('/booths?status=OFFLINE')}
        />
        <MetricCard
          title="In Maintenance"
          value={isLoading ? '...' : maintenanceCount}
          subtitle="Administrative service lock"
          icon={Wrench}
          variant="orange"
          onClick={() => navigate('/booths?status=MAINTENANCE')}
        />
        <MetricCard
          title="Sessions Today"
          value={isLoading ? '...' : sessionsCount}
          subtitle="Captured since 00:00 WIB"
          icon={Camera}
          variant="indigo"
          onClick={() => navigate('/sessions')}
        />
      </div>

      {/* Grid: Fleet Snapshot & Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Fleet Snapshot */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl p-6 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Fleet Connectivity Snapshot
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Active photobooths ordered by heartbeat recency
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/booths')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
            >
              View All Booths <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-800/80">
            {booths.slice(0, 5).map((b) => (
              <div
                key={b.id}
                onClick={() => navigate(`/booths`)}
                className="py-3 flex items-center justify-between hover:bg-slate-800/30 px-2 rounded-xl transition cursor-pointer"
              >
                <div>
                  <p className="text-sm font-bold text-white font-['Outfit',sans-serif]">
                    {b.name}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                    <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span>{b.branch?.name || 'Grand Indonesia'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-400">
                    {b.appVersion ? `v${b.appVersion}` : 'v1.0.0'}
                  </span>
                  <StatusBadge status={b.status} isMaintenance={b.isMaintenance} size="sm" />
                </div>
              </div>
            ))}
            {booths.length === 0 && !isLoading && (
              <p className="py-6 text-center text-xs text-slate-500">No booths registered yet.</p>
            )}
          </div>
        </div>

        {/* Right: Recent Sessions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl p-6 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Recent Photo Sessions
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Latest customer engagements captured across booths
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/sessions')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
            >
              View All Sessions <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-800/80">
            {recentSessions.slice(0, 5).map((s) => (
              <div
                key={s.id}
                onClick={() => navigate(`/gallery?sessionId=${s.id}`)}
                className="py-3 flex items-center justify-between hover:bg-slate-800/30 px-2 rounded-xl transition cursor-pointer"
              >
                <div>
                  <p className="text-xs font-mono font-semibold text-indigo-300">
                    {s.id}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {s.boothName} • {new Date(s.createdAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <LifecycleBadge status={s.status} size="sm" />
                </div>
              </div>
            ))}
            {recentSessions.length === 0 && !isLoading && (
              <p className="py-6 text-center text-xs text-slate-500">No recent sessions recorded.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
