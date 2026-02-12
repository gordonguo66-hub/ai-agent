"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CustomSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select an option...",
  disabled = false,
  className,
}: CustomSelectProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-lg border border-border bg-background px-3.5 py-2",
          "text-[0.9rem] font-medium tracking-[-0.01em]",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "transition-all duration-150",
          open && "border-ring ring-2 ring-ring/20",
          disabled && "cursor-not-allowed opacity-50",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="flex items-center gap-2.5 truncate">
          {selected ? (
            <>
              {selected.icon && <span className="flex shrink-0 items-center">{selected.icon}</span>}
              <span>{selected.label}</span>
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "absolute z-50 mt-1.5 w-full rounded-lg border border-border bg-popover shadow-lg",
          "origin-top transition-all duration-150 ease-out",
          open
            ? "pointer-events-auto scale-y-100 opacity-100"
            : "pointer-events-none scale-y-95 opacity-0"
        )}
      >
        <div className="p-1">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5",
                "text-[0.9rem] font-medium tracking-[-0.01em]",
                "transition-colors duration-100",
                "hover:bg-accent/10",
                value === option.value && "bg-primary/10 text-foreground"
              )}
            >
              {option.icon && <span className="flex shrink-0 items-center">{option.icon}</span>}
              <span className="flex-1 text-left">{option.label}</span>
              {option.description && (
                <span className="text-xs font-normal text-muted-foreground">{option.description}</span>
              )}
              {value === option.value && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
