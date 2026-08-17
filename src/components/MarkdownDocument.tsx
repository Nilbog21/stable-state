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
 * Renders a repo-root markdown document (the three role guides, the terms, the privacy policy)
 * with linkable `##`/`###` headings and a table of contents generated from those same headings,
 * so the list cannot drift from the document it heads.
 *
 * The contents block is emitted by the `h1` override rather than ahead of `<ReactMarkdown>`,
 * which is what puts it under the document's own title instead of above it. A document with no
 * `#` title falls back to the block rendering first.
 */
export function MarkdownDocument({ content }: { content: string }) {
  const { headings, slugByLine, firstH1Line } = parseHeadings(content)

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
        {headings.length > 0 && node!.position!.start.line === firstH1Line && (
          <TableOfContents headings={headings} />
        )}
      </>
    ),
  }

  return (
    <div className="prose prose-zinc max-w-none dark:prose-invert">
      {firstH1Line === null && headings.length > 0 && <TableOfContents headings={headings} />}
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  )
}
