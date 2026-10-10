# FreshBasket AI — Login design notes

The sign-in screen has been refined for a clearer first impression and easier use during a live demo.

## Design choices
- Split layout on desktop; stacked layout on tablets and phones.
- Navy/cobalt/cyan identity with a small orange highlight. No green is used as the primary brand colour.
- A distinct manager-workspace header makes the purpose of the form clear before the fields begin.
- Readable 12–14px labels and input text, generous touch targets, visible keyboard-focus outlines, and clear validation errors.
- A compact demo-credentials panel keeps the evaluation account discoverable without requiring a tooltip.
- Light and dark modes use different background, border, field, button, and text colours instead of merely inverting the same palette.
- The screen is built with CSS and existing SVG icons; no external image or animation dependency was added, to keep it lightweight.

## Demo account
- Email: `ops@freshbasket.demo`
- Password: `freshbasket123`

The login remains a presentation-only demo gate, not production authentication.
