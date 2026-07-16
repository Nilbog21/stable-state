import { Td } from '@/components/ui/Table'
import { InfoPopover } from './InfoPopover'
import { formatCurrency } from '@/lib/format-currency'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

function ValueCell({
  column,
  bucket,
  forceParens,
}: {
  column: ReconciliationColumn | null
  bucket: keyof ReconciliationColumn
  forceParens?: boolean
}) {
  if (!column) return <Td>—</Td>
  const value = column[bucket]
  if (forceParens && value === 0) return <Td>—</Td>
  return <Td>{formatCurrency(value, { forceParens })}</Td>
}

/**
 * Shared bottom-of-table reconciliation footer (#971) — Subtotal, Unattributed, Outside
 * this view, Total, for whichever of Gross/Expenses/Net a table has (By Paid To passes
 * `null` for gross/net, rendered as "—"). A separate <tfoot>, not part of the sortable
 * <tbody> rows, so it's structurally excluded from useSortableRows' sort.
 */
export function ReconciliationFoot({
  labelColSpan,
  gross,
  expenses,
  net,
  outsideInfoText,
  unattributedInfoText,
}: {
  labelColSpan: number
  gross: ReconciliationColumn | null
  expenses: ReconciliationColumn | null
  net: ReconciliationColumn | null
  outsideInfoText: string
  unattributedInfoText: string
}) {
  return (
    <tfoot>
      <tr>
        <Td colSpan={labelColSpan} tone="secondary" className="uppercase tracking-wide">Subtotal</Td>
        <ValueCell column={gross} bucket="subtotal" />
        <ValueCell column={expenses} bucket="subtotal" forceParens />
        <ValueCell column={net} bucket="subtotal" />
      </tr>
      <tr className="text-zinc-500 dark:text-zinc-400">
        <Td colSpan={labelColSpan} tone="secondary" className="uppercase tracking-wide">
          Unattributed
          <InfoPopover text={unattributedInfoText} align="left" />
        </Td>
        <ValueCell column={gross} bucket="unattributed" />
        <ValueCell column={expenses} bucket="unattributed" forceParens />
        <ValueCell column={net} bucket="unattributed" />
      </tr>
      <tr className="text-zinc-500 dark:text-zinc-400">
        <Td colSpan={labelColSpan} tone="secondary" className="uppercase tracking-wide">
          Outside this view
          <InfoPopover text={outsideInfoText} align="left" />
        </Td>
        <ValueCell column={gross} bucket="outside" />
        <ValueCell column={expenses} bucket="outside" forceParens />
        <ValueCell column={net} bucket="outside" />
      </tr>
      <tr className="font-semibold">
        <Td colSpan={labelColSpan} className="uppercase tracking-wide font-semibold">Total</Td>
        <ValueCell column={gross} bucket="total" />
        <ValueCell column={expenses} bucket="total" forceParens />
        <ValueCell column={net} bucket="total" />
      </tr>
    </tfoot>
  )
}
