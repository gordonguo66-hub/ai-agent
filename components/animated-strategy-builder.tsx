"use client";

import { useState, useEffect } from "react";

// ─── Constants ───────────────────────────────────────────────
const SCENE_DURATIONS = [9000, 4000, 4000, 4000, 4000]; // Basics is 9s (typing), rest are 4s
const TOTAL_CYCLE = SCENE_DURATIONS.reduce((a, b) => a + b, 0);
const TOTAL_SCENES = 5;
const TICK_INTERVAL = 50;

const TABS = [
  { id: "basics", label: "Basics", scenes: [0] },
  { id: "markets", label: "Markets", scenes: [1] },
  { id: "ai", label: "AI Inputs", scenes: [2] },
  { id: "entry", label: "Entry/Exit", scenes: [3] },
  { id: "risk", label: "Risk", scenes: [4] },
];

// ─── Provider logos (14px mini versions, matching provider-logos.tsx) ─────
const MINI_LOGO_SIZE = 14;

function OpenAILogo() {
  return (
    <svg width={MINI_LOGO_SIZE} height={MINI_LOGO_SIZE} viewBox="0 0 24 24" fill="none">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="currentColor" />
    </svg>
  );
}

function AnthropicLogo() {
  return (
    <svg width={MINI_LOGO_SIZE} height={MINI_LOGO_SIZE} viewBox="0 0 16 16" fill="none">
      <path d="M9.218 2h2.402L16 12.987h-2.402zM4.379 2h2.512l4.38 10.987H8.82l-.895-2.307h-4.58l-.896 2.307H0L4.38 2.001zm2.755 6.64L5.635 4.777 4.137 8.64z" fill="currentColor" />
    </svg>
  );
}

function DeepSeekLogo() {
  return (
    <svg width={MINI_LOGO_SIZE} height={MINI_LOGO_SIZE} viewBox="60 80 420 380" fill="none">
      <path fill="#4D6BFE" d="M440.898 139.167c-4.001-1.961-5.723 1.776-8.062 3.673-.801.612-1.479 1.407-2.154 2.141-5.848 6.246-12.681 10.349-21.607 9.859-13.048-.734-24.192 3.368-34.04 13.348-2.093-12.307-9.048-19.658-19.635-24.37-5.54-2.449-11.141-4.9-15.02-10.227-2.708-3.795-3.447-8.021-4.801-12.185-.861-2.509-1.725-5.082-4.618-5.512-3.139-.49-4.372 2.142-5.601 4.349-4.925 9.002-6.833 18.921-6.647 28.962.432 22.597 9.972 40.597 28.932 53.397 2.154 1.47 2.707 2.939 2.032 5.082-1.293 4.41-2.832 8.695-4.186 13.105-.862 2.817-2.157 3.429-5.172 2.205-10.402-4.346-19.391-10.778-27.332-18.553-13.481-13.044-25.668-27.434-40.873-38.702a177.614 177.614 0 00-10.834-7.409c-15.512-15.063 2.032-27.434 6.094-28.902 4.247-1.532 1.478-6.797-12.251-6.736-13.727.061-26.285 4.653-42.288 10.777-2.34.92-4.801 1.593-7.326 2.142-14.527-2.756-29.608-3.368-45.367-1.593-29.671 3.305-53.368 17.329-70.788 41.272-20.928 28.785-25.854 61.482-19.821 95.59 6.34 35.943 24.683 65.704 52.876 88.974 29.239 24.123 62.911 35.943 101.32 33.677 23.329-1.346 49.307-4.468 78.607-29.27 7.387 3.673 15.142 5.144 28.008 6.246 9.911.92 19.452-.49 26.839-2.019 11.573-2.449 10.773-13.166 6.586-15.124-33.915-15.797-26.47-9.368-33.24-14.573 17.235-20.39 43.213-41.577 53.369-110.222.8-5.448.121-8.877 0-13.287-.061-2.692.553-3.734 3.632-4.041 8.494-.981 16.742-3.305 24.314-7.471 21.975-12.002 30.84-31.719 32.933-55.355.307-3.612-.061-7.348-3.879-9.245v-.003z" />
    </svg>
  );
}

