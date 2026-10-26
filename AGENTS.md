<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

Instructions for AI agents working in this repository (Antigravity IDE).

This is the internal CRM for **Tchaikovsky School**, a music school teaching piano, violin and guitar. Staff use it daily to manage students, teachers, lessons, schedules, payments and communication. It is a work tool. It must feel calm, formal and fast.

Read this file fully before changing anything. If a rule here conflicts with a request, say so and ask before breaking it.

---

## 1. Role

Act as a senior engineer and product designer working together. Every change should be something a careful reviewer would approve without comments: correct, readable, consistent with the codebase, and visually consistent with the existing CRM.

Do not guess. If something is unclear (data shape, business rule, expected behavior), look in the codebase first, then ask.

---

## 2. Design principles

**Formal.** Neutral language, no slang, no playful copy, no decorative illustrations. Labels are plain: "Students", "Add student", "Save changes".

**Minimal.** Show only what the user needs for the task. Remove anything that doesn't earn its place: extra borders, shadows, gradients, icons without meaning, redundant text.

**Consistent.** The same problem is solved the same way everywhere. A table looks like every other table. A form behaves like every other form.

**Predictable.** Staff should never wonder what a button does or whether something saved.

### 2.1 Theme (strict rule)

The CRM already has a theme. **Use it. Do not invent colors, fonts, radii or shadows.**

