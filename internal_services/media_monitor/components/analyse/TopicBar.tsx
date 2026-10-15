import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TopicBarProps {
  topic: { name: string; percentage: number; trend: string };
  rank: number;
}

export function TopicBar({ topic, rank }: TopicBarProps) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-subtle)] px-2 rounded-md transition-colors duration-150">
      <div className="w-[20px] text-center text-[12px] font-bold text-[var(--text-muted)]">
        #{rank}
      </div>
      <div className="w-[120px] shrink-0 text-[13px] font-medium text-[var(--text-primary)] truncate">
        {topic.name}
      </div>
      <div className="flex-1 h-[6px] bg-[var(--bg-subtle)] rounded-full overflow-hidden flex items-center">
        <div 
          className="h-full bg-[var(--bar-2)] rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${topic.percentage}%` }}
        />
      </div>
      <div className="w-[40px] text-right text-[12px] font-bold text-[var(--text-primary)] tabular-nums">
        {topic.percentage === 0 ? "-" : `${topic.percentage}%`}
      </div>
      <div className="w-[20px] flex justify-center shrink-0">
        {topic.trend === "up" ? (
          <TrendingUp size={14} className="text-[var(--up)]" />
        ) : topic.trend === "down" ? (
          <TrendingDown size={14} className="text-[var(--down)]" />
        ) : (
          <Minus size={14} className="text-[var(--neutral)]" />
        )}
      </div>
    </div>
  );
}
