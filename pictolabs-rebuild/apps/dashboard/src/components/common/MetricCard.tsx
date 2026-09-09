import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'emerald' | 'rose' | 'orange' | 'indigo' | 'slate';
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'indigo',
  onClick,
}) => {
  const variantStyles = {
    emerald: {
      border: 'hover:border-emerald-500/40 border-emerald-500/20',
      iconBg: 'bg-emerald-500/15 text-emerald-400',
      accentGlow: 'from-emerald-500/10 to-transparent',
    },
    rose: {
      border: 'hover:border-rose-500/40 border-rose-500/20',
      iconBg: 'bg-rose-500/15 text-rose-400',
      accentGlow: 'from-rose-500/10 to-transparent',
    },
    orange: {
      border: 'hover:border-orange-500/40 border-orange-500/20',
      iconBg: 'bg-orange-500/15 text-orange-400',
      accentGlow: 'from-orange-500/10 to-transparent',
    },
    indigo: {
      border: 'hover:border-indigo-500/40 border-indigo-500/20',
      iconBg: 'bg-indigo-500/15 text-indigo-400',
      accentGlow: 'from-indigo-500/10 to-transparent',
    },
    slate: {
      border: 'hover:border-slate-500/40 border-slate-700/40',
      iconBg: 'bg-slate-700/40 text-slate-300',
      accentGlow: 'from-slate-500/10 to-transparent',
    },
  }[variant];

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl bg-slate-900/60 backdrop-blur-xl border p-6 transition-all duration-300 shadow-xl ${
        variantStyles.border
      } ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-indigo-500/5' : ''}`}
    >
      <div className={`absolute -right-6 -top-6 w-28 h-28 rounded-full bg-gradient-to-br ${variantStyles.accentGlow} pointer-events-none blur-xl`} />
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {title}
          </p>
          <div className="text-3xl font-extrabold text-white font-['Outfit',sans-serif] tracking-tight">
            {value}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-400 font-medium">
              {subtitle}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${variantStyles.iconBg}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
