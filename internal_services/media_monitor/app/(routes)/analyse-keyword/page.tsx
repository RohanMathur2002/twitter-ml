"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { KeywordAnalyticsDashboard } from "@/components/keyword/KeywordAnalyticsDashboard";
import { RefreshCw } from "lucide-react";

export default function AnalyseKeywordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center py-24">
          <RefreshCw className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      }
    >
      <AnalyseKeywordContent />
    </Suspense>
  );
}

function AnalyseKeywordContent() {
  const searchParams = useSearchParams();
  const keyword = searchParams.get("q") || "";

  return (
    <div className="w-full flex justify-center pt-20 pb-20 px-6 sm:pt-12 sm:pb-10 sm:px-4 bg-[var(--bg-base)] min-h-[calc(100vh-56px)] text-[var(--text-primary)] font-sans">
      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-9 page-container">
        <KeywordAnalyticsDashboard initialKeyword={keyword} />
      </div>
    </div>
  );
}
