import { createFileRoute } from "@tanstack/react-router";
import farmHero from "@/assets/farm-hero.jpg";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "GreenField — Modern Farm Management" },
      { name: "description", content: "Manage your farm smarter with GreenField. Track crops, livestock, and operations in one place." },
    ],
  }),
});

function Index() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <img
        src={farmHero}
        alt="Aerial view of lush green farmland at golden hour"
        className="absolute inset-0 h-full w-full object-cover"
        width={1920}
        height={1024}
      />
      <div className="absolute inset-0 bg-hero-overlay" />
      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-hero-text sm:text-7xl">
          GreenField
        </h1>
        <p className="mt-4 text-lg text-hero-subtitle sm:text-xl">
          Simple, modern farm management — from seed to harvest.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
            Get Started
          </button>
          <button className="rounded-lg border border-hero-subtitle/30 px-6 py-3 text-sm font-semibold text-hero-text transition hover:bg-hero-text/10">
            Learn More
          </button>
        </div>
      </div>
    </section>
  );
}
