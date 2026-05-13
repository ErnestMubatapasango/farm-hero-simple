import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Sprout, Eye, EyeOff } from "lucide-react";

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Supabase parses the invite token from the URL hash and sets a session.
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) {
        setEmail(user.email ?? "");
        setFullName((user.user_metadata?.full_name as string) ?? "");
        setReady(true);
      } else {
        // Wait briefly for the hash exchange
        const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
          if (session?.user) {
            setEmail(session.user.email ?? "");
            setFullName((session.user.user_metadata?.full_name as string) ?? "");
            setReady(true);
            sub.subscription.unsubscribe();
          }
        });
        setTimeout(() => {
          if (!ready) setError("This invitation link is invalid or has expired.");
        }, 3000);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const { error: rpcErr } = await supabase.rpc("accept_my_invitation");
    if (rpcErr) {
      console.error("accept_my_invitation failed", rpcErr);
    }
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
          <p className="text-center text-sm text-muted-foreground">Verifying invitation…</p>
        )}

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

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
