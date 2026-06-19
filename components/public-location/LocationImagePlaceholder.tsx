import TheOutHavenMark from "@/components/brand/TheOutHavenMark";

type LocationImagePlaceholderProps = {
  className?: string;
  label?: string;
};

export default function LocationImagePlaceholder({
  className = "",
  label = "Photo coming soon",
}: LocationImagePlaceholderProps) {
  return (
    <div
      className={`flex h-full min-h-[260px] flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_30%_20%,rgba(225,6,42,0.22),transparent_34%),#111114] p-6 text-center ${className}`}
    >
      <TheOutHavenMark size={64} className="border-red-200/30 bg-red-700/25" />
      <p className="text-xs font-black uppercase tracking-[0.22em] text-red-50/80">{label}</p>
    </div>
  );
}
