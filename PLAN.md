# Min/Max Order Limits Shopify App — Implementation Plan

## 1. Product goal

Build an embedded Shopify app comparable to MinMaxify that lets merchants define and enforce purchasing limits across the online store, cart, accelerated checkout, and checkout.

The primary use case is case-pack selling:

- A selected product has a minimum quantity of 6.
- Its quantity can only be 6, 12, 18, 24, and so on.
- The product page and cart guide the buyer toward valid quantities.
- Shopify blocks checkout if a buyer bypasses the storefront UI or submits an invalid quantity through another channel.

The app should grow from a focused MVP into a broader limits platform without replacing its core data model.

## 2. Scope

### MVP

The first production version will support:

- Enable or disable the app per shop.
- Create, edit, duplicate, enable, disable, and delete rules.
- Apply rules to:
  - specific products;
  - specific variants;
  - collections;
  - product tags;
  - all products.
- Rule constraints:
  - minimum quantity;
  - maximum quantity;
  - quantity multiple / increment;
  - optional starting quantity.
- Per-line mode and grouped-total mode.
- Excluded products and variants.
- Product page quantity guidance.
- Cart page and cart drawer validation messages.
- Native cart and checkout enforcement using Shopify Functions.
- Checkout cannot complete with invalid quantities, including carts created through Buy Now, accelerated checkout, AJAX cart requests, or Storefront API clients. Invalid quantities may still be added to a cart; the Theme Extension guides/corrects supported storefront flows and the Function authoritatively blocks checkout progress.
- Customizable customer-facing messages.
- Initial English, Latvian, and Russian translations.
- Rule synchronization status and diagnostics.
- Uninstall cleanup for data that should not remain in Shopify.

### MinMaxify-level expansion

Later phases will add:

- Cart-wide minimum and maximum quantity.
- Cart-wide minimum and maximum subtotal.
- Group minimum and maximum quantity.
- Group minimum and maximum subtotal.
- Cart and group weight limits.
- Conditions by vendor, product type, SKU, title, and handle.
- Composite condition groups with AND/OR logic.
- Customer-tag and B2B-company targeting.
- Market and country targeting.
- Scheduled rules.
- Rules based on inventory availability.
- Import/export and bulk editing.
- Rule templates, audit log, analytics, and billing plans.

## 3. Recommended technical stack

- Latest Shopify app scaffold with React Router and TypeScript.
- Node.js 22 or newer.
- Embedded Shopify Admin application.
- Polaris App Home web components for merchant UI.
- Shopify App Bridge for navigation, resource picker, toast, modal, and save bar behavior.
- Prisma for persistence.
- PostgreSQL in production; Neon is recommended for the existing deployment workflow.
- Shopify Admin GraphQL API for products, variants, collections, metafields, validation activation, and synchronization.
- Shopify Cart and Checkout Validation Function for authoritative enforcement.
- Theme App Extension for storefront quantity controls, messages, cart feedback, and theme integration.
- Vitest for app and Function tests.
- Render or equivalent Node hosting for the embedded app and webhook handlers.

## 4. Why both a Theme App Extension and Shopify Function are required

The Theme App Extension improves buyer experience:

- Changes product quantity input to minimum 6 and step 6.
- Displays “Sold in packs of 6”.
- Corrects or rejects invalid quantities before add-to-cart.
- Shows actionable messages in cart and cart drawer.
- Can best-effort disable detected storefront checkout controls while the cart is invalid.

It is not a security boundary. A Theme App Extension needs a merchant-enabled app block/embed plus injected JavaScript and theme-specific selectors to interact with native theme controls. It cannot modify Shopify checkout itself, and storefront JavaScript can be bypassed by Buy Now, custom themes, direct cart requests, headless storefronts, or disabled JavaScript.

The Cart and Checkout Validation Function is the source of truth:

- Runs on Shopify infrastructure.
- Validates the final cart before checkout can proceed.
- Returns errors for invalid minimums, maximums, and multiples.
- Protects checkout even when storefront UI is bypassed.
- Has no dependency on the app server during checkout.

