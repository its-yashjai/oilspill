import { cn } from "@/lib/utils";
export function Badge({ className, variant="default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default"|"outline"|"success"|"warning"|"danger" }){
  const v: Record<string,string> = {
    default:"bg-white/10 text-slate-200 border-white/10",
    outline:"border border-white/10 text-slate-300",
    success:"bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
    warning:"bg-amber-500/15 text-amber-300 border-amber-500/20",
    danger:"bg-red-500/15 text-red-300 border-red-500/20"
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", v[variant], className)} {...props} />;
}
