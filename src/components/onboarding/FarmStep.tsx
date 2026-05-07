import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";

export default function FarmStep({ farmInfo, setFormData, errors = {} }: any) {
  function handleChange(e) {
    const { name, value } = e.currentTarget;
    setFormData((prev) => ({
      ...prev,
      farmInfo: { ...prev.farmInfo, [name]: value },
    }));
  }

  const errCls = (key: string) =>
    errors[key] ? "border-destructive ring-1 ring-destructive/30 focus-visible:ring-destructive" : "";

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground">Farm Details</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="farmName">Farm Name</Label>
          <Input id="farmName" name="farmName" value={farmInfo.farmName} onChange={handleChange} placeholder="e.g. Golden Cocoa Estate" className={errCls("farm.farmName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="farmSizeHectares">Farm Size (hectares)</Label>
          <Input id="farmSizeHectares" name="farmSizeHectares" value={farmInfo.farmSizeHectares} onChange={handleChange} type="number" placeholder="4.2" className={errCls("farm.farmSizeHectares")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="region">Region</Label>
          <select id="region" name="region" value={farmInfo.region} onChange={handleChange} className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${errCls("farm.region")}`}>
            <option value="">Select region...</option>
            <option value="ashanti">Ashanti</option>
            <option value="eastern">Eastern</option>
            <option value="western">Western</option>
            <option value="central">Central</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="district">District</Label>
          <Input id="district" name="district" value={farmInfo.district} onChange={handleChange} placeholder="Kumasi Metropolitan" className={errCls("farm.district")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="latitude">Latitude</Label>
          <Input id="latitude" name="latitude" value={farmInfo.latitude} onChange={handleChange} type="number" placeholder="6.6885" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="longitude">Longitude</Label>
          <Input id="longitude" name="longitude" value={farmInfo.longitude} onChange={handleChange} type="number" placeholder="-1.6244" />
        </div>
      </div>
      <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 inline mr-1.5" />
        Map picker will be available in the next update. Enter coordinates manually for now.
      </div>
    </div>
  );
}
