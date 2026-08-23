import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Sprout, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Blocking screen shown to any signed-in user whose profile has no name yet.
 * The app stays out of reach until a first and last name are saved.
 */
export default function CompleteProfile() {
  const { session, needsProfileName, refreshRoles } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!session) return <Navigate to="/login" replace />;
  if (!needsProfileName) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      setError("Please enter both your first and last name.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ first_name: first.slice(0, 50), last_name: last.slice(0, 50) })
      .eq("user_id", session.user.id);
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    await refreshRoles();
    setSaving(false);
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sprout className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Complete your profile</h1>
          <p className="text-sm text-muted-foreground">
            Tell us your name so your teammates know who you are.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="kyf-card space-y-5 p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="first_name">
              First name
            </label>
            <Input
              id="first_name"
              value={firstName}
              maxLength={50}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="last_name">
              Last name
            </label>
            <Input
              id="last_name"
              value={lastName}
              maxLength={50}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save and continue
          </Button>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/login", { replace: true });
            }}
            className="w-full text-xs text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