function GeminiLogo() {
  return (
    <svg width={MINI_LOGO_SIZE} height={MINI_LOGO_SIZE} viewBox="0 0 65 65" fill="none">
      <defs>
        <linearGradient id="anim-gemini" x1="18" y1="43" x2="52" y2="15" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4" />
          <stop offset="1" stopColor="#886FBF" />
        </linearGradient>
      </defs>
      <path d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z" fill="url(#anim-gemini)" />
    </svg>
  );
}

function GrokLogo() {
  return (
    <svg width={MINI_LOGO_SIZE} height={MINI_LOGO_SIZE} viewBox="50 60 420 400" fill="none">
      <path fill="currentColor" d="M213.235 306.019l178.976-180.002v.169l51.695-51.763c-.924 1.32-1.86 2.605-2.785 3.89-39.281 54.164-58.46 80.649-43.07 146.922l-.09-.101c10.61 45.11-.744 95.137-37.398 131.836-46.216 46.306-120.167 56.611-181.063 14.928l42.462-19.675c38.863 15.278 81.392 8.57 111.947-22.03 30.566-30.6 37.432-75.159 22.065-112.252-2.92-7.025-11.67-8.795-17.792-4.263l-124.947 92.341zm-25.786 22.437l-.033.034L68.094 435.217c7.565-10.429 16.957-20.294 26.327-30.149 26.428-27.803 52.653-55.359 36.654-94.302-21.422-52.112-8.952-113.177 30.724-152.898 41.243-41.254 101.98-51.661 152.706-30.758 11.23 4.172 21.016 10.114 28.638 15.639l-42.359 19.584c-39.44-16.563-84.629-5.299-112.207 22.313-37.298 37.308-44.84 102.003-1.128 143.81z" />
    </svg>
  );
}

function QwenLogo() {
  return (
    <svg width={MINI_LOGO_SIZE} height={MINI_LOGO_SIZE} viewBox="27.55 17.52 147.28 145.51" fill="none">
      <path d="M174.82 108.75L155.38 75L165.64 57.75C166.46 56.31 166.46 54.53 165.64 53.09L155.38 35.84C154.86 34.91 153.87 34.33 152.78 34.33H114.88L106.14 19.03C105.62 18.1 104.63 17.52 103.54 17.52H83.3C82.21 17.52 81.22 18.1 80.7 19.03L61.26 52.77H41.02C39.93 52.77 38.94 53.35 38.42 54.28L28.16 71.53C27.34 72.97 27.34 74.75 28.16 76.19L45.52 107.5L36.78 122.8C35.96 124.24 35.96 126.02 36.78 127.46L47.04 144.71C47.56 145.64 48.55 146.22 49.64 146.22H87.54L96.28 161.52C96.8 162.45 97.79 163.03 98.88 163.03H119.12C120.21 163.03 121.2 162.45 121.72 161.52L141.16 127.78H158.52C159.61 127.78 160.6 127.2 161.12 126.27L171.38 109.02C172.2 107.58 172.2 105.8 171.38 104.36L174.82 108.75Z" fill="#665CEE" />
      <path d="M119.12 163.03H98.88L87.54 144.71H49.64L61.26 126.39H80.7L38.42 55.29H61.26L83.3 19.03L93.56 37.35L83.3 55.29H161.58L151.32 72.54L170.76 106.28H151.32L141.16 88.34L101.18 163.03H119.12Z" fill="white" />
      <path d="M127.86 79.83H76.14L101.18 122.11L127.86 79.83Z" fill="#665CEE" />
    </svg>
  );
}

// All 6 providers with their logos and display names
const AI_PROVIDERS = [
  { id: "openai", name: "OpenAI", logo: <OpenAILogo /> },
  { id: "anthropic", name: "Anthropic", logo: <AnthropicLogo /> },
  { id: "deepseek", name: "DeepSeek", logo: <DeepSeekLogo /> },
  { id: "google", name: "Google Gemini", logo: <GeminiLogo /> },
  { id: "xai", name: "xAI (Grok)", logo: <GrokLogo /> },
  { id: "qwen", name: "Qwen (Alibaba)", logo: <QwenLogo /> },
];

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", desc: "Frontier intelligence" },
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", desc: "Coding & agentic tasks" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", desc: "Fast, efficient" },
];

