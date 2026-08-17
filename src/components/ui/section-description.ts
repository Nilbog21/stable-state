/**
 * One style for the short description that leads an `AccordionSection`'s body, above that
 * section's controls or figures.
 *
 * #1557 introduced it as a local constant on the Manage Barn page, for one reason: the sizes had
 * already drifted apart by hand (two sections had gone `text-xs`). #1550 gave Finances the same
 * shape — its two Outstanding sections explain themselves in prose rather than behind an ⓘ —
 * which made a second copy of the string the thing standing between the two pages and the same
 * drift, one page apart instead of one section apart. So it moved here, next to
 * `dateNavButtonClass`, under the rule `src/components/ui/CLAUDE.md` states for that one:
 * **import it, never restate it.**
 *
 * Not a component: a `<p>` is the whole of it, and wrapping one to own a className would make
 * every caller's spacing override (`mt-6 ${...}`, as Data Backup's second block needs) a prop.
 */
export const sectionDescriptionClass = 'mb-3 text-sm text-zinc-500 dark:text-zinc-400'
