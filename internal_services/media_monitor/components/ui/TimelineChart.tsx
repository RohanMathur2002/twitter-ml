"use client";

import { useState } from "react";

interface TimelinePoint {
  label: string;
  value: number;
}

interface TimelineChartProps {
  data: TimelinePoint[];
  title?: string;
  icon?: React.ReactNode;
  emptyMessage?: string;
  lineColor?: string;
  fillColor?: string;
}

export function TimelineChart({
  data,
  title,
  icon,
  emptyMessage = "No data available",
  lineColor = "#3b82f6", // blue-500
  fillColor = "rgba(59, 130, 246, 0.1)", // blue-500 with opacity
}: TimelineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 800;
  const height = 240;
  const paddingLeft = 10;
  const paddingRight = 10;
  const paddingTop = 20;
  const paddingBottom = 40;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxVal = Math.max(...data.map((d) => d.value), 1); // Avoid division by zero
  // Add some padding to top scale
  const scaleMax = maxVal * 1.2;

  const generateLinePath = () => {
    if (data.length === 0) return "";

    const points = data.map((pt, index) => {
      const x = paddingLeft + (data.length === 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth);
      const y = paddingTop + chartHeight - (pt.value / scaleMax) * chartHeight;
      return [x, y] as [number, number];
    });

    if (points.length === 1) {
      return `M ${points[0][0]} ${points[0][1]} L ${points[0][0] + 1} ${points[0][1]}`;
    }

    let d = `M ${points[0][0]} ${points[0][1]}`;
    // Simple smooth curve approximation
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(i + 2, points.length - 1)];

      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      let cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      let cp2y = p2[1] - (p3[1] - p1[1]) / 6;

      const minY = paddingTop;
      const maxY = paddingTop + chartHeight;
      cp1y = Math.max(minY, Math.min(maxY, cp1y));
      cp2y = Math.max(minY, Math.min(maxY, cp2y));

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };

  const linePath = generateLinePath();
  
  const generateAreaPath = () => {
    if (!linePath || data.length === 0) return "";
    const firstX = paddingLeft;
    const lastX = paddingLeft + chartWidth;
    const bottomY = paddingTop + chartHeight;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (data.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const normalizedX = (mouseX / rect.width) * width;
    const relX = Math.max(0, Math.min(chartWidth, normalizedX - paddingLeft));
    const idx = Math.round((relX / chartWidth) * Math.max(data.length - 1, 1));
    setHoverIndex(Math.min(data.length - 1, Math.max(0, idx)));
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] p-6 rounded-2xl shadow-sm flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-4 h-14">
        {title && (
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-[16px] font-bold text-[var(--text-primary)]">
              {title}
            </h3>
          </div>
        )}
        
        <div className="flex items-center justify-end min-w-[200px]">
          {hoverIndex !== null && data.length > 0 ? (
            <div className="flex items-center gap-3 text-right">
              <span className="text-[14px] font-medium text-[var(--text-secondary)]">{data[hoverIndex].label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold text-[var(--text-primary)]">
                  {data[hoverIndex].value.toLocaleString()}
                </span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lineColor }} />
              </div>
            </div>
          ) : (
            <span className="text-[13px] text-[var(--text-muted)] italic">Hover over the chart to see details</span>
          )}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <span className="text-[14px] font-medium">{emptyMessage}</span>
        </div>
      ) : (
        <div className="relative w-full h-[240px]">
          <svg 
            viewBox={`0 0 ${width} ${height}`} 
            className="w-full h-full overflow-visible"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {/* Area */}
            <path
              d={generateAreaPath()}
              fill={fillColor}
              className="transition-all duration-300"
            />
            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-sm transition-all duration-300"
            />
            
            {/* Hover Crosshair */}
            {hoverIndex !== null && data.length > 0 && (
              <g>
                <line
                  x1={paddingLeft + (data.length === 1 ? chartWidth / 2 : (hoverIndex / (data.length - 1)) * chartWidth)}
                  y1={paddingTop}
                  x2={paddingLeft + (data.length === 1 ? chartWidth / 2 : (hoverIndex / (data.length - 1)) * chartWidth)}
                  y2={paddingTop + chartHeight}
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  className="text-[var(--border)]"
                />
                <circle
                  cx={paddingLeft + (data.length === 1 ? chartWidth / 2 : (hoverIndex / (data.length - 1)) * chartWidth)}
                  cy={paddingTop + chartHeight - (data[hoverIndex].value / scaleMax) * chartHeight}
                  r="5"
                  fill="white"
                  stroke={lineColor}
                  strokeWidth="2"
                  className="transition-all duration-150 shadow-sm"
                />
              </g>
            )}

            {/* X Axis Labels */}
            {data.map((pt, idx) => {
              // Show label only for a few points to prevent crowding
              const showLabel = data.length < 10 || idx === 0 || idx === data.length - 1 || idx === Math.floor(data.length / 2);
              if (!showLabel) return null;
              
              const x = paddingLeft + (data.length === 1 ? chartWidth / 2 : (idx / (data.length - 1)) * chartWidth);
              
              return (
                <text
                  key={idx}
                  x={x}
                  y={height - 10}
                  textAnchor={idx === 0 ? "start" : idx === data.length - 1 ? "end" : "middle"}
                  className="text-[12px] fill-[var(--text-secondary)] font-medium"
                >
                  {pt.label}
                </text>
              );
            })}
          </svg>

          {/* Removed Tooltip Overlay */}
        </div>
      )}
    </div>
  );
}