## 5. Rule model

### Core Rule

Each rule should contain:

- ID.
- Shop ID.
- Merchant-facing name.
- Optional customer-facing title.
- Enabled state.
- Scope type.
- Evaluation mode.
- Priority.
- Minimum quantity.
- Maximum quantity.
- Multiple / increment.
- Starting quantity.
- Start and end dates.
- Created and updated timestamps.

### Scope types

- ALL_PRODUCTS.
- PRODUCTS.
- VARIANTS.
- COLLECTIONS.
- PRODUCT_TAGS.
- PRODUCT_TYPES.
- VENDORS.
- CART.
- GROUP.

MVP only exposes the first five scopes, while the database enum can reserve the remaining values.

### Evaluation modes

- EACH_LINE: validate every matched cart line independently.
- EACH_PRODUCT: combine variants belonging to the same product.
- GROUP_TOTAL: add all matched quantities and validate the total.
- CART_TOTAL: validate the entire cart.

### Rule targets

Use normalized association records rather than large arrays in the Rule row:

- RuleProduct.
- RuleVariant.
- RuleCollection.
- RuleCondition.
- RuleExclusion.

Store Shopify GIDs and a cached display name/image for fast Admin UI rendering.

### Messages

Store templates per locale and violation type:

- minimum_not_met;
- maximum_exceeded;
- invalid_multiple;
- cart_minimum_not_met;
- cart_maximum_exceeded;
- group_minimum_not_met;
- group_maximum_exceeded.

Supported placeholders should include rule title, product title, current quantity, minimum, maximum, multiple, next valid quantity, and previous valid quantity. The Function input query must request Shopify’s `localization` locale so checkout errors can select EN/LV/RU templates, with English as the fallback.

## 6. Deterministic rule precedence

Rule conflict behavior must be explicit and tested.

Recommended precedence for line-level rules:

1. Variant-specific rule.
2. Product-specific rule.
3. Collection rule.
4. Product-tag rule.
5. Global product rule.

Within the same scope, higher priority wins. If priorities are equal, the most recently updated enabled rule wins; the rule ID is the final stable tie-breaker.

For the MVP, only one effective line-level rule should be materialized for each variant. This makes storefront behavior and checkout enforcement predictable.

Group and cart rules are independent. A cart can violate multiple group or cart rules simultaneously, and all actionable errors should be returned within Shopify Function limits.

The Admin UI must detect impossible configurations before saving, including:

- minimum greater than maximum;
- non-positive multiple;
- starting quantity below minimum or above maximum;
- no valid multiple within the min/max range;
- duplicate rules with identical scope and priority;
- mutually conflicting rules for the same variant.

## 7. Shopify data architecture

The PostgreSQL database is the source of truth for merchant configuration. Shopify metafields contain a compiled runtime representation for the Function and storefront.

### Effective variant/product metafield

Define versioned app-owned metafield definitions for PRODUCT and PRODUCTVARIANT, then write an effective metafield to each affected variant, with product-level fallback where appropriate. Definitions that must be read by Liquid or the Storefront API require explicit storefront `PUBLIC_READ` access; private Function-only configuration must remain non-public. The effective metafield contains the line rule only:

- rule ID;
- enabled state;
- minimum;
- maximum;
- multiple;
- starting quantity;
- localized short message key/version.

The Function input query reads this metafield directly from each cart line’s merchandise. This avoids trying to query the app server or search a large database at checkout.

### Validation-owner metafield

The Shopify `Validation` record created with `validationCreate` is the Function owner. Store compact global configuration in an app-owned metafield on that Validation:

- app enabled state;
- cart-level rules;
- group rule definitions;
- message templates or compact message identifiers;
- configuration schema version;
- synchronization revision.

### Group memberships

For group rules, materialize compact group IDs into the effective product or variant metafield. The Function aggregates matching lines by group ID and applies group definitions from its owner metafield.

### Storefront configuration

