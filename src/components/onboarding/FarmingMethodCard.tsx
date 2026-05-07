import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FarmingMethod {
  value: string;
  title: string;
  description: string;
}

interface FarmingMethodCardProps {
  method: FarmingMethod;
  selected: boolean;
  onSelect: (value: string) => void;
}

export function FarmingMethodCard({ method, selected, onSelect }: FarmingMethodCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(method.value)}
      className={cn(
        "relative w-full text-left rounded-lg border p-3 transition-all duration-200",
        "hover:border-primary/40 hover:bg-primary/5",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
        "active:scale-[0.98]",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border bg-card"
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30"
          )}
        >
          {selected && <Check className="h-3 w-3" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-sm font-medium leading-tight",
            selected ? "text-primary" : "text-foreground"
          )}>
            {method.title}
          </p>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">
            {method.description}
          </p>
        </div>
      </div>
    </button>
  );
}
