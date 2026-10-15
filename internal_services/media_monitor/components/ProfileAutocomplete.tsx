"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

interface Profile {
  id?: number;
  username: string;
  display_name: string | null;
  profile_image_url: string | null;
  followers_count?: string;
}

interface ProfileAutocompleteProps {
  profiles: Profile[];
  value: string;
  onChange: (val: string) => void;
  onSelect?: (username: string) => void;
  onSubmit?: (e: React.FormEvent) => void;
  placeholder?: string;
  className?: string;
  size?: "default" | "lg";
}

export default function ProfileAutocomplete({
  profiles,
  value,
  onChange,
  onSelect,
  onSubmit,
  placeholder = "Search profile...",
  className = "",
  size = "default",
}: ProfileAutocompleteProps) {
  const [focused, setFocused] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external value to local state
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleInputChange = (newVal: string) => {
    setLocalValue(newVal);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onChange(newVal);
    }, 200);
  };

  const handleImmediateChange = (newVal: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setLocalValue(newVal);
    onChange(newVal);
  };

  const suggestions = localValue.trim()
    ? profiles
        .filter(
          (p) =>
            p.username.toLowerCase().includes(localValue.toLowerCase().replace(/^@/, "")) ||
            (p.display_name &&
              p.display_name.toLowerCase().includes(localValue.toLowerCase()))
        )
        .slice(0, 6)
    : [];

  const showDropdown = focused && suggestions.length > 0;

  return (
    <form
      onSubmit={onSubmit}
      className={`relative ${className}`}
      autoComplete="off"
    >
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
        <Search size={15} />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 180)}
        placeholder={placeholder}

        className={`bg-[var(--bg-subtle)] border text-[var(--text-primary)] rounded-lg pr-8 pl-9 text-sm w-full outline-none transition-all duration-150 ${
          size === "lg" ? "py-3" : "py-2"
        } ${
          focused
            ? "border-[var(--accent)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent),transparent_82%)]"
            : "border-[var(--border)]"
        }`}
      />
      {localValue && (
        <button
          type="button"
          onClick={() => {
            handleImmediateChange("");
            onSelect?.("");
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer bg-transparent border-none p-0 flex items-center justify-center"
        >
          <X size={13} />
        </button>
      )}
      {showDropdown && (

        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.15)] z-50 overflow-hidden">
          {suggestions.map((p) => (
            <button
              key={p.username}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleImmediateChange(p.username);
                onSelect?.(p.username);
                setFocused(false);
                inputRef.current?.blur();
              }}
              className="w-full py-2 px-3 text-left bg-transparent border-b border-[var(--border-subtle)] last:border-b-0 text-[var(--text-primary)] text-xs cursor-pointer flex items-center gap-2.5 transition-colors duration-100 hover:bg-[var(--bg-subtle)]"
            >
              {p.profile_image_url ? (
                <img
                  src={p.profile_image_url}
                  alt={p.username}
                  className="w-6 h-6 rounded-full object-cover shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] shrink-0">
                  {p.username[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-[var(--text-primary)] truncate">
                  {p.display_name || p.username}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  @{p.username}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
