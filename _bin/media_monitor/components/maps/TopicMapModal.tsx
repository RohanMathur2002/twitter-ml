"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchTopicMapCoordinates, generateTopicMap } from "@/app/actions/maps";
import SemanticMap from "./SemanticMap";
import { X, Map as MapIcon, Loader2 } from "lucide-react";
import { MapCoordinate } from "@/services/mapService";

interface TopicMapModalProps {
  topicId: string;
  topicName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function TopicMapModal({ topicId, topicName, isOpen, onClose }: TopicMapModalProps) {
  const [data, setData] = useState<MapCoordinate[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    } else {
      setData([]); // Reset data on close to avoid stale map showing briefly next time
    }
  }, [isOpen, topicId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchTopicMapCoordinates(topicId);
      setData(res);
    } catch (e) {
      console.error(e);
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

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div 
        className="shadow-2xl flex flex-col relative"
        style={{
          width: "100%",
          maxWidth: "1100px",
          height: "90vh",
          maxHeight: "850px",
          display: "flex",
          flexDirection: "column",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div 
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-surface)"
          }}
        >
          <div>
            <h2 
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                margin: 0
              }}
            >
              <MapIcon size={20} color="var(--accent)" />
              {topicName} Semantic Map
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
              Displays profiles clustered by their stance and relevance within this specific topic.
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              borderRadius: "50%",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-primary)";
              e.currentTarget.style.background = "var(--bg-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X size={22} />
          </button>
        </div>
        
        {/* Map Area */}
        <div 
          style={{ 
            flex: 1, 
            padding: "24px", 
            background: "var(--bg-base)",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            minHeight: 0
          }}
        >
          {loading ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", color: "var(--text-muted)" }}>
              <Loader2 size={32} className="animate-spin text-blue-500" />
              <span style={{ fontSize: "14px" }}>Loading Map Data...</span>
            </div>
          ) : (
            <SemanticMap data={data} onGenerate={handleGenerate} title={topicName} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
