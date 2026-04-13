/** TypeScript-style shape documentation for prompts (matches ComponentTree / ComponentNode in src/types/component-tree.ts). */
const COMPONENT_TREE_SHAPE = `{
  "pageTitle": string,
  "pageDescription": string,
  "techStack": {
    "framework": string,
    "cssFramework": string,
    "typescript": boolean
  },
  "rootComponents": ComponentNode[]
}

// ComponentNode (recursive; optional fields marked):
type ComponentNode = {
  "id": string,
  "name": string,
  "type": "layout" | "section" | "ui" | "form" | "data",
  "description": string,
  "props": Array<{
    "name": string,
    "type": string,
    "required": boolean,
    "defaultValue"?: string
  }>,
  "tailwindClasses": string[],
  "children"?: ComponentNode[],
  "code"?: string
}`;

export function getSystemPrompt(): string {
  return [
    "You are a senior frontend architect and React expert who specializes in converting product",
    "requirements into clean, accessible React component trees and production-quality TSX code using",
    "Tailwind CSS.",
  ].join(" ");
}

export function getPrdParsePrompt(prdText: string): string {
  return `Analyze the following product requirements document (PRD) and extract structured metadata.

Return ONLY a single JSON object. Do not wrap it in markdown. Do not add explanations, comments, or text before or after the JSON.

The JSON must match this exact shape (types described in TypeScript-style notation):

{
  "pages": string[],
  "features": string[],
  "userRoles": string[],
  "dataEntities": string[],
  "primaryGoal": string,
  "suggestedAppType": "dashboard" | "landing" | "ecommerce" | "saas" | "onboarding" | "other"
}

PRD:
---
${prdText}
---`;
}

export function getComponentPlanPrompt(parsedPrdJson: string): string {
  return `You are planning the UI for a web application. Below is JSON that summarizes a parsed PRD (pages, features, roles, entities, goal, and suggested app type).

Using that context, produce a full component tree for ONE primary page or view that best represents the product. The output must describe layout, sections, UI pieces, forms, and data-oriented regions as appropriate.

Parsed PRD (JSON):
${parsedPrdJson}

Your response must be ONLY valid JSON matching this exact ComponentTree shape (no markdown, no code fences, no commentary):

${COMPONENT_TREE_SHAPE}

Rules you must follow:
- Use semantic HTML-oriented thinking in names and descriptions (header, main, nav, section, article, form, etc.).
- Keep each component single-responsibility: one clear purpose per node.
- Limit nesting to at most 3 levels from each root in rootComponents (root = level 1; children = level 2; grandchildren = level 3; do not add deeper children).
- Every component must include realistic props (name, type, required, optional defaultValue when helpful).
- Suggest appropriate Tailwind utility classes in tailwindClasses for layout, spacing, typography, color, and responsive behavior.
- Omit the optional "code" field on nodes (it will be filled later) or set it to null/omit entirely.
- Use stable unique string ids for every node (e.g. kebab-case or prefixed slugs).

Return ONLY the JSON object.`;
}

export function getComponentCodePrompt(componentJson: string, siblingContext: string): string {
  return `Generate TypeScript React (TSX) source code for a single component.

Component definition (JSON — this node may include children for context; implement THIS component only):
${componentJson}

Sibling / surrounding layout context (for naming, spacing, and consistency only — do not re-implement siblings unless needed):
${siblingContext}

Requirements:
- Define a TypeScript interface for the component props at the top of the file.
- Use Tailwind CSS classes only; do not use inline styles.
- Use accessible HTML: semantic elements where appropriate, aria-label (and other ARIA) when needed, and valid roles where appropriate.
- Export the component as a named export (not default).
- Use realistic placeholder content (copy, labels, sample list items) so the UI is reviewable.
- Use mobile-first responsive Tailwind classes, including sm:, md:, and lg: breakpoints where layout benefits from it.
- Import React explicitly if the file uses JSX that requires it in the target environment (e.g. import React from "react" or the minimal hooks/types you need).

Return ONLY the raw TSX source code. Do not wrap the output in markdown fences. Do not add explanations before or after the code.`;
}

export const SAMPLE_PRDS: Record<string, string> = {
  ecommerce: `Product: Checkout Experience — Scope: end-to-end purchase completion for logged-in and guest shoppers.

We need a multi-step checkout covering cart review, shipping details, payment, and order confirmation. Cart review must show line items with thumbnails, quantities, editable counts, promo code entry, subtotal/tax/shipping estimates, and a clear primary action to continue. Shipping collects full address, delivery method, and optional saved addresses for signed-in users with validation and inline errors.

Payment supports card (PCI-aware fields UI only), billing address same-as-shipping toggle, and order summary sidebar sticky on large screens. Confirmation displays order number, estimated delivery, email receipt notice, and links to account orders or continue shopping.

Success metrics: lower checkout abandonment, fewer support tickets on address/payment errors, and mobile completion rate parity with desktop. Non-goals: full inventory management or admin tooling. Constraints: WCAG 2.1 AA, performance budget on mobile, and Tailwind-based implementation for rapid theming. Telemetry should capture step-level drop-off without storing full PAN data.`,

  dashboard: `Product: SaaS Analytics Dashboard — Audience: account admins and operators monitoring product usage and revenue.

The dashboard opens to an overview with KPI cards (MAU, MRR, churn, active trials), trend sparklines, and a date-range control with comparison to previous period. A secondary row hosts a primary time-series chart (events or revenue) with legend, granularity toggle (day/week/month), and export CSV.

Below, a sortable, filterable user table shows name, role, last active, plan, and health score with pagination and empty states. A settings entry leads to workspace name, billing summary, API keys placeholder, and notification preferences.

Goals: faster insight-to-action, fewer clicks to diagnose drops, and trustworthy data freshness labels. Out of scope: embedded SQL or custom report builder v1. Requirements: responsive layout, keyboard-accessible tables and charts controls, and skeleton loading for slow queries. Engineering should favor composable widgets and shared metric definitions. Admins need a visible “last updated” timestamp and a manual refresh action when cached data is stale.`,

  onboarding: `Product: SaaS Team Onboarding — Goal: activate new workspaces quickly with minimal drop-off.

Flow: (1) Welcome screen with value prop, progress indicator, and skip-for-now only where legally allowed. (2) Profile setup: display name, role, avatar optional, company size with validation. (3) Invite team: email chips, role picker, optional personal message, resend limits noted. (4) Plan selection: compare table for Free/Pro/Enterprise with feature bullets, annual toggle, and clear CTA with trial terms. (5) Done state with checklist (verify email, connect integration, invite more) and link to dashboard.

Personas: org owner and first member; must support single-user completion path. Analytics: step completion, time on step, invite send count. Non-goals: in-app payments deep integration in v1 beyond plan selection UI. Accessibility and mobile-first layouts are required; copy should be concise and actionable with error recovery on failed invites or validation. Progress must persist across refresh within the same browser session until completion or explicit exit.`,
};
