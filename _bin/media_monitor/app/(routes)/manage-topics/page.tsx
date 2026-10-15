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
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "40px 24px",
        backgroundColor: "var(--bg-base)",
        minHeight: "calc(100vh - 56px)",
      }}
    >
      <div
        className="page-container"
        style={{
          width: "100%",
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        {/* Header Section */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--border)",
            paddingBottom: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em" }}>
              Topics Directory
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Define semantic matching, negative exclusions, and sarcasm rules for intelligence parsing.
            </p>
          </div>
          {!isEditing && (
            <button
              onClick={handleOpenNew}
              className="transition-surface"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <Plus size={16} />
              Add New Topic
            </button>
          )}
        </div>

        {/* Notifications */}
        {error && (
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              border: "1px solid rgba(220, 38, 38, 0.2)",
              backgroundColor: "rgba(220, 38, 38, 0.08)",
              color: "var(--down)",
              display: "flex",
              alignItems: "start",
              gap: 12,
              fontSize: 13,
            }}
          >
            <AlertCircle size={18} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>{error}</div>
            <button
              onClick={() => setError(null)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {success && (
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              border: "1px solid rgba(22, 163, 74, 0.2)",
              backgroundColor: "rgba(22, 163, 74, 0.08)",
              color: "var(--up)",
              display: "flex",
              alignItems: "start",
              gap: 12,
              fontSize: 13,
            }}
          >
            <Check size={18} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, fontWeight: 500 }}>{success}</div>
            <button
              onClick={() => setSuccess(null)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Form Panel / Grid */}
        {isEditing ? (
          <form
            onSubmit={handleSave}
            className="surface"
            style={{
              padding: 32,
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--border)",
                paddingBottom: 16,
              }}
            >
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  margin: 0,
                }}
              >
                <Settings size={20} style={{ color: "var(--accent)" }} />
                <span>{editId ? `Edit Topic: ${name}` : "Create New Topic"}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Basic Config */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 20,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Topic Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Artificial Intelligence, Cryptography"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: 14,
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: "var(--bg-subtle)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Status
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 12, height: "100%" }}>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    style={{
                      background: isActive ? "var(--up)" : "var(--border)",
                      border: "none",
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      cursor: "pointer",
                      position: "relative",
                      transition: "background-color 0.2s ease",
                    }}
                  >
                    <div
                      style={{
                        background: "#fff",
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        position: "absolute",
                        top: 2,
                        left: isActive ? 22 : 2,
                        transition: "left 0.2s ease",
                      }}
                    />
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>

            {/* Threshold Slider */}
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Similarity Threshold
                  </span>
                  {/* <HelpCircle size={14} style={{ color: "var(--text-muted)", cursor: "help" }} title="Minimum cosine similarity matching score for embeddings." /> */}
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>
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
                style={{
                  width: "100%",
                  cursor: "pointer",
                  height: 6,
                  borderRadius: 3,
                  outline: "none",
                  accentColor: "var(--accent)",
                }}
              />
            </div>

            {/* Sub-sections Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 20,
              }}
            >
              {/* Semantic Queries */}
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  background: "var(--bg-surface)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Semantic Queries
                    </span>
                    <span className="chip">{semanticQueries.length}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
                    Order of entering words marks their importance.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
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
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      fontSize: 13,
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--bg-subtle)",
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(queryInput, setQueryInput, semanticQueries, setSemanticQueries)}
                    style={{
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Add
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    maxHeight: 150,
                    overflowY: "auto",
                    padding: 8,
                    background: "var(--bg-subtle)",
                    borderRadius: 6,
                  }}
                >
                  {semanticQueries.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="chip"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px",
                        fontSize: 11,
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, minWidth: 14 }}>
                        #{index + 1}
                      </span>
                      <span>{tag}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 2, borderLeft: "1px solid var(--border)", paddingLeft: 4, marginLeft: 2 }}>
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "left", semanticQueries, setSemanticQueries)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                            }}
                            title="Move Left"
                          >
                            <ChevronLeft size={11} />
                          </button>
                        )}
                        {index < semanticQueries.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "right", semanticQueries, setSemanticQueries)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                            }}
                            title="Move Right"
                          >
                            <ChevronRight size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag, semanticQueries, setSemanticQueries)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                          }}
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </span>
                  ))}
                  {semanticQueries.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      No queries configured.
                    </span>
                  )}
                </div>
              </div>

              {/* Negative Semantics */}
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  background: "var(--bg-surface)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Negative Semantics
                    </span>
                    <span className="chip" style={{ color: "var(--down)" }}>{negativeSemantics.length}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
                    Order of entering words marks their importance.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
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
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      fontSize: 13,
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--bg-subtle)",
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(negInput, setNegInput, negativeSemantics, setNegativeSemantics)}
                    style={{
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Add
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    maxHeight: 150,
                    overflowY: "auto",
                    padding: 8,
                    background: "var(--bg-subtle)",
                    borderRadius: 6,
                  }}
                >
                  {negativeSemantics.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="chip"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px",
                        fontSize: 11,
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, minWidth: 14 }}>
                        #{index + 1}
                      </span>
                      <span>{tag}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 2, borderLeft: "1px solid var(--border)", paddingLeft: 4, marginLeft: 2 }}>
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "left", negativeSemantics, setNegativeSemantics)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                            }}
                            title="Move Left"
                          >
                            <ChevronLeft size={11} />
                          </button>
                        )}
                        {index < negativeSemantics.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "right", negativeSemantics, setNegativeSemantics)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                            }}
                            title="Move Right"
                          >
                            <ChevronRight size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag, negativeSemantics, setNegativeSemantics)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                          }}
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </span>
                  ))}
                  {negativeSemantics.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      No negative terms.
                    </span>
                  )}
                </div>
              </div>

              {/* Positive Sarcasm Cues */}
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  background: "var(--bg-surface)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Positive Sarcasm Cues
                    </span>
                    <span className="chip">{positiveSarcasmCues.length}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
                    Order of entering words marks their importance.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
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
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      fontSize: 13,
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--bg-subtle)",
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(posSarcasmInput, setPosSarcasmInput, positiveSarcasmCues, setPositiveSarcasmCues)}
                    style={{
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Add
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    maxHeight: 150,
                    overflowY: "auto",
                    padding: 8,
                    background: "var(--bg-subtle)",
                    borderRadius: 6,
                  }}
                >
                  {positiveSarcasmCues.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="chip"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px",
                        fontSize: 11,
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, minWidth: 14 }}>
                        #{index + 1}
                      </span>
                      <span>{tag}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 2, borderLeft: "1px solid var(--border)", paddingLeft: 4, marginLeft: 2 }}>
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "left", positiveSarcasmCues, setPositiveSarcasmCues)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                            }}
                            title="Move Left"
                          >
                            <ChevronLeft size={11} />
                          </button>
                        )}
                        {index < positiveSarcasmCues.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "right", positiveSarcasmCues, setPositiveSarcasmCues)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                            }}
                            title="Move Right"
                          >
                            <ChevronRight size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag, positiveSarcasmCues, setPositiveSarcasmCues)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                          }}
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </span>
                  ))}
                  {positiveSarcasmCues.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      No positive sarcasm cues.
                    </span>
                  )}
                </div>
              </div>

              {/* Negative Sarcasm Cues */}
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  background: "var(--bg-surface)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Negative Sarcasm Cues
                    </span>
                    <span className="chip">{negativeSarcasmCues.length}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
                    Order of entering words marks their importance.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
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
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      fontSize: 13,
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--bg-subtle)",
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(negSarcasmInput, setNegSarcasmInput, negativeSarcasmCues, setNegativeSarcasmCues)}
                    style={{
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Add
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    maxHeight: 150,
                    overflowY: "auto",
                    padding: 8,
                    background: "var(--bg-subtle)",
                    borderRadius: 6,
                  }}
                >
                  {negativeSarcasmCues.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="chip"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px",
                        fontSize: 11,
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, minWidth: 14 }}>
                        #{index + 1}
                      </span>
                      <span>{tag}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 2, borderLeft: "1px solid var(--border)", paddingLeft: 4, marginLeft: 2 }}>
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "left", negativeSarcasmCues, setNegativeSarcasmCues)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                            }}
                            title="Move Left"
                          >
                            <ChevronLeft size={11} />
                          </button>
                        )}
                        {index < negativeSarcasmCues.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveTag(index, "right", negativeSarcasmCues, setNegativeSarcasmCues)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                            }}
                            title="Move Right"
                          >
                            <ChevronRight size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag, negativeSarcasmCues, setNegativeSarcasmCues)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                          }}
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </span>
                  ))}
                  {negativeSarcasmCues.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      No negative sarcasm cues.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Form Action Controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                borderTop: "1px solid var(--border)",
                paddingTop: 20,
              }}
            >
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  background: "transparent",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <Save size={16} />
                Save Topic
              </button>
            </div>
          </form>
        ) : (
          /* List View */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {loading ? (
              /* Loading Skeletons */
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="surface"
                    style={{
                      height: 140,
                      padding: 24,
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      animation: "pulse 1.5s infinite ease-in-out",
                    }}
                  />
                ))}
              </div>
            ) : topics.length === 0 ? (
              <div
                className="surface"
                style={{
                  padding: 48,
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <Settings size={48} style={{ color: "var(--text-muted)", opacity: 0.3 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>No Topics Configured</h3>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 400 }}>
                    Define topics with keyword parameters to scan and catalog content automatically.
                  </p>
                </div>
                <button
                  onClick={handleOpenNew}
                  style={{
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  Create Your First Topic
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {topics.map((topic) => (
                  <div
                    key={topic.id}
                    className="surface"
                    style={{
                      padding: 24,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 24,
                      opacity: topic.is_active ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                          {topic.name}
                        </h3>
                        <span
                          className="chip"
                          style={{
                            backgroundColor: topic.is_active ? "rgba(22, 163, 74, 0.08)" : "rgba(120, 113, 108, 0.08)",
                            color: topic.is_active ? "var(--up)" : "var(--neutral)",
                            borderColor: topic.is_active ? "rgba(22, 163, 74, 0.15)" : "rgba(120, 113, 108, 0.15)",
                          }}
                        >
                          {topic.is_active ? "Active" : "Inactive"}
                        </span>
                        <span
                          className="chip"
                          style={{
                            backgroundColor: "var(--accent-subtle)",
                            color: "var(--accent)",
                            borderColor: "var(--accent-muted)",
                          }}
                        >
                          Threshold: {topic.similarity_threshold}
                        </span>
                      </div>

                      {/* Summary fields grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 16,
                          marginTop: 8,
                        }}
                      >
                        {/* Queries */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Semantic Queries ({topic.semantic_queries?.length || 0})
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {topic.semantic_queries?.slice(0, 5).map((t) => (
                              <span key={t} className="chip" style={{ fontSize: 11 }}>{t}</span>
                            ))}
                            {topic.semantic_queries?.length > 5 && (
                              <span className="chip" style={{ fontSize: 11, fontStyle: "italic" }}>
                                +{topic.semantic_queries.length - 5} more
                              </span>
                            )}
                            {(!topic.semantic_queries || topic.semantic_queries.length === 0) && (
                              <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>None</span>
                            )}
                          </div>
                        </div>

                        {/* Negatives */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Negatives ({topic.negative_semantics?.length || 0})
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {topic.negative_semantics?.slice(0, 5).map((t) => (
                              <span key={t} className="chip" style={{ fontSize: 11 }}>{t}</span>
                            ))}
                            {topic.negative_semantics?.length > 5 && (
                              <span className="chip" style={{ fontSize: 11, fontStyle: "italic" }}>
                                +{topic.negative_semantics.length - 5} more
                              </span>
                            )}
                            {(!topic.negative_semantics || topic.negative_semantics.length === 0) && (
                              <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>None</span>
                            )}
                          </div>
                        </div>

                        {/* Sarcasm Pos */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Sarcasm Pos ({topic.positive_sarcasm_cues?.length || 0})
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {topic.positive_sarcasm_cues?.slice(0, 5).map((t) => (
                              <span key={t} className="chip" style={{ fontSize: 11 }}>{t}</span>
                            ))}
                            {topic.positive_sarcasm_cues?.length > 5 && (
                              <span className="chip" style={{ fontSize: 11, fontStyle: "italic" }}>
                                +{topic.positive_sarcasm_cues.length - 5} more
                              </span>
                            )}
                            {(!topic.positive_sarcasm_cues || topic.positive_sarcasm_cues.length === 0) && (
                              <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>None</span>
                            )}
                          </div>
                        </div>

                        {/* Sarcasm Neg */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Sarcasm Neg ({topic.negative_sarcasm_cues?.length || 0})
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {topic.negative_sarcasm_cues?.slice(0, 5).map((t) => (
                              <span key={t} className="chip" style={{ fontSize: 11 }}>{t}</span>
                            ))}
                            {topic.negative_sarcasm_cues?.length > 5 && (
                              <span className="chip" style={{ fontSize: 11, fontStyle: "italic" }}>
                                +{topic.negative_sarcasm_cues.length - 5} more
                              </span>
                            )}
                            {(!topic.negative_sarcasm_cues || topic.negative_sarcasm_cues.length === 0) && (
                              <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>None</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions Panel */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleOpenEdit(topic)}
                        style={{
                          width: 36,
                          height: 36,
                          border: "1px solid var(--border)",
                          background: "transparent",
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                        }}
                        title="Edit Topic"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(topic.id, topic.name)}
                        style={{
                          width: 36,
                          height: 36,
                          border: "1px solid var(--border)",
                          background: "transparent",
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                        }}
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
