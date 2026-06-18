/**
 * ErrorState — Displays a friendly error message with retry option
 */
interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'Failed to load data',
  message = 'Something went wrong fetching your data.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 text-xl">
        ✕
      </div>
      <div>
        <p className="font-semibold text-surface-100">{title}</p>
        <p className="text-sm text-surface-200/60 mt-1 max-w-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          id="error-retry-btn"
          onClick={onRetry}
          className="mt-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  )
}
