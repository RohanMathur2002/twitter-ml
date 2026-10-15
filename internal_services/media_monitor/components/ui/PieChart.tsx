"use client";

import { useState } from "react";

interface PieChartData {
  label: string;
  value: number;
  color?: string;
  icon?: string;
}

interface PieChartProps {
  data: PieChartData[];
  title?: string;
  icon?: React.ReactNode;
  emptyMessage?: string;
}

const DEFAULT_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", 
  "#ec4899", "#06b6d4", "#14b8a6", "#f97316", "#6366f1"
];

export function PieChart({ 
  data, 
  title, 
  icon, 
  emptyMessage = "No data available" 
}: PieChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  function getCoordinatesForPercent(percent: number) {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  }

  interface Slice {
    item: PieChartData;
    percent: number;
    start: number;
    end: number;
    index: number;
  }

  // Calculate start and end percentages for each slice
  const slices = data.reduce((acc, item, index) => {
    const percent = item.value / total;
    const start = index === 0 ? 0 : acc[index - 1].end;
    const end = start + percent;
    acc.push({ item, percent, start, end, index });
    return acc;
  }, [] as Slice[]);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] p-6 rounded-2xl shadow-sm flex flex-col gap-6">
      {title && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
          {icon}
          <h3 className="text-[16px] font-bold text-[var(--text-primary)]">
            {title}
          </h3>
        </div>
      )}

      {total === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <span className="text-[14px] font-medium">{emptyMessage}</span>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="relative w-48 h-48 shrink-0">
            {/* SVG Pie Chart */}
            <svg viewBox="-1 -1 2 2" className="w-full h-full transform -rotate-90 filter drop-shadow-md">
              {slices.map(({ item, percent, start, end, index }) => {
                const color = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
                const isHovered = hoverIndex === index;
                
                if (percent === 1) {
                  return (
                    <circle
                      key={item.label}
                      cx="0"
                      cy="0"
                      r="1"
                      fill={color}
                      className="transition-all duration-300 ease-out cursor-pointer"
                      onMouseEnter={() => setHoverIndex(index)}
                      onMouseLeave={() => setHoverIndex(null)}
                      style={{ opacity: hoverIndex !== null && !isHovered ? 0.3 : 1 }}
                    />
                  );
                }

                const [startX, startY] = getCoordinatesForPercent(start);
                const [endX, endY] = getCoordinatesForPercent(end);
                const largeArcFlag = percent > 0.5 ? 1 : 0;
                const pathData = [
                  `M ${startX} ${startY}`,
                  `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                  `L 0 0`,
                ].join(' ');

                return (
                  <path
                    key={item.label}
                    d={pathData}
                    fill={color}
                    className={`transition-all duration-300 ease-out cursor-pointer hover:scale-105 transform origin-center`}
                    onMouseEnter={() => setHoverIndex(index)}
                    onMouseLeave={() => setHoverIndex(null)}
                    style={{ 
                      opacity: hoverIndex !== null && !isHovered ? 0.3 : 1,
                      transform: isHovered ? 'scale(1.05)' : 'scale(1)'
                    }}
                  />
                );
              })}
              
              {/* Inner Circle for Donut Chart effect */}
              <circle cx="0" cy="0" r="0.6" className="fill-[var(--bg-surface)]" />
            </svg>
            
            {/* Center Info Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {hoverIndex !== null ? (
                <>
                  <span className="text-[12px] text-[var(--text-secondary)] font-medium text-center truncate w-24">
                    {data[hoverIndex].label}
                  </span>
                  <span className="text-[18px] font-bold text-[var(--text-primary)]">
                    {((data[hoverIndex].value / total) * 100).toFixed(0)}%
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[12px] text-[var(--text-secondary)] font-medium">Total</span>
                  <span className="text-[18px] font-bold text-[var(--text-primary)]">{total}</span>
                </>
              )}
            </div>
          </div>
          
          {/* Legend */}
          <div className="flex-1 flex flex-col gap-3 w-full">
            {data.map((item, index) => {
              const color = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
              const percentage = ((item.value / total) * 100).toFixed(1);
              const isHovered = hoverIndex === index;
              
              return (
                <div 
                  key={item.label} 
                  className={`flex items-center justify-between text-[14px] p-2 rounded-lg transition-colors cursor-pointer
                    ${isHovered ? 'bg-[var(--bg-subtle)]' : 'hover:bg-[var(--bg-subtle)]'}`}
                  onMouseEnter={() => setHoverIndex(index)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-3 h-3 rounded-full shrink-0" 
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-medium text-[var(--text-primary)] truncate max-w-[150px]">
                      {item.icon} {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[var(--text-secondary)]">{item.value}</span>
                    <span className="font-bold text-[var(--text-primary)] w-12 text-right">
                      {percentage}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
