"use client";

import React, { useState, useRef, useEffect, MouseEvent as ReactMouseEvent } from "react";
import styles from "./SemanticMap.module.css";
import { MapCoordinate } from "@/services/mapService";
import { Plus, Minus, RotateCcw, Info, RefreshCw, Loader2, Layers } from "lucide-react";

interface SemanticMapProps {
  data: MapCoordinate[];
  onGenerate: () => Promise<any>;
  title: string;
}

const PROJECTIONS = [
  { value: "canonical", label: "Canonical (Balanced)" },
  { value: "narrative", label: "Narrative & Framing" },
  { value: "ideology", label: "Ideological Posture" },
  { value: "network", label: "Network & Interactions" },
  { value: "coordination", label: "Behavioral Coordination" },
  { value: "topic_focus", label: "Topic Focus Only" }
];

export default function SemanticMap({ data, onGenerate, title }: SemanticMapProps) {
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
      <div className={styles.mapContainer}>
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>No Semantic Map Data</h3>
          <p>Generate coordinates to view the {title} profile clusters.</p>
          <button 
            className={styles.generateBtn} 
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
      className={styles.mapContainer}
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Floating Info Badge */}
      <div className={styles.infoOverlay}>
        <Info size={13} />
        <span>Drag to Pan • Scroll or Use buttons to Zoom</span>
      </div>

      {/* Mode Switcher & Controls */}
      <div className={styles.controlsGroup} style={{ flexDirection: "column", gap: "0.5rem" }}>
        {isGlobalMap && (
          <div className={styles.projectionSelectWrapper}>
            <Layers size={16} className="text-gray-400" />
            <select 
              value={selectedProjection} 
              onChange={(e) => setSelectedProjection(e.target.value)}
              className={styles.projectionSelect}
            >
              {PROJECTIONS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button 
            type="button" 
            onClick={handleGenerateClick} 
            className={styles.controlBtn}
            title="Regenerate Map"
            disabled={isGenerating}
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin text-blue-500" /> : <RefreshCw size={16} />}
          </button>
          <button 
            type="button" 
            onClick={handleZoomIn} 
            className={styles.controlBtn}
            title="Zoom In"
          >
            <Plus size={18} />
          </button>
          <button 
            type="button" 
            onClick={handleZoomOut} 
            className={styles.controlBtn}
            title="Zoom Out"
          >
            <Minus size={18} />
          </button>
          <button 
            type="button" 
            onClick={handleResetZoom} 
            className={styles.controlBtn}
            title="Reset Zoom"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Floating Legend Overlay */}
      <div className={styles.legendOverlay}>
        <div className={styles.legendTitle}>{title} Space</div>
        <p className={styles.legendText}>{getLegendDescription()}</p>
        
        {isGlobalMap ? (
          <div className={styles.legendList}>
            <div className={styles.legendItem}>
              <span className={styles.legendColor} style={{ background: "var(--accent)" }} />
              <span>Cluster Focus</span>
            </div>
          </div>
        ) : (
          <div className={styles.legendList}>
            <div className={styles.legendItem}>
              <span className={styles.legendColor} style={{ background: "var(--up)" }} />
              <span>Supportive Stance</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendColor} style={{ background: "var(--down)" }} />
              <span>Opposing Stance</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendColor} style={{ background: "var(--accent)" }} />
              <span>Neutral/Unaligned</span>
            </div>
          </div>
        )}
      </div>

      <svg 
        className={styles.svgMap} 
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
          {filteredData.map((node) => (
            <circle
              key={node.id}
              cx={normalizeX(node.x)}
              cy={normalizeY(node.y)}
              r={16 / transform.scale}
              fill={`url(#pattern-${mapId}-${node.id})`}
              stroke={getColor(node)}
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
              className={styles.profilePoint}
              onMouseEnter={() => setHoveredNode(node)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => {
                window.open(`https://twitter.com/${node.username}`, "_blank");
              }}
              style={{ transition: 'cx 0.8s ease-in-out, cy 0.8s ease-in-out' }}
            />
          ))}
        </g>
      </svg>

      <div 
        className={`${styles.hoverCard} ${hoveredNode ? "" : styles.hidden}`}
        style={{ left: hoverPos.x, top: hoverPos.y }}
      >
        {hoveredNode && (
          <>
            <div className={styles.hoverHeader}>
              <img 
                src={hoveredNode.profile_image_url || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"} 
                alt={hoveredNode.display_name} 
                className={styles.avatar} 
                onError={(e) => { e.currentTarget.src = "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png" }}
              />
              <div>
                <h4 className={styles.name}>{hoveredNode.display_name}</h4>
                <p className={styles.username}>@{hoveredNode.username}</p>
              </div>
            </div>
            {hoveredNode.relevance_score !== undefined && (
              <div className={styles.statsGrid}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Relevance</span>
                  <span className={`${styles.statValue} ${styles.statRelevance}`}>
                    {(hoveredNode.relevance_score * 100).toFixed(1)}%
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Supportive</span>
                  <span className={`${styles.statValue} ${styles.statSupportive}`}>
                    {(hoveredNode.supportive_score! * 100).toFixed(1)}%
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Opposition</span>
                  <span className={`${styles.statValue} ${styles.statOpposition}`}>
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
