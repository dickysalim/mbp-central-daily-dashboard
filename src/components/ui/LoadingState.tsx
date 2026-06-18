/**
 * LoadingState — Full-panel skeleton loader
 */
export function LoadingState({ message = 'Loading data…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-surface-200/60">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-brand-500/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand-400 animate-spin" />
      </div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  )
}
