import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SupportSearchResult, SupportSearchQuery } from '../types/support';
import type { SessionListItem } from '../types/session';
import type { Booth } from '../types/booth';
import { supportApi } from '../services/supportApi';
import { boothsApi } from '../services/boothsApi';
import { SessionDetailModal } from '../components/sessions/SessionDetailModal';
import { Pagination } from '../components/common/Pagination';
import {
  Search,
  Mail,
  Phone,
  CreditCard,
  Calendar,
  Clock,
  RotateCcw,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
} from 'lucide-react';

export const SupportSearchPage: React.FC = () => {
  const navigate = useNavigate();

  // Search filter states
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [orderId, setOrderId] = useState('');
  const [boothId, setBoothId] = useState('ALL');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [page, setPage] = useState(1);

  // Booth options
  const [booths, setBooths] = useState<Booth[]>([]);

  // Results state
  const [results, setResults] = useState<SupportSearchResult[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Selected session for detail modal
  const [selectedSession, setSelectedSession] = useState<SessionListItem | null>(null);

  useEffect(() => {
    boothsApi.getBooths().then(setBooths).catch(console.error);
  }, []);

  const performSearch = useCallback(async () => {
    setIsLoading(true);
    try {
      const query: SupportSearchQuery = {
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        orderId: orderId.trim() || undefined,
        boothId: boothId !== 'ALL' ? boothId : undefined,
        date: date || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        page,
        limit: 8,
      };

      const res = await supportApi.searchSupport(query);
      setResults(res.results);
      setTotalPages(res.pagination.totalPages);
      setTotalResults(res.pagination.total);
    } catch (err) {
      console.error('Support search failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [email, phone, orderId, boothId, date, startTime, endTime, page]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  const handleReset = () => {
    setEmail('');
    setPhone('');
    setOrderId('');
    setBoothId('ALL');
    setDate('');
    setStartTime('');
    setEndTime('');
    setPage(1);
  };

  const getHealthBadge = (health: SupportSearchResult['health']) => {
    switch (health.healthStatus) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> HEALTHY
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" /> DEGRADED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> FAILED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
            <HelpCircle className="w-3 h-3" /> {health.healthStatus}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight font-['Outfit',sans-serif]">
          Omni-Channel Customer Support Search
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Instantly lookup sessions by customer email, phone, Midtrans Order ID, or approximate time window.
        </p>
      </div>

      {/* Multi-Parameter Search Panel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-6 shadow-xl space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-indigo-400" /> Customer Email
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. user@gmail.com"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition font-sans"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-400" /> Customer Phone / WhatsApp
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. 081288..."
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition font-sans"
            />
          </div>

          {/* Order ID */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-purple-400" /> Midtrans Order ID / Ref
            </label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. PICTO-ORDER-... / txn_..."
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition font-sans"
            />
          </div>
        </div>

        {/* Venue & Time Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-800/80">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
              Photobooth
            </label>
            <select
              value={boothId}
              onChange={(e) => {
                setBoothId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500 transition font-sans"
            >
              <option value="ALL">All Photobooths</option>
              {booths.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.branch?.name || 'Grand Indonesia'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500 transition font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Start Time (WIB)
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500 transition font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> End Time (WIB)
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500 transition font-sans"
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs font-mono text-slate-400">
            Found <strong className="text-white">{totalResults}</strong> matching session(s)
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
            </button>
            <button
              type="button"
              onClick={performSearch}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition"
            >
              <Search className="w-3.5 h-3.5" /> Search
            </button>
          </div>
        </div>
      </div>

      {/* Results Grid with Visual Photostrip Thumbnails */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-500 space-y-2">
            <Clock className="w-6 h-6 mx-auto animate-spin text-indigo-400" />
            <p>Scanning customer sessions and health indexes...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500 bg-slate-900/30 rounded-2xl border border-slate-800">
            No matching sessions found for the specified search criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {results.map((session) => (
              <div
                key={session.id}
                className="group relative rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl p-4 shadow-xl hover:border-slate-700/80 transition flex flex-col justify-between space-y-4"
              >
                {/* Visual Composite Thumbnail Banner */}
                <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800/80 flex items-center justify-center">
                  {session.thumbnailUrl ? (
                    <img
                      src={session.thumbnailUrl}
                      alt={`Session ${session.id}`}
                      className="w-full h-full object-cover object-top group-hover:scale-105 transition duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-center p-4 space-y-1 text-slate-600">
                      <ImageIcon className="w-8 h-8 mx-auto" />
                      <span className="text-[10px] font-mono">No Preview Strip</span>
                    </div>
                  )}

                  {/* Health status badge overlay */}
                  <div className="absolute top-2 left-2 shadow-md">
                    {getHealthBadge(session.health)}
                  </div>
                </div>

                {/* Session Card Info */}
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="font-mono text-[11px] font-bold text-indigo-300 block truncate">
                      {session.id}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {session.boothName} • {session.branchName}
                    </p>
                  </div>

                  {/* Customer Contact Identifiers */}
                  <div className="space-y-1 pt-2 border-t border-slate-800/60 text-[11px] font-mono">
                    {session.customerEmail && (
                      <p className="text-slate-300 truncate flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span>{session.customerEmail}</span>
                      </p>
                    )}
                    {session.customerPhone && (
                      <p className="text-slate-300 truncate flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{session.customerPhone}</span>
                      </p>
                    )}
                    {session.orderId && (
                      <p className="text-slate-400 truncate flex items-center gap-1.5">
                        <CreditCard className="w-3 h-3 text-purple-400 shrink-0" />
                        <span className="truncate">{session.orderId}</span>
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500">
                      {new Date(session.createdAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB •{' '}
                      {new Date(session.createdAt).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                </div>

                {/* Remediation & Inspector Buttons */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedSession({
                        id: session.id,
                        boothId: session.boothId,
                        boothName: session.boothName,
                        branchId: session.branchId,
                        branchName: session.branchName,
                        status: session.status,
                        customerEmail: session.customerEmail,
                        customerPhone: session.customerPhone,
                        photoCount: session.photoCount,
                        printCount: session.printCount,
                        createdAt: session.createdAt,
                        updatedAt: session.createdAt,
                      })
                    }
                    className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition text-center"
                  >
                    Timeline & Support
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/gallery?sessionId=${session.id}`)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                    title="View Customer Gallery"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pt-4">
            <Pagination
              pagination={{
                page,
                limit: 8,
                total: totalResults,
                totalPages,
              }}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {/* Detailed Timeline and Health Modal */}
      {selectedSession && (
        <SessionDetailModal
          sessionItem={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  );
};
