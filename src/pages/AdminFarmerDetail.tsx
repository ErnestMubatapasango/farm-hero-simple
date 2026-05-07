import { useParams } from "react-router-dom";

export default function AdminFarmerDetail() {
  const { userId } = useParams<{ userId: string }>();

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Farmer Detail</h1>
      <p className="text-muted-foreground">Farmer ID: {userId}</p>
      <div className="kyf-card-flat p-8 text-center">
        <p className="text-muted-foreground">Farmer onboarding data will appear here once the farmer tables are created (Phase 2).</p>
      </div>
    </div>
  );
}
