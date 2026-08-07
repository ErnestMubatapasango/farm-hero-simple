import { CheckCircle, Clock, XCircle, Circle, FileText } from "lucide-react";

interface DocSummary {
  document_type: string;
  status: string;
}

interface Props {
  docs: DocSummary[];
}

const REQUIRED: { value: string; label: string }[] = [
  { value: "id", label: "National ID" },
  { value: "land_title", label: "Land Title" },
];

type DocState = "verified" | "pending" | "rejected" | "missing";

function matches(docs: DocSummary[], type: string) {
  const aliases = type === "id" ? ["id", "national_id"] : [type];
  return docs.filter((d) => aliases.includes(d.document_type));
}

function deriveState(docs: DocSummary[], type: string): DocState {
  const matching = matches(docs, type);
  if (matching.some((d) => d.status === "verified")) return "verified";
  if (matching.some((d) => d.status === "pending")) return "pending";
  if (matching.some((d) => d.status === "rejected")) return "rejected";
  return "missing";
}


function stateMeta(state: DocState) {
  switch (state) {
    case "verified":
      return { Icon: CheckCircle, color: "text-green-600", bg: "bg-green-500/10", label: "Verified" };
    case "pending":
      return { Icon: Clock, color: "text-yellow-600", bg: "bg-yellow-500/10", label: "Pending review" };
    case "rejected":
      return { Icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Rejected — re-upload" };
    case "missing":
      return { Icon: Circle, color: "text-muted-foreground", bg: "bg-muted", label: "Missing" };
  }
}

export function hasAllRequiredDocs(docs: DocSummary[]): boolean {
  return REQUIRED.every((r) => {
    const matching = docs.filter((d) => d.document_type === r.value);
    return matching.some((d) => d.status === "verified" || d.status === "pending");
  });
}

export default function RequiredDocumentsChecklist({ docs }: Props) {
  const states = REQUIRED.map((r) => ({ ...r, state: deriveState(docs, r.value) }));
  const verifiedCount = states.filter((s) => s.state === "verified").length;
  const total = REQUIRED.length;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" />
          Required documents
        </div>
        <span className="text-xs text-muted-foreground">
          {verifiedCount} of {total} verified
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {states.map(({ value, label, state }) => {
          const meta = stateMeta(state);
          return (
            <div
              key={value}
              className={`flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${meta.bg}`}>
                <meta.Icon className={`h-3.5 w-3.5 ${meta.color}`} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{label}</p>
                <p className={`text-xs ${meta.color}`}>{meta.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
