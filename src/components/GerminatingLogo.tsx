import { Sprout } from "lucide-react";

interface GerminatingLogoProps {
  message?: string;
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { seed: "w-3 h-3", sprout: "w-5 h-5", ring: "w-8 h-8" },
  md: { seed: "w-5 h-5", sprout: "w-8 h-8", ring: "w-14 h-14" },
  lg: { seed: "w-7 h-7", sprout: "w-12 h-12", ring: "w-20 h-20" },
};

export function GerminatingLogo({
  message = "Growing your workspace...",
  fullScreen = true,
  size = "lg",
}: GerminatingLogoProps) {
  const { seed, sprout, ring } = sizes[size];

  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative flex items-center justify-center">
        {/* Soil ring */}
        <div
          className={`absolute rounded-full border-2 border-dashed border-primary/30 ${ring} kyf-germinate-ring`}
        />

        {/* Seed */}
        <div
          className={`absolute rounded-full bg-primary/80 ${seed} kyf-germinate-seed`}
        />

        {/* Sprout */}
        <Sprout
          className={`relative text-primary ${sprout} kyf-germinate-sprout`}
          strokeWidth={2}
        />
      </div>

      {message && (
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          {message}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background kyf-fade-in">
        {content}
      </div>
    );
  }

  return <div className="p-8 flex items-center justify-center">{content}</div>;
}
