import React from 'react';
import type { SessionStatus } from '../../types/session';

interface LifecycleBadgeProps {
  status: SessionStatus;
  className?: string;
  size?: 'sm' | 'md';
}

export const LifecycleBadge: React.FC<LifecycleBadgeProps> = ({
  status,
  className = '',
  size = 'md',
}) => {
  const norm = String(status || '').toUpperCase();

  // Color mapping with graceful fallback for unknown/custom strings
  let bgBorderText = 'bg-slate-800/80 text-slate-300 border-slate-700/60';
  let dotColor = 'bg-slate-400';

  if (norm === 'COMPLETED' || norm === 'PRINTED' || norm === 'READY') {
    bgBorderText = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    dotColor = 'bg-emerald-400';
  } else if (norm === 'PRINTING') {
    bgBorderText = 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    dotColor = 'bg-sky-400 animate-pulse';
  } else if (norm === 'CAPTURING' || norm === 'CAPTURED') {
    bgBorderText = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    dotColor = 'bg-amber-400';
  } else if (norm === 'PAID') {
    bgBorderText = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    dotColor = 'bg-indigo-400';
  } else if (norm === 'PAYMENT_PENDING' || norm === 'PENDING_PAYMENT' || norm === 'PENDING') {
    bgBorderText = 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30';
    dotColor = 'bg-yellow-400 animate-pulse';
  } else if (norm === 'PROCESSING' || norm === 'UPLOADING') {
    bgBorderText = 'bg-teal-500/15 text-teal-300 border-teal-500/30';
    dotColor = 'bg-teal-400 animate-pulse';
  } else if (norm === 'CREATED' || norm === 'INITIATED') {
    bgBorderText = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    dotColor = 'bg-purple-400';
  } else if (norm === 'FAILED' || norm === 'ERROR' || norm === 'CANCELLED') {
    bgBorderText = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    dotColor = 'bg-rose-400';
  }

  const sizeClasses = size === 'sm' ? 'text-[10px] px-2 py-0.5 gap-1.5' : 'text-xs px-2.5 py-1 gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-md border font-mono tracking-wider uppercase font-medium ${sizeClasses} ${bgBorderText} ${className}`}
      title={`Status: ${status}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status || 'UNKNOWN'}
    </span>
  );
};
