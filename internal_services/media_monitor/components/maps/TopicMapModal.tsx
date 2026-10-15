"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { fetchTopicMapCoordinates, generateTopicMap } from "@/app/actions/maps";
import SemanticMap from "./SemanticMap";
import StanceSpectrumLine from "./StanceSpectrumLine";
import { X, Map as MapIcon, Loader2, Sliders, Compass, Search, User, ExternalLink, Calendar, AlertTriangle, CheckCircle } from "lucide-react";
import { MapCoordinate } from "@/services/mapService";

interface TopicMapModalProps {
  topicId: string;
  topicName: string;
  isOpen: boolean;
  onClose: () => void;
  initialSearchPerson?: string;
}

export default function TopicMapModal({ topicId, topicName, isOpen, onClose, initialSearchPerson }: TopicMapModalProps) {
  const [data, setData] = useState<MapCoordinate[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Search & Person selection state
  const [personSearch, setPersonSearch] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<MapCoordinate | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [tweetTab, setTweetTab] = useState<"supportive" | "opposition">("supportive");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (initialSearchPerson) {
        setPersonSearch(initialSearchPerson);
      }
    } else {
      setData([]); // Reset data on close
      setPersonSearch("");
      setSelectedProfile(null);
    }
  }, [isOpen, topicId, initialSearchPerson]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchTopicMapCoordinates(topicId);
      setData(res);

      // Auto-select if initial search match exists
      if (initialSearchPerson && res.length > 0) {
        const clean = initialSearchPerson.replace(/^@/, "").toLowerCase();
        const match = res.find(p =>
          p.username.toLowerCase() === clean ||
          (p.display_name && p.display_name.toLowerCase().includes(clean))
        );
        if (match) {
          setSelectedProfile(match);
        }
      }
    } catch (e) {
      console.error("Error loading topic map coordinates:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    await generateTopicMap(topicId);

    // Poll to wait until data is populated
    return new Promise<void>((resolve) => {
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await fetchTopicMapCoordinates(topicId);
          if (res && res.length > 0) {
            setData(res);
            clearInterval(interval);
            resolve();
          } else if (attempts >= 20) { // Timeout after ~30s
            clearInterval(interval);
            resolve();
          }
        } catch (e) {
          console.error(e);
        }
      }, 1500);
    });
  };

  // Filter profiles for search autocomplete
  const searchResults = useMemo(() => {
    if (!personSearch.trim()) return [];
    const term = personSearch.replace(/^@/, "").toLowerCase();
    return data.filter(p =>
      p.username.toLowerCase().includes(term) ||
      (p.display_name && p.display_name.toLowerCase().includes(term))
    );
  }, [data, personSearch]);

  const handleSelectPerson = (profile: MapCoordinate) => {
    setSelectedProfile(profile);
    setPersonSearch(profile.username);
    setIsSearchFocused(false);
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[4px]">
      <div className="shadow-2xl flex flex-col relative w-full max-w-[1200px] h-[92vh] max-h-[920px] rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center py-4 px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-[var(--accent)] shrink-0">
              <MapIcon size={22} />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-primary)] flex items-center gap-2 m-0">
                {topicName}&nbsp;Semantic &amp; Stance Intelligence
              </h2>
              <p className="text-xs text-[var(--text-secondary)] m-0 mt-0.5">
                Explore profiles along the 2D stance spectrum line and the semantic vocabulary cluster projection.
              </p>
            </div>
          </div>

          {/* Search for Person in Modal */}
          <div className="flex items-center gap-3 ml-auto">
            <div className="relative min-w-[260px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                <Search size={15} />
              </span>
              <input
                type="text"
                value={personSearch}
                onChange={(e) => {
                  setPersonSearch(e.target.value);
                  if (selectedProfile && e.target.value !== selectedProfile.username) {
                    setSelectedProfile(null);
                  }
                }}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                placeholder="Search person / profile results..."
                className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-xl py-2 pr-8 pl-9 text-xs w-full outline-none transition-all duration-150 focus:border-[var(--accent)] focus:ring-2 focus:ring-purple-500/20"
              />
              {personSearch && (
                <button
                  onClick={() => {
                    setPersonSearch("");
                    setSelectedProfile(null);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border-none p-0 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}

              {/* Autocomplete Dropdown */}
              {isSearchFocused && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden max-h-[260px] overflow-y-auto">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectPerson(p);
                      }}
                      className="w-full py-2.5 px-3 text-left bg-transparent border-none border-b border-[var(--border-subtle)] text-[var(--text-primary)] text-xs cursor-pointer flex items-center justify-between transition-colors duration-150 hover:bg-[var(--bg-hover)]"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={p.profile_image_url || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"}
                          alt={p.username}
                          className="w-6 h-6 rounded-full object-cover border border-[var(--border)]"
                          onError={(e) => { e.currentTarget.src = "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"; }}
                        />
                        <div className="flex flex-col">
                          <span className="font-bold">@{p.username}</span>
                          {p.display_name && <span className="text-[10px] text-[var(--text-muted)]">{p.display_name}</span>}
                        </div>
                      </div>
                      {p.supportive_score !== undefined && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-[var(--accent)] border border-purple-500/20">
                          {((p.relevance_score || 0) * 100).toFixed(0)}% Rel
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer flex items-center justify-center p-1.5 rounded-full transition-all duration-200 hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-base)] flex flex-col gap-8 min-h-0">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-24 gap-3 text-[var(--text-muted)]">
              <Loader2 size={32} className="animate-spin text-blue-500" />
              <span className="text-sm font-medium">Loading Stance &amp; Map Data...</span>
            </div>
          ) : (
            <>
              {/* Selected Person Intelligence Dossier Panel (if a person is searched/selected) */}
              {selectedProfile && (
                <div className="bg-[var(--bg-surface)] border border-purple-500/30 rounded-2xl p-5 shadow-lg flex flex-col gap-4 animate-[fadeIn_0.2s_ease]">
                  <div className="flex flex-wrap justify-between items-start gap-4 border-b border-[var(--border-subtle)] pb-4">
                    <div className="flex items-center gap-3.5">
                      <img
                        src={selectedProfile.profile_image_url || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"}
                        alt={selectedProfile.display_name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-purple-500/40 shadow-sm"
                        onError={(e) => { e.currentTarget.src = "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"; }}
                      />
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-[var(--text-primary)] m-0">
                            {selectedProfile.display_name || selectedProfile.username}
                          </h3>
                          <a
                            href={`https://twitter.com/${selectedProfile.username}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                        <span className="text-xs text-[var(--text-secondary)] font-medium">@{selectedProfile.username}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {selectedProfile.relevance_score !== undefined && (
                        <div className="flex gap-2">
                          <div className="flex flex-col items-end bg-[var(--bg-subtle)] border border-[var(--border)] px-3 py-1.5 rounded-xl">
                            <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Relevance</span>
                            <span className="text-xs font-bold text-purple-400">
                              {((selectedProfile.relevance_score || 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex flex-col items-end bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                            <span className="text-[10px] text-emerald-400 font-bold uppercase">Support</span>
                            <span className="text-xs font-bold text-emerald-400">
                              {((selectedProfile.supportive_score || 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex flex-col items-end bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-xl">
                            <span className="text-[10px] text-red-400 font-bold uppercase">Opposition</span>
                            <span className="text-xs font-bold text-red-400">
                              {((selectedProfile.opposition_score || 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => setSelectedProfile(null)}
                        className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-red-400 rounded-xl p-2 cursor-pointer transition-colors"
                        title="Close Dossier"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Sarcasm Confidence Warning */}
                  {selectedProfile.sarcasm_confidence !== undefined && selectedProfile.sarcasm_confidence < 0.95 && (
                    <div className="flex items-center gap-2 p-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl text-amber-400 text-xs">
                      <AlertTriangle size={15} className="shrink-0" />
                      <span>
                        Stance modulated by sarcasm cues (sarcasm confidence: {((selectedProfile.sarcasm_confidence || 0) * 100).toFixed(0)}%).
                      </span>
                    </div>
                  )}

                  {/* Coverage & Matching terms */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedProfile.tweet_coverage_percent !== undefined && (
                      <div className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Topic Coverage</span>
                        <div className="flex justify-between items-center text-xs font-bold text-[var(--text-primary)]">
                          <span>{selectedProfile.tweet_coverage_percent.toFixed(1)}% Coverage</span>
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            {selectedProfile.matching_tweets_count || 0} of {selectedProfile.total_tweets_analyzed || 0} tweets
                          </span>
                        </div>
                      </div>
                    )}

                    {selectedProfile.strongest_matching_terms && selectedProfile.strongest_matching_terms.length > 0 && (
                      <div className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-3 flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Strongest Matching Terms</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedProfile.strongest_matching_terms.slice(0, 6).map((term: any, idx: number) => (
                            <span key={idx} className="text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-300 py-0.5 px-2 rounded-md font-medium">
                              {term.text} ({Number(term.avg_similarity || 0).toFixed(2)})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sample Tweets Tabs */}
                  {((selectedProfile.sample_supportive_tweets && selectedProfile.sample_supportive_tweets.length > 0) ||
                    (selectedProfile.sample_opposition_tweets && selectedProfile.sample_opposition_tweets.length > 0)) && (
                    <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3">
                      <div className="flex gap-3 border-b border-[var(--border)] pb-1.5">
                        <button
                          type="button"
                          onClick={() => setTweetTab("supportive")}
                          className={`bg-transparent border-none font-semibold text-xs pb-1.5 cursor-pointer ${
                            tweetTab === "supportive"
                              ? "text-[var(--text-primary)] border-b-2 border-emerald-500"
                              : "text-[var(--text-muted)] border-b-2 border-transparent"
                          }`}
                        >
                          Supportive Tweets ({(selectedProfile.sample_supportive_tweets || []).length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTweetTab("opposition")}
                          className={`bg-transparent border-none font-semibold text-xs pb-1.5 cursor-pointer ${
                            tweetTab === "opposition"
                              ? "text-[var(--text-primary)] border-b-2 border-red-500"
                              : "text-[var(--text-muted)] border-b-2 border-transparent"
                          }`}
                        >
                          Opposition Tweets ({(selectedProfile.sample_opposition_tweets || []).length})
                        </button>
                      </div>

                      <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                        {(tweetTab === "supportive"
                          ? selectedProfile.sample_supportive_tweets || []
                          : selectedProfile.sample_opposition_tweets || []
                        ).map((tweet: any, idx: number) => (
                          <div key={idx} className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg p-2.5 flex flex-col gap-1 text-xs">
                            <span className="text-[var(--text-primary)] leading-snug">"{tweet.text}"</span>
                            <div className="flex gap-2 text-[9px] text-[var(--text-muted)]">
                              <span className="text-emerald-400">Pos: {Number(tweet.positive_signal || 0).toFixed(2)}</span>
                              <span>•</span>
                              <span className="text-red-400">Neg: {Number(tweet.negative_signal || 0).toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section 1: 2D Stance Spectrum Line */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders size={18} className="text-[var(--accent)]" />
                    <h3 className="text-base font-bold text-[var(--text-primary)] m-0 tracking-tight">
                      1. Stance Spectrum (Support vs. Opposition Line)
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)] py-1 px-2.5 rounded-md border border-[var(--border)]">
                    X-Axis: Net Stance • Y-Axis: Topic Relevance
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] m-0">
                  Direct 2D positioning based on pre-classified stance scores. Profiles further right are strongly supportive (+100%), while profiles to the left represent strong opposition (-100%).
                </p>
                <StanceSpectrumLine
                  data={data}
                  title={topicName}
                  selectedUsername={selectedProfile?.username || personSearch}
                  onSelectNode={handleSelectPerson}
                />
              </div>

              {/* Section Divider */}
              <div className="h-px bg-[var(--border)] w-full opacity-60" />

              {/* Section 2: Semantic Cluster Map (2D UMAP Projection) */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Compass size={18} className="text-[var(--accent)]" />
                    <h3 className="text-base font-bold text-[var(--text-primary)] m-0 tracking-tight">
                      2. Semantic Cluster Map (2D UMAP Projection)
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)] py-1 px-2.5 rounded-md border border-[var(--border)]">
                    Spatial Vocabulary Distance
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] m-0">
                  Displays profiles clustered by how similar their vocabulary, phrasing, and semantic framing are across their tweets.
                </p>
                <div className="h-[520px] w-full">
                  <SemanticMap
                    data={data}
                    onGenerate={handleGenerate}
                    title={topicName}
                    selectedUsername={selectedProfile?.username || personSearch}
                    onSelectNode={handleSelectPerson}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
