"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Loader2, Calendar } from "lucide-react";

interface TimelinePoint {
  period: string;
  posts: number;
  original_posts: number;
  reply_posts: number;
  retweet_posts: number;
}

interface PostingTimelineChartProps {
  username: string;
}

type TimeRange = "30d" | "90d" | "1y" | "all" | "custom";
type Granularity = "day" | "week" | "month";

export function PostingTimelineChart({ username }: PostingTimelineChartProps) {
  const [range, setRange] = useState<TimeRange>("90d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [data, setData] = useState<TimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Metric toggles
  const [showTotalPosts, setShowTotalPosts] = useState(true);
  const [showOriginal, setShowOriginal] = useState(true);
  const [showReplies, setShowReplies] = useState(false);
  const [showRetweets, setShowRetweets] = useState(false);

  // Hover state for interactive crosshair
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (range === "30d" || range === "90d") setGranularity("day");
    else if (range === "1y") setGranularity("week");
    else if (range === "all") setGranularity("month");
  }, [range]);

  useEffect(() => {
    if (!username) return;

    let cancelled = false;
    const fetchTimeline = async () => {
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
        if (!cancelled) {
          setData(json.timeline || []);
        }
      } catch (e) {
        console.error("Timeline error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTimeline();
    return () => {
      cancelled = true;
    };
  }, [username, range, granularity, startDate, endDate]);

  // Aggregate totals
  const totals = useMemo(() => {
    return data.reduce(
      (acc, pt) => ({
        posts: acc.posts + pt.posts,
        original: acc.original + pt.original_posts,
        replies: acc.replies + pt.reply_posts,
        retweets: acc.retweets + pt.retweet_posts,
      }),
      { posts: 0, original: 0, replies: 0, retweets: 0 }
    );
  }, [data]);

  // Find max value to scale Y axis
  const maxValue = useMemo(() => {
    if (data.length === 0) return 10;
    let max = 0;
    data.forEach((pt) => {
      if (showTotalPosts && pt.posts > max) max = pt.posts;
      if (showOriginal && pt.original_posts > max) max = pt.original_posts;
      if (showReplies && pt.reply_posts > max) max = pt.reply_posts;
      if (showRetweets && pt.retweet_posts > max) max = pt.retweet_posts;
    });
    return Math.max(max, 5);
  }, [data, showTotalPosts, showOriginal, showReplies, showRetweets]);

  // SVG dimensions
  const width = 800;
  const height = 280;
  const paddingLeft = 48;
  const paddingRight = 16;
  const paddingTop = 20;
  const paddingBottom = 34;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const generatePath = (metricKey: keyof TimelinePoint) => {
    if (data.length === 0) return "";
    const points = data.map((pt, index) => {
      const x = paddingLeft + (data.length === 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth);
      const val = Number(pt[metricKey]) || 0;
      const y = paddingTop + chartHeight - (val / maxValue) * chartHeight;
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

  const hoveredPoint = hoverIndex !== null && data[hoverIndex] ? data[hoverIndex] : null;
  const hoverX =
    hoverIndex !== null && data.length > 1
      ? paddingLeft + (hoverIndex / (data.length - 1)) * chartWidth
      : paddingLeft + chartWidth / 2;

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[var(--text-muted)] m-0">
              Publishing Frequency & Activity Cadence
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/20">
              Posts Timeline
            </span>
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)] mt-1">
            Analyze volume of tweets, replies, and retweets published over time
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Buttons */}
          <div className="flex items-center bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg p-1 gap-1">
            {(["30d", "90d", "1y", "all"] as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRange(r);
                  setStartDate("");
                  setEndDate("");
                }}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  range === r
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {r === "30d" ? "30 Days" : r === "90d" ? "90 Days" : r === "1y" ? "1 Year" : "All Time"}
              </button>
            ))}
          </div>

          {/* Calendar Date Selector */}
          <div className="flex items-center bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-2.5 py-1 gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setRange("custom");
              }}
              className="bg-transparent outline-none text-xs font-extrabold text-[var(--text-primary)] cursor-pointer"
              aria-label="Filter timeline start date"
            />
            <span className="text-[var(--text-muted)]">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setRange("custom");
              }}
              className="bg-transparent outline-none text-xs font-extrabold text-[var(--text-primary)] cursor-pointer"
              aria-label="Filter timeline end date"
            />
            {(startDate || endDate || range === "custom") && (
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setRange("90d");
                }}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] font-extrabold ml-1 text-sm leading-none"
                title="Reset custom date filter"
              >
                ×
              </button>
            )}
          </div>

          {/* Granularity Selector */}
          <div className="flex items-center bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg p-1 gap-1">
            {(["day", "week", "month"] as Granularity[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all capitalize cursor-pointer ${
                  granularity === g
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

      {/* Metric Toggle Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
        <button
          type="button"
          onClick={() => setShowTotalPosts(!showTotalPosts)}
          className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
            showTotalPosts
              ? "bg-[var(--bg-subtle)]/70 border-[#06B6D4]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-55 hover:opacity-80"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-[#06B6D4] shadow-[0_0_8px_#06B6D488]" />
            <span className="text-xs font-bold text-[var(--text-secondary)]">Total Posts</span>
          </div>
          <span className="text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(totals.posts)}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowOriginal(!showOriginal)}
          className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
            showOriginal
              ? "bg-[var(--bg-subtle)]/70 border-[#3B82F6]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-55 hover:opacity-80"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-[#3B82F6] shadow-[0_0_8px_#3B82F688]" />
            <span className="text-xs font-bold text-[var(--text-secondary)]">Original Tweets</span>
          </div>
          <span className="text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(totals.original)}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowReplies(!showReplies)}
          className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
            showReplies
              ? "bg-[var(--bg-subtle)]/70 border-[#EC4899]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-55 hover:opacity-80"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-[#EC4899] shadow-[0_0_8px_#EC489988]" />
            <span className="text-xs font-bold text-[var(--text-secondary)]">Replies Published</span>
          </div>
          <span className="text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(totals.replies)}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowRetweets(!showRetweets)}
          className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
            showRetweets
              ? "bg-[var(--bg-subtle)]/70 border-[#A855F7]/50 shadow-sm"
              : "bg-[var(--bg-subtle)]/20 border-[var(--border-subtle)] opacity-55 hover:opacity-80"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-[#A855F7] shadow-[0_0_8px_#A855F788]" />
            <span className="text-xs font-bold text-[var(--text-secondary)]">Retweets Published</span>
          </div>
          <span className="text-sm font-extrabold text-[var(--text-primary)]">{formatNumber(totals.retweets)}</span>
        </button>
      </div>

      {/* SVG Interactive Line Chart */}
      <div className="relative w-full overflow-hidden select-none" ref={chartRef}>
        {loading ? (
          <div className="h-[280px] w-full flex flex-col items-center justify-center gap-3 bg-[var(--bg-subtle)]/30 rounded-xl">
            <Loader2 className="w-7 h-7 text-[var(--accent)] animate-spin" />
            <span className="text-xs font-bold text-[var(--text-muted)]">Loading publishing timeline...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="h-[280px] w-full flex flex-col items-center justify-center gap-2 bg-[var(--bg-subtle)]/30 rounded-xl">
            <Calendar className="w-8 h-8 text-[var(--text-muted)] opacity-50" />
            <span className="text-sm font-bold text-[var(--text-secondary)]">No posts found for this date range</span>
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
                <linearGradient id="gradPostsTot" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradOriginal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradRepliesPub" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EC4899" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#EC4899" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="gradRetweetsPub" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A855F7" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#A855F7" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {ticks.map((t, idx) => {
                const y = paddingTop + chartHeight * (1 - t);
                const val = Math.round(maxValue * t);
                return (
                  <g key={idx}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={width - paddingRight}
                      y2={y}
                      stroke="var(--border-subtle)"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      fill="var(--text-muted)"
                      fontSize="10"
                      fontWeight="600"
                    >
                      {formatNumber(val)}
                    </text>
                  </g>
                );
              })}

              {/* X Axis Date Labels */}
              {data.map((pt, i) => {
                const step = Math.max(1, Math.floor(data.length / 6));
                const isFirst = i === 0;
                const isLast = i === data.length - 1;
                const isStepTick = i % step === 0 && (data.length - 1 - i) >= Math.max(1, Math.floor(step * 0.7));
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

              {/* Curves */}
              {showRetweets && (
                <>
                  <path d={generateAreaPath(generatePath("retweet_posts"))} fill="url(#gradRetweetsPub)" />
                  <path d={generatePath("retweet_posts")} fill="none" stroke="#A855F7" strokeWidth="2.5" strokeLinecap="round" />
                </>
              )}
              {showReplies && (
                <>
                  <path d={generateAreaPath(generatePath("reply_posts"))} fill="url(#gradRepliesPub)" />
                  <path d={generatePath("reply_posts")} fill="none" stroke="#EC4899" strokeWidth="2.5" strokeLinecap="round" />
                </>
              )}
              {showOriginal && (
                <>
                  <path d={generateAreaPath(generatePath("original_posts"))} fill="url(#gradOriginal)" />
                  <path d={generatePath("original_posts")} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
                </>
              )}
              {showTotalPosts && (
                <>
                  <path d={generateAreaPath(generatePath("posts"))} fill="url(#gradPostsTot)" />
                  <path d={generatePath("posts")} fill="none" stroke="#06B6D4" strokeWidth="3" strokeLinecap="round" />
                </>
              )}

              {/* Crosshair & Dots */}
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
                  {showTotalPosts && (
                    <circle
                      cx={hoverX}
                      cy={paddingTop + chartHeight - (hoveredPoint.posts / maxValue) * chartHeight}
                      r="4.5"
                      fill="#06B6D4"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                  {showOriginal && (
                    <circle
                      cx={hoverX}
                      cy={paddingTop + chartHeight - (hoveredPoint.original_posts / maxValue) * chartHeight}
                      r="4.5"
                      fill="#3B82F6"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                  {showReplies && (
                    <circle
                      cx={hoverX}
                      cy={paddingTop + chartHeight - (hoveredPoint.reply_posts / maxValue) * chartHeight}
                      r="4.5"
                      fill="#EC4899"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                  {showRetweets && (
                    <circle
                      cx={hoverX}
                      cy={paddingTop + chartHeight - (hoveredPoint.retweet_posts / maxValue) * chartHeight}
                      r="4.5"
                      fill="#A855F7"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )}
                </g>
              )}
            </svg>

            {/* Hover Tooltip */}
            {hoverIndex !== null && hoveredPoint && (
              <div
                className="absolute top-2 z-20 pointer-events-none p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]/95 backdrop-blur-md shadow-xl transition-all duration-75 min-w-[170px]"
                style={{
                  left: `${Math.min(
                    Math.max(10, ((hoverX - 85) / width) * 100),
                    75
                  )}%`,
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
                <div className="flex flex-col gap-1.5">
                  {showTotalPosts && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#06B6D4]" /> Total Posts
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
                        {hoveredPoint.original_posts.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {showReplies && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#EC4899]" /> Replies Published
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {hoveredPoint.reply_posts.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {showRetweets && (
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#A855F7]" /> Retweets Published
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {hoveredPoint.retweet_posts.toLocaleString()}
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
