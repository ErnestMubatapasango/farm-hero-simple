import { Link } from "react-router-dom";
import { Users, KeyRound, BarChart3, Sprout, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { isOrgOwner, PERMISSIONS } from "@/lib/permissions";

export default function Admin() {
  const { roles } = useAuth();
  const { can } = usePermissions();
  const isOwner = isOrgOwner(roles);
  const canInvite = can(PERMISSIONS.teamInvite);
  const canManagePerms = can(PERMISSIONS.teamManagePermissions);

  const tiles = [
    { title: "Farmers", description: "Review and verify farmer records", icon: Sprout, to: "/admin/farmers" },
    {
      title: "Users",
      description: isOwner ? "Manage platform users" : "View your team members",
      icon: Users,
      to: "/admin/users",
    },
    { title: "Invitations", description: "Invite admins and enumerators", icon: Send, to: "/admin/invitations", hidden: !canInvite },
    { title: "Roles", description: canManagePerms ? "Configure role permissions" : "View role permissions", icon: KeyRound, to: "/admin/roles" },
    { title: "Overview", description: "Organization analytics", icon: BarChart3, to: "/analytics" },
  ].filter((t) => !t.hidden);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Administration</h1>
        <p className="text-muted-foreground mt-1">
          {isOwner
            ? "Manage users, roles, farmers, and organization settings."
            : "Review farmers and organization analytics."}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((item) => (
          <Link
            key={item.title}
            to={item.to}
            className="kyf-card p-5 hover:border-primary/30 transition-colors group"
          >
            <item.icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors mb-3" />
            <h3 className="font-semibold text-foreground">{item.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
