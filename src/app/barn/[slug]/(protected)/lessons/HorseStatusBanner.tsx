// ui: semantic amber alert box — Card's neutral border/bg can't express this without
// fighting its fixed classes, mirrors ManageMemberSection's unlinked-member notice
export function HorseStatusBanner({ reasons, className = 'max-w-2xl' }: { reasons: string[]; className?: string }) {
  if (reasons.length === 0) return null
  return (
    <div className={`w-full ${className} rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200`}>
      <p className="font-medium">Needs Attention</p>
      <ul className="mt-1 list-disc pl-5">
        {reasons.map((reason, i) => (
          <li key={`${i}-${reason}`}>{reason}</li>
        ))}
      </ul>
    </div>
  )
}
