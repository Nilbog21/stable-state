'use client'

import { useState } from 'react'

function todayString() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function padHour(h: number) {
  return String(h).padStart(2, '0')
}

export function DateHourPicker() {
  const [date, setDate] = useState(todayString)
  const [hour, setHour] = useState(() => new Date().getHours())

  const combinedValue = `${date}T${padHour(hour)}:00`

  return (
    <div className="flex gap-2">
      <div className="flex flex-col gap-1 flex-1">
        <label htmlFor="dh-date" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Date
        </label>
        <input
          id="dh-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="dh-hour" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Hour
        </label>
        <select
          id="dh-hour"
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>{padHour(i)}:00</option>
          ))}
        </select>
      </div>
      {date && <input type="hidden" name="lesson_at" value={combinedValue} />}
    </div>
  )
}
