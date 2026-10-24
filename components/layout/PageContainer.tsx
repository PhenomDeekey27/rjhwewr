import { cn } from "@/lib/cn";

/**
 * Shared page geometry: page padding 12 / 16 / 24 px and a 1440 px content
 * cap with consistent vertical rhythm.
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      id="main-content"
      className="min-h-[calc(100dvh-3.5rem)] scroll-mt-20 outline-none"
    >
      <div
        className={cn(
          "mx-auto w-full max-w-[1440px] space-y-5 px-3 py-5 sm:space-y-6 sm:px-4 sm:py-6 lg:px-6 lg:py-6",
          className,
        )}
      >
        {children}
      </div>
    </main>
  );
}
