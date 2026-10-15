"use client";

import { useMemo } from "react";
import { Heart, Repeat2, MessageSquare, PieChart } from "lucide-react";

interface EngagementDistributionChartProps {
  likes: number;
  retweets: number;
  replies: number;
}

export function EngagementDistributionChart({
  likes,
  retweets,
  replies,
}: EngagementDistributionChartProps) {
  const total = likes + retweets + replies;

  const likesPct = total === 0 ? 0 : (likes / total) * 100;
  const retweetsPct = total === 0 ? 0 : (retweets / total) * 100;
  const repliesPct = total === 0 ? 0 : (replies / total) * 100;

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
    return num.toLocaleString();
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] p-6 rounded-2xl shadow-sm flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
        <PieChart className="w-5 h-5 text-[var(--accent)]" />
        <h3 className="text-[16px] font-bold text-[var(--text-primary)]">
          Engagement Distribution
        </h3>
      </div>

      {total === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <PieChart className="w-8 h-8 opacity-50" />
          <span className="text-[14px] font-medium">No engagement data</span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Segmented Progress Bar */}
          <div className="relative w-full h-4 rounded-full flex overflow-hidden bg-[var(--bg-subtle)] shadow-inner">
            {likes > 0 && (
              <div
                style={{ width: `${likesPct}%` }}
                className="h-full bg-rose-500 transition-all duration-1000 ease-out hover:brightness-110"
                title={`Likes: ${formatNumber(likes)}`}
              />
            )}
            {retweets > 0 && (
              <div
                style={{ width: `${retweetsPct}%` }}
                className="h-full bg-emerald-500 transition-all duration-1000 ease-out hover:brightness-110"
                title={`Retweets: ${formatNumber(retweets)}`}
              />
            )}
            {replies > 0 && (
              <div
                style={{ width: `${repliesPct}%` }}
                className="h-full bg-sky-500 transition-all duration-1000 ease-out hover:brightness-110"
                title={`Replies: ${formatNumber(replies)}`}
              />
            )}
          </div>

          {/* Legend & Details */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)]/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center">
                  <Heart className="w-4 h-4" />
                </div>
                <span className="text-[14px] font-semibold text-[var(--text-primary)]">Likes</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[14px] font-bold text-rose-500">{formatNumber(likes)}</span>
                <span className="text-[12px] font-medium text-[var(--text-muted)] w-10 text-right">
                  {likesPct.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)]/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Repeat2 className="w-4 h-4" />
                </div>
                <span className="text-[14px] font-semibold text-[var(--text-primary)]">Retweets</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[14px] font-bold text-emerald-500">{formatNumber(retweets)}</span>
                <span className="text-[12px] font-medium text-[var(--text-muted)] w-10 text-right">
                  {retweetsPct.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)]/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-500 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <span className="text-[14px] font-semibold text-[var(--text-primary)]">Replies</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[14px] font-bold text-sky-500">{formatNumber(replies)}</span>
                <span className="text-[12px] font-medium text-[var(--text-muted)] w-10 text-right">
                  {repliesPct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
