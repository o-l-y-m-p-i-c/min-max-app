# Min Max Order Limits

Embedded Shopify app for minimum, maximum, and pack-size quantity rules.

## Features

- Rules for products, variants, collections, product tags, or the whole catalog.
- Minimum quantity, optional maximum, and quantity increment.
- Native Cart and Checkout Validation Function.
- Theme App Extension for product forms, quick add, cart page, and cart drawer.
- English, Latvian, and Russian validation messages.
- PostgreSQL persistence through Prisma.
- Docker and Render deployment configuration.

## Local setup

1. Copy `.env.example` to `.env` and set the Shopify credentials and PostgreSQL URL.
2. Link the project to the existing Shopify app with `npm run config:link`.
3. Run `npm install`.
4. Run `npm run setup`.
5. Run `npm run dev`.

The project expects these variables:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SCOPES`
- `DATABASE_URL`

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm test -w extensions/min-max-validation-js`
- `shopify app function build --path extensions/min-max-validation-js`
- `shopify theme check --path extensions/min-max-theme`
- `shopify app config validate --json`

## Render

`render.yaml` provisions a web service and PostgreSQL database. After creating the Render Blueprint, set `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` in Render. If Render assigns a URL different from `https://min-max-app.onrender.com`, update `SHOPIFY_APP_URL`, `application_url`, and the OAuth redirect URL before deploying the Shopify app configuration.

## First synchronization

Deploy both extensions, install the app, create a rule, and click **Sync now**. Synchronization creates the Shopify Validation, compiles effective variant metafields, and publishes storefront configuration.

See `PLAN.md` for the complete staged roadmap.
