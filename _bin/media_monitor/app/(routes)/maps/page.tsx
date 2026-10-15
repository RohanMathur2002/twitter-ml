import React from "react";
import { fetchGlobalMapCoordinates, generateGlobalMap } from "@/app/actions/maps";
import SemanticMap from "@/components/maps/SemanticMap";

export const metadata = {
  title: "Global Semantic Map | Media Monitor",
};

export default async function GlobalMapPage() {
  const data = await fetchGlobalMapCoordinates();

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
          }}
        >
          Global Semantic Map
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            maxWidth: 600,
          }}
        >
          A comprehensive semantic embedding space of all profiles based on their overarching narrative and behavioral patterns.
        </p>
      </div>

      <div
        className="surface"
        style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.02)",
          height: "650px",
        }}
      >
        <SemanticMap 
          data={data} 
          onGenerate={generateGlobalMap} 
          title="Global" 
        />
      </div>
    </div>
  );
}
