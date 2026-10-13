# Tour outline: slide cards, nested answers and saved tours

Builds on [guided-understanding-plan.md](guided-understanding-plan.md) and
[tour-polish-plan.md](tour-polish-plan.md). Goal: a quick overview of a subject
that the reader can dive in and out of, keep, and hand to the agent.

## What the reader sees

- **Slide cards.** Plan, document and agent (concept) tours write each card as a
  slide: the title is the claim, two to five short points back it, and any prose
  sits in collapsed **Notes**. Comparison and flow cards keep their visual with a
  one-line caption. File tours and change tours keep prose bodies; code tours are
  to be evaluated separately.
- **Answers are cards.** Ask, Go deeper, a suggested question, or the `›` on a
  single point adds the answer as child cards of the card on screen, at any depth
  up to five levels, and opens the first one. A line above an answer names the
  question and leads back to the card it answers; the card lists its answers at
  its foot.
- **Outline.** Where the window is at least 960px wide, a quiet tree of every
  card title stands to the right of the card. The path to the card on screen is
  open; other branches open from their twisty. On narrower windows the list icon
  shows the same tree in the card's place.
- **Keys.** ← and → move between cards at one level; → after the last answer
  carries on with the next card of the tour. ↓ enters the answers under a card and
  ↑ leaves them. Home and End jump to the first and last tour card.

## Saving and reopening

**Save tour** (bookmark icon) writes the tour, with every answer, to
`<subject>.tour.md` at the root of the task's worktree. A first save never
overwrites: an existing file of that name moves the tour to `-2`, `-3` and so on.
After that, each new answer updates the same file. The file is an ordinary
untracked file: commit it to keep it with the branch, or it goes when the
worktree is removed.

Open a `.tour.md` file on the canvas and press **Open Tour**: it opens as a tour
straight away, with no provider call, and follow-ups replay the plan, document or
file it names as its source (or the cards themselves when that is gone). The
document's own **Take Tour** then reopens the saved version.

### File format

```markdown
---
parallel-code-tour: 1
kind: document
subject: 'docs/cache.md'
source: 'docs/cache.md'
---

# docs/cache.md

## Reads dominate

<!-- tour-card {"tone":"important"} -->

**KEY DECISION**

- 90% of calls are reads
- Cache hits skip the database

<details><summary>Notes</summary>

Measured over the last week.

</details>

### Hits are measured weekly

<!-- tour-card {"question":"How do we know?"} -->

...
```

Each card is a heading one level below its parent's, so the file reads as an
outline on GitHub and can be edited by hand or by the agent. The HTML comment
carries what Markdown cannot show: tone, form, the question a card answers,
suggested questions, and `prose` for cards whose lists belong to the body. Without
it a card is a neutral slide; a heading alone is a valid card. Card text never
starts a heading of its own: such lines are written as `\#`.

## Referencing a card in the chat

**Reference in chat** (@ icon) closes the tour and appends the card on screen to
the task's prompt draft: the tour, the titles above it, the question it answers,
its content and, when saved, the file to read for the rest. Nothing is sent until
the user sends it. Reopening the tour keeps the reader's place.

## Where it lives

| Concern                       | Module                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Slide fields and validation   | `src/lib/understanding-tour.ts`, caps in `electron/shared/understanding-limits.ts`   |
| Slide prompt rules            | `src/lib/understanding-prompt.ts`, `tour_publish` in `electron/mcp/mcp-tool-list.ts` |
| Tree and reading order        | `src/lib/tour-tree.ts`                                                               |
| Tree state, save, restore     | `src/lib/create-understanding-tour.ts`                                               |
| Markdown file and chat format | `src/lib/tour-file.ts`                                                               |
| Writing into the worktree     | `electron/ipc/tour-files.ts` (`SaveTourFile`)                                        |
| Viewer                        | `src/components/UnderstandingTourDialog.tsx`, `src/components/understanding/`        |

`SaveTourFile` only writes `.tour.md` files, only into folders whose real path is
inside the worktree, never through a symlink, and never into `.git` or the app's
folders.

## Not done yet

- Editing cards or the outline in the app; the saved file can be edited instead.
- Letting the agent add answers under a given card through MCP.
- Showing two cards side by side.
- Reloading an open tour when its file changes on disk; reopening it reads the
  file again.
