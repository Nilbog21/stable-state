import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCalendarFeedData } from '@/lib/db/calendar-feed'
import { buildIcsFeed } from '@/lib/ics'

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) return new NextResponse('Missing token', { status: 400 })

  const feed = await getCalendarFeedData(token)
  if (!feed.valid) return new NextResponse('Not found', { status: 404 })

  const ics = buildIcsFeed(feed.barnName!, feed.items)
  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="calendar.ics"',
      'Cache-Control': 'no-store',
    },
  })
}