Expose a storefront-readable app-owned configuration containing only non-sensitive UI data. Its metafield definition must explicitly grant storefront `PUBLIC_READ` access when read through Liquid or Storefront API:

- whether storefront guidance is enabled;
- message templates;
- style settings;
- selector overrides;
- localization strings;
- configuration revision.

Do not expose internal database identifiers, billing data, or secrets.

## 8. Rule compilation and synchronization

A compilation service converts database rules into effective Shopify runtime configuration.

### Compilation flow

1. Merchant saves or disables a rule.
2. Validate rule semantics in the app.
3. Save the database transaction.
4. Find all potentially affected products and variants.
5. Resolve matching rules and precedence.
6. Compute one effective line rule per variant.
7. Compute group membership IDs.
8. Bulk-write app-owned metafields through Admin GraphQL in API-compliant chunks.
9. Update the Validation-owner configuration metafield.
10. Update storefront configuration.
11. Record sync revision, timestamps, counts, and errors.

### Background jobs

Use a persistent job table initially; add a dedicated queue only if scale requires it. Jobs include:

- full shop synchronization;
- rule-specific synchronization;
- product synchronization;
- collection membership synchronization;
- cleanup of obsolete metafields;
- retry of failed Admin API writes.

Jobs must be idempotent and safe to retry. Bulk metafield writes must be chunked according to the selected Admin API version’s mutation limits and cost budget, with throttle-aware backoff. Large-catalog and large-cart benchmarks must verify metafield payload size, Function input size, instruction count, and execution time.

### Webhooks

Subscribe to relevant events:

- APP_UNINSTALLED.
- PRODUCTS_CREATE.
- PRODUCTS_UPDATE.
- PRODUCTS_DELETE.
- COLLECTIONS_CREATE.
- COLLECTIONS_UPDATE.
- COLLECTIONS_DELETE.
- APP_SCOPES_UPDATE.

For public App Store distribution, also register and correctly handle the mandatory compliance topics:

- customers/data_request;
- customers/redact;
- shop/redact.

Product and collection changes enqueue recompilation rather than doing large sync work inside the webhook request. Every webhook endpoint must verify Shopify HMAC before accepting work.

## 9. Shopify Function behavior

Use the cart and checkout validation target `cart.validations.generate.run`.

For every cart line:

1. Read quantity, merchandise ID, product identity, and app-owned effective rule metafield.
2. Skip lines without an enabled effective rule.
3. Validate minimum quantity when the product is present. A minimum rule does not force a product to be added to the cart.
4. Validate maximum quantity.
5. Validate multiple using `quantity modulo multiple == 0`, in addition to the independent minimum and maximum checks. “Starting quantity” is a storefront UI default, normally the smallest valid multiple at or above the minimum; it is not a second arithmetic base for validation.
6. Aggregate product/group/cart values for non-line rules.
7. Return targeted, actionable errors.

Examples:

- “White Water is sold in packs of 6. Choose 6, 12, 18…”
- “The minimum quantity for White Water is 6. You currently have 2.”
- “The maximum quantity for this product is 24.”

Function requirements:

- No network requests.
- No dependency on PostgreSQL or the hosted app at runtime.
- Defensive parsing of missing, malformed, or old-version metafields.
- Missing or malformed business configuration returns no validation errors; Shopify `Validation.blockOnFailure` separately controls whether runtime exceptions/timeouts block checkout.
- Stable schema versioning for future migrations.
- Read the Function input `localization` locale and choose the matching translated error template, with English fallback.
- Unit tests covering every violation and conflict case.

## 10. Storefront behavior

### Product page

The Theme App Extension app block/embed should:

- Detect the selected variant.
- Read the effective minimum, maximum, and step for that variant.
- Set the quantity input’s min, max, step, and initial value.
- Make plus/minus controls move by the configured increment.
- Show “Minimum 6 · Sold in multiples of 6”.
- Reapply behavior after variant changes and Shopify section re-renders.
- Validate Add to Cart and Buy Now interactions where the theme permits.
- Never rely on this client validation as authoritative enforcement.

