import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BoothsTable } from '../components/booths/BoothsTable';
import { BoothDetailDrawer } from '../components/booths/BoothDetailDrawer';
import { SearchInput } from '../components/common/SearchInput';
import type { Booth } from '../types/booth';
import { boothsApi } from '../services/boothsApi';
import { useSocketStore } from '../stores/socketStore';

export const BoothsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status') || 'ALL';

  const [booths, setBooths] = useState<Booth[]>([]);
  const [search, setSearch] = useState('');
  const [selectedBooth, setSelectedBooth] = useState<Booth | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to WebSocket status changes
  const updatesCount = useSocketStore((state) => state.updatesCount);

  const fetchBooths = useCallback(async () => {
    try {
      const data = await boothsApi.getBooths();
      setBooths(data);
      // Keep selectedBooth updated if drawer is open
      if (selectedBooth) {
        const updated = data.find((b) => b.id === selectedBooth.id);
        if (updated) setSelectedBooth(updated);
      }
    } catch (err) {
      console.error('Failed to load booths:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBooth?.id]);

  useEffect(() => {
    fetchBooths();
  }, [fetchBooths, updatesCount]);

  // Tab Filtering
  const filteredByTab = booths.filter((b) => {
    if (statusParam === 'ALL') return true;
    if (statusParam === 'MAINTENANCE') return b.isMaintenance || b.status === 'MAINTENANCE';
    if (statusParam === 'ONLINE') return b.status === 'ONLINE' && !b.isMaintenance;
    if (statusParam === 'DEGRADED') return b.status === 'DEGRADED' && !b.isMaintenance;
    if (statusParam === 'OFFLINE') return b.status === 'OFFLINE' && !b.isMaintenance;
    return true;
  });

  // Search Filtering
  const displayedBooths = filteredByTab.filter((b) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      b.name.toLowerCase().includes(query) ||
      (b.branch?.name && b.branch.name.toLowerCase().includes(query)) ||
      (b.machineName && b.machineName.toLowerCase().includes(query)) ||
      (b.localIp && b.localIp.includes(query))
    );
  });

  const tabs = [
    { id: 'ALL', label: 'All Booths', count: booths.length },
    { id: 'ONLINE', label: 'Online', count: booths.filter((b) => b.status === 'ONLINE' && !b.isMaintenance).length },
    { id: 'DEGRADED', label: 'Degraded', count: booths.filter((b) => b.status === 'DEGRADED' && !b.isMaintenance).length },
    { id: 'OFFLINE', label: 'Offline', count: booths.filter((b) => b.status === 'OFFLINE' && !b.isMaintenance).length },
    { id: 'MAINTENANCE', label: 'Maintenance', count: booths.filter((b) => b.isMaintenance || b.status === 'MAINTENANCE').length },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight font-['Outfit',sans-serif]">
            Booths Fleet Management
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Monitor real-time connectivity, runtime software platform versions, and toggle maintenance locks.
          </p>
        </div>

        {/* Search Bar */}
        <div className="w-full sm:w-80">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search booth, branch, IP, hostname..."
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800">
        {tabs.map((tab) => {
          const isActive = statusParam === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSearchParams(tab.id === 'ALL' ? {} : { status: tab.id })}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Booths Table */}
      <BoothsTable
        booths={displayedBooths}
        onInspect={(booth) => setSelectedBooth(booth)}
        isLoading={isLoading}
      />

      {/* Slide-out Detail & Maintenance Drawer */}
      <BoothDetailDrawer
        booth={selectedBooth}
        isOpen={Boolean(selectedBooth)}
        onClose={() => setSelectedBooth(null)}
        onStatusUpdated={fetchBooths}
      />
    </div>
  );
};
