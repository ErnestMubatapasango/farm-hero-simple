import { Check, FileEdit, Send, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "draft" | "submitted" | "verified" | "rejected" | string;

const STEPS = [
  { key: "draft", label: "Draft", icon: FileEdit },
  { key: "submitted", label: "Submitted", icon: Send },
  { key: "verified", label: "Verified", icon: ShieldCheck },
] as const;

export function StatusStepper({ status }: { status: Status }) {
  const isRejected = status === "rejected";
  const currentIndex = isRejected
    ? 1
    : STEPS.findIndex((s) => s.key === status);
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div className="kyf-card p-5">
      <div className="flex items-center">
        {STEPS.map((step, idx) => {
          const isDone = idx < activeIndex || (idx === activeIndex && status === "verified");
          const isCurrent = idx === activeIndex && !isDone;
          const isLast = idx === STEPS.length - 1;
          const Icon = step.icon;
          const rejectedHere = isRejected && idx === 1;

          const circleClasses = cn(
            "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors shrink-0",
            rejectedHere
              ? "border-destructive bg-destructive text-destructive-foreground"
              : isDone
                ? "border-primary bg-primary text-primary-foreground"
                : isCurrent
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-muted text-muted-foreground"
          );

          const barClasses = cn(
            "flex-1 h-0.5 mx-2",
            isDone ? "bg-primary" : "bg-border"
          );

          const labelClasses = cn(
            "mt-2 text-xs font-medium text-center",
            rejectedHere
              ? "text-destructive"
              : isDone || isCurrent
                ? "text-foreground"
                : "text-muted-foreground"
          );

          return (
            <div key={step.key} className={cn("flex items-center", isLast ? "" : "flex-1")}>
              <div className="flex flex-col items-center">
                <div className={circleClasses}>
                  {rejectedHere ? (
                    <XCircle className="h-5 w-5" />
                  ) : isDone ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <span className={labelClasses}>
                  {rejectedHere ? "Rejected" : step.label}
                </span>
              </div>
              {!isLast && <div className={barClasses} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
