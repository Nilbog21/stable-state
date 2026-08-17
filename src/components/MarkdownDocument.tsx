import ReactMarkdown, { type Components } from 'react-markdown'
import { parseHeadings, type TocHeading } from '@/lib/markdown-toc'

function TableOfContents({ headings }: { headings: TocHeading[] }) {
  return (
    <nav
      aria-label="Contents"
      className="not-prose my-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Contents</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {headings.map((h) => (
          <li key={h.slug} className={h.level === 3 ? 'ml-4' : undefined}>
            <a
              href={`#${h.slug}`}
              className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Renders a repo-root markdown document (the three role guides, the terms, the privacy policy,
 * the changelog) with linkable `##`/`###` headings and a table of contents generated from those
 * same headings, so the list cannot drift from the document it heads.
 *
 * The contents block is emitted by the `h1` override rather than ahead of `<ReactMarkdown>`,
 * which is what puts it under the document's own title instead of above it. A document with no
 * `#` title falls back to the block rendering first.
 *
 * `maxTocLevel` (#1589) trims the *list* only — every `##`/`###` still gets its `id`, so an
 * excluded heading stays deep-linkable. It exists for the changelog, whose 28 `###` feature
 * headings would otherwise emit a list longer than the document is navigable, with entries
 * ("Lessons", "Notifications", "Bug fixes") repeating once per major version.
 */
export function MarkdownDocument({
  content,
  maxTocLevel = 3,
}: {
  content: string
  maxTocLevel?: 2 | 3
}) {
  const { headings, slugByLine, firstH1Line } = parseHeadings(content)
  const listed = headings.filter((h) => h.level <= maxTocLevel)

  const anchored =
    (Tag: 'h2' | 'h3'): Components['h2'] =>
    function AnchoredHeading({ node, children, ...props }) {
      // `node.position` is optional only in react-markdown's types; parsing a string source
      // always supplies it. Asserted rather than defaulted, so there is no dead branch to
      // exempt from the 100% coverage gate.
      const line = node!.position!.start.line
      return (
        <Tag id={slugByLine.get(line)} className="scroll-mt-4" {...props}>
          {children}
        </Tag>
      )
    }

  const components: Components = {
    h2: anchored('h2'),
    h3: anchored('h3'),
    h1: ({ node, children, ...props }) => (
      <>
        <h1 {...props}>{children}</h1>
        {listed.length > 0 && node!.position!.start.line === firstH1Line && (
          <TableOfContents headings={listed} />
        )}
      </>
    ),
  }

  return (
    <div className="prose prose-zinc max-w-none dark:prose-invert">
      {firstH1Line === null && listed.length > 0 && <TableOfContents headings={listed} />}
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  )
}
