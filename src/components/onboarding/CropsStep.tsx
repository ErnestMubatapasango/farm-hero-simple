import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FarmingMethodCard } from "./FarmingMethodCard";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const crops = ["Maize", "Wheat", "Sorghum", "Millet", "Groundnuts", "Cotton", "Sugarcane", "Beans", "Soyabeans", "Tobacco", "Rice"];

const farmingMethods = [
  { value: "rain-fed", title: "Rain-Fed Farming", description: "Relies on natural rainfall. Common among small to mid-scale farmers." },
  { value: "irrigation", title: "Irrigation Farming", description: "Uses boreholes, rivers, or dams. Includes drip, sprinkler, and flood irrigation." },
  { value: "conservation", title: "Conservation Agriculture (Pfumvudza/Intwasa)", description: "Minimum soil disturbance, mulching, and crop rotation." },
  { value: "commercial", title: "Commercial Farming", description: "Large-scale, mechanized production. Focus on cash crops." },
  { value: "subsistence", title: "Subsistence Farming", description: "Small-scale, for personal consumption with minimal surplus." },
  // { value: "mixed", title: "Mixed Farming", description: "Crops and livestock combined for diversified income." },
  { value: "contract", title: "Contract Farming", description: "Production under agreement with a buyer/company." },
  { value: "organic", title: "Organic Farming", description: "No synthetic chemicals. Growing niche market with premium pricing." },

];

const currentYear = new Date().getFullYear();
const previousYear = currentYear - 1;

type CropsStepProps = {
  cropInfo: { primaryCrop: string; secondaryCrop: string; farmingMethods: Record<string, string> };
  yieldHistory: Record<string, { yield: string; revenue: string }>;
  setFormData: (updater: (prev: any) => any) => void;
  errors?: Record<string, unknown>;
};

