"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { TrendingUp, Loader2, Calendar, Activity, BarChart2 } from "lucide-react";

interface TimelinePoint {
  period: string;
  posts: number;
  original_posts: number;
  reply_posts: number;
  retweet_posts: number;
  likes: number;
  comments: number;
  reposts: number;
  views: number;
}

interface EngagementTimelineChartProps {
  username: string;
}

type TimeRange = "30d" | "90d" | "1y" | "all" | "custom";
type Granularity = "day" | "week" | "month";

export function EngagementTimelineChart({ username }: EngagementTimelineChartProps) {
  const [range, setRange] = useState<TimeRange>("90d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [data, setData] = useState<TimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Engagement Metric toggles
  const [showLikes, setShowLikes] = useState(true);
  const [showComments, setShowComments] = useState(true);
  const [showReposts, setShowReposts] = useState(true);
  const [showViews, setShowViews] = useState(false);

  // Publishing Cadence Metric toggles
  const [showPosts, setShowPosts] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [showRetweets, setShowRetweets] = useState(false);

  // Hover state for interactive crosshair
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Granularity is adjusted when range changes via onClick handlers

  useEffect(() => {
    if (!username) return;

    let cancelled = false;
    async function fetchTimeline() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          username,
          range,
          granularity,
        });
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);

        const res = await fetch(`/api/analyse/timeline?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load timeline");
        const json = await res.json();
        if (!cancelled && json.timeline) {
          const parsedTimeline = json.timeline.map((pt: TimelinePoint) => ({
            ...pt,
            likes: Number(pt.likes || 0),
            comments: Number(pt.comments || 0),
            reposts: Number(pt.reposts || 0),
            views: Number(pt.views || 0),
            posts: Number(pt.posts || 0),
            original_posts: Number(pt.original_posts || 0),
            reply_posts: Number(pt.reply_posts || 0),
            retweet_posts: Number(pt.retweet_posts || 0),
          }));
          setData(parsedTimeline);
        }
      } catch (err) {
        console.error("Timeline load error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTimeline();
    return () => {
      cancelled = true;
    };
  }, [username, range, granularity, startDate, endDate]);

  // Aggregate totals
  const totals = useMemo(() => {
    return data.reduce(
      (acc, pt) => ({
        likes: acc.likes + pt.likes,
        comments: acc.comments + pt.comments,
        reposts: acc.reposts + pt.reposts,
        views: acc.views + (pt.views || 0),
        posts: acc.posts + pt.posts,
        original_posts: acc.original_posts + (pt.original_posts || 0),
        reply_posts: acc.reply_posts + (pt.reply_posts || 0),
        retweet_posts: acc.retweet_posts + (pt.retweet_posts || 0),
      }),
      {
        likes: 0,
        comments: 0,
        reposts: 0,
        views: 0,
        posts: 0,
        original_posts: 0,
        reply_posts: 0,
        retweet_posts: 0,
      }
    );
  }, [data]);

  const hasEngagementActive = showLikes || showComments || showReposts || showViews;
  const hasPostsActive = showPosts || showOriginal || showReplies || showRetweets;

  // Find max values for dual Y-axis scaling
  const maxEngagement = useMemo(() => {
    if (data.length === 0) return 10;
    let max = 0;
    data.forEach((pt) => {
      if (showLikes && pt.likes > max) max = pt.likes;
      if (showComments && pt.comments > max) max = pt.comments;
      if (showReposts && pt.reposts > max) max = pt.reposts;
      if (showViews && (pt.views || 0) > max) max = pt.views || 0;
    });
    return Math.max(max, 10);
  }, [data, showLikes, showComments, showReposts, showViews]);

  const maxPosts = useMemo(() => {
    if (data.length === 0) return 5;
    let max = 0;
    data.forEach((pt) => {
      if (showPosts && pt.posts > max) max = pt.posts;
      if (showOriginal && (pt.original_posts || 0) > max) max = pt.original_posts || 0;
      if (showReplies && (pt.reply_posts || 0) > max) max = pt.reply_posts || 0;
      if (showRetweets && (pt.retweet_posts || 0) > max) max = pt.retweet_posts || 0;
    });
    return Math.max(max, 5);
  }, [data, showPosts, showOriginal, showReplies, showRetweets]);

  const leftScaleMax = hasEngagementActive ? maxEngagement : maxPosts;
  const rightScaleMax = hasEngagementActive && hasPostsActive ? maxPosts : null;

  // SVG dimensions
  const width = 800;
  const height = 300;
  const paddingLeft = 54;
  const paddingRight = rightScaleMax ? 48 : 16;
  const paddingTop = 20;
  const paddingBottom = 34;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const generatePath = (metric: keyof TimelinePoint, scaleMax: number) => {
    if (data.length === 0) return "";

    const points = data.map((pt, index) => {
      const x = paddingLeft + (data.length === 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth);
      const val = Number(pt[metric] || 0);
      const y = paddingTop + chartHeight - (val / scaleMax) * chartHeight;
      return [x, y] as [number, number];
    });

    if (points.length === 1) {
      return `M ${points[0][0]} ${points[0][1]} L ${points[0][0] + 1} ${points[0][1]}`;
    }

    let d = `M ${points[0][0]} ${points[0][1]}`;
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

  const generateAreaPath = (linePath: string) => {
    if (!linePath || data.length === 0) return "";
    const firstX = paddingLeft;
    const lastX = paddingLeft + chartWidth;
    const bottomY = paddingTop + chartHeight;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
    return num.toLocaleString();
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (granularity === "month") {
        return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
      }
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    } catch {
      return dateStr;
    }
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

  const hoveredPoint = hoverIndex !== null ? data[hoverIndex] : null;
  const hoverX =
    hoverIndex !== null && data.length > 0
      ? paddingLeft + (data.length === 1 ? chartWidth / 2 : (hoverIndex / (data.length - 1)) * chartWidth)
      : 0;

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="card p-6">
      {/* Header controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="text-base font-extrabold text-[var(--text-primary)]">
              Activity Timeline
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Time Range Selector */}
          <div className="flex items-center bg-[var(--bg-subtle)]/50 p-1 rounded-xl border border-[var(--border-subtle)]">
            {(["30d", "90d", "1y", "all"] as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRange(r);
                  setStartDate("");
                  setEndDate("");
                  if (r === "30d" || r === "90d") setGranularity("day");
                  else if (r === "1y") setGranularity("week");
                  else if (r === "all") setGranularity("month");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${range === r && !startDate && !endDate
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
              >
                {r === "30d" ? "30 Days" : r === "90d" ? "90 Days" : r === "1y" ? "1 Year" : "All Time"}
              </button>
            ))}
          </div>

          {/* Custom Date Range Controls */}
          <div className="flex items-center gap-2 bg-[var(--bg-subtle)]/40 px-3 py-1 rounded-xl border border-[var(--border-subtle)]">
            <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[var(--text-muted)] font-medium">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setRange("custom");
                }}
                className="bg-transparent text-[var(--text-primary)] font-semibold text-xs border-0 focus:outline-none cursor-pointer"
              />
              <span className="text-[var(--text-muted)] font-medium">To</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setRange("custom");
                }}
                className="bg-transparent text-[var(--text-primary)] font-semibold text-xs border-0 focus:outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Granularity Selector */}
          <div className="flex items-center bg-[var(--bg-subtle)]/50 p-1 rounded-xl border border-[var(--border-subtle)]">
            {(["day", "week", "month"] as Granularity[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${granularity === g
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Engagement Metric Toggle Chips */}
      <div className="mt-5">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5 text-[#F59E0B]" /> Engagement Metrics (Left Y-Axis)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setShowLikes(!showLikes)}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${showLikes
              ? "bg-[var(--bg-subtle)]/70 border-[#F59E0B]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-50 hover:opacity-80"
              }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#F59E0B] shadow-[0_0_8px_#F59E0B88]" />
              <span className="text-xs font-bold text-[var(--text-secondary)]">Likes</span>
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(totals.likes)}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${showComments
              ? "bg-[var(--bg-subtle)]/70 border-[#10B981]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-50 hover:opacity-80"
              }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B98188]" />
              <span className="text-xs font-bold text-[var(--text-secondary)]">Comments</span>
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(totals.comments)}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowReposts(!showReposts)}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${showReposts
              ? "bg-[var(--bg-subtle)]/70 border-[#8B5CF6]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-50 hover:opacity-80"
              }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#8B5CF6] shadow-[0_0_8px_#8B5CF688]" />
              <span className="text-xs font-bold text-[var(--text-secondary)]">Reposts</span>
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(totals.reposts)}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowViews(!showViews)}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${showViews
              ? "bg-[var(--bg-subtle)]/70 border-[#38BDF8]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-50 hover:opacity-80"
              }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#38BDF8] shadow-[0_0_8px_#38BDF888]" />
              <span className="text-xs font-bold text-[var(--text-secondary)]">Views</span>
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(totals.views)}</span>
          </button>
        </div>
      </div>

      {/* Publishing Cadence Toggle Chips */}
      <div className="mt-4 mb-5">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#F43F5E]" /> Publishing Metrics (Right Y-Axis)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setShowPosts(!showPosts)}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${showPosts
              ? "bg-[var(--bg-subtle)]/70 border-[#F43F5E]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-50 hover:opacity-80"
              }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#F43F5E] shadow-[0_0_8px_#F43F5E88]" />
              <span className="text-xs font-bold text-[var(--text-secondary)]">Total Posts</span>
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(totals.posts)}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowOriginal(!showOriginal)}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${showOriginal
              ? "bg-[var(--bg-subtle)]/70 border-[#3B82F6]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-50 hover:opacity-80"
              }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#3B82F6] shadow-[0_0_8px_#3B82F688]" />
              <span className="text-xs font-bold text-[var(--text-secondary)]">Original</span>
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">
              {formatNumber(totals.original_posts)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowReplies(!showReplies)}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${showReplies
              ? "bg-[var(--bg-subtle)]/70 border-[#EC4899]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-50 hover:opacity-80"
              }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#EC4899] shadow-[0_0_8px_#EC489988]" />
              <span className="text-xs font-bold text-[var(--text-secondary)]">Replies</span>
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">
              {formatNumber(totals.reply_posts)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowRetweets(!showRetweets)}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${showRetweets
              ? "bg-[var(--bg-subtle)]/70 border-[#D946EF]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-50 hover:opacity-80"
              }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#D946EF] shadow-[0_0_8px_#D946EF88]" />
              <span className="text-xs font-bold text-[var(--text-secondary)]">Retweets</span>
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">
              {formatNumber(totals.retweet_posts)}
            </span>
          </button>
        </div>
      </div>

      {/* SVG Interactive Dual-Axis Line Chart */}
      <div className="relative w-full overflow-hidden select-none" ref={chartRef}>
        {loading ? (
          <div className="h-[300px] w-full flex flex-col items-center justify-center gap-3 bg-[var(--bg-subtle)]/30 rounded-xl">
            <Loader2 className="w-7 h-7 text-[var(--accent)] animate-spin" />
            <span className="text-xs font-bold text-[var(--text-muted)]">Loading interactive time series...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="h-[300px] w-full flex flex-col items-center justify-center gap-2 bg-[var(--bg-subtle)]/30 rounded-xl">
            <Calendar className="w-8 h-8 text-[var(--text-muted)] opacity-50" />
            <span className="text-sm font-bold text-[var(--text-secondary)]">No timeline data found for this range</span>
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto overflow-visible cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id="gradViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradLikes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradComments" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradReposts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradPosts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradOriginal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradReplies" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EC4899" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#EC4899" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradRetweets" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D946EF" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#D946EF" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid Lines & Left/Right Axis Labels */}
              {ticks.map((t, idx) => {
                const y = paddingTop + chartHeight * (1 - t);
                const leftVal = Math.round(leftScaleMax * t);
                const rightVal = rightScaleMax ? Math.round(rightScaleMax * t) : null;
                return (
                  <g key={idx}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={width - paddingRight}
                      y2={y}
                      stroke="var(--border-subtle)"
                      strokeDasharray={idx === 0 ? "none" : "3 3"}
                    />
                    {/* Left Axis (Engagement scale) */}
                    <text
                      x={paddingLeft - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      fill="var(--text-muted)"
                      fontSize="10"
                      fontWeight="600"
                    >
                      {formatNumber(leftVal)}
                    </text>
                    {/* Right Axis (Publishing scale) */}
                    {rightVal !== null && (
                      <text
                        x={width - paddingRight + 8}
                        y={y + 3.5}
                        textAnchor="start"
                        fill="#F43F5E"
                        fontSize="10"
                        fontWeight="600"
                      >
                        {formatNumber(rightVal)}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* X Axis Date Labels */}
              {data.map((pt, i) => {
                const step = Math.max(1, Math.floor(data.length / 6));
                const isFirst = i === 0;
                const isLast = i === data.length - 1;
                const isStepTick = i % step === 0 && data.length - 1 - i >= Math.max(1, Math.floor(step * 0.7));
                if (!isFirst && !isLast && !isStepTick) return null;
                const x = paddingLeft + (data.length === 1 ? chartWidth / 2 : (i / (data.length - 1)) * chartWidth);
                return (
                  <text
                    key={i}
                    x={x}
                    y={height - 10}
                    textAnchor="middle"
                    fill="var(--text-muted)"
                    fontSize="10"
                    fontWeight="600"
                  >
                    {formatDateLabel(pt.period)}
                  </text>
                );
              })}

              {/* Curves - Publishing Cadence (scaled to right scale if active) */}
              {showRetweets && (
                <>
                  <path
                    d={generateAreaPath(generatePath("retweet_posts", rightScaleMax || leftScaleMax))}
                    fill="url(#gradRetweets)"
                  />
                  <path
                    d={generatePath("retweet_posts", rightScaleMax || leftScaleMax)}
                    fill="none"
                    stroke="#D946EF"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}
              {showReplies && (
                <>
                  <path
                    d={generateAreaPath(generatePath("reply_posts", rightScaleMax || leftScaleMax))}
                    fill="url(#gradReplies)"
                  />
                  <path
                    d={generatePath("reply_posts", rightScaleMax || leftScaleMax)}
                    fill="none"
                    stroke="#EC4899"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}
              {showOriginal && (
                <>
                  <path
                    d={generateAreaPath(generatePath("original_posts", rightScaleMax || leftScaleMax))}
                    fill="url(#gradOriginal)"
                  />
                  <path
                    d={generatePath("original_posts", rightScaleMax || leftScaleMax)}
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}
              {showPosts && (
                <>
                  <path
                    d={generateAreaPath(generatePath("posts", rightScaleMax || leftScaleMax))}
                    fill="url(#gradPosts)"
                  />
                  <path
                    d={generatePath("posts", rightScaleMax || leftScaleMax)}
                    fill="none"
                    stroke="#F43F5E"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}

              {/* Curves - Audience Engagement (scaled to left scale) */}
              {showViews && (
                <>
                  <path d={generateAreaPath(generatePath("views", leftScaleMax))} fill="url(#gradViews)" />
                  <path
                    d={generatePath("views", leftScaleMax)}
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}
              {showReposts && (
                <>
                  <path d={generateAreaPath(generatePath("reposts", leftScaleMax))} fill="url(#gradReposts)" />
                  <path
                    d={generatePath("reposts", leftScaleMax)}
                    fill="none"
                    stroke="#8B5CF6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}
              {showComments && (
                <>
                  <path d={generateAreaPath(generatePath("comments", leftScaleMax))} fill="url(#gradComments)" />
                  <path
                    d={generatePath("comments", leftScaleMax)}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}
              {showLikes && (
                <>
                  <path d={generateAreaPath(generatePath("likes", leftScaleMax))} fill="url(#gradLikes)" />
                  <path
                    d={generatePath("likes", leftScaleMax)}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </>
              )}

              {/* Hover Crosshair & Dots */}
              {hoverIndex !== null && hoveredPoint && (
                <g>
                  <line
                    x1={hoverX}
                    y1={paddingTop}
                    x2={hoverX}
                    y2={paddingTop + chartHeight}
                    stroke="var(--text-secondary)"
                    strokeDasharray="3 3"
                    strokeWidth="1.5"
                  />
                  {showViews && (
                    <circle
                      cx={hoverX}
                      cy={paddingTop + chartHeight - ((hoveredPoint.views || 0) / leftScaleMax) * chartHeight}
                      r="4.5"
                      fill="#38BDF8"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                  {showLikes && (
                    <circle
                      cx={hoverX}
                      cy={paddingTop + chartHeight - (hoveredPoint.likes / leftScaleMax) * chartHeight}
                      r="4.5"
                      fill="#F59E0B"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                  {showComments && (
                    <circle
                      cx={hoverX}
                      cy={paddingTop + chartHeight - (hoveredPoint.comments / leftScaleMax) * chartHeight}
                      r="4.5"
                      fill="#10B981"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                  {showReposts && (
                    <circle
                      cx={hoverX}
                      cy={paddingTop + chartHeight - (hoveredPoint.reposts / leftScaleMax) * chartHeight}
                      r="4.5"
                      fill="#8B5CF6"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                  {showPosts && (
                    <circle
                      cx={hoverX}
                      cy={
                        paddingTop +
                        chartHeight -
                        (hoveredPoint.posts / (rightScaleMax || leftScaleMax)) * chartHeight
                      }
                      r="4.5"
                      fill="#F43F5E"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                  {showOriginal && (
                    <circle
                      cx={hoverX}
                      cy={
                        paddingTop +
                        chartHeight -
                        ((hoveredPoint.original_posts || 0) / (rightScaleMax || leftScaleMax)) * chartHeight
                      }
                      r="4.5"
                      fill="#3B82F6"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                  {showReplies && (
                    <circle
                      cx={hoverX}
                      cy={
                        paddingTop +
                        chartHeight -
                        ((hoveredPoint.reply_posts || 0) / (rightScaleMax || leftScaleMax)) * chartHeight
                      }
                      r="4.5"
                      fill="#EC4899"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                  {showRetweets && (
                    <circle
                      cx={hoverX}
                      cy={
                        paddingTop +
                        chartHeight -
                        ((hoveredPoint.retweet_posts || 0) / (rightScaleMax || leftScaleMax)) * chartHeight
                      }
                      r="4.5"
                      fill="#D946EF"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                </g>
              )}
            </svg>

            {/* Floating Glassmorphism Tooltip Card */}
            {hoverIndex !== null && hoveredPoint && (
              <div
                className="absolute top-2 z-20 pointer-events-none p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]/95 backdrop-blur-md shadow-xl transition-all duration-75 min-w-[190px]"
                style={{
                  left: `${Math.min(Math.max(10, ((hoverX - 85) / width) * 100), 73)}%`,
                }}
              >
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] pb-1.5 mb-2 border-b border-[var(--border-subtle)]">
                  {new Date(hoveredPoint.period).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </div>
                <div className="flex items-center justify-between gap-4 pb-2 mb-2 border-b border-[var(--border-subtle)] text-xs">
                  <span className="text-[var(--text-muted)] font-semibold">Tweets Analyzed</span>
                  <span className="font-extrabold text-[var(--accent)]">
                    {hoveredPoint.posts.toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {(showLikes || showComments || showReposts || showViews) && (
                    <div className="text-[10px] font-extrabold uppercase text-[var(--text-muted)] mb-0.5">
                      Engagement
                    </div>
                  )}
                  {showLikes && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" /> Likes
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {hoveredPoint.likes.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {showComments && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" /> Comments
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {hoveredPoint.comments.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {showReposts && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" /> Reposts
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {hoveredPoint.reposts.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {showViews && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" /> Views
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {(hoveredPoint.views || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {(showPosts || showOriginal || showReplies || showRetweets) && (
                    <div className="text-[10px] font-extrabold uppercase text-[#F43F5E] mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                      Publishing Activity
                    </div>
                  )}
                  {showPosts && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#F43F5E]" /> Total Posts
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {hoveredPoint.posts.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {showOriginal && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" /> Original Tweets
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {(hoveredPoint.original_posts || 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {showReplies && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#EC4899]" /> Replies Published
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {(hoveredPoint.reply_posts || 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {showRetweets && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#D946EF]" /> Retweets Published
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {(hoveredPoint.retweet_posts || 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
