import {
  LayoutDashboard,
  UserCircle,
  FileText,
  BarChart3,
  ShieldCheck,
  Sprout,
  LogOut,
  ChevronRight,
  Gauge,
  Users,
  KeyRound,
  Send,
  UserPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Onboarding", url: "/onboarding", icon: UserPlus },
  { title: "My Profile", url: "/profile", icon: UserCircle },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Credit Score", url: "/credit-score", icon: Gauge, adminOnly: true },
];

const adminNav = [
  { title: "Admin", url: "/admin", icon: ShieldCheck },
  { title: "Farmers", url: "/admin/farmers", icon: Sprout },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Roles", url: "/admin/roles", icon: KeyRound },
  { title: "Invitations", url: "/admin/invitations", icon: Send },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const { session, roles, hasAnyRole, organizationId } = useAuth();
  const userId = session?.user?.id;
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const avatarSrc = useAvatarUrl(profile?.avatar_url);


  const isAdmin = hasAnyRole(["admin", "super_admin", "developer"]);

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setProfile(data));
  }, [userId]);

  useEffect(() => {
    if (!organizationId) {
      setOrgName(null);
      return;
    }
    supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle()
      .then(({ data }) => setOrgName(data?.name ?? null));
  }, [organizationId]);

  const displayName = profile?.full_name || session?.user?.email || "User";
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : (session?.user?.email?.[0] || "U").toUpperCase();
  const roleLabel = roles.length > 0 ? roles[0].replace("_", " ") : "User";

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <div className={`flex items-center gap-3 border-b border-border ${collapsed ? "justify-center px-2 py-4" : "px-4 py-5"}`}>
        <div className={`flex items-center justify-center rounded-lg bg-primary ${collapsed ? "h-8 w-8" : "h-9 w-9"}`}>
          <Sprout className={`text-primary-foreground ${collapsed ? "h-4.5 w-4.5" : "h-5 w-5"}`} />
        </div>
        {!collapsed && (
          <div className="kyf-fade-in min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{orgName || "KYF Platform"}</p>
            <p className="text-xs text-muted-foreground truncate">{orgName ? "KYF Platform" : "Know Your Farmer"}</p>
          </div>
        )}
      </div>



      <SidebarContent className={`${collapsed ? "px-1 pt-3" : "px-2 pt-4"}`}>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      onClick={handleNavClick}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4.5 w-4.5 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              {!collapsed && (
                <p className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Administration</p>
              )}
              <SidebarMenu>
                {adminNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      onClick={handleNavClick}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4.5 w-4.5 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className={`border-t border-border space-y-2 ${collapsed ? "p-2" : "p-3"}`}>
        <div className={`flex items-center gap-3 rounded-lg ${collapsed ? "justify-center px-2 py-1.5" : "px-3 py-2"}`}>
          <Avatar className={`${collapsed ? "h-7 w-7" : "h-8 w-8"}`}>
            <AvatarImage src={avatarSrc || undefined} alt={displayName} />
            <AvatarFallback className="bg-muted text-sm font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground capitalize">{roleLabel}</p>
            </div>
          )}
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate("/login");
          }}
          className={`flex items-center gap-3 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive w-full ${collapsed ? "justify-center px-2 py-2" : "px-3 py-2.5"}`}
        >
          <LogOut className="h-4.5 w-4.5 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