### Product cards and quick add

For eligible themes:

- Set quick-add default quantity to the valid starting quantity.
- Show pack-size information near the product price or quick-add button.
- Gracefully fall back to checkout enforcement when a theme does not expose quantity controls.

### Cart page and cart drawer

The extension should:

- Find all matching line quantity inputs, including both cart page and drawer when both exist in the DOM.
- Apply min/max/step.
- Make increment and decrement buttons use the configured step.
- Auto-correct an invalid quantity only after explicit buyer action; do not silently change quantities on initial load.
- Display inline errors with nearest valid quantities.
- Best-effort disable detected storefront checkout buttons while invalid; do not claim universal compatibility or checkout-page control.
- Re-render only after actual cart/section changes and ignore its own DOM mutations to avoid observer loops.
- Support merchant-defined selector overrides for non-Dawn themes.

### Theme compatibility

Start with Dawn as the reference implementation. Add a diagnostics screen that reports:

- whether the app embed is enabled;
- detected product quantity input;
- detected cart page input;
- detected cart drawer input;
- detected checkout buttons;
- current selector overrides.

Provide generic selectors and merchant-editable overrides rather than hardcoding a single theme forever.

## 11. Embedded Admin UI

### Home / dashboard

- App status.
- Number of active rules.
- Products/variants covered.
- Last successful sync.
- Failed sync jobs.
- Theme embed status.
- Setup guide.

### Rules index

- Tabs: Product rules, Group rules, Cart rules.
- Search and filters.
- Status badge.
- Scope summary.
- Min/max/multiple summary.
- Priority.
- Last synchronized timestamp.
- Bulk enable, disable, duplicate, and delete.

### Rule editor

- Rule name and enabled switch.
- Scope picker using Shopify Resource Picker for products, variants, and collections.
- Tag targeting for tag rules.
- Exclusions.
- Evaluation mode.
- Min, max, multiple, and starting quantity fields.
- Live valid-quantity examples such as 6, 12, 18, 24.
- Message preview.
- Conflict warning.
- Estimated number of affected variants.
- Save and synchronize action.

### Messages

- English, Latvian, and Russian templates.
- Per-violation templates.
- Placeholder reference.
- Preview using sample data.
- Reset to defaults.

### Theme integration

- Enable/disable storefront guidance.
- Link to Theme Editor app embed.
- Selector overrides for product input, cart input, plus/minus controls, and checkout buttons.
- Styling controls kept intentionally limited.
- Theme diagnostics.

### Settings

- Master enable switch.
- Shopify `Validation.blockOnFailure` preference, clearly explained as behavior for Function runtime exceptions/timeouts rather than ordinary rule violations.
- Rule precedence policy display.
- Automatic synchronization.
- Manual full sync.
- Cleanup before uninstall.

## 12. API scopes and permissions

Start with the minimum required scopes and verify exact names against the selected Shopify API version during scaffold implementation.

Expected scopes:

- `write_products` for reading products, variants, and collections and writing product/variant app-owned metafields; Shopify documents that the write scope includes read access.
- `read_validations` for validation queries.
- `write_validations` for `validationCreate`, `validationUpdate`, and `validationDelete`.
- `read_themes` only if theme diagnostics genuinely require it.
- Customer-related scopes only if customer-tag or historical-customer targeting is introduced and the exact shipped implementation requires them.

Do not request customer or order scopes in the MVP unless a shipped feature requires them.

## 13. Database outline

Recommended initial entities:

- Shop.
- Session.
- Rule.
- RuleTarget.
- RuleCondition.
- RuleMessage.
- SyncJob.
- SyncResult.
- AuditEvent.

Important Shop fields:

- shop domain;
- enabled state;
- Shopify validation ID;
- validation Function ID/handle;
- current config revision;
- last successful sync;
- storefront settings;
- uninstall timestamp.

Important SyncJob fields:

- job type;
- entity ID;
- status;
- attempts;
- run-after timestamp;
- locked-at timestamp;
- structured error;
- created/completed timestamps.

