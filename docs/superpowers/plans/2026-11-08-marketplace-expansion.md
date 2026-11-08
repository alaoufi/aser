# Family offers, requests and coverage implementation plan

> For agentic workers: use superpowers:subagent-driven-development. Work in independent vertical slices and review the final branch.

**Goal:** Family-managed targeted offers, guest/member requests with duration and history, and hierarchical multiple coverage areas. Agreement and payment remain outside the site.
**Architecture:** Additive PostgreSQL migrations, existing Next.js route/auth/CSRF helpers, small account/public components. Preserve all existing IDs, products, phone verification and moderation.
**Tech Stack:** Existing Next.js16/React, Zod, pg, CSS modules, node:test and Playwright; no dependencies.
**Spec:** Owner instructions and latest clarifications recorded in docs/PROJECT_HANDOFF.md and docs/DECISIONS.md; this document records implementation choices delegated to us.

## Global constraints
- No payment collection, automatic debit/renewal or external-site changes.
- Anonymous requests permitted; session ownership controls member history. No history lookup/claim by arbitrary phone.
- Every family mutation verifies ownership; public surfaces require approved families and active records.
- Target groups are declared opt-in interests, not verified identity. Family states eligibility terms and checks outside the site. Targeted offers returned only for an enrolled group, not mixed into public listing. Never claim student status independently verified.
- All migrations additive, checksum001..005 untouched. No invented geographic parentage. New detailed locations administratively curated; legacy cities remain selectable while unmapped.
- Dropdown titles inside first options with accessible sr-only labels. Existing branding and responsive layout preserved.

## Review focus
- Cross-family writes/history/targeted offer leakage.
- Concurrent retry duplicate requests and state transitions.
- Expired/disabled offers, unavailable products and suspended families.
- Parent-child geographic mismatch and preserving old city coverage.
- Guest privacy, rate limits, request body limits, date boundaries and no false payment confirmations.

### Task1: Requests vertical slice
Files: migrations/008_requests.sql; src/server/orders.ts; src/app/api/orders/**; src/app/api/producer/orders/**; src/components/forms/orders.tsx; src/app/(account)/orders/page.tsx; src/app/(account)/dashboard/orders/page.tsx; tests/orders.test.ts. Only edit these files; root owns shared navigation/product integration.
- [x] Tests first for validation, session ownership, approved product/family checks, durations days/end date, immutable product snapshot and legal status transitions.
- [x] Implement POST /api/orders (optional session), GET /api/orders (member-only), GET/PATCH /api/producer/orders (own family). Fresh drafts for reorder use current availability; no automatic resubmission. Random client request key plus DB uniqueness for retry deduplication.
- [x] Export OrderRequestForm({productId, productName, offerId?}) for root integration; member history and family inbox pages. Name/phone, quantity, meal, start date, number of days OR inclusive end date (max366days), notes; explicitly pending family agreement, payment outside. Guests receive receipt reference, no publicly accessible private data.
- [x] Run focused tests, self-review, report exact evidence; do not commit shared work or deploy.

### Task2: Offers vertical slice
Files: migrations/007_offers.sql; src/server/offers.ts; src/app/api/offers/**; src/app/api/producer/offers/**; src/components/forms/offers.tsx; src/app/(account)/dashboard/offers/page.tsx; src/app/offers/page.tsx; tests/offers.test.ts. Root owns shared nav.
- [x] Tests first for ownership, target opt-in, active time range, approved family, disable behavior, input bounds.
- [x] Family creates/edits/enables offers (title/description/terms/optional productId/price, audience general/students/employees/families, meal breakfast/lunch/dinner/occasion, start/end dates). Product must be owned. General offers public; targeted require saved per-user opt-in in server DB via /api/offers/preferences; no blanket public response.
- [x] Public page offers opt-in group selection for signed-in users, honest self-declaration text and no identity-proof claim; selected group membership allows targeted offers. Family page manages own offers and activation.
- [x] If product-bound offer links to request, use /products/ID?offer=UUID; root/orders validate offer via exported assertOfferAccess(user|null,offerId,producerId,productId) helper. Expose safe summary returns label/price, throws inaccessible404. Offer with no product links family direct contact (agreement outside).
- [x] Focused tests/self-review; no deploy/commit shared files.

### Task3: Coverage vertical slice
Files: migrations/006_coverage.sql; src/server/coverage.ts; src/app/api/coverage/**; src/app/api/producer/coverage/**; src/app/api/admin/coverage/**; src/components/forms/coverage.tsx; src/app/(account)/dashboard/coverage/page.tsx; src/app/(account)/admin/coverage/page.tsx; tests/coverage.test.ts. Root owns shared nav/catalog integration.
- [x] Tests first for hierarchy/multiple picks, ownership, admin-only curated nodes, invalid parents, legacy retention.
- [x] Administrative curated tree region -> governorate -> city -> center -> neighborhood, allowing neighborhood below city. Reference existing cities/regions without changing IDs; no guessed parent mappings or fabricated seed centers. Admin can add governorates, associate existing city, add centers/neighborhoods. Legacy flat cities remain usable through clearly labeled unmapped path until curated.
- [x] Family selects multiple covered city/center/neighborhood nodes via dependent dropdowns and chips, saves own coverage, fees optional. Keep existing delivery_areas unchanged. Public safe helper getPublicCoverage(producerId) gives display labels for approved family only; root integrates producer detail.
- [x] Focused tests/self-review; no deploy/commit shared files.

### Task4: Root integration and eligibility
- [x] Link family offers/requests/coverage and customer orders/public offers in navigation without desktop/mobile overflow; integrate product request form and offer param, public family coverage.
- [x] Implement genuine admin eligibility exception (nullable document only for explicit exception request, reason required on admin approval, audit), preserve OTP requirement and no self-approval; meaningful tests.
- [x] Review all slices, run scratch migrations + full integration and browser gates + production build sequentially. Correct regressions. Review diff/secrets then commit exact files.
- [x] Verify recoverable Jdatna backup before additive production migration. Deploy exact built SHA via Jdatna Coolify service only. Verify public health/readiness and browser screens; no fake production users or actual SMS.
- [x] Record actual results/deployed SHA/remaining geographic curation and owner admin access in handoff/tasks/decisions, commit docs. No claim physical phone testing.
