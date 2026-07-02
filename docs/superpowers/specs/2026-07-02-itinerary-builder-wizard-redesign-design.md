# Itinerary Builder — Step-by-Step Wizard Redesign

## Context

`itinerary-builder/` is a Next.js 14 app (not yet committed to git) that lets JVTO staff generate a custom itinerary + price estimate from selected destinations. Today the entire input lives on one scrollable page (`ItineraryForm.tsx`: Trip Info section → Destinations section → Generate button → `ResultView.tsx` result). The visual style is a generic green/white admin-form look, unrelated to the JVTO marketing site.

The user wants the input flow turned into a **modern, full-screen, flat, step-by-step wizard** ending in the existing itinerary result, restyled to feel **senada** (matching) with the JVTO homepage: dark navy sections, bold headlines, orange accent for CTAs/highlights, lime-green accent for badges/checkmarks, rounded pill buttons, flat (no heavy shadows/gradients).

## Goals

- Replace the single-page form with a 3-step full-screen wizard: **Trip Basics → Destinations → Result**.
- Match the JVTO homepage's dark-navy-dominant flat aesthetic.
- Destination selection becomes photo cards (multi-select) instead of text pills.
- Replace all emoji icons with `lucide-react` icons.
- Restyle the result page (Step 3) to match, without changing its logic (PDF export, WhatsApp export, hotel-swap, expense report all behave identically).

## Non-goals

- No changes to calculation logic (`calculator.ts`), WhatsApp formatting (`whatsapp.ts`), data types, or brain data loading (`page.tsx`).
- No changes to `estimateDays`/`generateDays` routing logic in `ItineraryForm.tsx` — that logic moves as-is into the new orchestrator.
- Not adding destination photos for Malang City, Coffee & Cocoa Science Technopark, or Taman Safari Prigen — they're hidden from selection until photos exist.
- No backend/API changes.

## Architecture

Split the current 430-line `ItineraryForm.tsx` into focused pieces:

- **`ItineraryWizard.tsx`** (replaces `ItineraryForm.tsx`) — orchestrator. Owns all form state (name, pax, dates, pickup/dropoff, selected destinations, editableDays, result) and the existing `estimateDays`/`generateDays`/`handleGenerate`/`handleHotelChange` logic verbatim. Owns `currentStep: 1 | 2 | 3` state and renders the active step with a framer-motion transition.
- **`StepIndicator.tsx`** (new) — labeled progress bar (3 segments: "Trip Basics", "Destinations", "Result"), filled with `orange` up to the active step. Completed steps are clickable to jump back.
- **`Step1TripBasics.tsx`** (new) — full-screen navy step. Fields: name, pax, start date, pickup point/time, dropoff point/time. Same fields/behavior as today, restyled.
- **`Step2Destinations.tsx`** (new) — full-screen navy step. Grid of photo cards for the 5 destinations that have images (Bromo, Ijen, Madakaripura, Tumpak Sewu, Papuma); toggled multi-select with checkmark-overlay style. Below the grid: the existing estimate banner (day count, Bromo/Ijen prenight warnings, Bali ferry note).
- **`ResultView.tsx`** (existing file, restyled only) — same props/interface (`result`, `brain`, `editableDays`, `onHotelChange`). Layout becomes: sticky dark-navy hero (price + trip summary) at top, cream-colored body below containing the existing tabs (Itinerary / WhatsApp / Expense Report) and day-by-day cards. No logic changes — `downloadPDF`, `copyWa`, hotel `<select>` swapping, and the Expense Report table all stay as-is.

`calculator.ts`, `whatsapp.ts`, `types/index.ts`, and `page.tsx` (data loading) are untouched.

## Design tokens

Approximated from the homepage screenshot (not official brand hex — swap later if exact values are provided):

| Token | Hex | Usage |
|---|---|---|
| `navy` | `#0E1B2E` | Background of Step 1/2 and Step 3 hero |
| `navy-light` | `#16233D` | Card/surface on navy |
| `navy-border` | `#26344C` | Thin borders on navy |
| `cream` | `#F7F4EC` | Step 3 body background |
| `ink` | `#14181F` | Text on cream |
| `orange` | `#FF6A39` | Primary accent — CTAs, highlighted words, active progress segment |
| `lime` | `#CFFF3D` | Secondary accent — selected-state checkmark/badge |

Defined once in `tailwind.config.ts` `theme.extend.colors`, referenced by name everywhere (no hardcoded hex in components).

Font: `Inter` via `next/font/google`, weights 400/600/800.

Style: flat, rounded-pill buttons/badges, rounded-2xl cards, minimal shadow (a soft glow only on the primary CTA).

## Icon mapping (emoji → lucide-react)

| Emoji | Lucide icon | Context |
|---|---|---|
| 🚐 | `Bus` | Pickup/dropoff |
| 🏔️ | `Mountain` | Destination |
| 🏨 | `Hotel` | Accommodation |
| 🍽️ | `UtensilsCrossed` | Meals |
| 📝 | `StickyNote` | Notes |
| 📅 | `CalendarDays` | Itinerary tab |
| 📲 | `MessageCircle` | WhatsApp tab |
| 🧮 | `Calculator` | Expense Report tab |
| ⬇️ | `Download` | Download PDF |
| 📋 | `Copy` | Copy WhatsApp message |
| ✓ | `Check` | Copied confirmation |
| ⚠️ | `AlertTriangle` | Bromo/Ijen prenight warning |
| 🚢 | `Ship` | Bali ferry note |
| ✅ | `CheckCircle2` | Included items |
| ❌ | `XCircle` | Excluded items |
| ✨ | `Sparkles` | Generate CTA |
| — | `ArrowLeft` / `ArrowRight` | Back / Continue navigation |

## Step-by-step behavior

- **Navigation**: "Continue" at the bottom of each step advances `currentStep`. "Back" (`ArrowLeft`, top-left) returns to the previous step without losing state (state lives in `ItineraryWizard`, not remounted per step).
- **Step 1 → 2**: Continue always enabled (all Step 1 fields already optional/defaulted today — unchanged).
- **Step 2 → 3**: "Continue & Generate" disabled until ≥1 destination selected (existing `canGenerate` check), and on click runs the existing `handleGenerate()` unchanged.
- **Progress bar**: completed steps are clickable to jump back directly (not just sequential Back).
- **Transitions**: `framer-motion` slide+fade between steps (new dependency added to `itinerary-builder/package.json`).
- **Step 2 destination grid**: only the 5 destinations with photos are shown (Bromo, Ijen, Madakaripura, Tumpak Sewu, Papuma); the other 3 (no photos yet) are excluded from the grid, same as `displayDests` filtering today plus the additional 3 exclusions.
- **Step 3**: hero stays visible (sticky) while the cream body scrolls; tabs and Expense Report's "internal only" banner behave exactly as today.

## Responsive behavior

- Mobile: full-bleed single column, standard padding.
- Desktop: navy/cream backgrounds remain full-screen, but content is centered with a `max-w-2xl`–`max-w-3xl` container; the Step 2 destination grid becomes 2–3 columns on wider screens instead of 2.

## Testing / verification

No new business logic is introduced (pure UI restructuring), so no new unit tests are needed. Verification is manual, via `/run` or `npm run dev`:

- Walk through Step 1 → 2 → 3 with a sample selection (e.g., Bromo + Ijen), confirm the generated itinerary/price match what today's single-page form produces for the same inputs.
- Confirm Back navigation and progress-bar jump-back preserve entered data.
- Confirm PDF download and WhatsApp copy still work unchanged from Step 3.
- Confirm mobile (narrow viewport) and desktop layouts both look correct.