// ─── Mini Switch Component ───────────────────────────────────
function MiniSwitch({ on }: { on: boolean }) {
  return (
    <div
      className={`relative w-8 h-[18px] rounded-full transition-colors duration-300 ${
        on ? "bg-blue-600" : "bg-gray-600"
      }`}
    >
      <div
        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all duration-300 ${
          on ? "left-[16px]" : "left-[2px]"
        }`}
      />
    </div>
  );
}

// ─── Scene Components ────────────────────────────────────────

function VenueScene({ progress }: { progress: number }) {
  const venues = [
    { name: "Hyperliquid", desc: "Perpetuals (up to 50x)" },
    { name: "Coinbase", desc: "Spot trading (1x only)" },
    { name: "Virtual", desc: "Paper trading (no exchange)" },
    { name: "Arena", desc: "Competition mode" },
  ];
  const selected = progress > 0.375; // ~1.5s

  return (
    <div className="space-y-3">
      <div className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">
        Exchange Venue
      </div>
      <div className="grid grid-cols-2 gap-2">
        {venues.map((v, i) => {
          const isSelected = i === 0 && selected;
          return (
            <div
              key={v.name}
              className={`p-2.5 rounded-lg border text-left transition-all duration-500 ${
                isSelected
                  ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30"
                  : `border-white/10 ${selected && i !== 0 ? "opacity-40" : "opacity-70"}`
              }`}
            >
              <div className={`text-[12px] font-semibold ${isSelected ? "text-white" : "text-white/80"}`}>
                {v.name}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">{v.desc}</div>
            </div>
          );
        })}
      </div>
      {selected && (
        <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-md transition-opacity duration-500">
          <p className="text-[10px] text-blue-400">
            <span className="font-semibold">Hyperliquid:</span> Perpetuals with leverage and short selling
          </p>
        </div>
      )}
    </div>
  );
}

const PROMPT_TEXT = "Maximize my profit with strict risk control.";

function ConfigScene({ progress }: { progress: number }) {
  // Timeline (9s scene):
  // 0.00-0.07: Pause, name field visible (~0.6s)
  // 0.07-0.52: Provider dropdown open, scans ALL 6 providers (~4s)
  //   Scan: OpenAI → Anthropic → DeepSeek → Gemini → Grok → Qwen
  //   Index 5 (Qwen) reached at ~0.42, shown for ~0.4s
  // 0.46-0.52: Lock back on Anthropic with checkmark (~0.5s)
  // 0.52-0.57: Dropdown closes, Anthropic confirmed (~0.5s)
  // 0.57-0.72: Model dropdown open, selects Opus 4.5 after 1s (~1.35s)
  // 0.68: Opus 4.5 highlighted with checkmark (1s after open)
  // 0.72-0.75: Model confirmed
  // 0.75-1.00: Trading prompt typewriter (~2.25s)

  const dropdownOpen = progress > 0.07 && progress < 0.52;
  const providerSelected = progress > 0.52;
  const modelDropdownOpen = progress > 0.57 && progress < 0.72;
  const modelSelected = progress > 0.72;

  // Each provider highlighted for ~0.065 of progress (~0.6s each at 9s)
  // Scanning starts at 0.09, index 5 (Qwen) reached at 0.09 + 5*0.065 = 0.415
  const highlightIndex = dropdownOpen
    ? Math.min(5, Math.floor((progress - 0.09) / 0.065))
    : -1;
  // After scanning ALL 6 (including Qwen), lock back on Anthropic (index 1)
  const finalHighlight = progress > 0.46 ? 1 : highlightIndex;

  // Model: open dropdown, wait 1s (~0.11 progress), then select Opus 4.5
  const finalModelHighlight = modelDropdownOpen && progress > 0.68 ? 0 : -1;

  // Typewriter for trading prompt (0.75 → 0.89), then 1s pause before scene change
  const typingProgress = Math.max(0, Math.min(1, (progress - 0.75) / 0.14));
  const visibleChars = Math.floor(typingProgress * PROMPT_TEXT.length);
  const typedText = PROMPT_TEXT.slice(0, visibleChars);
  const showCursor = progress > 0.73;

  return (
    <div className="space-y-3">
      {/* Strategy Name - pre-filled */}
      <div className="space-y-1">
        <div className="text-[12px] font-semibold text-white/70">Strategy Name</div>
        <div className="h-8 w-full rounded-md border border-white/10 bg-white/5 px-2.5 flex items-center">
          <span className="text-[12px] text-white/80 font-mono">Momentum Scalper v1</span>
        </div>
      </div>

      {/* Model Provider - with animated dropdown */}
      <div className="space-y-1 relative">
        <div className="text-[12px] font-semibold text-white/70">Model Provider</div>
        <div
          className={`h-8 w-full rounded-md border px-2.5 flex items-center justify-between transition-all duration-200 ${
            dropdownOpen
              ? "border-blue-500/50 ring-1 ring-blue-500/20 bg-white/5"
              : "border-white/10 bg-white/5"
          }`}
        >
          {providerSelected ? (
            <span className="flex items-center gap-2">
              <span className="text-white"><AnthropicLogo /></span>
              <span className="text-[12px] text-white/90 font-medium">Anthropic</span>
            </span>
          ) : (
            <span className="text-[11px] text-white/30">Select a provider...</span>
          )}
          <svg
            width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            className={`text-white/30 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        {/* Provider dropdown panel */}
        <div
          className={`absolute z-20 left-0 right-0 mt-1 rounded-lg border border-white/10 bg-black shadow-xl transition-all duration-200 origin-top ${
            dropdownOpen
              ? "opacity-100 scale-y-100"
              : "opacity-0 scale-y-95 pointer-events-none"
          }`}
        >
          <div className="p-1">
            {AI_PROVIDERS.map((provider, i) => {
              const isHighlighted = finalHighlight === i;
              const isSelected = providerSelected && i === 1; // Anthropic
              return (
                <div
                  key={provider.id}
                  className={`flex items-center gap-2 px-2.5 py-[6px] rounded-md text-[11px] transition-all duration-150 ${
                    isHighlighted
                      ? "bg-blue-500/15 text-white"
                      : isSelected
                      ? "bg-blue-500/10 text-white"
                      : "text-white/60"
                  }`}
                >
                  <span className="flex shrink-0 items-center">{provider.logo}</span>
                  <span className="flex-1 font-medium">{provider.name}</span>
                  {isHighlighted && i === 1 && progress > 0.46 && (
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="text-blue-400">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Model Name - with animated dropdown */}
      <div className="space-y-1 relative">
        <div className="text-[12px] font-semibold text-white/70">Model Name</div>
        <div
          className={`h-8 w-full rounded-md border px-2.5 flex items-center justify-between transition-all duration-200 ${
            modelDropdownOpen
              ? "border-blue-500/50 ring-1 ring-blue-500/20 bg-white/5"
              : "border-white/10 bg-white/5"
          }`}
        >
          {modelSelected ? (
            <span className="flex items-center gap-2">
              <span className="text-white"><AnthropicLogo /></span>
              <span className="text-[12px] text-white/90 font-medium">Claude Opus 4.5</span>
            </span>
          ) : providerSelected ? (
            <span className="text-[11px] text-white/30">Select a model...</span>
          ) : (
            <span className="text-[11px] text-white/20">Select a provider first...</span>
          )}
          <svg
            width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            className={`text-white/30 transition-transform duration-200 ${modelDropdownOpen ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        {/* Model dropdown panel */}
        <div
          className={`absolute z-10 left-0 right-0 mt-1 rounded-lg border border-white/10 bg-black shadow-xl transition-all duration-200 origin-top ${
            modelDropdownOpen
              ? "opacity-100 scale-y-100"
              : "opacity-0 scale-y-95 pointer-events-none"
          }`}
        >
          <div className="p-1">
            {ANTHROPIC_MODELS.map((model, i) => {
              const isHighlighted = finalModelHighlight === i;
              return (
                <div
                  key={model.id}
                  className={`flex items-center gap-2 px-2.5 py-[6px] rounded-md transition-all duration-150 ${
                    isHighlighted ? "bg-blue-500/15" : ""
                  }`}
                >
                  <span className="flex shrink-0 items-center text-white"><AnthropicLogo /></span>
                  <span className={`flex-1 text-[11px] font-medium ${isHighlighted ? "text-white" : "text-white/60"}`}>
                    {model.name}
                  </span>
                  <span className="text-[9px] text-white/30">{model.desc}</span>
                  {isHighlighted && i === 0 && progress > 0.68 && (
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="text-blue-400">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Trading Prompt - typewriter */}
      <div className="space-y-1">
        <div className="text-[12px] font-semibold text-white/70">Trading Prompt</div>
        <div className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 overflow-hidden">
          <span className="text-[10px] text-white/80 font-mono leading-tight">
            {typedText}
            {showCursor && <span className="animate-blink text-blue-400">|</span>}
          </span>
          {!showCursor && (
            <span className="text-[10px] text-white/15 font-mono leading-tight">
              Describe your trading strategy...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AIInputsScene({ progress }: { progress: number }) {
  const indicators = [
    { name: "Candles", detail: "200 × 5m", on: false, threshold: 0.10 },
    { name: "RSI", detail: "Period: 14", on: false, threshold: 0.25 },
    { name: "ATR", detail: "Period: 14", on: false, threshold: 0.40 },
    { name: "EMA", detail: "Fast: 12 / Slow: 26", on: false, threshold: 0.55 },
  ];

  return (
    <div className="space-y-3">
      <div className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">
        Data Sources
      </div>
      <div className="space-y-1">
        {indicators.map((ind) => {
          const isOn = ind.on || progress > ind.threshold;
          return (
            <div
              key={ind.name}
              className="flex items-center justify-between py-2 px-2.5 rounded-md border border-white/5 bg-white/[0.02]"
            >
              <div>
                <div className="text-[12px] font-medium text-white/80">{ind.name}</div>
                <div className="text-[10px] text-white/35">{ind.detail}</div>
              </div>
              <MiniSwitch on={isOn} />
            </div>
          );
        })}
      </div>

      {/* Additional toggles */}
      <div className="pt-1 border-t border-white/5 space-y-1">
        <div className="flex items-center justify-between py-1.5 px-2.5">
          <span className="text-[11px] text-white/50">Include Position State</span>
          <MiniSwitch on={progress > 0.70} />
        </div>
        <div className="flex items-center justify-between py-1.5 px-2.5">
          <span className="text-[11px] text-white/50">Recent Decisions (5)</span>
          <MiniSwitch on={progress > 0.85} />
        </div>
      </div>
    </div>
  );
}

function EntryExitScene({ progress }: { progress: number }) {
  const behaviors = [
    { name: "Trend Following", on: true, threshold: 0 },
    { name: "Breakout", on: false, threshold: 0.25 },
    { name: "Mean Reversion", on: false, threshold: 0.5 },
  ];

  const confidence = Math.min(70, 50 + Math.floor(progress * 25));

  return (
    <div className="space-y-3">
      {/* Entry Behaviors */}
      <div className="space-y-1.5">
        <div className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">
          Entry Behaviors
        </div>
        <div className="space-y-1">
          {behaviors.map((b) => {
            const isOn = b.on || progress > b.threshold;
            return (
              <div
                key={b.name}
                className="flex items-center justify-between py-2 px-2.5 rounded-md border border-white/5 bg-white/[0.02]"
              >
                <span className="text-[12px] font-medium text-white/80">{b.name}</span>
                <MiniSwitch on={isOn} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Exit Mode */}
      <div className="space-y-1.5">
        <div className="text-[12px] font-semibold text-white/70">Exit Mode</div>
        <div className="h-8 w-full rounded-md border border-white/10 bg-white/5 px-2.5 flex items-center justify-between">
          <span className="text-[13px] text-white/90">Signal (AI-driven)</span>
          <ChevronDown />
        </div>
      </div>

      {/* Confidence */}
      <div className="flex items-center justify-between py-2 px-2.5 rounded-md border border-white/5 bg-white/[0.02]">
        <span className="text-[12px] font-medium text-white/70">Min Confidence</span>
        <span className="text-[14px] font-semibold text-blue-400 tabular-nums">{confidence}%</span>
      </div>
    </div>
  );
}

function RiskScene({ progress }: { progress: number }) {
  const dailyLoss = Math.min(5, Math.floor(progress * 1.5 * 5));
  const positionSize = Math.min(1000, Math.floor(progress * 1.5 * 1000));
  const leverage = Math.min(3, 1 + Math.floor(progress * 1.3 * 2));
  const showLong = progress > 0.5;
  const showShort = progress > 0.75;

  return (
    <div className="space-y-3">
      <div className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">
        Risk Limits
      </div>

      <div className="space-y-2">
        {/* Max Daily Loss */}
        <div className="flex items-center justify-between py-2.5 px-2.5 rounded-md border border-white/5 bg-white/[0.02]">
          <div>
            <div className="text-[12px] font-medium text-white/80">Max Daily Loss</div>
            <div className="text-[10px] text-white/35">Emergency stop threshold</div>
          </div>
          <span className="text-[15px] font-semibold text-red-400 tabular-nums">{dailyLoss}%</span>
        </div>

        {/* Max Position Size */}
        <div className="flex items-center justify-between py-2.5 px-2.5 rounded-md border border-white/5 bg-white/[0.02]">
          <div>
            <div className="text-[12px] font-medium text-white/80">Max Position Size</div>
            <div className="text-[10px] text-white/35">Per-trade limit</div>
          </div>
          <span className="text-[15px] font-semibold text-white/90 tabular-nums">
            ${positionSize.toLocaleString()}
          </span>
        </div>

        {/* Max Leverage */}
        <div className="flex items-center justify-between py-2.5 px-2.5 rounded-md border border-white/5 bg-white/[0.02]">
          <div>
            <div className="text-[12px] font-medium text-white/80">Max Leverage</div>
            <div className="text-[10px] text-white/35">Maximum multiplier</div>
          </div>
          <span className="text-[15px] font-semibold text-yellow-400 tabular-nums">{leverage}x</span>
        </div>
      </div>

      {/* Direction badges */}
      <div className="flex gap-2 pt-1">
        <span
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all duration-500 ${
            showLong
              ? "bg-green-500/15 text-green-400 border border-green-500/20"
              : "bg-white/5 text-white/20 border border-white/5"
          }`}
        >
          Long
        </span>
        <span
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all duration-500 ${
            showShort
              ? "bg-green-500/15 text-green-400 border border-green-500/20"
              : "bg-white/5 text-white/20 border border-white/5"
          }`}
        >
          Short
        </span>
      </div>
    </div>
  );
}

// ─── Tiny chevron icon ───────────────────────────────────────
function ChevronDown() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-white/30">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────
export function AnimatedStrategyBuilder() {
  const [scene, setScene] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += TICK_INTERVAL;
      const cycleTime = elapsed % TOTAL_CYCLE;
      let acc = 0;
      for (let i = 0; i < TOTAL_SCENES; i++) {
        if (cycleTime < acc + SCENE_DURATIONS[i]) {
          setScene(i);
          setProgress((cycleTime - acc) / SCENE_DURATIONS[i]);
          break;
        }
        acc += SCENE_DURATIONS[i];
      }
    }, TICK_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const activeTab = TABS.find((t) => t.scenes.includes(scene))?.id || "basics";

  return (
    <div className="w-full max-w-[380px] sm:max-w-[430px] md:max-w-[480px]">
      <style jsx>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes cardGlow {
          0%, 100% { box-shadow: 0 0 15px rgba(255, 255, 255, 0.06), 0 0 40px rgba(255, 255, 255, 0.03); }
          50% { box-shadow: 0 0 20px rgba(255, 255, 255, 0.12), 0 0 60px rgba(255, 255, 255, 0.05); }
        }
        .animate-blink { animation: blink 1s step-end infinite; }
        .card-glow { animation: cardGlow 6s ease-in-out infinite; }
      `}</style>

      <div className="card-glow bg-black border border-white/[0.28] rounded-3xl overflow-hidden pointer-events-none select-none">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-semibold text-white/80">Strategy Builder</div>
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500/40" />
              <div className="w-2 h-2 rounded-full bg-yellow-500/40" />
              <div className="w-2 h-2 rounded-full bg-green-500/40" />
            </div>
          </div>
          {/* Tab bar */}
          <div className="flex gap-0.5 mt-2.5">
            {TABS.map((tab) => (
              <div
                key={tab.id}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors duration-200 ${
                  activeTab === tab.id
                    ? "bg-blue-600/25 text-blue-400"
                    : "text-white/25"
                }`}
              >
                {tab.label}
              </div>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="relative h-[370px] sm:h-[390px]">
          {/* Scene 0: Strategy Config (Basics tab) */}
          <div
            className={`absolute inset-0 p-4 transition-opacity duration-300 ${
              scene === 0 ? "opacity-100" : "opacity-0"
            }`}
          >
            <ConfigScene progress={scene === 0 ? progress : 1} />
          </div>

          {/* Scene 1: Venue Selection (Markets tab) */}
          <div
            className={`absolute inset-0 p-4 transition-opacity duration-300 ${
              scene === 1 ? "opacity-100" : "opacity-0"
            }`}
          >
            <VenueScene progress={scene === 1 ? progress : 1} />
          </div>

          {/* Scene 2: AI Inputs */}
          <div
            className={`absolute inset-0 p-4 transition-opacity duration-300 ${
              scene === 2 ? "opacity-100" : "opacity-0"
            }`}
          >
            <AIInputsScene progress={scene === 2 ? progress : 1} />
          </div>

          {/* Scene 3: Entry/Exit */}
          <div
            className={`absolute inset-0 p-4 transition-opacity duration-300 ${
              scene === 3 ? "opacity-100" : "opacity-0"
            }`}
          >
            <EntryExitScene progress={scene === 3 ? progress : 1} />
          </div>

          {/* Scene 4: Risk */}
          <div
            className={`absolute inset-0 p-4 transition-opacity duration-300 ${
              scene === 4 ? "opacity-100" : "opacity-0"
            }`}
          >
            <RiskScene progress={scene === 4 ? progress : 1} />
          </div>
        </div>
      </div>
    </div>
  );
}
