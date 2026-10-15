"use client";

import { useState } from "react";

export default function TweetTestPage() {
  const [username, setUsername] = useState("");
  const [limit, setLimit] = useState<number | "">(10);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState("");

  const handleFetch = async () => {
    if (!username.trim()) {
      setError("Please enter a username.");
      return;
    }
    
    setLoading(true);
    setError("");
    setResults(null);
    
    try {
      const res = await fetch("/api/tweettest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
            username: username.trim(), 
            limit: limit || 10 
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "An error occurred fetching data.");
      } else {
        setResults(data);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] p-8 font-sans transition-colors duration-200">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
            Agent Dashboard Test
            </h1>
            <p className="text-[var(--text-muted)]">Test the Lobstr API integration with live tracking.</p>
        </div>
        
        <div className="surface p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col space-y-2">
                <label className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Target Username</label>
                <div className="flex relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">@</span>
                    <input 
                    type="text" 
                    placeholder="elonmusk" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg py-3 pl-8 pr-4 text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                    />
                </div>
              </div>
              
              <div className="flex flex-col space-y-2">
                <label className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Number of Result (Limit)</label>
                <input 
                  type="number" 
                  value={limit}
                  onChange={(e) => setLimit(e.target.value ? parseInt(e.target.value) : "")}
                  placeholder="10"
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
          </div>
          
          <button 
            onClick={handleFetch}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 active:scale-[0.98]"
          >
            {loading ? "Agent is working (This may take a few minutes)..." : "Execute Fetch Sequence"}
          </button>
          
          {error && (
            <div className="text-red-400 bg-red-500/10 p-4 rounded-lg border border-red-500/20 flex items-center space-x-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        {results && (
          <div className="surface p-6 space-y-6 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                <h2 className="text-xl font-semibold flex items-center space-x-2">
                    <span>Results for <span className="text-blue-500">@{results.username}</span></span>
                </h2>
                <span className="chip bg-blue-500/10 text-blue-500 border-blue-500/20 px-3 py-1 text-xs">
                    {results.tweets?.length || 0} Tweets
                </span>
            </div>

            {results.error ? (
               <div className="text-red-400 bg-red-500/10 p-4 rounded-lg border border-red-500/20">
                 {results.error}
               </div>
            ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {results.tweets?.map((tweet: any, i: number) => (
                      <div key={i} className="surface-subtle p-5 space-y-3 hover:border-blue-500/30 transition-surface">
                        <p className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{tweet.text}</p>
                        <div className="flex space-x-6 text-xs text-[var(--text-muted)] font-medium pt-2 border-t border-[var(--border-subtle)]">
                          <span className="flex items-center space-x-1 hover:text-red-400 transition-colors">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                              <span>{tweet.likes?.toLocaleString()}</span>
                          </span>
                          <span className="flex items-center space-x-1 hover:text-green-400 transition-colors">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                              <span>{tweet.retweets?.toLocaleString()}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              <span>{new Date(tweet.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric'})}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                    {results.tweets?.length === 0 && (
                        <div className="text-center py-12 text-[var(--text-muted)] space-y-3">
                            <svg className="w-12 h-12 mx-auto opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p>No tweets found or the fetch failed.</p>
                        </div>
                    )}
                </div>
            )}
            
            <details className="mt-4 group border border-[var(--border)] rounded-lg overflow-hidden">
                <summary className="text-sm text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-hover)] p-3 transition-colors flex justify-between items-center bg-[var(--bg-subtle)]">
                    <span className="font-medium">View Raw AI Agent Response</span>
                    <svg className="w-4 h-4 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </summary>
                <div className="bg-[var(--bg-surface)] p-4 overflow-x-auto text-xs text-[var(--text-muted)] border-t border-[var(--border)]">
                    <pre><code>{JSON.stringify(results, null, 2)}</code></pre>
                </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