## 14. Security and reliability

- Verify Shopify sessions on every embedded route.
- Verify webhook HMAC signatures.
- Keep access tokens server-side only.
- Use app-owned metafields.
- Validate all IDs as Shopify GIDs before API calls.
- Escape merchant-controlled messages before storefront rendering.
- Rate-limit manual full sync.
- Use idempotency keys/revisions for sync jobs.
- Do not log tokens or full customer/cart payloads.
- Record structured synchronization errors without sensitive values.
- Make uninstall cleanup safe and repeatable.

## 15. Testing strategy

### Function tests

- No rule.
- Disabled app and disabled rule.
- Exact minimum.
- Below minimum.
- Exact maximum.
- Above maximum.
- Valid multiple: 6, 12, 18.
- Invalid multiple: 7, 10, 13.
- Starting quantity plus step.
- Product with multiple variants.
- Variant override over product rule.
- Exclusion precedence.
- Group aggregation.
- Multiple simultaneous violations.
- Malformed and old-version metafields.
- Discounted product lines.
- Selling plans and subscriptions where supported.
- Multiple currencies for amount-based limits in later phases.

### App tests

- Rule CRUD.
- Conflict detection.
- Rule compilation.
- Precedence resolution.
- Product and collection webhook handling.
- Idempotent synchronization.
- Retry behavior.
- Uninstall cleanup.

### Theme tests

- Dawn product page.
- Variant switching.
- Product quick add.
- Cart page.
- Cart drawer.
- AJAX section replacement.
- Multiple identical products/variants.
- Buy Now.
- Invalid keyboard-entered quantity.
- No MutationObserver loops.
- Sale products and discounted cart lines.

### End-to-end acceptance case

For a product configured with minimum 6 and multiple 6:

- Initial product quantity is 6.
- Plus produces 12; minus from 12 produces 6.
- Buyer cannot reduce below 6 through normal controls.
- Cart accepts 6, 12, 18, and so on.
- Cart clearly explains invalid manually entered values.
- Direct cart/API insertion of quantity 7 is rejected before checkout completion.
- Buy Now with an invalid quantity cannot complete checkout.
- Disabling the rule removes the restriction after synchronization.

## 16. Delivery phases

### Phase 0 — Scaffold and infrastructure

- Scaffold Shopify app.
- Configure local app and dev store.
- Add Prisma and PostgreSQL.
- Add session storage.
- Add health endpoint and deployment configuration.
- Configure CI for typecheck, lint, tests, and build.

Exit condition: embedded app installs, authenticates, persists a shop, and deploys.

### Phase 1 — Native validation proof of concept

- Generate Cart and Checkout Validation Function.
- Create/activate the Shopify validation.
- Store one test rule in an app-owned metafield.
- Enforce min/max/multiple for one variant.
- Add Function unit tests.

Exit condition: quantity 7 is blocked for a variant configured as packs of 6, including accelerated checkout.

### Phase 2 — Rule CRUD and compiler

- Build database schema.
- Build rules index and editor.
- Add resource picker.
- Implement product, variant, collection, tag, and global scopes.
- Implement precedence resolver.
- Compile effective metafields.
- Add sync jobs and diagnostics.

Exit condition: merchants can manage rules and Shopify enforcement updates reliably.

### Phase 3 — Storefront guidance

- Generate Theme App Extension.
- Implement Dawn product quantity behavior.
- Implement cart page and cart drawer behavior.
- Add inline messages and checkout-button state.
- Add section/AJAX handling without mutation loops.
- Add selector overrides and diagnostics.

Exit condition: normal buyer flows only offer valid quantities, while the Function remains the final authority.

### Phase 4 — Groups, cart limits, and localization

- Add grouped quantity rules.
- Add cart quantity and subtotal limits.
- Add English, Latvian, and Russian message configuration.
- Add message previews and placeholders.
- Add amount and weight test coverage.

Exit condition: core MinMaxify-style product, group, and cart limits are supported.

### Phase 5 — Production hardening

