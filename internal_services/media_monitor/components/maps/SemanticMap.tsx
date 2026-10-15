"use client";

import React, { useState, useRef, useEffect, MouseEvent as ReactMouseEvent } from "react";
import { MapCoordinate } from "@/services/mapService";
import { Plus, Minus, RotateCcw, Info, RefreshCw, Loader2, Layers } from "lucide-react";

interface SemanticMapProps {
  data: MapCoordinate[];
  onGenerate: () => Promise<any>;
  title: string;
  selectedUsername?: string;
  onSelectNode?: (node: MapCoordinate) => void;
}

const PROJECTIONS = [
  { value: "canonical", label: "Canonical (Balanced)" },
  { value: "narrative", label: "Narrative & Framing" },
  { value: "ideology", label: "Ideological Posture" },
  { value: "network", label: "Network & Interactions" },
  { value: "coordination", label: "Behavioral Coordination" },
  { value: "topic_focus", label: "Topic Focus Only" }
];

export default function SemanticMap({ data, onGenerate, title, selectedUsername, onSelectNode }: SemanticMapProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<MapCoordinate | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedProjection, setSelectedProjection] = useState("canonical");

  // SVG Pan/Zoom state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Compute boundaries to normalize coordinates
  const [bounds, setBounds] = useState({ minX: 0, maxX: 1, minY: 0, maxY: 1 });

  const isGlobalMap = title.toLowerCase().includes("global");

  // Filter data based on projection mode (Topic Maps don't have projections, so they pass through)
  const filteredData = React.useMemo(() => {
    return data.filter(d => !d.projection_type || d.projection_type === selectedProjection);
  }, [data, selectedProjection]);

  useEffect(() => {
    if (filteredData && filteredData.length > 0) {
      const xs = filteredData.map((d) => d.x);
      const ys = filteredData.map((d) => d.y);
      const margin = 1.0;
      setBounds({
        minX: Math.min(...xs) - margin,
        maxX: Math.max(...xs) + margin,
        minY: Math.min(...ys) - margin,
        maxY: Math.max(...ys) + margin,
      });
    }
  }, [filteredData]);

  const handleGenerateClick = async () => {
    setIsGenerating(true);
    try {
      await onGenerate();
    } finally {
      setIsGenerating(false);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const scaleAdjust = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.5, Math.min(prev.scale * scaleAdjust, 5)),
    }));
  };

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    } else if (hoveredNode && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setHoverPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredNode(null);
  };

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full min-h-[350px] relative rounded-xl border border-[var(--border)] overflow-hidden shadow-[inset_0_0_30px_rgba(0,0,0,0.04)] bg-gradient-radial from-blue-600/5 to-[var(--bg-surface)]">
        <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
          <h3 className="text-lg text-[var(--text-primary)] mb-2">No Semantic Map Data</h3>
          <p>Generate coordinates to view the {title} profile clusters.</p>
          <button
            className="mt-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white border-none py-2.5 px-5 rounded-lg font-semibold cursor-pointer transition-all duration-200 shadow-[0_4px_14px_rgba(37,99,235,0.4)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(37,99,235,0.6)] active:translate-y-0"
            onClick={handleGenerateClick}
            disabled={isGenerating}
          >
            {isGenerating ? "Generating..." : "Generate Map"}
          </button>
        </div>
      </div>
    );
  }

  // Coordinate normalization mapping to [0, 1000] for SVG viewBox
  const viewBoxSize = 1000;
  const normalizeX = (val: number) => ((val - bounds.minX) / (bounds.maxX - bounds.minX || 1)) * viewBoxSize;
  const normalizeY = (val: number) => ((val - bounds.minY) / (bounds.maxY - bounds.minY || 1)) * viewBoxSize;

  // Determine colors based on stats if available
  const getColor = (node: MapCoordinate) => {
    if (node.supportive_score !== undefined && node.opposition_score !== undefined) {
      if (node.supportive_score > node.opposition_score) return "var(--up)";
      if (node.opposition_score > node.supportive_score) return "var(--down)";
    }
    // Default color from a nice palette based on cluster_id
    const colors = [
      "var(--accent)", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#6366f1"
    ];
    return colors[(node.cluster_id || 0) % colors.length];
  };

  const handleZoomIn = () => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(prev.scale * 1.3, 5),
    }));
  };

  const handleZoomOut = () => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(prev.scale / 1.3, 0.5),
    }));
  };

  const handleResetZoom = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  const mapId = title.toLowerCase().replace(/[^a-z0-9]/g, "-");

  const getLegendDescription = () => {
    if (!isGlobalMap) {
      return "Stance distributions of profiles within the narrative.";
    }
    switch (selectedProjection) {
      case "canonical": return "Balanced overview. Distance implies diverse narrative focus.";
      case "narrative": return "Distance represents differences in vocabulary and framing.";
      case "ideology": return "Distance represents opposing stances on monitored topics.";
      case "network": return "Distance represents isolated interaction and amplification circles.";
      case "coordination": return "Clusters suggest tightly coordinated behavioral patterns.";
      case "topic_focus": return "Distance represents divergent topical interests.";
      default: return "Semantic distance mapping.";
    }
  };

  return (
    <div
      className={`w-full h-full min-h-[350px] relative rounded-xl ${isGlobalMap ? "" : "border border-[var(--border)]"} overflow-hidden shadow-[inset_0_0_30px_rgba(0,0,0,0.04)] bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.04)_0%,var(--bg-surface)_100%)] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Floating Info Badge */}
      <div className="absolute top-5 left-5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-full py-1 px-3 text-[11px] text-[var(--text-secondary)] shadow-[0_2px_8px_rgba(0,0,0,0.05)] flex items-center gap-1.5 pointer-events-none z-20 opacity-90">
        <Info size={13} />
        <span>Drag to Pan • Scroll or Use buttons to Zoom</span>
      </div>

      {/* Mode Switcher & Controls */}
      <div className="absolute bottom-5 right-5 flex flex-col gap-2 z-20">
        {isGlobalMap && (
          <div className="flex items-center gap-2 bg-[var(--bg-surface)] py-2 px-3 rounded-lg border border-[var(--border)] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
            <Layers size={16} className="text-gray-400" />
            <select
              value={selectedProjection}
              onChange={(e) => setSelectedProjection(e.target.value)}
              className="bg-transparent text-[var(--text-primary)] border-none outline-none cursor-pointer text-sm font-medium"
            >
              {PROJECTIONS.map(p => (
                <option key={p.value} value={p.value} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">{p.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={handleGenerateClick}
            className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] flex items-center justify-center cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-200 outline-none hover:bg-[var(--bg-hover)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:-translate-y-0.5 active:translate-y-0"
            title="Regenerate Map"
            disabled={isGenerating}
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin text-blue-500" /> : <RefreshCw size={16} />}
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] flex items-center justify-center cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-200 outline-none hover:bg-[var(--bg-hover)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:-translate-y-0.5 active:translate-y-0"
            title="Zoom In"
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] flex items-center justify-center cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-200 outline-none hover:bg-[var(--bg-hover)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:-translate-y-0.5 active:translate-y-0"
            title="Zoom Out"
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] flex items-center justify-center cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-200 outline-none hover:bg-[var(--bg-hover)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:-translate-y-0.5 active:translate-y-0"
            title="Reset Zoom"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Floating Legend Overlay */}
      <div className="absolute bottom-5 left-5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg py-3 px-4 w-[240px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] z-20 flex flex-col gap-1">
        <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">{title} Space</div>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-1">{getLegendDescription()}</p>

        {isGlobalMap ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <span className="w-2 h-2 rounded-full shrink-0 bg-[var(--accent)]" />
              <span>Cluster Focus</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <span className="w-2 h-2 rounded-full shrink-0 bg-[var(--up)]" />
              <span>Supportive Stance</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <span className="w-2 h-2 rounded-full shrink-0 bg-[var(--down)]" />
              <span>Opposing Stance</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <span className="w-2 h-2 rounded-full shrink-0 bg-[var(--accent)]" />
              <span>Neutral/Unaligned</span>
            </div>
          </div>
        )}
      </div>

      <svg
        className="w-full h-full transition-transform duration-100 ease-out"
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern
            id={`grid-${mapId}`}
            width="100"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            {/* Fine grid lines */}
            <path
              d="M 20 0 L 20 100 M 40 0 L 40 100 M 60 0 L 60 100 M 80 0 L 80 100 M 0 20 L 100 20 M 0 40 L 100 40 M 0 60 L 100 60 M 0 80 L 100 80"
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="0.5"
              opacity="0.5"
            />
            {/* Major grid lines */}
            <path
              d="M 100 0 L 0 0 0 100"
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
              opacity="0.8"
            />
          </pattern>
          {filteredData.map((node) => (
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
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Infinite-like background grid that pans and zooms */}
          <rect
            x="-5000"
            y="-5000"
            width="10000"
            height="10000"
            fill={`url(#grid-${mapId})`}
            pointerEvents="none"
          />
          {/* Center Axes */}
          <line
            x1="-5000"
            y1="500"
            x2="5000"
            y2="500"
            stroke="var(--accent)"
            strokeWidth="1"
            opacity="0.25"
            strokeDasharray="5 5"
            pointerEvents="none"
          />
          <line
            x1="500"
            y1="-5000"
            x2="500"
            y2="5000"
            stroke="var(--accent)"
            strokeWidth="1"
            opacity="0.25"
            strokeDasharray="5 5"
            pointerEvents="none"
          />
          {filteredData.map((node) => {
            const isSelected = !!selectedUsername && (
              node.username.toLowerCase() === selectedUsername.toLowerCase() ||
              (node.display_name && node.display_name.toLowerCase().includes(selectedUsername.toLowerCase()))
            );

            const cx = normalizeX(node.x);
            const cy = normalizeY(node.y);
            const r = (isSelected ? 22 : 16) / transform.scale;

            return (
              <g key={node.id}>
                {isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={30 / transform.scale}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={4 / transform.scale}
                    className="animate-pulse"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={`url(#pattern-${mapId}-${node.id})`}
                  stroke={isSelected ? "var(--accent)" : getColor(node)}
                  strokeWidth={isSelected ? 4.5 : 3}
                  vectorEffect="non-scaling-stroke"
                  className="transition-all duration-300 origin-center cursor-pointer hover:scale-[1.4] hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.6)] hover:stroke-[4.5px]"
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => {
                    if (onSelectNode) {
                      onSelectNode(node);
                    } else {
                      window.open(`https://twitter.com/${node.username}`, "_blank");
                    }
                  }}
                  style={{ transition: 'cx 0.8s ease-in-out, cy 0.8s ease-in-out', transformBox: 'fill-box' }}
                />
              </g>
            );
          })}
        </g>
      </svg>

      <div
        className={`absolute pointer-events-none bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4 min-w-[220px] text-[var(--text-primary)] z-10 -translate-x-1/2 -translate-y-[120%] transition-all duration-200 shadow-[0_10px_30px_rgba(0,0,0,0.12)] opacity-95 backdrop-blur-md ${hoveredNode ? "" : "opacity-0 -translate-y-[110%] scale-95 hidden"}`}
        style={{ left: hoverPos.x, top: hoverPos.y }}
      >
        {hoveredNode && (
          <>
            <div className="flex items-center gap-3 mb-3 border-b border-[var(--border-subtle)] pb-3">
              <img
                src={hoveredNode.profile_image_url || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"}
                alt={hoveredNode.display_name}
                className="w-10 h-10 rounded-full object-cover border-2 border-[var(--border)]"
                onError={(e) => { e.currentTarget.src = "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png" }}
              />
              <div>
                <h4 className="font-semibold text-sm m-0 text-[var(--text-primary)]">{hoveredNode.display_name}</h4>
                <p className="text-xs text-[var(--text-secondary)] m-0">@{hoveredNode.username}</p>
              </div>
            </div>
            {hoveredNode.relevance_score !== undefined && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase text-[var(--text-muted)] tracking-wider">Relevance</span>
                  <span className="text-[13px] font-medium text-[var(--accent)]">
                    {(hoveredNode.relevance_score * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase text-[var(--text-muted)] tracking-wider">Supportive</span>
                  <span className="text-[13px] font-medium text-[var(--up)]">
                    {(hoveredNode.supportive_score! * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase text-[var(--text-muted)] tracking-wider">Opposition</span>
                  <span className="text-[13px] font-medium text-[var(--down)]">
                    {(hoveredNode.opposition_score! * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
