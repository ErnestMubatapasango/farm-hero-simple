import { Link } from "react-router-dom";
import { Users, KeyRound, BarChart3 } from "lucide-react";

export default function Admin() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Administration</h1>
        <p className="text-muted-foreground mt-1">Manage users, roles, and organization settings.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { title: "Users", description: "Manage platform users", icon: Users, to: "/admin/users" },
          { title: "Roles", description: "Assign and manage roles", icon: KeyRound, to: "/admin/roles" },
          { title: "Overview", description: "Organization analytics", icon: BarChart3, to: "/analytics" },
        ].map((item) => (
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