- Full webhook coverage.
- Bulk synchronization and retry tuning.
- Billing plans if the app is commercial.
- Privacy, support, and app listing requirements.
- Performance testing against large catalogs and carts.
- Theme compatibility matrix.
- Monitoring and operational runbook.

Exit condition: app is ready for production installation and Shopify App Store review if required.

## 17. MVP exclusions

Do not include these in the first release unless explicitly required:

- Historical per-customer lifetime purchase limits.
- Order lookup and customer purchase aggregation.
- Complex nested condition builder.
- Arbitrary JavaScript conditions.
- Automatic inventory replenishment logic.
- POS enforcement.
- Headless-storefront UI SDK.
- Advanced analytics.

The checkout Function should still enforce rules for headless carts when effective metafields are present; only the guided UI is excluded.

## 18. Key risks and mitigations

### Theme variability

Risk: quantity controls and cart markup differ across themes.

Mitigation: Function enforcement is theme-independent; provide Dawn adapter, generic selectors, diagnostics, and merchant overrides.

### Metafield/runtime limits

Risk: large rule JSON exceeds metafield or Function input/instruction limits.

Mitigation: materialize one compact effective rule per variant, use short group IDs, version schemas, and benchmark large carts early.

### Collection membership drift

Risk: automated collection membership changes without a rule edit.

Mitigation: collection/product webhooks and scheduled reconciliation enqueue recompilation.

### Conflicting rules

Risk: buyer sees inconsistent min, max, and step behavior.

Mitigation: deterministic precedence, save-time conflict detection, compiled effective rules, and an Admin UI explanation of which rule wins.

### Storefront-only bypass

Risk: scripts can be bypassed.

Mitigation: never treat theme JavaScript as enforcement; always validate with Shopify Functions.

### Function outage or malformed configuration

Risk: checkout is unintentionally blocked.

Mitigation: defensive parsing, schema versions, staged synchronization, last-known-good config, diagnostics, and Shopify’s explicit `Validation.blockOnFailure` setting for runtime failures.

## 19. First implementation milestone

The first implementation task after approval should be a narrow vertical slice:

1. Scaffold the embedded app.
2. Create the validation Function.
3. Create one Admin rule form for a specific product/variant.
4. Save min, max, and multiple.
5. Synchronize an effective metafield.
6. Enforce the rule in cart and checkout.
7. Add a Dawn product-page block showing minimum and pack size.
8. Verify the example minimum 6 / step 6 end to end.

Only after this vertical slice is stable should collection, tag, grouped, cart-value, weight, customer, and scheduling rules be added.

## 20. Acceptance definition for the requested case

A merchant selects a product and enters:

- Minimum: 6.
- Multiple: 6.
- Maximum: optional.

After save and synchronization:

- Product page starts at 6.
- Quantity buttons move 6 → 12 → 18.
- Cart page and drawer preserve the same step.
- The buyer sees a clear “Sold in packs of 6” message.
- Checkout accepts only 6, 12, 18, and so on.
- Invalid quantities inserted through URLs, AJAX, Buy Now, or custom storefront calls cannot complete checkout.
- Turning the rule off restores normal quantity behavior after synchronization.

## 21. Reference documentation

- Shopify cart and checkout validation overview: https://shopify.dev/docs/apps/build/checkout/cart-checkout-validation
- Shopify validation Function + Admin UI tutorial: https://shopify.dev/docs/apps/build/checkout/cart-checkout-validation/create-admin-ui-validation
- Shopify Cart and Checkout Validation Function API: https://shopify.dev/docs/api/functions/latest/cart-and-checkout-validation
- Shopify `validationCreate`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/validationCreate
- Shopify metafield definitions and access: https://shopify.dev/docs/apps/build/metafields/definitions
- Shopify mandatory privacy webhooks: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
- MinMaxify feature overview: https://docs.minmaxify.com/article/311-about-order-limits-minmaxify
- MinMaxify group limits overview: https://docs.minmaxify.com/article/393-introduction-to-group-limit
