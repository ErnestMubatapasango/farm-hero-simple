import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { uploadAvatar } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { GerminatingLogo } from "@/components/GerminatingLogo";
import { Loader2, Mail, Calendar, Camera, Phone, Building2, Pencil } from "lucide-react";

interface ProfileRow {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  created_at: string | null;
  organization_id: string | null;
}

export default function Profile() {
  const { session, roles } = useAuth();
  const { toast } = useToast();
  const userId = session?.user?.id;
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const avatarSrc = useAvatarUrl(profile?.avatar_url);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("full_name, first_name, last_name, avatar_url, phone, created_at, organization_id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(async ({ data }) => {
        setProfile(data ?? null);
        setFirstName(data?.first_name ?? "");
        setLastName(data?.last_name ?? "");
        setPhone(data?.phone ?? "");
        if (data?.organization_id) {
          const { data: org } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", data.organization_id)
            .maybeSingle();
          setOrgName(org?.name ?? null);
        }
        setLoading(false);
      });
  }, [userId]);

  const handleSave = async () => {
    if (!userId) return;
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter both your first and last name.",
        variant: "destructive",
      });
      return;
    }
    if (phone.trim() && !/^\+?[0-9\s-]{7,20}$/.test(phone.trim())) {
      toast({ title: "Invalid phone number", description: "Use digits, spaces, dashes or a leading +.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim().slice(0, 50),
        last_name: lastName.trim().slice(0, 50),
        phone: phone.trim().slice(0, 20) || null,
      })
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    setProfile((p) =>
      p
        ? {
            ...p,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
            phone: phone.trim() || null,
          }
        : p
    );
    setEditing(false);
    toast({ title: "Profile updated" });
  };

  const handleAvatar = async (file: File) => {
    if (!userId) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Unsupported file", description: "Please pick an image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Maximum size is 5MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const path = await uploadAvatar(userId, file);
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("user_id", userId);
      if (error) throw error;
      setProfile((p) => (p ? { ...p, avatar_url: path } : p));
      toast({ title: "Profile picture updated" });
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <GerminatingLogo fullScreen={false} message="Loading your profile..." />;
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : (session?.user?.email?.[0] || "U").toUpperCase();

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit profile
          </Button>
        )}
      </div>

      <div className="kyf-card p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <Avatar className="h-16 w-16 border-2 border-border">
              <AvatarImage src={avatarSrc || undefined} alt={profile?.full_name || "User"} />
              <AvatarFallback className="bg-muted text-lg font-bold">{initials}</AvatarFallback>
            </Avatar>
            <button
              type="button"
              aria-label="Upload profile picture"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatar(file);
                e.target.value = "";
              }}
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{profile?.full_name || "User"}</h2>
            <p className="text-sm text-muted-foreground capitalize">
              {roles.length > 0 ? roles.map((r) => r.replace("_", " ")).join(", ") : "No role"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Tap the camera icon to change your picture</p>
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="first_name">First Name</label>
                <Input
                  id="first_name"
                  value={firstName}
                  maxLength={50}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="last_name">Last Name</label>
                <Input
                  id="last_name"
                  value={lastName}
                  maxLength={50}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="phone">Phone Number</label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                maxLength={20}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+263 77 000 0000"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save changes
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setFirstName(profile?.first_name ?? "");
                  setLastName(profile?.last_name ?? "");
                  setPhone(profile?.phone ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium text-foreground truncate">{session?.user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="font-medium text-foreground">{profile?.phone || "Not provided"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Organization</p>
                <p className="font-medium text-foreground truncate">{orgName || "None"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Joined</p>
                <p className="font-medium text-foreground">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "N/A"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
