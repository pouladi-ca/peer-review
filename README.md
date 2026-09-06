# Panelist

**A private, browser-based workbench for grant peer reviewers.**

You have been asked to review a grant application. The funding agency sent you a
PDF. Panelist is where you read it, mark it up, score it against your agency's
rubric, and leave with a critique that is already written.

It runs as a small private server you own (one Docker image on fly.io or any host)
with the app served from it. Sign in with a password on each device and every review,
note, score, and PDF syncs between them: start on a phone, continue on a laptop at the
same page. Applications never go to a third party.

![The Brief panel, with the application on the left and detected facts on the right](screenshots/02-brief.png)

## Why it exists

Reviewing a grant well is slow, exacting work. You read forty pages closely,
hold a dozen judgements in your head, keep every criticism tethered to the place
in the text that provoked it, and then assemble all of it into structured,
constructive comments under the criteria your agency defines. Panelist takes the
mechanical weight off that process so your attention stays on the science.

## What it does

- **Two ways to read.** *Pages* shows the PDF as laid out, with a crisp text
  layer, search, an auto-detected outline, and a page map that tracks what you
  have read. *Read* reflows the application into clean, responsive text with
  headings, bold and italic runs, figure and table cards you can tap to zoom, and
  a table of contents, which is how it reads on a phone. Notes made in either view
  appear in the other, and your position carries across views and devices.
  Mixed portrait and landscape pages (budget tables, Gantt charts) each fit the
  width or, with *Fit whole page*, the window; non-embedded standard fonts
  render correctly. PDFs whose fonts
  lose ligature glyphs ("Jus fica on" for "Justification", common in portal
  exports) are repaired using the document's own vocabulary, so search,
  headings, and quoted passages read correctly.
- **Detects the essentials.** Title, applicant, institution, mechanism, budget,
  duration, the specific aims, the key vocabulary, and counts of figures,
  tables, and references, all pulled from the text and editable.
- **Turns reading into evidence.** Select any passage and press **S**, **W**,
  **Q**, or **N** to tag it a strength, weakness, question, or note. Each tag
  becomes a highlight in the PDF and a bullet in your draft, carrying its page
  reference. Notes attach to the criterion the section belongs to.
- **Scores the way your agency does.** Built-in frameworks for **NIH** (2025
  simplified and the legacy five criteria), **NSF**, **CIHR**, **ERC**,
  **Horizon Europe**, **NSERC Discovery**, **NHMRC Ideas**, **Wellcome**,
  **UKRI/MRC**, **DFG**, and the Huntington's disease funders **HDSA** (Human
  Biology and Human Experience Projects) and **HDF** (research grants and
  postdoctoral fellowships), plus a general rubric, each with its scale,
  guiding questions, and an overall rating. Where a funder does not publish
  its numeric scale, the framework says so and defaults to 1 to 5. A consistency check flags when your overall
  score drifts from your criterion scores.
- **Works for any agency.** Open *Manage frameworks…* from the framework menu to
  define your own criteria and scales, or duplicate a built-in rubric and edit
  it. Custom frameworks are stored in the browser and can be exported as JSON to
  share with co-reviewers. Many foundations and institutional competitions do
  not match a national agency's template; this is how you review those.
- **Keeps you honest with a checklist.** Completeness and rigor checks (power
  analysis, blinding, sex as a biological variable, data sharing, ethics, and
  more) show page references to where the application seems to address each item,
  so you verify rather than hunt. It includes reviewer self-checks such as
  conflict of interest.
- **Shows where you stand.** A live scorecard summarises every criterion, its
  score, and its evidence at a glance, and a *Before you submit* check lists the
  blockers that remain and the thoroughness nudges that make for a balanced,
  constructive critique (an unbalanced criterion, a major weakness with no
  suggested fix, an unconfirmed conflict of interest).
- **Writes the review.** Scores, rationale, and tagged evidence assemble into a
  structured critique with a preview, exportable as **Word (.docx)**,
  **Markdown**, plain text, or **print/PDF**. Confidential comments to the
  program stay separate and are excluded unless you opt in.
