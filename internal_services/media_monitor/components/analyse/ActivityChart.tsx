import { BarChart3 } from "lucide-react";

interface ActivityChartProps {
  data: { label: string; value: number }[];
}

export function ActivityChart({ data }: ActivityChartProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 1); // Avoid division by zero

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[var(--text-muted)] m-0">
          Activity Timeline
        </h2>
        <BarChart3 size={16} className="text-[var(--text-muted)]" />
      </div>
      <div className="flex items-end gap-1 h-[160px] pt-4 border-b border-[var(--border-subtle)]">
        {data.map((item, i) => {
          const heightPct = (item.value / maxVal) * 100;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end group relative min-w-0"
              title={`${item.label}: ${item.value}`}
            >
              <div 
                className="w-full bg-[var(--bar-1)] opacity-70 rounded-t-sm transition-all duration-200 hover:opacity-100 hover:bg-[var(--bar-2)]"
                style={{ height: `${heightPct === 0 ? 2 : heightPct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-3 px-1 text-[11px] text-[var(--text-muted)]">
        {data.map((item, i) => (
          <span key={i} className="text-center truncate" style={{ width: `${100 / data.length}%` }}>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
