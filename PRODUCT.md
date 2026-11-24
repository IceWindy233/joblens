# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Chrome Manifest V3 extension (Chrome ≥ 116): a side panel (`entrypoints/sidepanel/`) that runs beside BOSS 直聘 job pages, plus a full-page options page (`entrypoints/options/`). An Android client (preview, `android/` + `mobile/`) reads the BOSS 直聘 app through an accessibility service and shows the same workspace in an overlay panel; analysis starts only when the user taps the overlay button. See `docs/android/ARCHITECTURE.md`.

## Users

General job seekers in mainland China browsing postings on BOSS 直聘, across any role, not only technical ones. They should not need to know what an API, a model, or a token is. They are working through a list of postings, deciding which ones are worth contacting and writing the first message to each recruiter.

Current gap: the product requires users to configure their own OpenAI-compatible endpoint, model name, and API key. The product does not yet serve the non-technical majority of its intended audience; setup and wording must not assume technical knowledge.

## Product Purpose

JobLens reads the job description on the current BOSS 直聘 posting and combines it with a résumé profile the user picked. It drafts the first greeting message to the recruiter (打招呼语) and shows the evidence for how the profile matches the posting.

Success means a greeting the user can send as written: specific to this posting's key tasks, true to the user's verified facts, never overstated. Match analysis (score, application focus, per-item evidence, gaps) is secondary. It helps the user check the greeting and decide whether to apply, but it is not the main output.

## Positioning

- The user brings their own model. There is no developer server, analytics, or telemetry. Résumé profiles, rules, and examples stay in `chrome.storage.local`.
- Truthfulness is a built-in rule that personal preferences cannot override. A structured fact layer separates personal projects from production experience and shipped work from work in progress. AI-drafted facts must be confirmed by the user before they are saved. Local checks catch invented numbers, years, and claims that contradict a fact's limits. Numbers from the JD title cannot back a candidate claim.
- Assisted, never automated. The extension does not send messages, submit applications, or run batch operations. Every model call starts with a user click.

## Operating Context

- The side panel sits next to BOSS 直聘 list pages (right-hand detail pane) and `/job_detail/` pages. It follows the selected posting and the active tab automatically.
- Users keep several résumé profiles, one per job direction. Each has its own summary, structured facts, capability limits, rules, and saved examples. Profiles never mix during analysis.
- The workflow has two stages. Stage A (match analysis, fact selection) and Stage B (greeting writing) are cached separately. When Stage A is stale, the user must refresh the analysis before rewriting the greeting.
- Rules apply at three levels: global default → per-profile → one-off request. Built-in fact and safety rules sit above all three. Selection rules (Stage A) are kept separate from writing rules (Stage B).
- Résumés (text-based PDF/DOCX) are parsed locally. Phone numbers, email addresses, and ID numbers can be masked.
- The user edits, copies, rewrites, or saves greetings as examples by hand, then sends them inside BOSS 直聘.

## Capabilities and Constraints

- UI language: Simplified Chinese only. No internationalization planned.
- Site coverage: BOSS 直聘 only today. Support for more Chinese job sites (e.g. 拉勾, 猎聘) is planned. Site-specific logic belongs in `adapters/<site>/`; product surfaces should not hard-code BOSS-only assumptions.
- Dark mode is required. It is not implemented yet: the current tokens in `components/styles.css` are light-only.
- Content scripts only read the current posting and never modify the page. Web pages and content scripts cannot reach API keys or profiles.
- By default, API keys live in `chrome.storage.session`. Optional "remember" stores the key in `chrome.storage.local` as plain text, and the UI says so.
- Salary is left blank when the site obfuscates it with a custom font. The product does not decode it.
- Not supported: scanned PDFs or image résumés (no OCR), `.doc` files.
- Page redesigns on the job site can break extraction. The side panel reports "职位读取失败" and offers a page-structure snapshot download for diagnosis.
- Open: how onboarding will serve non-technical users. Options include guided provider setup and presets; no decision has been made.

## Brand Commitments

- Name: JobLens · 职镜. Icon: `docs/icon.png`, `public/icon/*`.
- Not affiliated with BOSS 直聘 / 看准科技. Disclaimer in README must persist.
- Plain, honest voice: no promises about outcomes. Scores are labeled as reference only. Privacy tradeoffs are stated directly.

## Evidence on Hand

- README.md: feature, privacy, and limitation copy.
- DOM fixtures and unit tests in `tests/`.
- No testimonials, user counts, success rates, press, or store listing exist. Do not fabricate any.

## Product Principles

1. Truth over persuasion: a weaker true greeting beats a stronger invented one.
2. The user stays in control: suggest and show evidence, never act on the user's behalf.
3. Data stays the user's: nothing leaves the browser unless the user clicks, and only to the provider the user configured.
4. Explain why: every score, selected fact, and warning links back to the JD line or profile fact it came from.
5. Assume no technical fluency: anyone looking for a job should be able to use it.

## Accessibility & Inclusion

WCAG 2.2 AA is required for both the side panel and the options page, in light and dark themes. This includes contrast, full keyboard operation, visible focus, and correct names and roles on controls. The side panel is narrow, so text and controls must stay usable at that width and at browser zoom.
