import React, { useCallback, useEffect, useState } from 'react';
import type { BooleanSettingKey, TunToggleItem } from './tunConfig';

interface MonochromeSwitchVisualProps {
  enabled: boolean;
}

/** Sleek, refined hardware-style monochrome toggle pill with no icon clutter. */
export const MonochromeSwitchVisual: React.FC<MonochromeSwitchVisualProps> = React.memo(
  ({ enabled }) => (
    <span
      aria-hidden="true"
      className={`w-8 h-[18px] rounded-full border flex items-center justify-start px-[2px] shrink-0 transition-colors duration-150 ${
        enabled
          ? 'bg-white border-white shadow-[0_0_10px_rgba(255,255,255,0.28)]'
          : 'bg-white/[0.08] border-white/15'
      }`}
    >
      <span
        className={`w-3 h-3 rounded-full will-change-transform transition-transform duration-150 ${
          enabled ? 'translate-x-[14px] bg-black' : 'translate-x-0 bg-zinc-400'
        }`}
      />
    </span>
  )
);
MonochromeSwitchVisual.displayName = 'MonochromeSwitchVisual';

interface TunToggleRowProps {
  item: TunToggleItem;
  enabled: boolean;
  onToggleKey: (key: BooleanSettingKey) => void;
  variant?: 'standalone' | 'divided';
}

/**
 * Minimal, breathable toggle row using a single semantic button[role="switch"]
 * supporting both standalone card rows and hairline-divided unified list rows.
 */
export const TunToggleRow: React.FC<TunToggleRowProps> = React.memo(
  ({ item, enabled, onToggleKey, variant = 'standalone' }) => {
    const handleToggle = useCallback(() => {
      onToggleKey(item.key);
    }, [onToggleKey, item.key]);

    const surfaceClasses =
      variant === 'divided'
        ? `px-3 py-2.5 focus-visible:ring-inset ${
            enabled
              ? 'bg-white/[0.03] hover:bg-white/[0.05]'
              : 'hover:bg-white/[0.02]'
          }`
        : `px-3 py-2.5 rounded-xl border ${
            enabled
              ? 'bg-white/[0.05] border-white/20 hover:border-white/30'
              : 'bg-[#121317] border-white/[0.06] hover:border-white/15'
          }`;

    return (
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={handleToggle}
        className={`contain-row w-full text-left flex items-center justify-between gap-3 cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 transition-colors duration-150 ${surfaceClasses}`}
      >
        <div className="min-w-0 space-y-0.5">
          <span
            className={`block text-[11px] font-semibold transition-colors duration-150 ${
              enabled ? 'text-white' : 'text-zinc-200 group-hover:text-white'
            }`}
          >
            {item.title}
          </span>
          <p className="text-[9.5px] text-zinc-400 leading-snug">{item.desc}</p>
        </div>

        <MonochromeSwitchVisual enabled={enabled} />
      </button>
    );
  }
);
TunToggleRow.displayName = 'TunToggleRow';

interface RovingKeyOptions {
  e: React.KeyboardEvent<HTMLButtonElement>;
  index: number;
  count: number;
  role: 'radio' | 'tab';
  onSelectIndex: (nextIdx: number) => void;
}

/** Handles ArrowLeft/ArrowRight navigation and focus movement for radio/tab groups. */
export function handleRovingGroupKeyDown({
  e,
  index,
  count,
  role,
  onSelectIndex,
}: RovingKeyOptions): void {
  if (count <= 0) return;
  let nextIdx: number | null = null;
  if (e.key === 'ArrowRight') {
    nextIdx = (index + 1) % count;
  } else if (e.key === 'ArrowLeft') {
    nextIdx = (index - 1 + count) % count;
  }
  if (nextIdx === null) return;

  e.preventDefault();
  onSelectIndex(nextIdx);
  const items = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
    `[role="${role}"]`
  );
  items?.[nextIdx]?.focus();
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  sublabel?: string;
}

interface SegmentedControlProps<T extends string | number> {
  ariaLabel: string;
  options: SegmentedOption<T>[];
  value: T | null;
  onChange: (val: T) => void;
  compact?: boolean;
  darkSurface?: boolean;
}

/**
 * Reusable GPU-gliding segmented selector with spring-like motion matching Sidebar.
 */
