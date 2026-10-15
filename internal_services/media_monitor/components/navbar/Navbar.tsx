"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ThemeToggle from "@/components/navbar/ThemeToggle";
import { Bookmark, User } from "lucide-react";

function NavLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const q = searchParams.get("q");

  const navItems = [
    { name: "Profiles", href: "/?q=profile" },
    { name: "Tweets", href: "/?q=tweet" },
    { name: "Keywords", href: "/?q=keyword" },
    { name: "Topics", href: "/topics" },
    { name: "Profile mapping", href: "/maps" },
  ];

  return (
    <nav className="flex items-center gap-6 justify-center">
      {navItems.map((item) => {
        let isActive = false;
        if (item.href.startsWith("/?q=")) {
          const itemQ = item.href.split("q=")[1];
          isActive =
            (pathname === "/" && (q === itemQ || (!q && itemQ === "profile"))) ||
            pathname.startsWith(`/${itemQ}`);
        } else {
          isActive = pathname === item.href || pathname.startsWith(item.href);
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-[13px] no-underline transition-colors duration-150 ${
              isActive
                ? "font-semibold text-[var(--accent)]"
                : "font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}

function BookmarkIcon() {
  const pathname = usePathname();
  const isActive = pathname === "/bookmarks";
  return (
    <Link
      href="/bookmarks"
      className={`w-8 h-8 rounded-md border flex items-center justify-center transition-all ${
        isActive
          ? "bg-[var(--accent)] border-[var(--accent)] text-white"
          : "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]"
      }`}
      title="Bookmarks"
    >
      <Bookmark size={15} className={isActive ? "fill-current" : ""} />
    </Link>
  );
}

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[var(--bg-surface)] border-b border-[var(--border)] h-14 flex items-center opacity-95 backdrop-blur-md">
      <div className="w-full max-w-[1200px] mx-auto flex justify-between items-center px-6">
        {/* Left Side: Brand Logo */}
        <div className="flex-1 flex justify-start">
          <Link href="/" className="flex items-center text-[var(--text-primary)] no-underline">
            <span className="text-[15px] font-bold tracking-tight">
              Media Monitor
            </span>
          </Link>
        </div>

        {/* Center: Navigation Links */}
        <Suspense fallback={<div className="w-48" />}>
          <NavLinks />
        </Suspense>

        {/* Right Side: Actions (Bookmarks, User Icon & Theme Toggle) */}
        <div className="flex-1 flex justify-end items-center gap-2.5">
          <Suspense fallback={<div className="w-8 h-8" />}>
            <BookmarkIcon />
          </Suspense>
          <div className="w-8 h-8 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-secondary)] shrink-0">
            <User size={15} />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
