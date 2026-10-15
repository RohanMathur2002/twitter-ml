"use client";

import { AtSign } from "lucide-react";

interface TopMentionsListProps {
  mentions: Array<{
    mention: string;
    count: number;
  }>;
}

export function TopMentionsList({ mentions }: TopMentionsListProps) {
  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
    return num.toLocaleString();
  };

  const maxCount = mentions.length > 0 ? mentions[0].count : 1;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] p-6 rounded-2xl shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
        <h4 className="text-[16px] font-bold text-[var(--text-primary)] flex items-center gap-2">
          <AtSign className="w-4 h-4 text-[var(--accent)]" />
          Top Mentioned Accounts
        </h4>
        <span className="text-[12px] text-[var(--text-secondary)]">In keyword discourse</span>
      </div>

      {mentions.length === 0 ? (
        <div className="text-[13px] text-[var(--text-muted)] py-6 text-center">
          No mentions found.
        </div>
      ) : (
        <div className="flex flex-col gap-3 pt-2">
          {mentions.map((m, idx) => (
            <div key={m.mention} className="relative group">
              <div className="flex items-center justify-between z-10 relative px-2">
                <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                  @{m.mention}
                </span>
                <span className="text-[13px] font-bold text-[var(--text-secondary)]">
                  {formatNumber(m.count)}
                </span>
              </div>
              <div className="absolute top-1/2 -translate-y-1/2 left-0 h-[28px] bg-[var(--accent)]/10 rounded-md -z-0 transition-all duration-500 ease-out group-hover:bg-[var(--accent)]/20"
                style={{ width: `${Math.max((m.count / maxCount) * 100, 2)}%` }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
