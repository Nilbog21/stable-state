'use client'
import { useState, useEffect } from 'react'

export function LocalTime({ iso }: { iso: string }) {
  const [display, setDisplay] = useState('')
  useEffect(() => {
    setDisplay(new Date(iso).toLocaleString())
  }, [iso])
  return <>{display}</>
}
