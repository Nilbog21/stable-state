'use client'

export function LocalTime({ iso }: { iso: string }) {
  return <>{new Date(iso).toLocaleString()}</>
}
