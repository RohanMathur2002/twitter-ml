import React from "react";
import { fetchGlobalMapCoordinates, generateGlobalMap } from "@/app/actions/maps";
import SemanticMap from "@/components/maps/SemanticMap";

export const metadata = {
  title: "Global Semantic Map | Media Monitor",
};

export default async function GlobalMapPage() {
  const data = await fetchGlobalMapCoordinates();

  return (
    <div className="w-full flex justify-center pt-20 pb-20 px-6 sm:pt-12 sm:pb-10 sm:px-4">
      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-6">
        <div className="flex justify-between items-center gap-4 border-b border-[var(--border)] pb-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight m-0 text-[var(--text-primary)]">
              Global Semantic Map
            </h1>
            <p className="text-sm text-[var(--text-secondary)] m-0">
              A comprehensive semantic embedding space of all profiles based on their overarching narrative and behavioral patterns.
            </p>
          </div>
        </div>

        <div className="w-full h-[650px]">
          <SemanticMap 
            data={data} 
            onGenerate={generateGlobalMap} 
            title="Global" 
          />
        </div>
      </div>
    </div>
  );
}