export function SegmentedControl<T extends string | number>({
  ariaLabel,
  options,
  value,
  onChange,
  compact = false,
  darkSurface = true,
}: SegmentedControlProps<T>) {
  const activeIndex = value === null ? -1 : options.findIndex((o) => o.value === value);
  const count = options.length;
  const colClass =
    count === 2 ? 'grid-cols-2' : count === 3 ? 'grid-cols-3' : 'grid-cols-4';
  const widthPct = `${100 / count}%`;

  return (
    <div
      className={`p-1 rounded-xl border border-white/[0.07] ${
        darkSurface ? 'bg-[#0b0c10]' : 'bg-black/40'
      }`}
    >
      <div role="radiogroup" aria-label={ariaLabel} className={`relative grid ${colClass}`}>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 rounded-lg bg-white shadow-[0_2px_10px_rgba(255,255,255,0.14)] will-change-transform transition-[transform,opacity] duration-200 ${
            activeIndex >= 0 ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            width: widthPct,
            transitionTimingFunction: 'cubic-bezier(0.22, 1.25, 0.36, 1)',
            transform: `translate3d(${Math.max(0, activeIndex) * 100}%, 0, 0)`,
          }}
        />

        {options.map((opt, idx) => {
          const selected = opt.value === value;
          const isTabStop = selected || (activeIndex < 0 && idx === 0);
          return (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={isTabStop ? 0 : -1}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) =>
                handleRovingGroupKeyDown({
                  e,
                  index: idx,
                  count,
                  role: 'radio',
                  onSelectIndex: (nextIdx) => onChange(options[nextIdx].value),
                })
              }
              className={`relative z-10 rounded-lg flex items-center justify-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 transition-colors duration-150 ${
                compact ? 'py-1 px-1.5 text-[10px]' : 'py-1.5 px-2 text-[10.5px]'
              } font-semibold ${selected ? 'text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              <span className={opt.sublabel ? '' : 'font-mono tabular-nums'}>{opt.label}</span>
              {opt.sublabel && (
                <span
                  className={`text-[8.5px] font-mono ${
                    selected ? 'text-black/65' : 'text-zinc-500'
                  }`}
                >
                  {opt.sublabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface PrecisionPreset {
  value: number;
  label: string;
  hint?: string;
}

interface PrecisionTrackControlProps {
  label: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  presets: PrecisionPreset[];
  headerRight?: React.ReactNode;
  onCommit: (nextValue: number) => void;
  embedded?: boolean;
}

/**
 * Calibrated precision slider with tick markers, snap preset chips,
 * and an inline spinner-free numeric input. Commits only on release/Enter/blur
 * so WinTUN never reloads mid-drag.
 */
export const PrecisionTrackControl: React.FC<PrecisionTrackControlProps> = React.memo(
  ({
    label,
    ariaLabel,
    value,
    min,
    max,
    presets,
    headerRight,
    onCommit,
    embedded = false,
  }) => {
    const [draftValue, setDraftValue] = useState<number>(value);
    const [textValue, setTextValue] = useState<string>(String(value));
    const isDraggingRef = React.useRef(false);

    useEffect(() => {
      if (!isDraggingRef.current) {
        setDraftValue(value);
        setTextValue(String(value));
      }
    }, [value]);

    const clamp = useCallback(
      (n: number) => Math.min(max, Math.max(min, Math.round(n))),
      [min, max]
    );

    const commitNumeric = useCallback(
      (raw: string) => {
        const parsed = parseInt(raw, 10);
        if (Number.isNaN(parsed)) {
          setDraftValue(value);
          setTextValue(String(value));
          return;
        }
        const next = clamp(parsed);
        setDraftValue(next);
        setTextValue(String(next));
        if (next !== value) onCommit(next);
      },
      [clamp, onCommit, value]
    );

    const commitSlider = useCallback(
      (nextNum: number) => {
        isDraggingRef.current = false;
        const next = clamp(nextNum);
        setDraftValue(next);
        setTextValue(String(next));
        if (next !== value) onCommit(next);
      },
      [clamp, onCommit, value]
    );

    const pct = Math.min(100, Math.max(0, ((draftValue - min) / (max - min)) * 100));

    return (
      <div
        className={
          embedded
            ? 'space-y-2'
            : 'p-2.5 rounded-xl bg-[#121317] border border-white/[0.06] space-y-2'
        }
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-white truncate">{label}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {headerRight}
            <input
              type="number"
              min={min}
              max={max}
              value={textValue}
              aria-label={`${ariaLabel} numeric input`}
              onChange={(e) => setTextValue(e.target.value)}
              onBlur={() => commitNumeric(textValue)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitNumeric(textValue);
              }}
              className="w-12 py-0.5 px-1.5 rounded-md bg-[#090a0d] border border-white/[0.12] focus:border-white/40 text-white text-[10px] font-mono tabular-nums text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>

        {/* Full-Width Edge-to-Edge Calibrated Slider */}
        <div className="relative flex items-center py-1">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-1.5 h-1">
            {presets.map((p) => {
              const notchPct = ((p.value - min) / (max - min)) * 100;
              return (
                <span
                  key={p.value}
                  className="absolute top-1.5 w-[1px] h-1 bg-white/25"
                  style={{ left: `${notchPct}%` }}
                />
              );
            })}
          </div>

          <input
            type="range"
            min={min}
            max={max}
            value={draftValue}
            aria-label={ariaLabel}
            onPointerDown={() => {
              isDraggingRef.current = true;
            }}
            onChange={(e) => {
              const next = Number(e.target.value);
              setDraftValue(next);
              setTextValue(String(next));
            }}
            onPointerUp={(e) => commitSlider(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => {
              if (
                e.key === 'ArrowLeft' ||
                e.key === 'ArrowRight' ||
                e.key === 'ArrowUp' ||
                e.key === 'ArrowDown' ||
                e.key === 'Home' ||
                e.key === 'End'
              ) {
                commitSlider(Number((e.target as HTMLInputElement).value));
              }
            }}
            onBlur={() => {
              if (isDraggingRef.current) commitSlider(draftValue);
            }}
            style={{
              background: `linear-gradient(to right, rgba(255, 255, 255, 0.9) ${pct}%, rgba(255, 255, 255, 0.12) ${pct}%)`,
            }}
            className="relative z-10 w-full appearance-none h-1 rounded-full cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-white/40 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#111216] [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,255,255,0.65)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 hover:[&::-webkit-slider-thumb]:scale-110"
          />
        </div>

        {/* Snap Preset Chips */}
        <div className="flex items-center gap-1.5">
          {presets.map((p) => {
            const active = draftValue === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => commitSlider(p.value)}
                className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-semibold border cursor-pointer flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 transition-colors duration-150 ${
                  active
                    ? 'bg-white text-black border-white shadow-sm'
                    : 'bg-black/40 border-white/[0.08] text-zinc-400 hover:text-white hover:border-white/20'
                }`}
              >
                <span className="font-mono tabular-nums">{p.label}</span>
                {p.hint && (
                  <span className={`text-[8.5px] font-normal ${active ? 'text-black/70' : 'text-zinc-500'}`}>
                    {p.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);
PrecisionTrackControl.displayName = 'PrecisionTrackControl';
