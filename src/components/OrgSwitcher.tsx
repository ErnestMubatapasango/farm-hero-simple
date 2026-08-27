import { Building2 } from "lucide-react";
import { useActiveOrg } from "@/hooks/useActiveOrg";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Platform developers have no organization of their own: they pick the
 * organization whose data every section should show.
 */
export function OrgSwitcher({ className }: { className?: string }) {
  const {
    isDeveloper,
    organizations,
    activeOrganizationId,
    setActiveOrganization,
    loadingOrganizations,
  } = useActiveOrg();

  if (!isDeveloper) return null;

  return (
    <div className={className}>
      <Select
        value={activeOrganizationId ?? undefined}
        onValueChange={(v) => setActiveOrganization(v)}
      >
        <SelectTrigger className="w-full sm:w-72" aria-label="Active organization">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue
              placeholder={loadingOrganizations ? "Loading organizations..." : "Select an organization"}
            />
          </div>
        </SelectTrigger>
        <SelectContent>
          {organizations.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No organizations yet</div>
          )}
          {organizations.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              <span className="truncate">{o.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {o.memberCount} members · {o.farmerCount} farmers
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Empty state shown to a developer before they pick an organization. */
export function SelectOrgNotice({ what = "data" }: { what?: string }) {
  return (
    <div className="kyf-card flex flex-col items-center gap-2 p-8 text-center">
      <Building2 className="h-6 w-6 text-muted-foreground" />
      <p className="font-medium text-foreground">Select an organization to continue</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Choose an organization from the picker above to load its {what}.
      </p>
    </div>
  );
}
