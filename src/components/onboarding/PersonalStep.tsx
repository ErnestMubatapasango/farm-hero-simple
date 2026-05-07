import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export default function PersonalStep({ personalInfo, setFormData, errors = {} }: any) {
  function handleChange(event) {
    const { name, value } = event.currentTarget;
    setFormData((prev) => ({
      ...prev,
      personalInfo: { ...prev.personalInfo, [name]: value },
    }));
  }

  const errCls = (key: string) =>
    errors[key] ? "border-destructive ring-1 ring-destructive/30 focus-visible:ring-destructive" : "";

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground">Personal Information</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First Name</Label>
          <Input id="firstName" name="firstName" placeholder="Amara" value={personalInfo.firstName} onChange={handleChange} className={errCls("personal.firstName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last Name</Label>
          <Input id="lastName" name="lastName" placeholder="Kofi" value={personalInfo.lastName} onChange={handleChange} className={errCls("personal.lastName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone Number</Label>
          <Input id="phone" name="phone" placeholder="+233 24 567 8901" value={personalInfo.phone} onChange={handleChange} className={errCls("personal.phone")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" name="email" type="email" placeholder="email@example.com" value={personalInfo.email} onChange={handleChange} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dob">Date of Birth</Label>
          <Input id="dob" name="dob" type="date" value={personalInfo.dob} onChange={handleChange} className={errCls("personal.dob")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <select
            id="gender"
            name="gender"
            value={personalInfo.gender}
            onChange={handleChange}
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              errCls("personal.gender")
            )}
          >
            <option value="">Select gender...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" name="address" placeholder="Village, town, district..." rows={2} value={personalInfo.address} onChange={handleChange} className={errCls("personal.address")} />
      </div>
    </div>
  );
}
