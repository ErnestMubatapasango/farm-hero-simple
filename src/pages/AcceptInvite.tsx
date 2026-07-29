import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Loader2, Sprout, Eye, EyeOff } from "lucide-react";


export default function AcceptInvite() {
  const navigate = useNavigate();
  const { refreshRoles } = useAuth();
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");


  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sub: { subscription: { unsubscribe: () => void } } | undefined;

    const markReady = (user: { email?: string | null; user_metadata?: any } | null | undefined) => {
      if (!user) return;
      readyRef.current = true;
      setEmail(user.email ?? "");
      setFullName((user.user_metadata?.full_name as string) ?? "");
      setReady(true);
      if (timer) clearTimeout(timer);
      sub?.subscription.unsubscribe();
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        markReady(data.session.user);
        return;
      }
      // Wait briefly for the hash exchange
      const listener = supabase.auth.onAuthStateChange((_e, session) => {
        if (session?.user) markReady(session.user);
      });
      sub = listener.data;
      timer = setTimeout(() => {
        if (!readyRef.current) setError("This invitation link is invalid or has expired.");
      }, 3000);
    });

    return () => {
      if (timer) clearTimeout(timer);
      sub?.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName },
    });
    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }
    // Mark the matching invitation as accepted (and ensure profile/role rows exist).
    const { error: rpcErr } = await supabase.rpc("accept_my_invitation", {
      _full_name: fullName,
    });
    if (rpcErr) {
      console.error("accept_my_invitation failed", rpcErr);
      setError("Could not activate your invitation. Please contact your administrator.");
      setLoading(false);
      return;
    }
    // Pull the freshly-inserted role + organization into AuthContext so the
    // user lands on a routable page (AdminRoute etc. read from context).
    await refreshRoles();
    navigate("/", { replace: true });
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sprout className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Accept your invitation</h1>
          <p className="text-sm text-muted-foreground">Set your password to finish setting up your account.</p>
        </div>

        {!ready && !error && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying invitation…
          </p>
        )}

        {!ready && error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {ready && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input type="email" value={email} disabled />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
            >
              {loading ? "Saving…" : "Activate account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
