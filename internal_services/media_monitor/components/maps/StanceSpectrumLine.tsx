"use client";

import React, { useState, useRef, useMemo, MouseEvent as ReactMouseEvent } from "react";
import { MapCoordinate } from "@/services/mapService";
import { Info, ExternalLink } from "lucide-react";

interface StanceSpectrumLineProps {
  data: MapCoordinate[];
  title: string;
  selectedUsername?: string;
  onSelectNode?: (node: MapCoordinate) => void;
}

export default function StanceSpectrumLine({ data, title, selectedUsername, onSelectNode }: StanceSpectrumLineProps) {
  const [hoveredNode, setHoveredNode] = useState<MapCoordinate | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const viewBoxWidth = 1000;
  const viewBoxHeight = 340;
  const axisY = 280;

  // Process and position nodes cleanly along the stance line
  const processedNodes = useMemo(() => {
    return data.map((d, index) => {
      const support = d.supportive_score !== undefined ? Number(d.supportive_score) : 0;
      const opposition = d.opposition_score !== undefined ? Number(d.opposition_score) : 0;
      const relevance = d.relevance_score !== undefined ? Number(d.relevance_score) : 0.5;
      
      // Net stance ranges from -1.0 (100% Opposition) to +1.0 (100% Support)
      const netStance = support - opposition;

      // X coordinate along the horizontal axis (from x=100 for -1.0 to x=900 for +1.0)
      const x = 500 + (netStance * 400);

      // Y coordinate based on topic relevance (from y=250 for 0% relevance to y=60 for 100% relevance)
      // Plus a subtle stagger offset so avatars don't collide when stance/relevance scores are identical
      const staggerOffset = ((index * 37) % 24) - 12;
      const y = Math.max(50, Math.min(255, 250 - (relevance * 190) + staggerOffset));

      let stanceColor = "var(--accent)";
      if (netStance > 0.05) stanceColor = "var(--up)";
      else if (netStance < -0.05) stanceColor = "var(--down)";

      const isSelected = !!selectedUsername && (
        d.username.toLowerCase() === selectedUsername.toLowerCase() ||
        (d.display_name && d.display_name.toLowerCase().includes(selectedUsername.toLowerCase()))
      );

      return {
        ...d,
        netStance,
        support,
        opposition,
        relevance,
        x,
        y,
        stanceColor,
        isSelected
      };
    });
  }, [data, selectedUsername]);

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (hoveredNode && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setHoverPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredNode(null);
  };

  if (!data || data.length === 0) {
    return (
      <div className="w-full min-h-[260px] rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] flex flex-col items-center justify-center text-center p-8 gap-3">
        <div className="w-12 h-12 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)]">
          <Info size={24} />
        </div>
        <h4 className="text-base font-bold text-[var(--text-primary)] m-0">No Stance Intelligence Available</h4>
        <p className="text-xs text-[var(--text-secondary)] max-w-md m-0">
          Run profile analysis for <strong>{title}</strong> using the Profile Explorer below to populate their stance scores on this spectrum line.
        </p>
      </div>
    );
  }

  const mapId = `stance-line-${title.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  return (
    <div
      className="w-full h-[360px] relative rounded-xl border border-[var(--border)] overflow-hidden shadow-[inset_0_0_30px_rgba(0,0,0,0.02)] bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.03)_0%,var(--bg-surface)_100%)] select-none"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Summary Badge */}
      <div className="absolute top-3.5 left-3.5 bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--border)] rounded-xl py-2 px-3.5 shadow-sm z-10 flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-red-400 font-semibold">Opposition ({processedNodes.filter(n => n.netStance < -0.05).length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
          <span className="text-[var(--text-secondary)] font-semibold">Neutral ({processedNodes.filter(n => Math.abs(n.netStance) <= 0.05).length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-emerald-400 font-semibold">Supportive ({processedNodes.filter(n => n.netStance > 0.05).length})</span>
        </div>
      </div>

      <svg
        className="w-full h-full"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={`grad-axis-${mapId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="10%" stopColor="#ef4444" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.4" />
            <stop offset="90%" stopColor="#10b981" stopOpacity="0.85" />
          </linearGradient>

          {processedNodes.map((node) => (
            <pattern
              key={`pattern-${mapId}-${node.id}`}
              id={`pattern-${mapId}-${node.id}`}
              x="0"
              y="0"
              height="100%"
              width="100%"
              patternContentUnits="objectBoundingBox"
            >
              <image
                x="0"
                y="0"
                height="1"
                width="1"
                preserveAspectRatio="xMidYMid slice"
                href={node.profile_image_url || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"}
                onError={(e) => {
                  e.currentTarget.setAttribute("href", "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png");
                }}
              />
            </pattern>
          ))}
        </defs>

        {/* Background relevance level guides */}
        <line x1="100" y1="70" x2="900" y2="70" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
        <text x="88" y="73" textAnchor="end" fontSize="10" fill="var(--text-muted)" fontWeight="600">High Rel</text>

        <line x1="100" y1="165" x2="900" y2="165" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
        <text x="88" y="168" textAnchor="end" fontSize="10" fill="var(--text-muted)" fontWeight="600">Mid Rel</text>

        {/* Center Neutral Line (Vertical) */}
        <line x1="500" y1="40" x2="500" y2={axisY + 24} stroke="var(--border)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
        <text x="500" y="32" textAnchor="middle" fontSize="11" fill="var(--text-secondary)" fontWeight="700" letterSpacing="0.05em">
          NEUTRAL / BALANCED
        </text>

        {/* Main Horizontal Stance Axis Bar */}
        <rect x="100" y={axisY - 4} width="800" height="8" rx="4" fill={`url(#grad-axis-${mapId})`} />
        <line x1="100" y1={axisY} x2="900" y2={axisY} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

        {/* Tick marks along horizontal stance axis */}
        <g transform={`translate(0, ${axisY})`}>
          {/* -100% Opposition */}
          <line x1="100" y1="-8" x2="100" y2="12" stroke="#ef4444" strokeWidth="2" />
          <text x="100" y="26" textAnchor="middle" fontSize="11" fill="#ef4444" fontWeight="700">-100% Opposition</text>

          {/* -50% */}
          <line x1="300" y1="-5" x2="300" y2="8" stroke="var(--border)" strokeWidth="1.5" />
          <text x="300" y="22" textAnchor="middle" fontSize="10" fill="var(--text-muted)">-50%</text>

          {/* 0% Neutral */}
          <line x1="500" y1="-8" x2="500" y2="12" stroke="var(--border)" strokeWidth="2" />
          <text x="500" y="26" textAnchor="middle" fontSize="11" fill="var(--text-secondary)" fontWeight="700">0%</text>

          {/* +50% */}
          <line x1="700" y1="-5" x2="700" y2="8" stroke="var(--border)" strokeWidth="1.5" />
          <text x="700" y="22" textAnchor="middle" fontSize="10" fill="var(--text-muted)">+50%</text>

          {/* +100% Support */}
          <line x1="900" y1="-8" x2="900" y2="12" stroke="#10b981" strokeWidth="2" />
          <text x="900" y="26" textAnchor="middle" fontSize="11" fill="#10b981" fontWeight="700">+100% Support</text>
        </g>

        {/* Drop lines and Node Avatars */}
        {processedNodes.map((node) => (
          <g key={node.id} className="group">
            {/* Vertical Drop Line to Stance Axis */}
            <line
              x1={node.x}
              y1={node.y}
              x2={node.x}
              y2={axisY - 4}
              stroke={node.stanceColor}
              strokeWidth={1.5}
              strokeDasharray="2 2"
              opacity="0.45"
              className="transition-all duration-200 group-hover:opacity-100 group-hover:strokeWidth-2"
            />

            {/* Stance Anchor Dot on Axis */}
            <circle
              cx={node.x}
              cy={axisY}
              r="4"
              fill={node.stanceColor}
              className="transition-all duration-200 group-hover:scale-150"
            />

            {/* Profile Avatar Circle */}
            {node.isSelected && (
              <circle
                cx={node.x}
                cy={node.y}
                r="24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
                className="animate-pulse"
              />
            )}
            <circle
              cx={node.x}
              cy={node.y}
              r={node.isSelected ? 19 : 16}
              fill={`url(#pattern-${mapId}-${node.id})`}
              stroke={node.isSelected ? "var(--accent)" : node.stanceColor}
              strokeWidth={node.isSelected ? 4 : 3}
              className="transition-all duration-200 origin-center cursor-pointer hover:scale-[1.3] hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.7)] hover:stroke-[4px]"
              onMouseEnter={() => setHoveredNode(node)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => {
                if (onSelectNode) {
                  onSelectNode(node);
                } else {
                  window.open(`https://twitter.com/${node.username}`, "_blank");
                }
              }}
            />
          </g>
        ))}
      </svg>

      {/* Hover Dossier Tooltip */}
      <div
        className={`absolute pointer-events-none bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3.5 min-w-[240px] text-[var(--text-primary)] z-30 -translate-x-1/2 -translate-y-[120%] transition-all duration-150 shadow-xl opacity-95 backdrop-blur-md ${
          hoveredNode ? "" : "opacity-0 -translate-y-[110%] scale-95 hidden"
        }`}
        style={{ left: hoverPos.x, top: hoverPos.y }}
      >
        {hoveredNode && (
          <>
            <div className="flex items-center justify-between gap-3 mb-2.5 border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center gap-2.5">
                <img
                  src={hoveredNode.profile_image_url || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"}
                  alt={hoveredNode.display_name}
                  className="w-9 h-9 rounded-full object-cover border-2 border-[var(--border)]"
                  onError={(e) => {
                    e.currentTarget.src = "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png";
                  }}
                />
                <div>
                  <h4 className="font-semibold text-xs m-0 text-[var(--text-primary)] flex items-center gap-1.5">
                    {hoveredNode.display_name}
                  </h4>
                  <p className="text-[11px] text-[var(--text-secondary)] m-0">@{hoveredNode.username}</p>
                </div>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                <ExternalLink size={13} />
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs bg-[var(--bg-subtle)] py-1 px-2.5 rounded-lg border border-[var(--border)]">
                <span className="font-semibold text-[var(--text-secondary)]">Net Stance</span>
                <span
                  className="font-bold text-xs"
                  style={{
                    color:
                      (hoveredNode as any).netStance > 0.05
                        ? "var(--up)"
                        : (hoveredNode as any).netStance < -0.05
                        ? "var(--down)"
                        : "var(--accent)"
                  }}
                >
                  {((hoveredNode as any).netStance > 0 ? "+" : "") +
                    ((hoveredNode as any).netStance * 100).toFixed(1)}
                  %
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 mt-0.5">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-[var(--text-muted)] font-bold tracking-wider">Support</span>
                  <span className="text-xs font-semibold text-[var(--up)]">
                    {(((hoveredNode as any).support || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-[var(--text-muted)] font-bold tracking-wider">Opposition</span>
                  <span className="text-xs font-semibold text-[var(--down)]">
                    {(((hoveredNode as any).opposition || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-[var(--text-muted)] font-bold tracking-wider">Relevance</span>
                  <span className="text-xs font-semibold text-[var(--accent)]">
                    {(((hoveredNode as any).relevance || 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
