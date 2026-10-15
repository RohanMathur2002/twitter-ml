"use client";

import { useState, useEffect } from "react";
import { fetchTopics, saveTopic, removeTopic } from "@/app/actions/topics";
import type { Topic } from "@/services/TopicRepository";
import { Plus, Trash2, Edit, Check, X, AlertCircle, Settings, HelpCircle, Save, ChevronLeft, ChevronRight } from "lucide-react";

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit / Form state
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // null means adding a new topic
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.45);

  // Tag lists state
  const [semanticQueries, setSemanticQueries] = useState<string[]>([]);
  const [negativeSemantics, setNegativeSemantics] = useState<string[]>([]);
  const [positiveSarcasmCues, setPositiveSarcasmCues] = useState<string[]>([]);
  const [negativeSarcasmCues, setNegativeSarcasmCues] = useState<string[]>([]);

  // Input fields for tags
  const [queryInput, setQueryInput] = useState("");
  const [negInput, setNegInput] = useState("");
  const [posSarcasmInput, setPosSarcasmInput] = useState("");
  const [negSarcasmInput, setNegSarcasmInput] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchTopics();
      setTopics(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load topics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const clearNotification = () => {
    setTimeout(() => {
      setSuccess(null);
    }, 4000);
  };

  const handleOpenNew = () => {
    setEditId(null);
    setName("");
    setIsActive(true);
    setSimilarityThreshold(0.45);
    setSemanticQueries([]);
    setNegativeSemantics([]);
    setPositiveSarcasmCues([]);
    setNegativeSarcasmCues([]);
    setQueryInput("");
    setNegInput("");
    setPosSarcasmInput("");
    setNegSarcasmInput("");
    setIsEditing(true);
  };

  const handleOpenEdit = (topic: Topic) => {
    setEditId(topic.id);
    setName(topic.name);
    setIsActive(topic.is_active);
    setSimilarityThreshold(topic.similarity_threshold);
    setSemanticQueries(topic.semantic_queries || []);
    setNegativeSemantics(topic.negative_semantics || []);
    setPositiveSarcasmCues(topic.positive_sarcasm_cues || []);
    setNegativeSarcasmCues(topic.negative_sarcasm_cues || []);
    setQueryInput("");
    setNegInput("");
    setPosSarcasmInput("");
    setNegSarcasmInput("");
    setIsEditing(true);
  };

  const handleAddTag = (
    input: string,
    setInput: (val: string) => void,
    list: string[],
    setList: (val: string[]) => void
  ) => {
    const trimmed = input.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
      setInput("");
    }
  };

  const handleRemoveTag = (
    val: string,
    list: string[],
    setList: (val: string[]) => void
  ) => {
    setList(list.filter((item) => item !== val));
  };

  const handleMoveTag = (
    index: number,
    direction: "left" | "right",
    list: string[],
    setList: (val: string[]) => void
  ) => {
    const newList = [...list];
    const swapIdx = direction === "left" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newList.length) return;
    [newList[index], newList[swapIdx]] = [newList[swapIdx], newList[index]];
    setList(newList);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Topic name is required.");
      return;
    }

    try {
      const payload: any = {
        name: name.trim(),
        semantic_queries: semanticQueries,
        negative_semantics: negativeSemantics,
        positive_sarcasm_cues: positiveSarcasmCues,
        negative_sarcasm_cues: negativeSarcasmCues,
        similarity_threshold: Number(similarityThreshold),
        is_active: isActive,
      };

      if (editId) {
        payload.id = editId;
      }

      await saveTopic(payload);
      setSuccess(editId ? "Topic updated successfully!" : "Topic created successfully!");
      setIsEditing(false);
      loadData();
      clearNotification();
    } catch (err: any) {
      setError(err.message || "Failed to save topic.");
    }
  };

  const handleDelete = async (id: string, topicName: string) => {
    if (!confirm(`Are you sure you want to delete the topic "${topicName}"?`)) {
      return;
    }

    try {
      await removeTopic(id);
      setSuccess("Topic deleted successfully.");
      loadData();
      clearNotification();
    } catch (err: any) {
      setError(err.message || "Failed to delete topic.");
    }
  };

  return (
    <div className="flex-1 flex flex-col py-10 px-6 bg-[var(--bg-base)] min-h-[calc(100vh-56px)]">
      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-7">
        
        {/* Header Section */}
        <div className="flex justify-between items-center border-b border-[var(--border)] pb-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight m-0">Topics Directory</h1>
            <p className="text-[13px] text-[var(--text-secondary)] m-0">
              Define semantic matching, negative exclusions, and sarcasm rules for intelligence parsing.
            </p>
          </div>
          {!isEditing && (
            <button
              onClick={handleOpenNew}
              className="flex items-center gap-2 py-2 px-4 text-[13px] font-semibold bg-[var(--accent)] text-white border-none rounded-lg cursor-pointer transition-opacity duration-150 hover:opacity-90"
            >
              <Plus size={16} />
              Add New Topic
            </button>
          )}
        </div>

        {/* Notifications */}
        {error && (
          <div className="p-4 rounded-lg border border-red-600/20 bg-red-600/10 text-red-500 flex items-start gap-3 text-[13px]">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">{error}</div>
            <button
              onClick={() => setError(null)}
              className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-0 hover:text-[var(--text-secondary)]"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-lg border border-emerald-600/20 bg-emerald-600/10 text-emerald-500 flex items-start gap-3 text-[13px]">
            <Check size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1 font-medium">{success}</div>
            <button
              onClick={() => setSuccess(null)}
              className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-0 hover:text-[var(--text-secondary)]"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Form Panel / Grid */}
        {isEditing ? (
          <form
            onSubmit={handleSave}
            className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)] shadow-sm p-8 flex flex-col gap-6"
          >
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-4">
              <h2 className="text-lg font-bold flex items-center gap-2.5 m-0">
                <Settings size={20} className="text-[var(--accent)]" />
                <span>{editId ? `Edit Topic: ${name}` : "Create New Topic"}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="bg-transparent border-none text-[var(--text-secondary)] cursor-pointer p-1 flex items-center justify-center hover:bg-[var(--bg-subtle)] rounded-md transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Basic Config */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Topic Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Artificial Intelligence, Cryptography"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full py-2.5 px-3.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Status
                </label>
                <div className="flex items-center gap-3 h-full">
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`relative w-11 h-6 rounded-full border-none cursor-pointer transition-colors duration-200 ${isActive ? "bg-emerald-500" : "bg-[var(--border)]"}`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all duration-200 ${isActive ? "left-[22px]" : "left-0.5"}`}
                    />
                  </button>
                  <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>

            {/* Threshold Slider */}
            <div className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg py-4 px-5 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Similarity Threshold
                  </span>
                </div>
                <span className="text-sm font-bold text-[var(--accent)]">
                  {similarityThreshold}
                </span>
              </div>
              <input
                type="range"
                min="0.10"
                max="0.90"
                step="0.01"
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                className="w-full cursor-pointer h-1.5 rounded-full outline-none accent-[var(--accent)]"
              />
            </div>

            {/* Sub-sections Grid */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
              
              {/* Semantic Queries */}
              <div className="border border-[var(--border)] rounded-lg p-4 flex flex-col gap-3 bg-[var(--bg-surface)]">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      Semantic Queries
                    </span>
                    <span className="py-0.5 px-2 bg-[var(--bg-subtle)] text-xs rounded-full border border-[var(--border)]">{semanticQueries.length}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] italic">
                    Order of entering words marks their importance.
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add term..."
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag(queryInput, setQueryInput, semanticQueries, setSemanticQueries);
                      }
                    }}
                    className="flex-1 py-2 px-3 text-[13px] border border-[var(--border)] rounded-md bg-[var(--bg-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(queryInput, setQueryInput, semanticQueries, setSemanticQueries)}
                    className="py-2 px-3 text-[13px] font-semibold bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md cursor-pointer hover:bg-[var(--border)] transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto p-2 bg-[var(--bg-subtle)] rounded-md">
                  {semanticQueries.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="flex items-center gap-1.5 py-1 px-2 text-[11px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-md"
                    >
                      <span className="text-[10px] text-[var(--accent)] font-bold min-w-[14px]">
                        #{index + 1}
                      </span>
                      <span>{tag}</span>
                      <div className="flex items-center gap-0.5 border-l border-[var(--border)] pl-1 ml-0.5">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "left", semanticQueries, setSemanticQueries)}
                            className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-[var(--text-primary)]"
                            title="Move Left"
                          >
                            <ChevronLeft size={11} />
                          </button>
                        )}
                        {index < semanticQueries.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "right", semanticQueries, setSemanticQueries)}
                            className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-[var(--text-primary)]"
                            title="Move Right"
                          >
                            <ChevronRight size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag, semanticQueries, setSemanticQueries)}
                          className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-red-500"
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </span>
                  ))}
                  {semanticQueries.length === 0 && (
                    <span className="text-xs text-[var(--text-muted)] italic">
                      No queries configured.
                    </span>
                  )}
                </div>
              </div>

              {/* Negative Semantics */}
              <div className="border border-[var(--border)] rounded-lg p-4 flex flex-col gap-3 bg-[var(--bg-surface)]">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      Negative Semantics
                    </span>
                    <span className="py-0.5 px-2 bg-[var(--bg-subtle)] text-xs rounded-full border border-[var(--border)] text-red-500">{negativeSemantics.length}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] italic">
                    Order of entering words marks their importance.
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add term..."
                    value={negInput}
                    onChange={(e) => setNegInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag(negInput, setNegInput, negativeSemantics, setNegativeSemantics);
                      }
                    }}
                    className="flex-1 py-2 px-3 text-[13px] border border-[var(--border)] rounded-md bg-[var(--bg-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(negInput, setNegInput, negativeSemantics, setNegativeSemantics)}
                    className="py-2 px-3 text-[13px] font-semibold bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md cursor-pointer hover:bg-[var(--border)] transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto p-2 bg-[var(--bg-subtle)] rounded-md">
                  {negativeSemantics.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="flex items-center gap-1.5 py-1 px-2 text-[11px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-md"
                    >
                      <span className="text-[10px] text-[var(--accent)] font-bold min-w-[14px]">
                        #{index + 1}
                      </span>
                      <span>{tag}</span>
                      <div className="flex items-center gap-0.5 border-l border-[var(--border)] pl-1 ml-0.5">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "left", negativeSemantics, setNegativeSemantics)}
                            className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-[var(--text-primary)]"
                            title="Move Left"
                          >
                            <ChevronLeft size={11} />
                          </button>
                        )}
                        {index < negativeSemantics.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "right", negativeSemantics, setNegativeSemantics)}
                            className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-[var(--text-primary)]"
                            title="Move Right"
                          >
                            <ChevronRight size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag, negativeSemantics, setNegativeSemantics)}
                          className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-red-500"
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </span>
                  ))}
                  {negativeSemantics.length === 0 && (
                    <span className="text-xs text-[var(--text-muted)] italic">
                      No negative terms.
                    </span>
                  )}
                </div>
              </div>

              {/* Positive Sarcasm Cues */}
              <div className="border border-[var(--border)] rounded-lg p-4 flex flex-col gap-3 bg-[var(--bg-surface)]">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      Positive Sarcasm Cues
                    </span>
                    <span className="py-0.5 px-2 bg-[var(--bg-subtle)] text-xs rounded-full border border-[var(--border)]">{positiveSarcasmCues.length}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] italic">
                    Order of entering words marks their importance.
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add term..."
                    value={posSarcasmInput}
                    onChange={(e) => setPosSarcasmInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag(posSarcasmInput, setPosSarcasmInput, positiveSarcasmCues, setPositiveSarcasmCues);
                      }
                    }}
                    className="flex-1 py-2 px-3 text-[13px] border border-[var(--border)] rounded-md bg-[var(--bg-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(posSarcasmInput, setPosSarcasmInput, positiveSarcasmCues, setPositiveSarcasmCues)}
                    className="py-2 px-3 text-[13px] font-semibold bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md cursor-pointer hover:bg-[var(--border)] transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto p-2 bg-[var(--bg-subtle)] rounded-md">
                  {positiveSarcasmCues.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="flex items-center gap-1.5 py-1 px-2 text-[11px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-md"
                    >
                      <span className="text-[10px] text-[var(--accent)] font-bold min-w-[14px]">
                        #{index + 1}
                      </span>
                      <span>{tag}</span>
                      <div className="flex items-center gap-0.5 border-l border-[var(--border)] pl-1 ml-0.5">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "left", positiveSarcasmCues, setPositiveSarcasmCues)}
                            className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-[var(--text-primary)]"
                            title="Move Left"
                          >
                            <ChevronLeft size={11} />
                          </button>
                        )}
                        {index < positiveSarcasmCues.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "right", positiveSarcasmCues, setPositiveSarcasmCues)}
                            className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-[var(--text-primary)]"
                            title="Move Right"
                          >
                            <ChevronRight size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag, positiveSarcasmCues, setPositiveSarcasmCues)}
                          className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-red-500"
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </span>
                  ))}
                  {positiveSarcasmCues.length === 0 && (
                    <span className="text-xs text-[var(--text-muted)] italic">
                      No positive sarcasm cues.
                    </span>
                  )}
                </div>
              </div>

              {/* Negative Sarcasm Cues */}
              <div className="border border-[var(--border)] rounded-lg p-4 flex flex-col gap-3 bg-[var(--bg-surface)]">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      Negative Sarcasm Cues
                    </span>
                    <span className="py-0.5 px-2 bg-[var(--bg-subtle)] text-xs rounded-full border border-[var(--border)]">{negativeSarcasmCues.length}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] italic">
                    Order of entering words marks their importance.
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add term..."
                    value={negSarcasmInput}
                    onChange={(e) => setNegSarcasmInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag(negSarcasmInput, setNegSarcasmInput, negativeSarcasmCues, setNegativeSarcasmCues);
                      }
                    }}
                    className="flex-1 py-2 px-3 text-[13px] border border-[var(--border)] rounded-md bg-[var(--bg-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(negSarcasmInput, setNegSarcasmInput, negativeSarcasmCues, setNegativeSarcasmCues)}
                    className="py-2 px-3 text-[13px] font-semibold bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md cursor-pointer hover:bg-[var(--border)] transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto p-2 bg-[var(--bg-subtle)] rounded-md">
                  {negativeSarcasmCues.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="flex items-center gap-1.5 py-1 px-2 text-[11px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-md"
                    >
                      <span className="text-[10px] text-[var(--accent)] font-bold min-w-[14px]">
                        #{index + 1}
                      </span>
                      <span>{tag}</span>
                      <div className="flex items-center gap-0.5 border-l border-[var(--border)] pl-1 ml-0.5">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "left", negativeSarcasmCues, setNegativeSarcasmCues)}
                            className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-[var(--text-primary)]"
                            title="Move Left"
                          >
                            <ChevronLeft size={11} />
                          </button>
                        )}
                        {index < negativeSarcasmCues.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "right", negativeSarcasmCues, setNegativeSarcasmCues)}
                            className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-[var(--text-primary)]"
                            title="Move Right"
                          >
                            <ChevronRight size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag, negativeSarcasmCues, setNegativeSarcasmCues)}
                          className="border-none bg-transparent text-[var(--text-muted)] cursor-pointer p-0 flex items-center hover:text-red-500"
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </span>
                  ))}
                  {negativeSarcasmCues.length === 0 && (
                    <span className="text-xs text-[var(--text-muted)] italic">
                      No negative sarcasm cues.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Form Action Controls */}
            <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-5">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="py-2.5 px-5 text-sm font-semibold bg-transparent text-[var(--text-primary)] border border-[var(--border)] rounded-lg cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 py-2.5 px-6 text-sm font-semibold bg-[var(--accent)] text-white border-none rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              >
                <Save size={16} />
                Save Topic
              </button>
            </div>
          </form>
        ) : (
          /* List View */
          <div className="flex flex-col gap-4">
            {loading ? (
              /* Loading Skeletons */
              <div className="flex flex-col gap-4">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-[140px] p-6 flex flex-col gap-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl animate-[pulse_1.5s_infinite_ease-in-out]"
                  />
                ))}
              </div>
            ) : topics.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center gap-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl">
                <Settings size={48} className="text-[var(--text-muted)] opacity-30" />
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-bold m-0">No Topics Configured</h3>
                  <p className="text-[13px] text-[var(--text-secondary)] max-w-[400px]">
                    Define topics with keyword parameters to scan and catalog content automatically.
                  </p>
                </div>
                <button
                  onClick={handleOpenNew}
                  className="py-2 px-4 text-[13px] font-semibold bg-[var(--accent)] text-white border-none rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                >
                  Create Your First Topic
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {topics.map((topic) => (
                  <div
                    key={topic.id}
                    className={`p-6 flex justify-between items-start gap-6 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl ${topic.is_active ? 'opacity-100' : 'opacity-60'}`}
                  >
                    <div className="flex flex-col gap-3 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-lg font-bold m-0 text-[var(--text-primary)]">
                          {topic.name}
                        </h3>
                        <span className={`py-0.5 px-2.5 text-xs font-semibold rounded-full border ${topic.is_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-stone-500/10 text-stone-500 border-stone-500/20'}`}>
                          {topic.is_active ? "Active" : "Inactive"}
                        </span>
                        <span className="py-0.5 px-2.5 text-xs font-semibold rounded-full bg-purple-500/10 text-[var(--accent)] border border-purple-500/20">
                          Threshold: {topic.similarity_threshold}
                        </span>
                      </div>

                      {/* Summary fields grid */}
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mt-2">
                        {/* Queries */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                            Semantic Queries ({topic.semantic_queries?.length || 0})
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {topic.semantic_queries?.slice(0, 5).map((t) => (
                              <span key={t} className="py-0.5 px-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-md text-[11px]">{t}</span>
                            ))}
                            {topic.semantic_queries?.length > 5 && (
                              <span className="py-0.5 px-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-md text-[11px] italic">
                                +{topic.semantic_queries.length - 5} more
                              </span>
                            )}
                            {(!topic.semantic_queries || topic.semantic_queries.length === 0) && (
                              <span className="text-xs text-[var(--text-muted)] italic">None</span>
                            )}
                          </div>
                        </div>

                        {/* Negatives */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                            Negatives ({topic.negative_semantics?.length || 0})
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {topic.negative_semantics?.slice(0, 5).map((t) => (
                              <span key={t} className="py-0.5 px-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-md text-[11px]">{t}</span>
                            ))}
                            {topic.negative_semantics?.length > 5 && (
                              <span className="py-0.5 px-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-md text-[11px] italic">
                                +{topic.negative_semantics.length - 5} more
                              </span>
                            )}
                            {(!topic.negative_semantics || topic.negative_semantics.length === 0) && (
                              <span className="text-xs text-[var(--text-muted)] italic">None</span>
                            )}
                          </div>
                        </div>

                        {/* Sarcasm Pos */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                            Sarcasm Pos ({topic.positive_sarcasm_cues?.length || 0})
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {topic.positive_sarcasm_cues?.slice(0, 5).map((t) => (
                              <span key={t} className="py-0.5 px-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-md text-[11px]">{t}</span>
                            ))}
                            {topic.positive_sarcasm_cues?.length > 5 && (
                              <span className="py-0.5 px-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-md text-[11px] italic">
                                +{topic.positive_sarcasm_cues.length - 5} more
                              </span>
                            )}
                            {(!topic.positive_sarcasm_cues || topic.positive_sarcasm_cues.length === 0) && (
                              <span className="text-xs text-[var(--text-muted)] italic">None</span>
                            )}
                          </div>
                        </div>

                        {/* Sarcasm Neg */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                            Sarcasm Neg ({topic.negative_sarcasm_cues?.length || 0})
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {topic.negative_sarcasm_cues?.slice(0, 5).map((t) => (
                              <span key={t} className="py-0.5 px-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-md text-[11px]">{t}</span>
                            ))}
                            {topic.negative_sarcasm_cues?.length > 5 && (
                              <span className="py-0.5 px-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-md text-[11px] italic">
                                +{topic.negative_sarcasm_cues.length - 5} more
                              </span>
                            )}
                            {(!topic.negative_sarcasm_cues || topic.negative_sarcasm_cues.length === 0) && (
                              <span className="text-xs text-[var(--text-muted)] italic">None</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions Panel */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenEdit(topic)}
                        className="w-9 h-9 border border-[var(--border)] bg-transparent rounded-lg flex items-center justify-center cursor-pointer text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
                        title="Edit Topic"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(topic.id, topic.name)}
                        className="w-9 h-9 border border-[var(--border)] bg-transparent rounded-lg flex items-center justify-center cursor-pointer text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-500 transition-colors"
                        title="Delete Topic"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
