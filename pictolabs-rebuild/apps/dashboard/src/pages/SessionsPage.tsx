import React, { useState, useEffect, useCallback } from 'react';
import { SessionsTable } from '../components/sessions/SessionsTable';
import { SessionFilterBar } from '../components/sessions/SessionFilterBar';
import { SessionDetailModal } from '../components/sessions/SessionDetailModal';
import { Pagination } from '../components/common/Pagination';
import type { SessionListItem, SessionPagination } from '../types/session';
import type { Booth } from '../types/booth';
import { sessionsApi } from '../services/sessionsApi';
import { boothsApi } from '../services/boothsApi';

export const SessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [pagination, setPagination] = useState<SessionPagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  // Filter state
  const [search, setSearch] = useState('');
  const [boothId, setBoothId] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [datePreset, setDatePreset] = useState('ALL');
  const [selectedSession, setSelectedSession] = useState<SessionListItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch registered booths for filter dropdown
  useEffect(() => {
    boothsApi
      .getBooths()
      .then((data: Booth[]) => setBooths(data))
      .catch((err: unknown) => console.error('Failed to load booths for filter:', err));
  }, []);

  const calculateDateParam = (preset: string) => {
    if (preset === 'ALL') return undefined;
    const now = new Date();
    const wibOffsetMs = 7 * 60 * 60 * 1000;
    const wibNow = new Date(now.getTime() + wibOffsetMs);

    if (preset === 'TODAY') {
      return wibNow.toISOString().split('T')[0];
    }
    if (preset === 'YESTERDAY') {
      const yest = new Date(wibNow.getTime() - 24 * 60 * 60 * 1000);
      return yest.toISOString().split('T')[0];
    }
    return undefined;
  };

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const dateParam = calculateDateParam(datePreset);
      const res = await sessionsApi.getSessions({
        search: search.trim() || undefined,
        boothId: boothId !== 'ALL' ? boothId : undefined,
        status: status !== 'ALL' ? status : undefined,
        date: dateParam,
        page: pagination.page,
        limit: pagination.limit,
      });
      setSessions(res.data);
      setPagination(res.pagination);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, boothId, status, datePreset, pagination.page, pagination.limit]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleResetFilters = () => {
    setSearch('');
    setBoothId('ALL');
    setStatus('ALL');
    setDatePreset('ALL');
    setPagination((prev: SessionPagination) => ({ ...prev, page: 1 }));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight font-['Outfit',sans-serif]">
          Customer Sessions Archive
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Complete operational audit trail of customer capture sessions across all venues.
        </p>
      </div>

      {/* Filter Bar */}
      <SessionFilterBar
        search={search}
        onSearchChange={(val: string) => {
          setSearch(val);
          setPagination((prev: SessionPagination) => ({ ...prev, page: 1 }));
        }}
        boothId={boothId}
        onBoothChange={(val: string) => {
          setBoothId(val);
          setPagination((prev: SessionPagination) => ({ ...prev, page: 1 }));
        }}
        status={status}
        onStatusChange={(val: string) => {
          setStatus(val);
          setPagination((prev: SessionPagination) => ({ ...prev, page: 1 }));
        }}
        datePreset={datePreset}
        onDatePresetChange={(val: string) => {
          setDatePreset(val);
          setPagination((prev: SessionPagination) => ({ ...prev, page: 1 }));
        }}
        booths={booths}
        onReset={handleResetFilters}
      />

      {/* Sessions Table with embedded Pagination */}
      <div className="space-y-0">
        <SessionsTable
          sessions={sessions}
          onSelectSession={(sess) => setSelectedSession(sess)}
          isLoading={isLoading}
        />
        <Pagination
          pagination={pagination}
          onPageChange={(newPage: number) =>
            setPagination((prev: SessionPagination) => ({ ...prev, page: newPage }))
          }
        />
      </div>

      {/* Detail Modal */}
      <SessionDetailModal
        sessionItem={selectedSession}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  );
};