- Before styling anything, find the theme source (for example `tailwind.config.*`, `globals.css`, CSS variables, a `theme` or `tokens` file, or the UI library's provider) and read it.
- Use theme tokens only: semantic color names, spacing scale, font families, radius, shadows.
- Never write raw hex, rgb or hsl values in components. Never use arbitrary Tailwind values like `bg-[#1a1a1a]` or `text-[13px]` when a token exists.
- If a needed token does not exist, stop and tell the user. Do not add a one-off color. Propose the token and wait for approval.
- Use existing components first (buttons, inputs, tables, dialogs, badges, toasts). Build a new one only when nothing fits, and build it from the same tokens.
- Dark mode, if the CRM supports it, must work automatically through tokens. No per-component dark overrides with hardcoded colors.

### 2.2 Layout and spacing

- Use the spacing scale from the theme. No random pixel values.
- Keep generous whitespace. Dense is fine for tables, cramped is not.
- Align to a consistent grid. Left-align text and labels. Right-align numbers and amounts in tables.
- One primary action per screen or section. Secondary actions are visually quieter.
- Page structure: title, short context line if needed, primary action, then content. Same order on every page.

### 2.3 Typography

- Use the theme fonts only.
- Clear hierarchy with few levels: page title, section title, body, caption. Do not add new sizes.
- Sentence case for labels and buttons. No ALL CAPS except where the existing UI already does it.
- No emoji anywhere in the UI, copy, commits or docs.

### 2.4 Components and patterns

**Tables**
- Sticky header for long lists. Sortable only where sorting is useful.
- Search and filters above the table, same position on every list page.
- Pagination or virtualization for anything that can grow. Never render unbounded lists.
- Row actions in a single menu or a small, consistent set of icon buttons with accessible labels.
- Empty state: one line explaining what is missing and the action to fix it.

**Forms**
- One column by default. Group related fields under a plain section title.
- Visible labels above inputs. Placeholders are hints, not labels.
- Validate on blur and on submit. Show the error next to the field in plain language ("Enter a valid phone number"), not codes.
- Disable the submit button while submitting and show progress. Prevent double submits.
- Never lose the user's input on error.

**Feedback**
- Success: short toast or inline confirmation.
- Errors: say what happened and what to do next. Never show raw error messages, stack traces or IDs to users.
- Destructive actions (delete, cancel lesson, refund) require a confirmation dialog naming the exact item. Prefer soft delete or undo where possible.
- Every async view has a loading state (skeleton matching the layout) and an error state with retry.

**Navigation**
- Sidebar for main modules, same order and naming throughout. Highlight the current page.
- Breadcrumbs or a clear back action on detail pages.
- Do not hide core features behind unlabeled icons.

### 2.5 Accessibility and responsiveness

- Everything reachable and usable with keyboard. Visible focus states from the theme.
- Semantic HTML first (`button`, `a`, `label`, `table`), ARIA only when needed.
- Text contrast must come from theme tokens that already meet WCAG AA. Do not rely on color alone to convey status. Pair it with text or an icon.
- Every icon-only button has an accessible name.
- Responsiveness is a hard requirement, not a polish step. See section 2.6.
- If the school operates in Arabic or any RTL context, use logical CSS properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start`, `end`) instead of left/right so RTL works without rewrites.

### 2.6 Responsiveness (hard requirement)

Reception and teachers will open the CRM on desktops, laptops, tablets and phones, often between lessons. Every screen must work well at every width. A feature that only works on desktop is not finished.

**Approach**
- Design **mobile-first**: write the base styles for the smallest screen, then add `sm`, `md`, `lg`, `xl` variants upward using the theme's existing breakpoints. Do not add custom breakpoints.
- Think in layouts, not devices. Test in-between widths too (for example 360, 390, 768, 820, 1024, 1280, 1440 and wider), not only the common ones.
- Prefer fluid layout (flex, grid, `min-w-0`, `max-w-*`, `%`, `fr`) over fixed widths and heights. No fixed pixel widths on containers.
- Use `dvh`/`svh` instead of `100vh` for full-height layouts so mobile browser toolbars do not break them.
- No horizontal scroll on the page at any width. If content is wider than the screen (tables, calendars), only that component scrolls, inside its own container.
- Respect safe areas on phones with notches (`env(safe-area-inset-*)`) for fixed headers, footers and bottom bars.

**App shell**
- Desktop: persistent sidebar. Tablet: collapsible or icon-only sidebar. Phone: sidebar becomes a drawer opened from a menu button in the top bar.
- Top bar stays compact on phones. Secondary actions move into a menu.
- The primary action on a page stays easy to reach on phones (for example a full-width button or a sticky bottom action bar), never buried.

**Tables and lists**
- Wide tables on desktop. On phones, do one of these, and use the same one across the whole CRM:
  - Convert rows to stacked cards showing the 2 to 4 most important fields, with the rest on the detail page, or
  - Keep the table but let it scroll horizontally inside its container with a sticky first column.
- Hide low-priority columns at smaller breakpoints instead of squeezing everything.
- Filters collapse into a single "Filters" button that opens a sheet or drawer on phones.
- Pagination controls and row actions must stay reachable and tappable at every width.

**Forms**
- Single column on phones. Multi-column only from `md` up, and only when it helps.
- Inputs take full width on small screens. Labels stay above inputs.
- Use the correct input types and attributes (`type="tel"`, `type="email"`, `inputMode`, `autocomplete`) so mobile keyboards are right.
- Submit and cancel buttons stack on phones and sit in a consistent place on desktop. On long forms, keep the submit action visible without scrolling back up (a sticky footer is acceptable).

**Dialogs, menus and overlays**
- Dialogs become full-screen or bottom sheets on phones. They must never be taller than the viewport without internal scrolling.
- Dropdowns and popovers must not overflow the screen. Use collision handling from the UI library.
- Date and time pickers must be usable by touch.

**Touch and input**
- Minimum touch target of 44 by 44 px for buttons, links, checkboxes, icon buttons and row actions, with enough spacing between them.
- Never depend on hover for essential actions or information. Provide a tap or focus alternative.
- Support both pointer and keyboard on larger screens. Do not break touch scrolling with custom handlers.

**Scheduling and calendar views** (highest risk area)
- Desktop: week or month grid. Tablet: week grid with horizontal scroll if needed. Phone: day or agenda list view by default.
- Lesson cards must stay readable with long names, long Arabic or English text, and overlapping lessons.
- Date navigation and "add lesson" must stay one tap away on phones.

**Content and text**
- Long text (names, emails, notes) must truncate with ellipsis or wrap cleanly. It must never overflow its container or push the layout.
- Test with long and short content, empty states, many items, and both LTR and RTL if supported.
- Images and media use responsive sizing (`max-w-full`, aspect-ratio, the framework's image component).
- Font sizes come from theme tokens. Inputs on phones must be at least 16px so iOS does not zoom on focus. Text must stay usable at browser zoom up to 200%.

**Performance on small devices**
- Phones may be on slow networks. Keep initial payloads light, lazy-load heavy components (calendars, charts, editors), and avoid layout shift.
- Do not render desktop-only components on phones when it can be avoided. Load them conditionally instead of only hiding them with CSS.

**How to verify responsiveness**
- Check every new or changed screen at a minimum of 360, 768, 1024 and 1440 px wide, in portrait and landscape for phone and tablet.
- Check loading, empty, error and long-content states at each width.
- Check the keyboard-open state on phones: the focused field must not be hidden behind the keyboard or a sticky bar.
- Use browser dev tools device emulation as the baseline, and test on a real phone for anything involving touch, sticky elements or forms.
- Include screenshots at phone and desktop widths in every UI pull request.

---

## 3. Engineering principles

### 3.1 Clean code

- **Names say what things are.** `getStudentsByTeacher`, not `getData2`. No abbreviations unless they are universal.
- **Small, single-purpose functions and components.** If you need "and" to describe it, split it.
- **No dead code.** No commented-out blocks, unused imports, unused variables, or leftover `console.log`.
- **No magic values.** Extract constants and enums (lesson status, payment status, roles, instruments).
- **DRY, but not at any cost.** Extract after the second or third real repetition, not before. Avoid abstractions that make the code harder to follow.
- **Comments explain why, not what.** If a comment explains what the code does, rewrite the code.
- **Early returns** over deep nesting. Keep nesting to two or three levels.
- **Prefer pure functions** and explicit inputs and outputs. Isolate side effects.
- **Follow the existing style** of the repo (formatting, naming, folder structure) even if you would do it differently. Run the linter and formatter before finishing.

### 3.2 TypeScript

- Strict mode. No `any`. If a type is truly unknown, use `unknown` and narrow it.
- No `@ts-ignore` or non-null assertions (`!`) to silence errors. Fix the type.
- Define domain types once (Student, Teacher, Lesson, Payment, etc.) and reuse them. Derive from schemas where possible (for example with Zod) so runtime validation and types never drift.
- Type function return values for public functions and API boundaries.
- Use discriminated unions for states (loading, error, success) instead of multiple booleans.

### 3.3 React and Next.js

- Components are small and focused. Presentational components do not fetch data. Data logic lives in hooks, server components, actions or services.
- Default to server components in Next.js where the project uses the App Router. Add `"use client"` only when interactivity requires it, and push it as far down the tree as possible.
- Keep state as local as possible. Do not lift or globalize state without a reason.
- Do not use `useEffect` for things that can be derived or handled in event handlers.
- Memoize only when measurement shows a problem.
- Stable, meaningful `key` props. Never use array index for dynamic lists.
- Use the project's existing form, data-fetching and table libraries. Do not add a second library for the same job.

### 3.4 Backend, API and data

- Validate every input on the server. Never trust the client.
- Check authentication and authorization on every route and action. Roles (for example admin, reception, teacher) must be enforced server-side, not only hidden in the UI.
- Consistent API response and error shape across all endpoints. Use correct HTTP status codes.
- Keep business logic in a service layer, not inside route handlers or components.
- Database: index fields used in filters and sorts. Avoid N+1 queries. Paginate list queries. Use transactions for multi-step writes (for example creating a lesson and a payment).
- Soft delete or archive for records with history (students, payments, lessons). Keep an audit trail for sensitive changes.
- Migrations or schema changes must be backward compatible and explained in the PR.
- Dates and times: store in UTC, display in the school's timezone, and handle timezone explicitly in scheduling logic. Never compare dates as strings.
- Money: store as integers in the smallest unit or use a decimal type. Never use floats for amounts. Always store currency.

### 3.5 Security and privacy

This CRM holds personal data, including data about children.

- Never commit secrets, tokens or `.env` files. Use environment variables and update the example env file when adding new ones.
- Never log personal data (names, phones, emails, payment details).
- Sanitize and escape user-generated content. Parameterize queries.
- Principle of least privilege for roles and API access.
- Rate limit authentication and sensitive endpoints.
- Do not expose internal IDs, stack traces or system details in responses.

### 3.6 Performance

- Fetch only the fields needed. Paginate and filter on the server.
- Avoid unnecessary client JavaScript and large dependencies. Check bundle impact before adding a package.
- Optimize images with the framework's image tools.
- Debounce search inputs. Avoid layout shift.

### 3.7 Error handling

- Handle errors where you can do something useful with them. Do not swallow them silently.
- Expected failures (validation, not found, conflict) return clear typed results. Unexpected failures are logged with context and shown to the user as a generic, friendly message.
- No empty `catch` blocks.

---

## 4. Workflow for agents

1. **Understand.** Read the relevant files, the theme, and similar existing features before writing code.
2. **Plan briefly.** For anything beyond a small fix, state the plan in a few lines: what changes, which files, any risk.
3. **Make the smallest correct change.** Do not refactor unrelated code, rename things, or reformat files you are not working on.
4. **Reuse before creating.** Search for an existing component, hook, util or type first.
5. **Verify.** Run type check, lint, tests and build. Fix what you broke. Check the UI states: loading, empty, error, success, and long content, at phone, tablet and desktop widths (section 2.6).
6. **Report honestly.** Summarize what changed, what you tested, and anything you were unsure about or did not do.

### Ask before you:

- Add a dependency
- Add or change a theme token
- Change a database schema or a public API
- Delete files or data
- Change authentication or permissions
- Do a large refactor

### Never:

- Hardcode colors, fonts or one-off styles outside the theme
- Ship a screen that was only checked at desktop width
- Use fixed pixel widths or hover-only interactions for essential features
- Use `any`, `@ts-ignore`, or disable lint rules to get past an error
- Leave TODOs without a clear owner or reason
- Invent business rules (pricing, cancellation policy, lesson rules). Ask.
- Fake data or hardcode values to make something look finished
- Claim something works without running it

---

## 5. Domain notes

- Instruments taught: piano, violin, guitar. Treat instruments as data (enum or table), not hardcoded strings in the UI.
- Core entities typically include: students (and guardians), teachers, lessons and schedules, packages or subscriptions, payments, attendance, notes and communication history.
- Students are often minors. Guardian contact details and consent matter. Be careful with what is shown and to whom.
- Scheduling is the highest-risk area: time zones, recurring lessons, cancellations, rescheduling and conflicts need explicit handling and tests.
- Payment and attendance records are part of the school's financial and legal history. Do not hard delete them.

If any of this does not match the actual codebase, the codebase wins. Tell the user so this file can be corrected.

---

## 6. Commits and pull requests

- Small, focused commits. One logical change each.
- Commit format: `type(scope): short description` in the imperative, for example `feat(students): add guardian contact section`. Types: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`.
- PR description: what changed, why, how it was tested, screenshots for UI changes at phone and desktop widths (including empty and error states).
- No unrelated changes mixed in.

---

## 7. Definition of done

A task is done only when all of these are true:

- It does what was asked, including edge cases and error states
- It uses the CRM theme and existing components, with no hardcoded styling
- Types are strict and there are no lint or type errors
- Tests exist for new logic, and existing tests pass
- It is accessible by keyboard and fully responsive: no horizontal page scroll, usable by touch, and checked at phone, tablet and desktop widths
- No leftover debug code, dead code or secrets
- The summary to the user is accurate about what was and was not verified