import { cn } from "@/lib/utils";

const statusConfig = {
  pending: { label: "Pending", className: "kyf-status-pending" },
  verified: { label: "Verified", className: "kyf-status-verified" },
  rejected: { label: "Rejected", className: "kyf-status-rejected" },
  in_progress: { label: "In Progress", className: "kyf-status-pending" },
  submitted: { label: "Submitted", className: "bg-blue-50 text-blue-700 border-blue-200" },
  flagged: { label: "Flagged", className: "bg-red-50 text-red-700 border-red-200" },
};

export function StatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", config.className)}>
      {config.label}
    </span>
  );
}
