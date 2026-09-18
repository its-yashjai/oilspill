import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>){ return <div className={cn("rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-md", className)} {...props} />; }
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>){ return <div className={cn("p-4 border-b border-white/5", className)} {...props} />; }
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>){ return <div className={cn("p-4", className)} {...props} />; }
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>){ return <h3 className={cn("font-semibold text-sm tracking-tight", className)} {...props} />; }
