import { cn } from "@/lib/utils";
import * as React from "react";
export function Button({ className, variant="default", size="default", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default"|"ghost"|"outline"|"destructive"; size?: "default"|"sm"|"lg"|"icon" }){
  const base = "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20";
  const variants: Record<string,string> = {
    default: "bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.2)]",
    ghost: "hover:bg-white/10 text-slate-200",
    outline: "border border-white/10 hover:bg-white/5 text-slate-200",
    destructive: "bg-red-600 hover:bg-red-500 text-white"
  };
  const sizes: Record<string,string> = { default:"h-9 px-4", sm:"h-8 px-3", lg:"h-11 px-8", icon:"h-9 w-9" };
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
