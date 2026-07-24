import { notFound } from 'next/navigation'
import { DemoLoader } from './DemoLoader'

export default function DemoPage() {
  if (!process.env.DEMO_USER_EMAIL) notFound()

  return <DemoLoader />
}
