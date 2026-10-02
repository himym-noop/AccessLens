"use client";

import { useState } from "react";
import Link from "next/link";

export default function Home() {
  const [hovered, setHovered] = useState(false);

  return (
    <main className="min-h-screen bg-[#0b0d0c] text-white overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[-250px] left-[-200px] w-[600px] h-[600px] rounded-full bg-emerald-500/10 blur-[140px]" />
      <div className="absolute bottom-[-300px] right-[-150px] w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[140px]" />

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 md:px-14 py-7">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-black" />
          </div>

          <span className="text-xl font-semibold tracking-tight">
            AccessLens
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
          <span className="hover:text-white transition cursor-pointer">
            How it works
          </span>

          <span className="hover:text-white transition cursor-pointer">
            About
          </span>

          <span className="hover:text-white transition cursor-pointer">
            Accessibility
          </span>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 min-h-[calc(100vh-100px)] flex items-center px-8 md:px-14">
        <div className="max-w-6xl mx-auto w-full grid md:grid-cols-2 gap-16 items-center">

          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 border border-white/10 rounded-full px-4 py-2 text-xs text-white/60 mb-8">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              AI-powered accessibility intelligence
            </div>

            <h1 className="text-5xl md:text-7xl font-semibold tracking-[-0.04em] leading-[0.95]">
              See the space.
              <br />
              <span className="text-white/40">
                Understand the barriers.
              </span>
            </h1>

            <p className="mt-8 max-w-lg text-lg leading-8 text-white/50">
              AccessLens uses AI to understand physical environments,
              identify visible accessibility barriers, and help people
              discover potentially accessible routes.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/scan"
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className="group flex items-center gap-4 bg-white text-black px-6 py-4 rounded-2xl font-medium transition-all hover:scale-[1.02]"
              >
                Scan environment

                <span
                  className={`transition-transform ${
                    hovered ? "translate-x-1" : ""
                  }`}
                >
                  →
                </span>
              </Link>

              <button className="px-6 py-4 rounded-2xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition">
                See how it works
              </button>
            </div>

            <div className="mt-12 flex gap-8 text-sm">
              <div>
                <p className="text-white font-medium">Vision AI</p>
                <p className="text-white/35 mt-1">Environment analysis</p>
              </div>

              <div>
                <p className="text-white font-medium">Route AI</p>
                <p className="text-white/35 mt-1">Accessibility reasoning</p>
              </div>

              <div>
                <p className="text-white font-medium">Real-time</p>
                <p className="text-white/35 mt-1">Scan & adapt</p>
              </div>
            </div>
          </div>

          {/* Right visual */}
          <div className="relative">
            <div className="relative aspect-[4/5] max-w-md mx-auto rounded-[32px] border border-white/10 bg-white/[0.03] overflow-hidden">

              {/* Fake camera scene */}
              <div className="absolute inset-5 rounded-[24px] overflow-hidden bg-[#171a18]">

                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-black/40" />

                {/* Architecture */}
                <div className="absolute bottom-0 left-0 right-0 h-[48%] bg-[#252a27]" />

                {/* Door */}
                <div className="absolute bottom-[18%] left-[18%] w-[25%] h-[42%] border-4 border-white/20 rounded-t-xl" />

                {/* Ramp */}
                <div className="absolute bottom-[18%] right-[12%] w-[40%] h-3 bg-emerald-400/70 rotate-[-18deg] origin-right rounded-full" />

                {/* Accessibility marker */}
                <div className="absolute top-[28%] right-[15%] flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)]" />
                  <div className="text-xs bg-black/60 backdrop-blur-md border border-white/10 px-3 py-2 rounded-lg">
                    Ramp detected
                  </div>
                </div>

                {/* Stairs marker */}
                <div className="absolute bottom-[38%] left-[12%] flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-400 shadow-[0_0_20px_rgba(251,146,60,0.7)]" />
                  <div className="text-xs bg-black/60 backdrop-blur-md border border-white/10 px-3 py-2 rounded-lg">
                    Stairs
                  </div>
                </div>

                {/* Scan corners */}
                <div className="absolute top-6 left-6 w-8 h-8 border-l-2 border-t-2 border-white/60 rounded-tl-md" />
                <div className="absolute top-6 right-6 w-8 h-8 border-r-2 border-t-2 border-white/60 rounded-tr-md" />
                <div className="absolute bottom-6 left-6 w-8 h-8 border-l-2 border-b-2 border-white/60 rounded-bl-md" />
                <div className="absolute bottom-6 right-6 w-8 h-8 border-r-2 border-b-2 border-white/60 rounded-br-md" />
              </div>

              {/* Bottom status */}
              <div className="absolute bottom-7 left-7 right-7 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      Environment detected
                    </p>
                    <p className="text-xs text-white/40 mt-1">
                      4 accessibility features identified
                    </p>
                  </div>

                  <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
                    ✓
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>
    </main>
  );
}