export default function CropsStep({ cropInfo, yieldHistory, setFormData, errors = {} }: CropsStepProps) {
  const [expandedCrop, setExpandedCrop] = useState<string | null>(null);
  const errCls = (key: string) =>
    errors[key] ? "border-destructive ring-1 ring-destructive/30 focus-visible:ring-destructive" : "";

  function handleCropChange(name: string, value: string) {
    setFormData((prev: any) => ({
      ...prev,
      cropInfo: { ...prev.cropInfo, [name]: value },
    }));
  }

  function handleFarmingMethodChange(crop: string, value: string) {
    setFormData((prev: any) => {
      const methods = typeof prev.cropInfo.farmingMethods === "object" && prev.cropInfo.farmingMethods !== null
        ? { ...prev.cropInfo.farmingMethods }
        : {};
      methods[crop] = value;
      return { ...prev, cropInfo: { ...prev.cropInfo, farmingMethods: methods } };
    });
  }

  const formatter = new Intl.NumberFormat("en-US");
  const formatNumber = (value: string | number | undefined | null) =>
    !value ? "" : formatter.format(Number(value));

  function handleYieldChange(crop: string, year: number, field: "yield" | "revenue", value: string) {
    const key = `${crop}_${year}`;
    setFormData((prev: any) => {
      const updated = { ...prev.yieldHistory };
      if (!updated[key]) updated[key] = { yield: "", revenue: "" };
      updated[key] = { ...updated[key], [field]: value };
      return { ...prev, yieldHistory: updated };
    });
  }

  const selectedCrops = [cropInfo.primaryCrop, cropInfo.secondaryCrop].filter(Boolean);
  const methods = typeof cropInfo.farmingMethods === "object" && cropInfo.farmingMethods !== null ? cropInfo.farmingMethods : {};

  const getMethodTitle = (value: string) => farmingMethods.find((m) => m.value === value)?.title || "";

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground">Crops & Yield History</h2>

      {/* Crop Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Primary Crop</Label>
          <Select value={cropInfo.primaryCrop} onValueChange={(v) => handleCropChange("primaryCrop", v)}>
            <SelectTrigger className={errCls("crop.primaryCrop")}><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {crops.map((crop) => (
                <SelectItem key={crop} value={crop.toLowerCase()}>{crop}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Secondary Crop (optional)</Label>
          <Select value={cropInfo.secondaryCrop} onValueChange={(v) => handleCropChange("secondaryCrop", v)} disabled={!cropInfo.primaryCrop}>
            <SelectTrigger><SelectValue placeholder={cropInfo.primaryCrop ? "Select..." : "Select primary first"} /></SelectTrigger>
            <SelectContent>
              {crops.filter((c) => c.toLowerCase() !== cropInfo.primaryCrop).map((crop) => (
                <SelectItem key={crop} value={crop.toLowerCase()}>{crop}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* <div className="space-y-1.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
          <Label>Third Crop (optional)</Label>
          <Select value={cropInfo.thirdCrop} onValueChange={(v) => handleCropChange("thirdCrop", v)} disabled={!cropInfo.secondaryCrop}>
            <SelectTrigger><SelectValue placeholder={cropInfo.secondaryCrop ? "Select..." : "Select secondary first"} /></SelectTrigger>
            <SelectContent>
              {crops.filter((c) => c.toLowerCase() !== cropInfo.primaryCrop && c.toLowerCase() !== cropInfo.secondaryCrop).map((crop) => (
                <SelectItem key={crop} value={crop.toLowerCase()}>{crop}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div> */}
      </div>

      {/* Per-Crop Details */}
      {selectedCrops.length > 0 && (
        <div className="space-y-4">
          {selectedCrops.map((crop) => {
            const selectedMethod = methods[crop] || "";
            const methodExpanded = expandedCrop === crop;

            return (
              <div key={crop} className={cn("border rounded-xl overflow-hidden", errors[`crop.method.${crop}`] ? "border-destructive ring-1 ring-destructive/30" : "border-border")}>
                {/* Crop Header */}
                <div className="bg-muted/40 px-4 py-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground capitalize">{crop}</h3>
                  {selectedMethod && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {getMethodTitle(selectedMethod)}
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-4">
                  {/* Farming Method */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Farming Method</Label>
                      <button
                        type="button"
                        onClick={() => setExpandedCrop(methodExpanded ? null : crop)}
                        className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
                      >
                        {selectedMethod ? "Change" : "Select method"}
                        <ChevronDown className={cn("h-3 w-3 transition-transform", methodExpanded && "rotate-180")} />
                      </button>
                    </div>

                    {/* Selected method preview */}
                    {selectedMethod && !methodExpanded && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <p className="text-sm font-medium text-primary">
                          {getMethodTitle(selectedMethod)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {farmingMethods.find((m) => m.value === selectedMethod)?.description}
                        </p>
                      </div>
                    )}

                    {/* Method cards grid */}
                    {methodExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
                        {farmingMethods.map((method) => (
                          <FarmingMethodCard
                            key={method.value}
                            method={method}
                            selected={selectedMethod === method.value}
                            onSelect={(v) => {
                              handleFarmingMethodChange(crop, v);
                              setExpandedCrop(null);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Yield History */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Yield History (last 2 years)</Label>
                    {[previousYear, currentYear].map((year) => {
                      const key = `${crop}_${year}`;
                      return (
                        <div key={year} className="grid grid-cols-3 gap-2 sm:gap-3 items-center">
                          <span className="text-sm text-muted-foreground">{year}</span>
                          <Input
                            placeholder="Yield (kg)"
                            type="text"
                            className="text-sm"
                            value={formatNumber(yieldHistory[key]?.yield)}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^\d]/g, "");
                              handleYieldChange(crop, year, "yield", cleaned);
                            }}
                          />
                          <Input
                            placeholder="Revenue (USD)"
                            type="text"
                            className="text-sm"
                            value={formatNumber(yieldHistory[key]?.revenue)}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^\d]/g, "");
                              handleYieldChange(crop, year, "revenue", cleaned);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
