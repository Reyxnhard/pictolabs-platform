import React from 'react';
import type { ComputedStatus } from '../../types/booth';

interface StatusBadgeProps {
  status: ComputedStatus | string;
  isMaintenance?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  isMaintenance = false,
  className = '',
  size = 'md',
}) => {
  const effective = isMaintenance ? 'MAINTENANCE' : status.toUpperCase();

  let badgeStyles = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  let dotStyles = 'bg-rose-500';
  let label = 'OFFLINE';

  if (effective === 'ONLINE') {
    badgeStyles = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    dotStyles = 'bg-emerald-500 animate-pulse';
    label = 'ONLINE';
  } else if (effective === 'DEGRADED') {
    badgeStyles = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    dotStyles = 'bg-amber-500 animate-pulse';
    label = 'DEGRADED';
  } else if (effective === 'MAINTENANCE') {
    badgeStyles = 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    dotStyles = 'bg-orange-500';
    label = 'MAINTENANCE';
  }

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-2 font-medium',
    lg: 'text-sm px-3.5 py-1.5 gap-2.5 font-semibold',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full border tracking-wide uppercase font-mono ${sizeClasses} ${badgeStyles} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles}`} />
      {label}
    </span>
  );
};
