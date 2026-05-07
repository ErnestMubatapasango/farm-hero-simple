import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { MapPin, Phone, Mail, Calendar, Loader2, Globe, Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";

export default function Profile() {
  const { session } = useAuth();
  const { currency, setCurrency, currencies } = useCurrency();
  const userId = session?.user?.id;

  const [farmProfile, setFarmProfile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [docCount, setDocCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : "F";

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", userId);
      if (updErr) throw updErr;
      setProfile((p: any) => ({ ...p, avatar_url: publicUrl }));
      toast({ title: "Profile picture updated" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!userId) return;
    async function fetchProfile() {
      setLoading(true);
      const [profileRes, farmRes, docRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("farm_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("documents").select("id, status").eq("user_id", userId),
      ]);

      setLoading(false);

      if (profileRes.error || farmRes.error) {
        console.error("Error fetching profile info:", profileRes.error || farmRes.error);
      } else {
        setProfile(profileRes.data);
        setFarmProfile(farmRes.data);
        setDocCount((docRes.data || []).filter(d => d.status === "verified").length);
      }
    }
    fetchProfile();
  }, [userId]);

  if (loading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="kyf-slide-up">
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        <p className="text-muted-foreground mt-1">Your agricultural identity summary.</p>
      </div>

      <div className="kyf-card p-6 kyf-slide-up" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <Avatar className="h-16 w-16 border-2 border-border">
              <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || "Farmer"} />
              <AvatarFallback className="bg-kyf-sand text-lg font-bold text-kyf-earth">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Upload profile picture"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-background transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{profile?.full_name || "Farmer"}</h2>
            <p className="text-sm text-muted-foreground truncate">Farm name: {farmProfile?.farm_name || "N/A"}</p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={farmProfile?.status} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {[
            { icon: Phone, label: "Phone", value: profile?.phone },
            { icon: Mail, label: "Email", value: profile?.email },
            { icon: MapPin, label: "Location", value: `${farmProfile?.district}, ${farmProfile?.region}` },
            { icon: Calendar, label: "Registered", value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "N/A" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="font-medium text-foreground">{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {farmProfile && (
          <div className="mt-5 pt-5 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Profile Completeness</span>
              <span className="text-sm font-semibold tabular-nums">{farmProfile.completeness}%</span>
            </div>
            <Progress value={farmProfile.completeness} className="h-2" />
          </div>
        )}
      </div>

      {/* Currency Preference */}
      <div className="kyf-card p-6 kyf-slide-up" style={{ animationDelay: "120ms" }}>
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Globe className="h-4 w-4" /> Currency Preference
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Select your preferred currency. All financial values will be converted and displayed in this currency.
        </p>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select currency" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(currencies).map(([code, info]) => (
              <SelectItem key={code} value={code}>
                {(info as any).symbol} — {(info as any).name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {farmProfile && (
        <div className="kyf-card p-6 kyf-slide-up" style={{ animationDelay: "160ms" }}>
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Farm Summary</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Farm Size</p>
              <p className="font-semibold text-foreground">{farmProfile.farm_size_hectares ?? "—"} hectares</p>
            </div>
            <div>
              <p className="text-muted-foreground">Primary Crop</p>
              <p className="font-semibold text-foreground">{farmProfile.primary_crop || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Coordinates</p>
              <p className="font-semibold text-foreground tabular-nums">
                {farmProfile.coordinates_latitude && farmProfile.coordinates_longitude
                  ? `${farmProfile.coordinates_latitude}, ${farmProfile.coordinates_longitude}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Documents</p>
              <p className="font-semibold text-foreground">{docCount} verified</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
