"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/navbar/ThemeToggle";
import { User } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Profiles", href: "/" },
    { name: "Topics", href: "/topics" },
    { name: "Profile mapping", href: "/maps" },
  ];

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        height: 56,
        display: "flex",
        alignItems: "center",
        opacity: 0.95,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="page-container"
        style={{
          width: "100%",
          maxWidth: 1200,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 24px",
        }}
      >
        {/* Left Side: Brand Logo */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
              Media Monitor
            </span>
          </Link>
        </div>

        {/* Center: Navigation Links */}
        <nav style={{ display: "flex", alignItems: "center", gap: 24, justifyContent: "center" }}>
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/" || pathname.startsWith("/profile") || pathname.startsWith("/analyse-profile")
                : pathname === item.href || pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                  textDecoration: "none",
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Right Side: Actions (User Icon & Theme Toggle) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
              flexShrink: 0,
            }}
          >
            <User size={15} />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
