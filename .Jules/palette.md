## 2024-05-16 - Add Focus Visible Styles
**Learning:** This app is missing focus-visible styles on buttons and inputs, which makes keyboard navigation inaccessible.
**Action:** Adding global focus-visible styles in styles.css to ensure keyboard navigability.

## 2024-05-17 - Icon-Only Button ARIA Labels
**Learning:** Found multiple instances where buttons containing only symbols (`^`/`v` carets) or emojis (emoji category bar) were missing `aria-label`s. Screen readers announce symbols poorly (e.g., "caret" or just the raw emoji unicode name), confusing users about the button's action.
**Action:** Always pair `aria-label` with `title` on icon-only buttons so screen readers read the intent (e.g., "Collapse tray", "Smileys & People category") instead of the symbol.
