export function HorseStatusBanner({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null
  return (
    <div className="w-full max-w-2xl rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-medium">Needs Attention</p>
      <ul className="mt-1 list-disc pl-5">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  )
}
