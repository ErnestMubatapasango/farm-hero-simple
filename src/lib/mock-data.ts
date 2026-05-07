export const farmerProfile = {
  id: "f-001",
  name: "Amara Kofi",
  phone: "+233 24 567 8901",
  email: "amara.kofi@mail.com",
  region: "Ashanti Region",
  district: "Kumasi Metropolitan",
  completeness: 68,
  status: "in_progress" as const,
  createdAt: "2025-11-14",
  farmSize: 4.2,
  primaryCrop: "Cocoa",
  coordinates: { lat: 6.6885, lng: -1.6244 },
};

export const documents = [
  { id: "d-1", name: "National ID Card", type: "ID", status: "verified" as const, uploadedAt: "2025-11-14", extractedFields: { name: "Amara Kofi", idNumber: "GHA-2847391" } },
  { id: "d-2", name: "Land Title Certificate", type: "Land", status: "pending" as const, uploadedAt: "2025-12-02", extractedFields: null },
  { id: "d-3", name: "Fertilizer Purchase Receipt", type: "Receipt", status: "rejected" as const, uploadedAt: "2025-12-10", extractedFields: null },
  { id: "d-4", name: "Crop Insurance Policy", type: "Insurance", status: "verified" as const, uploadedAt: "2026-01-05", extractedFields: { policyNo: "INS-88412" } },
];

export const cropHistory = [
  { year: 2021, crop: "Cocoa", yield: 820, unit: "kg", revenue: 4100 },
  { year: 2022, crop: "Cocoa", yield: 1050, unit: "kg", revenue: 5780 },
  { year: 2023, crop: "Cocoa", yield: 940, unit: "kg", revenue: 5420 },
  { year: 2024, crop: "Cocoa", yield: 1180, unit: "kg", revenue: 7200 },
  { year: 2025, crop: "Cocoa", yield: 1340, unit: "kg", revenue: 8750 },
];

export const adminFarmers = [
  { id: "f-001", name: "Amara Kofi", region: "Ashanti", crop: "Cocoa", completeness: 68, status: "in_progress" as const },
  { id: "f-002", name: "Kwame Mensah", region: "Eastern", crop: "Palm Oil", completeness: 100, status: "submitted" as const },
  { id: "f-003", name: "Esi Darko", region: "Western", crop: "Rubber", completeness: 100, status: "verified" as const },
  { id: "f-004", name: "Yaw Boateng", region: "Brong-Ahafo", crop: "Cashew", completeness: 45, status: "in_progress" as const },
  { id: "f-005", name: "Abena Serwaa", region: "Central", crop: "Maize", completeness: 100, status: "flagged" as const },
];

export type DocumentStatus = "pending" | "verified" | "rejected";
export type FarmerStatus = "in_progress" | "submitted" | "verified" | "flagged";
