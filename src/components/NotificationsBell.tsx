import { useEffect, useState, useCallback } from "react";
import { Bell, CheckCircle, XCircle, Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { relativeTime } from "@/lib/relative-time";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EmptyState } from "@/components/EmptyState";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  farmer_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationsBell() {
  const { session } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, farmer_id, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as Notification[]) || []);
  }, [session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel(`notifications-${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${session.user.id}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, load]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!session?.user?.id) return;
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
  };

  const markRead = async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
  };

  const iconFor = (type: string) => {
    if (type === "farmer_verified") return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (type === "farmer_rejected") return <XCircle className="h-4 w-4 text-destructive" />;
    return <Bell className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors active:scale-95">
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-kyf-amber text-[10px] font-semibold text-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No notifications yet"
              description="You'll see updates here when your farmers are verified or rejected."
            />
          ) : (
            items.map((n) => {
              const inner = (
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{iconFor(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {relativeTime(n.created_at)}
                    </p>
                  </div>
                  {!n.read_at && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  )}
                </div>
              );
              const className = `block px-4 py-3 border-b border-border hover:bg-muted/60 transition-colors text-left w-full ${
                n.read_at ? "" : "bg-primary/5"
              }`;
              return n.farmer_id ? (
                <Link
                  key={n.id}
                  to={`/admin/farmer/${n.farmer_id}`}
                  className={className}
                  onClick={() => {
                    markRead(n.id);
                    setOpen(false);
                  }}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={className}
                >
                  {inner}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
