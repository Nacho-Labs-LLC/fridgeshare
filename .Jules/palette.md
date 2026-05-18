## 2024-05-16 - Add Focus Visible Styles
**Learning:** This app is missing focus-visible styles on buttons and inputs, which makes keyboard navigation inaccessible.
**Action:** Adding global focus-visible styles in styles.css to ensure keyboard navigability.

## 2026-05-18 - Pair title with aria-label on icon-only buttons
**Learning:** Screen readers might not correctly announce the intent of icon-only or symbol buttons (such as emojis or purely visual indicators like `^`) if only a `title` is provided. `title` provides a visual tooltip for sighted users, but `aria-label` is needed for robust screen reader support.
**Action:** Always ensure that icon-only/symbol buttons pair their `title` attribute with an equivalent `aria-label` attribute so the button's intent is properly announced to assistive technologies.