- **Saves as you go, privately.** Everything persists in the browser
  (IndexedDB). A JSON backup bundles the review and its PDFs so you can move to
  another machine.
- **Gets out of your way.** A command palette (**⌘K**), full keyboard control,
  focus mode, and light or dark themes.

## Reading view

The server reflows each uploaded PDF (PyMuPDF, the extractor shared with
Marginalia): running headers and footers are dropped, paragraphs are joined
across page breaks, figures and ruled tables are cut out as images with their
captions, and Word-exported fonts that leave ligature glyphs unnamed are repaired
from the font's own metrics. It runs in the background right after upload, so a
phone opening the review a minute later finds it ready.

## Privacy and sync

Panelist is a single-user app behind a password. Your PDFs, notes, and scores live
on your own server (SQLite plus files on a persistent volume) and in a local cache on
each signed-in device. Sync is on by default: edits are saved locally first, queued,
and pushed within a second; other devices pick them up within a few seconds while
open, and on focus. Each score, note, checklist item, and draft field is its own
record, so two devices editing different parts of a review never overwrite each
other; pages read are merged as a set, and active time adds up per device.
Signing out of a device clears its local copy. *Sign out everywhere* invalidates
every device's session.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `S` `W` `Q` `N` | Tag the selection as a strength, weakness, question, or note |
| `1`–`5` | Brief, Notes, Score, Checklist, Draft |
| `[` `]` | Previous / next page |
| `+` `-` | Zoom |
| `⌘F` | Find in document |
| `\` | Toggle the navigator |
| `F` | Focus mode |
| `⌘K` | Command palette |
| `?` | All shortcuts |

## Development

Two processes: the API (Python 3.12, FastAPI, SQLite; managed with `uv`) and the
Vite dev server, which proxies `/api` to it.

```bash
npm install
npm run api          # API on :8000; first run seeds the admin dev@panelist.local / panelist-dev
npm run dev          # app on :5173
npm run build        # typecheck and build the SPA
npm test             # unit tests (Vitest)
npm run test:server  # API tests (pytest)
npm run test:e2e     # end-to-end (Playwright) against a throwaway server and data dir
```

The end-to-end tests drive the real app against a bundled, fictional sample
application (which includes a landscape budget page) and verify PDF rendering,
scrolling and page navigation, fact detection, tagging, scoring, the checklist,
custom frameworks, and export.

### Stack

Client: React 19, TypeScript, Vite, Zustand, Dexie (IndexedDB cache and outbox),
pdf.js for rendering, `docx` for Word export. Server: FastAPI, SQLite in WAL mode,
signed session cookies, a CSRF and body-size guard in front of every API route.

### The sample application

`public/sample-application.pdf` is a fully fictional NIH R01 application,
generated by `scripts/make_sample_pdf.py`. It is written to exercise the app's
heuristics and contains no real research or personal data.

## Deployment

One Docker image builds the SPA and serves it with the API. `fly.toml` is set up for
fly.io with a persistent volume at `/data`; the machine suspends when idle and wakes
on the first request.

```bash
fly launch --no-deploy                                   # once
fly secrets set ADMIN_EMAIL='you@example.org' APP_PASSWORD='…' SESSION_SECRET="$(openssl rand -base64 48)"
fly deploy --remote-only
```

Any host that runs the container with those variables set and a volume mounted at
`DATA_DIR` works the same way.

### Accounts

Every reviewer has their own account, identified by email, and sees only their own
reviews. `ADMIN_EMAIL` and `APP_PASSWORD` are read once, when the database has no
users yet, to create the first admin; after that passwords live in the database and
changing the variables does nothing. Admins add people from the account menu
("Manage people"): a new account gets a temporary password to hand over out of band,
which must be replaced at first sign-in. Admins can also reset a password (which
signs that person out everywhere), disable or delete an account, and promote another
admin. There is no self-service reset by email; ask an admin.

## License

MIT. The application content you review is your own and stays on your device.
