# Itinerary Builder Wizard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page itinerary input form with a 3-step full-screen wizard (Trip Basics → Destinations → Result), restyled to match the JVTO homepage's dark-navy flat aesthetic, per `docs/superpowers/specs/2026-07-02-itinerary-builder-wizard-redesign-design.md`.

**Architecture:** Split `ItineraryForm.tsx` into `ItineraryWizard.tsx` (state + step orchestration, using the exact same `estimateDays`/`generateDays` logic verbatim) plus two new full-screen step components (`Step1TripBasics.tsx`, `Step2Destinations.tsx`) and a `StepIndicator.tsx` progress bar. `ResultView.tsx` is restyled in place (same props/logic, new hero+body layout) and becomes Step 3. A new `src/lib/images.ts` centralizes the destination/vehicle image maps that were previously duplicated twice inside `ResultView.tsx`.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript (strict), Tailwind CSS 3, `lucide-react` (new), `framer-motion` (new).

## Global Constraints

- No changes to `calculator.ts`, `whatsapp.ts`, `types/index.ts`, or brain-data loading in `page.tsx` beyond swapping which component it renders — pure UI restructuring only (per spec Non-goals).
- `estimateDays`/`generateDays`/`handleGenerate`/`handleHotelChange` logic moves verbatim into `ItineraryWizard.tsx` — no behavior changes.
- Design tokens (`navy`, `navy-light`, `navy-border`, `cream`, `ink`, `orange`, `lime`) are defined once in `tailwind.config.ts` and referenced by Tailwind class name everywhere — no hardcoded hex in component files (except the existing jsPDF drawing code in `ResultView.tsx`, which uses its own RGB tuples and is out of scope).
- All emoji icons are replaced with `lucide-react` icons per the mapping table in the spec.
- Step 2's destination grid only shows the 5 destinations that have photos (Bromo, Ijen, Madakaripura, Tumpak Sewu, Papuma) — the other 3 destinations stay hidden until photos exist.
- No test framework exists in `itinerary-builder/` and this feature adds no new business logic, so verification is `npx tsc --noEmit` (type-check) after every task plus a final manual walkthrough — no unit tests are added, per the spec's Testing section.
- Every new/modified component file starts with `'use client'` where it uses hooks or event handlers, consistent with the existing codebase.

---

### Task 1: Dependencies, design tokens, and font

**Files:**
- Modify: `itinerary-builder/package.json`
- Modify: `itinerary-builder/tailwind.config.ts`
- Modify: `itinerary-builder/src/app/layout.tsx`

**Interfaces:**
- Produces: Tailwind color classes `bg-navy`, `bg-navy-light`, `border-navy-border`, `bg-cream`, `text-ink`, `bg-orange`/`text-orange`, `bg-lime`/`text-lime` (and their `/opacity` variants, e.g. `bg-orange/10`) — used by every later task.
- Produces: `lucide-react` and `framer-motion` as installed npm packages — used by every later task.

- [ ] **Step 1: Install the new dependencies**

```bash
cd itinerary-builder && npm install lucide-react framer-motion
```

Expected: `package.json` `dependencies` gains `lucide-react` and `framer-motion` entries; command exits 0.

- [ ] **Step 2: Add design tokens to `tailwind.config.ts`**

Replace the full contents of `itinerary-builder/tailwind.config.ts` with:

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0E1B2E',
        'navy-light': '#16233D',
        'navy-border': '#26344C',
        cream: '#F7F4EC',
        ink: '#14181F',
        orange: '#FF6A39',
        lime: '#CFFF3D',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 3: Load the Inter font in the root layout**

Replace the full contents of `itinerary-builder/src/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], weight: ['400', '600', '800'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'JVTO Itinerary Builder',
  description: 'Custom itinerary builder for Java Volcano Tour Operator',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: Verify with the TypeScript compiler**

```bash
cd itinerary-builder && npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
cd itinerary-builder && git add package.json package-lock.json tailwind.config.ts src/app/layout.tsx
git commit -m "feat(itinerary-builder): add lucide-react/framer-motion and JVTO design tokens"
```

---

### Task 2: Shared image lookup + dedupe in ResultView

**Files:**
- Create: `itinerary-builder/src/lib/images.ts`
- Modify: `itinerary-builder/src/components/ResultView.tsx`

**Interfaces:**
- Produces: `DEST_IMAGE: Record<string, string>` and `VEH_IMAGE: Record<string, string>` exported from `@/lib/images` — consumed by Task 5 (`Step2Destinations.tsx`) and Task 6 (`ResultView.tsx`).

- [ ] **Step 1: Create `src/lib/images.ts`**

```ts
export const DEST_IMAGE: Record<string, string> = {
  'Mount Bromo':            '/images/destinations/bromo.jpg',
  'Mount Ijen':             '/images/destinations/ijen.webp',
  'Madakaripura Waterfall': '/images/destinations/madakaripura.jpg',
  'Tumpak Sewu Waterfall':  '/images/destinations/tumpak-sewu.webp',
  'Papuma Beach':           '/images/destinations/papuma.jpg',
}

export const VEH_IMAGE: Record<string, string> = {
  'MPV':     '/images/vehicles/mpv.png',
  'Minibus': '/images/vehicles/hiace.png',
  'ELF':     '/images/vehicles/hiace.png',
  'Hiace':   '/images/vehicles/hiace.png',
}
```

- [ ] **Step 2: Import the shared maps in `ResultView.tsx`**

In `itinerary-builder/src/components/ResultView.tsx`, replace:

```tsx
import { useState, useRef, useEffect } from 'react'
import type { ItineraryResult, BrainData, DayInput } from '@/types'
import { formatWhatsApp, rp } from '@/lib/whatsapp'
```

with:

```tsx
import { useState, useRef, useEffect } from 'react'
import type { ItineraryResult, BrainData, DayInput } from '@/types'
import { formatWhatsApp, rp } from '@/lib/whatsapp'
import { DEST_IMAGE, VEH_IMAGE } from '@/lib/images'
```

- [ ] **Step 3: Remove the duplicated map inside the image-preload `useEffect`**

Replace:

```tsx
  // Preload images as JPEG data URLs (canvas conversion handles WEBP/PNG)
  useEffect(() => {
    const DEST_IMG: Record<string, string> = {
      'Mount Bromo':             '/images/destinations/bromo.jpg',
      'Mount Ijen':              '/images/destinations/ijen.webp',
      'Madakaripura Waterfall':  '/images/destinations/madakaripura.jpg',
      'Tumpak Sewu Waterfall':   '/images/destinations/tumpak-sewu.webp',
      'Papuma Beach':            '/images/destinations/papuma.jpg',
    }
    const VEH_IMG: Record<string, string> = {
      'MPV':     '/images/vehicles/mpv.png',
      'Minibus': '/images/vehicles/hiace.png',
      'ELF':     '/images/vehicles/hiace.png',
      'Hiace':   '/images/vehicles/hiace.png',
    }
    const toLoad = new Set<string>()
    days.forEach(d => d.destinationNames.forEach(n => { if (DEST_IMG[n]) toLoad.add(DEST_IMG[n]) }))
    const vImg = VEH_IMG[vehicleType.name]
    if (vImg) toLoad.add(vImg)
```

with:

```tsx
  // Preload images as JPEG data URLs (canvas conversion handles WEBP/PNG)
  useEffect(() => {
    const toLoad = new Set<string>()
    days.forEach(d => d.destinationNames.forEach(n => { if (DEST_IMAGE[n]) toLoad.add(DEST_IMAGE[n]) }))
    const vImg = VEH_IMAGE[vehicleType.name]
    if (vImg) toLoad.add(vImg)
```

- [ ] **Step 4: Remove the duplicated map inside `downloadPDF`**

Replace:

```tsx
    const DEST_IMG: Record<string, string> = {
      'Mount Bromo':            '/images/destinations/bromo.jpg',
      'Mount Ijen':             '/images/destinations/ijen.webp',
      'Madakaripura Waterfall': '/images/destinations/madakaripura.jpg',
      'Tumpak Sewu Waterfall':  '/images/destinations/tumpak-sewu.webp',
      'Papuma Beach':           '/images/destinations/papuma.jpg',
    }
    const VEH_IMG: Record<string, string> = {
      'MPV': '/images/vehicles/mpv.png', 'Minibus': '/images/vehicles/hiace.png',
      'ELF': '/images/vehicles/hiace.png', 'Hiace': '/images/vehicles/hiace.png',
    }

    // Build destination lookup for pro tips
```

with:

```tsx
    // Build destination lookup for pro tips
```

- [ ] **Step 5: Rename the two remaining usages inside `downloadPDF`**

Replace:

```tsx
      const imgSrc = DEST_IMG[day.destinationNames[0] ?? '']
```

with:

```tsx
      const imgSrc = DEST_IMAGE[day.destinationNames[0] ?? '']
```

Replace:

```tsx
    const vImgSrc = VEH_IMG[vehicleType.name]
```

with:

```tsx
    const vImgSrc = VEH_IMAGE[vehicleType.name]
```

- [ ] **Step 6: Verify**

```bash
cd itinerary-builder && npx tsc --noEmit && grep -n "DEST_IMG\|VEH_IMG" src/components/ResultView.tsx
```

Expected: `tsc` prints nothing (exit 0); the `grep` finds no matches (exit 1, meaning fully renamed) — if `grep` prints any line, a rename was missed and must be fixed before continuing.

- [ ] **Step 7: Commit**

```bash
git add itinerary-builder/src/lib/images.ts itinerary-builder/src/components/ResultView.tsx
git commit -m "refactor(itinerary-builder): dedupe destination/vehicle image maps into src/lib/images.ts"
```

---

### Task 3: `StepIndicator` component

**Files:**
- Create: `itinerary-builder/src/components/StepIndicator.tsx`

**Interfaces:**
- Produces: `StepIndicator({ currentStep, maxReachedStep, onStepClick }: { currentStep: 1|2|3; maxReachedStep: 1|2|3; onStepClick: (step: 1|2|3) => void })` — a fixed `h-16`-tall bar — consumed by Task 6 (`ItineraryWizard.tsx`).

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { Check } from 'lucide-react'

const STEPS: { id: 1 | 2 | 3; label: string }[] = [
  { id: 1, label: 'Trip Basics' },
  { id: 2, label: 'Destinations' },
  { id: 3, label: 'Result' },
]

interface Props {
  currentStep: 1 | 2 | 3
  maxReachedStep: 1 | 2 | 3
  onStepClick: (step: 1 | 2 | 3) => void
}

export default function StepIndicator({ currentStep, maxReachedStep, onStepClick }: Props) {
  return (
    <div className="w-full max-w-2xl mx-auto h-16 px-4 flex flex-col justify-center gap-1.5">
      <div className="flex items-center gap-2">
        {STEPS.map(step => {
          const isDone = step.id < currentStep
          const isActive = step.id === currentStep
          const isClickable = step.id <= maxReachedStep && step.id !== currentStep
          return (
            <button
              key={step.id}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(step.id)}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                isDone || isActive ? 'bg-orange' : 'bg-navy-border'
              } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
              aria-label={`Go to step ${step.id}: ${step.label}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between">
        {STEPS.map(step => (
          <span
            key={step.id}
            className={`text-[11px] font-semibold tracking-wide flex items-center gap-1 ${
              step.id === currentStep ? 'text-orange' : step.id < currentStep ? 'text-lime' : 'text-navy-border'
            }`}
          >
            {step.id < currentStep && <Check size={12} strokeWidth={3} />}
            {step.label}
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd itinerary-builder && npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add itinerary-builder/src/components/StepIndicator.tsx
git commit -m "feat(itinerary-builder): add StepIndicator progress bar component"
```

---

### Task 4: `Step1TripBasics` component

**Files:**
- Create: `itinerary-builder/src/components/Step1TripBasics.tsx`

**Interfaces:**
- Consumes: `BrainData` from `@/types` (`brain.pickupContexts`, `brain.dropoffContexts`, each `{ id: string; label: string; ... }`).
- Produces: `Step1TripBasics(props)` with the prop shape below — consumed by Task 6 (`ItineraryWizard.tsx`).

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { ArrowRight } from 'lucide-react'
import type { BrainData } from '@/types'

interface Props {
  brain: BrainData
  name: string
  onNameChange: (v: string) => void
  pax: number
  onPaxChange: (v: number) => void
  startDate: string
  onStartDateChange: (v: string) => void
  pickupTime: string
  onPickupTimeChange: (v: string) => void
  dropoffTime: string
  onDropoffTimeChange: (v: string) => void
  originId: string
  onOriginIdChange: (v: string) => void
  endCityId: string
  onEndCityIdChange: (v: string) => void
  locationLabel: Record<string, string>
  onContinue: () => void
}

export default function Step1TripBasics({
  brain, name, onNameChange, pax, onPaxChange, startDate, onStartDateChange,
  pickupTime, onPickupTimeChange, dropoffTime, onDropoffTimeChange,
  originId, onOriginIdChange, endCityId, onEndCityIdChange, locationLabel, onContinue,
}: Props) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-navy flex flex-col justify-center px-4 py-8">
      <div className="max-w-2xl mx-auto w-full">
        <p className="text-orange text-xs font-bold tracking-widest uppercase mb-2">Step 1 / 3</p>
        <h1 className="text-white text-3xl sm:text-4xl font-extrabold leading-tight mb-8">
          Tell us about<br />your <span className="text-orange">trip</span>
        </h1>

        <div className="bg-navy-light border border-navy-border rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="wizard-label">Name (optional)</label>
              <input className="wizard-input" placeholder="Guest / group name"
                value={name} onChange={e => onNameChange(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label">No. of Guests</label>
              <input className="wizard-input" type="number" min={1} max={30} value={pax}
                onChange={e => onPaxChange(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div>
              <label className="wizard-label">Start Date</label>
              <input className="wizard-input" type="date" value={startDate}
                onChange={e => onStartDateChange(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label">Pickup Point</label>
              <select className="wizard-input" value={originId} onChange={e => onOriginIdChange(e.target.value)}>
                {brain.pickupContexts.map(c => (
                  <option key={c.id} value={c.id}>{locationLabel[c.id] ?? c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="wizard-label">Pickup Time</label>
              <input className="wizard-input" type="time" value={pickupTime}
                onChange={e => onPickupTimeChange(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label">Drop-off Point</label>
              <select className="wizard-input" value={endCityId} onChange={e => onEndCityIdChange(e.target.value)}>
                {brain.dropoffContexts.map(c => (
                  <option key={c.id} value={c.id}>{locationLabel[c.id] ?? c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="wizard-label">Est. Drop-off Time</label>
              <input className="wizard-input" type="time" value={dropoffTime}
                onChange={e => onDropoffTimeChange(e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>

        <button onClick={onContinue}
          className="mt-6 w-full sm:w-auto sm:ml-auto sm:flex bg-orange text-white font-bold px-8 py-4 rounded-full hover:brightness-110 transition-all items-center justify-center gap-2">
          Continue <ArrowRight size={18} />
        </button>

        <style jsx global>{`
          .wizard-label { display:block; font-size:0.75rem; font-weight:600; color:#9fb0c8; margin-bottom:4px; }
          .wizard-input { width:100%; border:1px solid #26344C; border-radius:10px; padding:9px 12px; font-size:0.875rem; outline:none; background:#0E1B2E; color:white; }
          .wizard-input:focus { border-color:#FF6A39; box-shadow:0 0 0 3px rgba(255,106,57,0.15); }
        `}</style>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd itinerary-builder && npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add itinerary-builder/src/components/Step1TripBasics.tsx
git commit -m "feat(itinerary-builder): add Step1TripBasics wizard step"
```

---

### Task 5: `Step2Destinations` component

**Files:**
- Create: `itinerary-builder/src/components/Step2Destinations.tsx`

**Interfaces:**
- Consumes: `DEST_IMAGE` from `@/lib/images` (Task 2); `BrainData['destinations']` items shaped `{ id: number; name: string }`.
- Produces: `Step2Destinations(props)` with the prop shape below — consumed by Task 6 (`ItineraryWizard.tsx`).

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { ArrowLeft, Sparkles, AlertTriangle, Ship, Check } from 'lucide-react'
import type { BrainData } from '@/types'
import { DEST_IMAGE } from '@/lib/images'

interface Props {
  brain: BrainData
  selDests: number[]
  onToggleDest: (id: number) => void
  estimatedDays: number
  canGenerate: boolean
  onBack: () => void
  onContinue: () => void
}

export default function Step2Destinations({
  brain, selDests, onToggleDest, estimatedDays, canGenerate, onBack, onContinue,
}: Props) {
  const displayDests = brain.destinations.filter(d => d.name in DEST_IMAGE)

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-navy px-4 py-8">
      <div className="max-w-3xl mx-auto w-full">
        <button onClick={onBack} className="flex items-center gap-1.5 text-navy-border hover:text-white text-sm font-medium mb-4 transition-colors">
          <ArrowLeft size={16} /> Back
        </button>

        <p className="text-orange text-xs font-bold tracking-widest uppercase mb-2">Step 2 / 3</p>
        <h1 className="text-white text-3xl sm:text-4xl font-extrabold leading-tight mb-6">
          Pick your <span className="text-orange">destinations</span>
        </h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {displayDests.map(dest => {
            const sel = selDests.includes(dest.id)
            return (
              <button
                key={dest.id}
                onClick={() => onToggleDest(dest.id)}
                className={`relative rounded-xl overflow-hidden aspect-[4/5] text-left transition-all ${
                  sel ? 'ring-2 ring-lime' : 'ring-1 ring-navy-border'
                }`}
              >
                <img src={DEST_IMAGE[dest.name]} alt={dest.name}
                  className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                {sel && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-lime flex items-center justify-center">
                    <Check size={14} strokeWidth={3} className="text-navy" />
                  </div>
                )}
                <span className="absolute bottom-2 left-2 right-2 text-white text-sm font-bold leading-tight">
                  {dest.name}
                </span>
              </button>
            )
          })}
        </div>

        {selDests.length > 0 && (
          <div className="mt-5 bg-navy-light border border-navy-border rounded-xl px-4 py-3">
            <p className="text-sm text-white">
              <span className="font-semibold text-lime">{estimatedDays} Day{estimatedDays !== 1 ? 's' : ''} {Math.max(0, estimatedDays - 1)} Night{Math.max(0, estimatedDays - 1) !== 1 ? 's' : ''}</span>
              <span className="text-navy-border"> — route, hotels & schedule generated automatically</span>
            </p>
            {selDests.includes(1) && (
              <p className="flex items-center gap-1.5 text-xs text-orange mt-1.5"><AlertTriangle size={13} /> Bromo: must arrive the night before — sunrise at 03:00 AM</p>
            )}
            {selDests.includes(2) && (
              <p className="flex items-center gap-1.5 text-xs text-orange mt-1.5"><AlertTriangle size={13} /> Ijen: must arrive the night before — hike starts at 00:00</p>
            )}
            {selDests.includes(3) && (
              <p className="flex items-center gap-1.5 text-xs text-white/70 mt-1.5"><Ship size={13} /> Bali: includes Ketapang–Gilimanuk ferry crossing</p>
            )}
          </div>
        )}

        <button
          onClick={onContinue}
          disabled={!canGenerate}
          className={`mt-6 w-full flex items-center justify-center gap-2 font-bold py-4 rounded-full transition-all ${
            canGenerate ? 'bg-orange text-white hover:brightness-110' : 'bg-navy-light text-navy-border cursor-not-allowed'
          }`}
        >
          <Sparkles size={18} /> Continue &amp; Generate Itinerary
        </button>
        {!canGenerate && (
          <p className="text-center text-xs text-navy-border mt-2">Please select at least 1 destination</p>
        )}
      </div>
    </div>
  )
}
```

Note: `selDests.includes(3)` (Bali) can never be true today because Bali is never added to `displayDests` (it has no photo in `DEST_IMAGE`) — this mirrors the exact same dead branch that existed in the original `ItineraryForm.tsx`, kept verbatim per the "no logic changes" constraint.

- [ ] **Step 2: Verify**

```bash
cd itinerary-builder && npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add itinerary-builder/src/components/Step2Destinations.tsx
git commit -m "feat(itinerary-builder): add Step2Destinations photo-card grid"
```

---

### Task 6: Restyle ResultView, build ItineraryWizard, retire ItineraryForm

This task is intentionally not split further: `ResultView` gaining a required `onBack` prop and `ItineraryWizard` replacing `ItineraryForm` as the prop's only caller must land together, otherwise the tree fails to type-check in between.

**Files:**
- Modify: `itinerary-builder/src/components/ResultView.tsx`
- Create: `itinerary-builder/src/components/ItineraryWizard.tsx`
- Delete: `itinerary-builder/src/components/ItineraryForm.tsx`
- Modify: `itinerary-builder/src/app/page.tsx`

**Interfaces:**
- Consumes: `StepIndicator` (Task 3), `Step1TripBasics` (Task 4), `Step2Destinations` (Task 5), `DEST_IMAGE`/`VEH_IMAGE` (Task 2, already wired into `ResultView.tsx`).
- Produces: `ResultView` now requires `onBack: () => void` in its `Props`. `ItineraryWizard({ brain: BrainData })` is the new default export rendered by `page.tsx`.

- [ ] **Step 1: Add lucide-react icons to `ResultView.tsx` imports**

Replace:

```tsx
import { useState, useRef, useEffect } from 'react'
import type { ItineraryResult, BrainData, DayInput } from '@/types'
import { formatWhatsApp, rp } from '@/lib/whatsapp'
import { DEST_IMAGE, VEH_IMAGE } from '@/lib/images'
```

with:

```tsx
import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Bus, Mountain, Hotel, UtensilsCrossed, StickyNote, CalendarDays, MessageCircle, Calculator, Download, Copy, Check, CheckCircle2, XCircle } from 'lucide-react'
import type { ItineraryResult, BrainData, DayInput } from '@/types'
import { formatWhatsApp, rp } from '@/lib/whatsapp'
import { DEST_IMAGE, VEH_IMAGE } from '@/lib/images'
```

- [ ] **Step 2: Add the `onBack` prop**

Replace:

```tsx
interface Props {
  result: ItineraryResult
  brain: BrainData
  editableDays: DayInput[]
  onHotelChange: (dayIdx: number, hotelId: number | null) => void
}

export default function ResultView({ result, brain, editableDays, onHotelChange }: Props) {
```

with:

```tsx
interface Props {
  result: ItineraryResult
  brain: BrainData
  editableDays: DayInput[]
  onHotelChange: (dayIdx: number, hotelId: number | null) => void
  onBack: () => void
}

export default function ResultView({ result, brain, editableDays, onHotelChange, onBack }: Props) {
```

- [ ] **Step 3: Restyle the rekap table helpers**

Replace:

```tsx
  const NAVY_CSS = '#1e3a5f'
  const catHdr = (title: string) => (
    <tr>
      <td colSpan={6} style={{ backgroundColor: NAVY_CSS }} className="text-white font-semibold py-2 px-3 text-xs uppercase tracking-wide">
        {title}
      </td>
    </tr>
  )
  const rekapRow = (r: RekapLine) => (
    <tr key={r.no} className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-1.5 px-2 text-center text-gray-400 text-xs w-7">{r.no}</td>
      <td className="py-1.5 px-2 text-gray-500 text-xs">{r.subCat}</td>
      <td className="py-1.5 px-2 text-gray-800 text-xs">{r.item}</td>
      <td className="py-1.5 px-2 text-center text-gray-600 text-xs w-8">{r.qty}</td>
      <td className="py-1.5 px-2 text-right text-gray-500 text-xs whitespace-nowrap">{rp(r.unitCost)}</td>
      <td className="py-1.5 px-2 text-right font-medium text-gray-800 text-xs whitespace-nowrap">{rp(r.total)}</td>
    </tr>
  )
```

with:

```tsx
  const catHdr = (title: string) => (
    <tr>
      <td colSpan={6} className="bg-navy text-white font-semibold py-2 px-3 text-xs uppercase tracking-wide">
        {title}
      </td>
    </tr>
  )
  const rekapRow = (r: RekapLine) => (
    <tr key={r.no} className="border-b border-ink/5 hover:bg-cream/60">
      <td className="py-1.5 px-2 text-center text-ink/30 text-xs w-7">{r.no}</td>
      <td className="py-1.5 px-2 text-ink/50 text-xs">{r.subCat}</td>
      <td className="py-1.5 px-2 text-ink text-xs">{r.item}</td>
      <td className="py-1.5 px-2 text-center text-ink/60 text-xs w-8">{r.qty}</td>
      <td className="py-1.5 px-2 text-right text-ink/50 text-xs whitespace-nowrap">{rp(r.unitCost)}</td>
      <td className="py-1.5 px-2 text-right font-medium text-ink text-xs whitespace-nowrap">{rp(r.total)}</td>
    </tr>
  )
```

- [ ] **Step 4: Replace the entire render `return` statement**

Everything from the `return (` that starts the component's JSX (immediately after the `rekapRow` helper defined in Step 3) through the end of the file (the component's closing `}`) must be replaced with:

```tsx
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-cream">
      {/* Hero */}
      <div className="sticky top-16 z-10 bg-navy text-white px-4 sm:px-6 py-6">
        <div className="max-w-3xl mx-auto w-full">
          <button onClick={onBack} className="flex items-center gap-1.5 text-navy-border hover:text-white text-sm font-medium mb-3 transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
          <p className="text-orange text-xs font-bold tracking-widest uppercase mb-1">Step 3 / 3 — Your Itinerary</p>
          <p className="text-4xl font-extrabold tracking-tight">{rp(sellingPrice)}</p>
          {pax > 1 && <p className="text-white/70 text-sm mt-1">{rp(sellingPricePerPax)} / person &middot; {pax} guests</p>}
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-white/80">
            <span className="flex items-center gap-1.5"><CalendarDays size={14} /> {fmtDateShort(days[0]?.date)}{days.length > 1 ? ` – ${fmtDateShort(days[days.length - 1]?.date)}` : ''}</span>
            <span>{days.length} Day{days.length !== 1 ? 's' : ''} {days.length - 1} Night{days.length - 1 !== 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1.5"><Bus size={14} /> {vehicleType.name} &mdash; private transport</span>
          </div>
          <p className="mt-3 text-xs text-white/40">* Estimated price. Final confirmation after coordination with the JVTO team.</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6">

        {/* Included banner */}
        <div className="bg-white border border-lime/40 rounded-2xl px-5 py-4 mb-5">
          <p className="text-xs font-bold text-ink uppercase tracking-wide mb-2">What&apos;s included</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink/80">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-orange" /> Private AC Transport</span>
            {days.some(d => d.hotel) && <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-orange" /> Accommodation</span>}
            {days.some(d => d.activityNames.length > 0) && <>
              <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-orange" /> Destination entry tickets</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-orange" /> Local guide(s)</span>
            </>}
            {days.some(d => d.meals.length > 0) && <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-orange" /> Meals as per program</span>}
            <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-orange" /> Fuel &amp; driver allowance</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink/35 mt-2">
            <span className="flex items-center gap-1.5"><XCircle size={15} /> Flights / train tickets</span>
            <span className="flex items-center gap-1.5"><XCircle size={15} /> Personal expenses</span>
            <span className="flex items-center gap-1.5"><XCircle size={15} /> Guide &amp; driver tips (optional)</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-white rounded-full border border-ink/10 p-1 mb-5">
          {([
            { key: 'itinerary', label: 'Itinerary', icon: CalendarDays },
            { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
            { key: 'rekap', label: 'Expense Report', icon: Calculator },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-navy text-white' : 'text-ink/40 hover:text-ink/70'
              }`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {/* ── Itinerary ── */}
        {tab === 'itinerary' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-ink">
                {input.customer.name ? `${input.customer.name} · ` : ''}{pax} guest{pax !== 1 ? 's' : ''}
              </h3>
              <button onClick={downloadPDF}
                className="flex items-center gap-1.5 text-sm bg-ink/5 hover:bg-ink/10 px-4 py-1.5 rounded-full text-ink/70 font-medium">
                <Download size={14} /> Download PDF
              </button>
            </div>

            {days.map((day, dayIdx) => {
              const edDay = editableDays[dayIdx]
              const currentHotelDestId = edDay?.hotelId
                ? (brain.hotels.find(h => h.id === edDay.hotelId)?.destination_id ?? null)
                : null
              const hotelOptions = currentHotelDestId
                ? brain.hotels.filter(h => h.destination_id === currentHotelDestId)
                : []

              return (
                <div key={day.dayNumber} className="border border-ink/10 rounded-2xl overflow-hidden bg-white">
                  <div className="bg-navy px-4 py-2.5 flex items-center gap-3">
                    <span className="text-white font-bold text-sm">Day {day.dayNumber}</span>
                    <span className="text-white/50 text-sm">{fmtDate(day.date)}</span>
                  </div>
                  <div className="p-4 space-y-2.5 text-sm text-ink/80">
                    {day.pickup && (
                      <div className="flex gap-2.5 items-center">
                        <Bus size={15} className="text-orange shrink-0" />
                        <span><strong>Pickup</strong> at {day.pickup.location} &mdash; {day.pickup.time}</span>
                      </div>
                    )}
                    {day.destinationNames.map(dest => (
                      <div key={dest} className="flex gap-2.5 items-center">
                        <Mountain size={15} className="text-orange shrink-0" /><strong>{dest}</strong>
                      </div>
                    ))}
                    {day.hotel && (
                      <div className="flex gap-2.5 items-center">
                        <Hotel size={15} className="text-orange shrink-0" />
                        {hotelOptions.length > 1 ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <select
                              value={edDay?.hotelId ?? ''}
                              onChange={e => onHotelChange(dayIdx, parseInt(e.target.value))}
                              className="border border-ink/15 rounded-lg px-2 py-1 text-sm text-ink bg-white focus:outline-none focus:border-orange"
                            >
                              {hotelOptions.map(h => (
                                <option key={h.id} value={h.id}>{h.name}</option>
                              ))}
                            </select>
                            <span className="text-ink/40 text-xs">&middot; {day.hotel.roomTypeName} &times; {day.hotel.roomCount} room{day.hotel.roomCount !== 1 ? 's' : ''}</span>
                          </div>
                        ) : (
                          <span>{day.hotel.hotelName} &middot; {day.hotel.roomTypeName} &times; {day.hotel.roomCount} room{day.hotel.roomCount !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    )}
                    {day.meals.length > 0 && (
                      <div className="flex gap-2.5 items-center">
                        <UtensilsCrossed size={15} className="text-orange shrink-0" />
                        <span><strong>Meals:</strong> {day.meals.join(' + ')}</span>
                      </div>
                    )}
                    {day.dropoff && (
                      <div className="flex gap-2.5 items-center">
                        <Bus size={15} className="text-orange shrink-0" />
                        <span><strong>Drop-off</strong> at {day.dropoff.location}{day.dropoff.estimatedTime ? ` ~${day.dropoff.estimatedTime}` : ''}</span>
                      </div>
                    )}
                    {day.notes && <div className="flex gap-2.5 text-ink/40 italic text-xs"><StickyNote size={14} className="shrink-0" /><span>{day.notes}</span></div>}
                    {!day.pickup && !day.dropoff && day.destinationNames.length === 0 && !day.hotel && (
                      <p className="text-ink/40 text-xs italic">No program selected for this day.</p>
                    )}
                  </div>
                </div>
              )
            })}

            <div className="bg-navy rounded-2xl p-4 text-center">
              <p className="text-sm text-white font-semibold">Interested in this itinerary?</p>
              <p className="text-xs text-white/60 mt-0.5">Switch to the <strong className="text-lime">WhatsApp</strong> tab to send your request to the JVTO team.</p>
            </div>
          </div>
        )}

        {/* ── WhatsApp ── */}
        {tab === 'whatsapp' && (
          <div className="space-y-4">
            <div className="bg-white border border-ink/10 rounded-2xl p-4">
              <p className="text-sm text-ink font-semibold mb-1">How to book:</p>
              <ol className="text-sm text-ink/70 space-y-0.5 list-decimal pl-4">
                <li>Click <strong>Copy Message</strong></li>
                <li>Open WhatsApp, chat to the JVTO number</li>
                <li>Paste &amp; send</li>
              </ol>
            </div>
            <div className="flex justify-between items-center">
              <p className="text-sm text-ink/50">Message preview:</p>
              <button onClick={copyWa}
                className={`flex items-center gap-1.5 text-sm px-5 py-2 rounded-full font-semibold transition-colors ${copied ? 'bg-lime text-navy' : 'bg-orange text-white hover:brightness-110'}`}>
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied!' : 'Copy Message'}
              </button>
            </div>
            <textarea readOnly value={waText}
              className="w-full h-96 border border-ink/10 rounded-2xl p-4 text-xs font-mono resize-none bg-white text-ink/80 leading-relaxed focus:outline-none" />
          </div>
        )}

        {/* ── Expense Report ── */}
        {tab === 'rekap' && (
          <div className="space-y-4 text-sm">
            <div className="bg-orange/10 border border-orange/30 rounded-xl p-3 text-xs text-orange flex items-center gap-2">
              <Calculator size={14} /> Internal verification only &mdash; not visible to customer.
            </div>

            {/* Trip header */}
            <div className="grid grid-cols-2 gap-1 text-xs text-ink/70 bg-white border border-ink/10 rounded-lg p-3">
              <div><span className="font-semibold">Customer:</span> {input.customer.name || '—'} ({pax} PAX)</div>
              <div className="text-right"><span className="font-semibold">Duration:</span> {days.length} Day{days.length !== 1 ? 's' : ''} {days.length - 1} Night{days.length - 1 !== 1 ? 's' : ''}</div>
              <div><span className="font-semibold">Travel Date:</span> {fmtDateShort(days[0]?.date)}</div>
              <div className="text-right"><span className="font-semibold">Vehicle:</span> {vehicleSummary}</div>
            </div>

            {/* Categorical table */}
            <table className="w-full text-xs border border-ink/10 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="py-2 px-2 text-center w-7">No</th>
                  <th className="py-2 px-2 text-left">Sub Category</th>
                  <th className="py-2 px-2 text-left">Item</th>
                  <th className="py-2 px-2 text-center w-8">Qty</th>
                  <th className="py-2 px-2 text-right">Price</th>
                  <th className="py-2 px-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {rekapAccom.length > 0 && <>{catHdr('Accommodation')}{rekapAccom.map(rekapRow)}</>}
                {rekapDest.length  > 0 && <>{catHdr('Destination')}{rekapDest.map(rekapRow)}</>}
                {rekapTransp.length > 0 && <>{catHdr('Transport')}{rekapTransp.map(rekapRow)}</>}
                {rekapCrew.length  > 0 && <>{catHdr('Crew / Resource')}{rekapCrew.map(rekapRow)}</>}
                {rekapOther.length > 0 && <>{catHdr('Others (D-codes)')}{rekapOther.map(rekapRow)}</>}
              </tbody>
            </table>

            {/* Grand Total */}
            <div className="border-t-2 border-ink/10 pt-4 space-y-2">
              <div className="flex justify-between text-ink/50 text-xs">
                <span>Accommodation + Destination</span><span>{rp(days.reduce((s, d) => s + d.daySubtotal, 0))}</span>
              </div>
              <div className="flex justify-between text-ink/50 text-xs">
                <span>Transport</span><span>{rp(vehicleCost)}</span>
              </div>
              <div className="flex justify-between text-ink/50 text-xs">
                <span>Crew</span><span>{rp(crewCost)}</span>
              </div>
              <div className="flex justify-between text-ink/50 text-xs">
                <span>D-codes</span><span>{rp(otherTotal)}</span>
              </div>
              <div className="flex justify-between text-ink/70 border-t border-ink/10 pt-2">
                <span>Total Expense</span><span className="font-medium">{rp(totalExpense)}</span>
              </div>
              <div className="flex justify-between text-ink/70">
                <span>Markup 20%</span><span className="font-medium">{rp(sellingPrice - totalExpense)}</span>
              </div>
              <div className="flex justify-between text-navy font-bold text-base pt-2 border-t-2 border-orange/30">
                <span>Selling Price</span><span>{rp(sellingPrice)}</span>
              </div>
              {pax > 1 && (
                <div className="flex justify-between text-ink/40 text-xs">
                  <span>Per person</span><span>{rp(sellingPricePerPax)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify ResultView in isolation**

```bash
cd itinerary-builder && npx tsc --noEmit
```

Expected: TypeScript will report an error at this point because `ItineraryForm.tsx` (not yet updated) still calls `<ResultView ... />` without the new required `onBack` prop. That error is expected and gets resolved by Step 6-8 below — do not stop here, continue to the next step.

- [ ] **Step 6: Create `ItineraryWizard.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BrainData, ItineraryInput, DayInput, ItineraryResult } from '@/types'
import { calculate } from '@/lib/calculator'
import StepIndicator from './StepIndicator'
import Step1TripBasics from './Step1TripBasics'
import Step2Destinations from './Step2Destinations'
import ResultView from './ResultView'

interface Props { brain: BrainData }

// Display labels for pickup/dropoff context IDs
const LOCATION_LABEL: Record<string, string> = {
  surabaya_airport_pickup:        'Surabaya — Airport',
  surabaya_hotel_pickup:          'Surabaya — Hotel',
  surabaya_train_station_pickup:  'Surabaya — Train Station',
  ketapang_harbor_pickup:         'Ketapang — Harbor',
  surabaya_city_point_pickup:     'Surabaya',
  custom_address_pickup:          'Other (custom)',
  ketapang_harbor_dropoff:        'Ketapang — Harbor',
  surabaya_airport_dropoff:       'Surabaya — Airport',
  bali_hotel_dropoff:             'Bali',
  surabaya_hotel_dropoff:         'Surabaya — Hotel',
  surabaya_train_station_dropoff: 'Surabaya — Train Station',
  malang_dropoff:                 'Malang',
  custom_address_dropoff:         'Other (custom)',
}

// Optimal visit order per origin location_group (destination IDs)
const ROUTE_ORDER: Record<string, number[]> = {
  Surabaya:   [5, 18, 38, 7, 1, 6, 9, 2, 3],
  Malang:     [5, 18, 38, 7, 1, 6, 9, 2, 3],
  Bali:       [2, 9, 7, 1, 6, 18, 38, 5],
  Banyuwangi: [2, 9, 7, 1, 6, 18, 38, 5], // Ketapang side — start from Ijen east
  Bondowoso:  [2, 9, 7, 1, 6, 18, 38, 5], // via Situbondo/Bondowoso from Surabaya side — Ijen first
  default:    [5, 18, 38, 7, 1, 6, 9, 2, 3],
}

// Destinations that require arrival the night before (3am / midnight activity)
const NEEDS_PRENIGHT = new Set([1, 2]) // Bromo (03:00), Ijen (00:00)

// Hotel staging area: which destination_id of hotels to look up per destination visited
const HOTEL_STAGING: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 5: 5, 6: 1, 7: 7, 9: 2, 18: 5, 38: 5,
}

// Preferred default hotel IDs per destination staging area
const DEFAULT_HOTEL_ID: Record<number, number> = {
  1: 11, // Bromo → Joglo Kecombrang Bromo
  2: 34, // Ijen  → Riverside Homestay
}

// Destination notes for travel-only days
const TRAVEL_NOTES: Record<number, string> = {
  1: 'Transfer to Bromo area. Check-in and rest — sunrise hike departs at 03:00 AM.',
  2: 'Transfer to Ijen area. Check-in and rest — midnight hike departs at 00:00.',
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function estimateDays(selectedIds: number[]): number {
  const routeOrder = ROUTE_ORDER.default
  const hasBromo = selectedIds.includes(1)
  const hasIjen  = selectedIds.includes(2)

  const mainDests = routeOrder.filter(id => {
    if (!selectedIds.includes(id)) return false
    if (id === 6 && hasBromo) return false
    if (id === 9 && hasIjen)  return false
    return true
  })

  let days = 0
  const absorbed = new Set<number>()
  for (let i = 0; i < mainDests.length; i++) {
    const id     = mainDests[i]
    const nextId = mainDests[i + 1]
    if (NEEDS_PRENIGHT.has(id)) {
      if (!absorbed.has(id)) days++
      days++
      if (nextId && NEEDS_PRENIGHT.has(nextId)) absorbed.add(nextId)
    } else {
      days++
    }
  }
  return Math.max(1, days)
}

function generateDays(
  selectedDestIds: number[],
  originGroup: string,
  pickupLabel: string,
  pickupTime: string,
  dropoffLabel: string,
  dropoffTime: string,
  hasBaliDrop: boolean,
  startDate: string,
  pax: number,
  brain: BrainData
): DayInput[] {
  const hasMadak  = selectedDestIds.includes(6)
  const hasPapuma = selectedDestIds.includes(9)
  const hasBromo  = selectedDestIds.includes(1)
  const hasIjen   = selectedDestIds.includes(2)

  const pickupHour = pickupTime ? parseInt(pickupTime.split(':')[0]) : 7
  const isEarlyPickup = pickupHour < 15
  const surabayaSide = originGroup === 'Surabaya' || originGroup === 'Malang' || originGroup === 'default'
  const routeOrder = (surabayaSide && hasIjen && isEarlyPickup)
    ? ROUTE_ORDER.Bondowoso   // Ijen-first via Situbondo/Bondowoso
    : (ROUTE_ORDER[originGroup] ?? ROUTE_ORDER.default)

  const allOrdered = routeOrder.filter(id => selectedDestIds.includes(id))

  const roomCount = Math.max(1, Math.ceil(pax / 2))

  interface Seg {
    actIds: number[]
    hotelDestId: number | null
    isTravel: boolean
    notes: string
  }

  const segs: Seg[] = []
  const processed      = new Set<number>()
  const absorbedTravel = new Set<number>()

  const mainOrdered = allOrdered.filter(id => {
    if (id === 6 && hasBromo)  return false
    if (id === 9 && hasIjen)   return false
    return true
  })

  for (let mi = 0; mi < mainOrdered.length; mi++) {
    const destId  = mainOrdered[mi]
    const nextId  = mainOrdered[mi + 1]
    if (processed.has(destId)) continue

    if (NEEDS_PRENIGHT.has(destId)) {
      if (!absorbedTravel.has(destId)) {
        const travelActs: number[] = []
        if (destId === 2 && hasPapuma) {
          travelActs.push(9)
          processed.add(9)
        }
        segs.push({
          actIds: travelActs,
          hotelDestId: HOTEL_STAGING[destId] ?? destId,
          isTravel: true,
          notes: travelActs.length === 0 ? (TRAVEL_NOTES[destId] ?? '') : '',
        })
      }

      const actIds = [destId]
      if (destId === 1 && hasMadak) {
        actIds.push(6)
        processed.add(6)
      }

      let actHotel: number | null = null
      if (nextId && NEEDS_PRENIGHT.has(nextId)) {
        actHotel = HOTEL_STAGING[nextId] ?? nextId
        absorbedTravel.add(nextId)
      }

      segs.push({
        actIds,
        hotelDestId: actHotel,
        isTravel: false,
        notes: '',
      })
    } else {
      segs.push({
        actIds: [destId],
        hotelDestId: HOTEL_STAGING[destId] ?? destId,
        isTravel: false,
        notes: '',
      })
    }

    processed.add(destId)
  }

  if (segs.length > 0) segs[segs.length - 1].hotelDestId = null

  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i].hotelDestId !== null) continue
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[j].hotelDestId !== null) {
        segs[i].hotelDestId = segs[j].hotelDestId
        break
      }
    }
  }

  return segs.map((seg, idx) => {
    const isFirst = idx === 0
    const isLast  = idx === segs.length - 1

    const hotel = seg.hotelDestId !== null
      ? (brain.hotels.find(h => h.id === DEFAULT_HOTEL_ID[seg.hotelDestId!])
         ?? brain.hotels.find(h => h.destination_id === seg.hotelDestId)
         ?? null)
      : null
    const room = hotel?.room_types?.[0] ?? null

    return {
      dayNumber: idx + 1,
      date: startDate ? addDays(startDate, idx) : '',
      pickup: isFirst ? { location: pickupLabel, time: pickupTime || '07:00' } : null,
      destinationIds: seg.actIds,
      hotelId: hotel?.id ?? null,
      roomTypeId: room?.id ?? null,
      roomCount,
      meals: {
        // breakfast: dari hotel malam sebelumnya (hari 1 tidak ada — tamu baru tiba)
        breakfast: idx > 0 && segs[idx - 1].hotelDestId !== null,
        // lunch: Tumpak Sewu, atau hari mendaki Ijen (kecuali hari terakhir + drop Bali)
        lunch: seg.actIds.includes(7) || (seg.actIds.includes(2) && !(isLast && hasBaliDrop)),
        // dinner: malam di area Ijen (hotelDestId=2) — makan malam sebelum pendakian tengah malam
        dinner: seg.hotelDestId === 2,
      },
      notes: seg.notes,
      dropoff: isLast ? { location: dropoffLabel, estimatedTime: dropoffTime } : null,
    }
  })
}

type Step = 1 | 2 | 3

export default function ItineraryWizard({ brain }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [maxReachedStep, setMaxReachedStep] = useState<Step>(1)

  const [name, setName]           = useState('')
  const [pax, setPax]             = useState(2)
  const [startDate, setStartDate] = useState('')
  const [pickupTime, setPickupTime]   = useState('07:00')
  const [dropoffTime, setDropoffTime] = useState('')
  const [originId, setOriginId]   = useState(
    brain.pickupContexts.find(c => c.id === 'surabaya_airport_pickup')?.id ?? brain.pickupContexts[0]?.id ?? ''
  )
  const [endCityId, setEndCityId] = useState(
    brain.dropoffContexts.find(c => c.id === 'surabaya_airport_dropoff')?.id ?? brain.dropoffContexts[0]?.id ?? ''
  )
  const [selDests, setSelDests]   = useState<number[]>([])
  const [editableDays, setEditableDays] = useState<DayInput[] | null>(null)
  const [result, setResult]       = useState<ItineraryResult | null>(null)

  const originCtx   = brain.pickupContexts.find(c => c.id === originId)
  const endCtx      = brain.dropoffContexts.find(c => c.id === endCityId)
  const originGroup = originCtx?.location_group ?? 'Surabaya'
  const pickupLabel = LOCATION_LABEL[originId]  ?? originCtx?.label ?? originId
  const dropoffLabel = LOCATION_LABEL[endCityId] ?? endCtx?.label ?? endCityId

  const estimatedDays = estimateDays(selDests)
  const canGenerate   = selDests.length > 0

  const toggleDest = (id: number) =>
    setSelDests(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const goToStep = (target: Step) => {
    setStep(target)
    setMaxReachedStep(prev => (target > prev ? target : prev))
  }

  const handleGenerate = () => {
    if (!canGenerate) return
    const hasBaliDrop = endCtx?.location_group === 'Bali'
    const days = generateDays(selDests, originGroup, pickupLabel, pickupTime, dropoffLabel, dropoffTime, hasBaliDrop, startDate, pax, brain)
    setEditableDays(days)
    const input: ItineraryInput = { customer: { name, pax }, origin: originGroup, days }
    setResult(calculate(input, brain))
    goToStep(3)
  }

  const handleHotelChange = (dayIdx: number, newHotelId: number | null) => {
    if (!editableDays) return
    const hotel = newHotelId ? brain.hotels.find(h => h.id === newHotelId) ?? null : null
    const room = hotel?.room_types?.[0] ?? null
    const updated = editableDays.map((d, i) =>
      i !== dayIdx ? d : { ...d, hotelId: newHotelId, roomTypeId: room?.id ?? null }
    )
    setEditableDays(updated)
    const input: ItineraryInput = { customer: { name, pax }, origin: originGroup, days: updated }
    setResult(calculate(input, brain))
  }

  return (
    <div className="min-h-screen bg-navy">
      <div className="sticky top-0 z-30 bg-navy border-b border-navy-border">
        <StepIndicator currentStep={step} maxReachedStep={maxReachedStep} onStepClick={goToStep} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          {step === 1 && (
            <Step1TripBasics
              brain={brain}
              name={name} onNameChange={setName}
              pax={pax} onPaxChange={setPax}
              startDate={startDate} onStartDateChange={setStartDate}
              pickupTime={pickupTime} onPickupTimeChange={setPickupTime}
              dropoffTime={dropoffTime} onDropoffTimeChange={setDropoffTime}
              originId={originId} onOriginIdChange={setOriginId}
              endCityId={endCityId} onEndCityIdChange={setEndCityId}
              locationLabel={LOCATION_LABEL}
              onContinue={() => goToStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Destinations
              brain={brain}
              selDests={selDests}
              onToggleDest={toggleDest}
              estimatedDays={estimatedDays}
              canGenerate={canGenerate}
              onBack={() => goToStep(1)}
              onContinue={handleGenerate}
            />
          )}
          {step === 3 && result && editableDays && (
            <ResultView
              result={result}
              brain={brain}
              editableDays={editableDays}
              onHotelChange={handleHotelChange}
              onBack={() => goToStep(2)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 7: Delete `ItineraryForm.tsx`**

```bash
rm itinerary-builder/src/components/ItineraryForm.tsx
```

- [ ] **Step 8: Update `page.tsx` to render the wizard**

Replace the full contents of `itinerary-builder/src/app/page.tsx` with:

```tsx
import fs from 'fs'
import path from 'path'
import ItineraryWizard from '@/components/ItineraryWizard'
import type { BrainData } from '@/types'

const BRAIN = path.join(process.cwd(), '../generated/itinerary-intelligence')

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(path.join(BRAIN, file), 'utf-8'))
}

export default function Page() {
  const destinations = readJson('22-destinations-master.json').destinations
  const hotels = readJson('17-hotels-master.json').hotels
  const activities = readJson('18-activities-master.json').destination_activities
  const vehicleTypes = readJson('19-transport-master.json').vehicle_types
  const vehicleRules = readJson('23-transport-crew-rules.json').rules
  const otherItems = readJson('20-others-master.json').catalog_items

  // Exclude internal "previous tour" handoff — not a customer-facing pickup point
  const pickupContexts = (readJson('01-pickup-contexts.json') as Array<{id:string;label:string;type:string;location_group:string;status:string}>)
    .filter(c => c.status === 'active' && c.id !== 'previous_tour_dropoff_pickup')
  const dropoffContexts = (readJson('02-dropoff-contexts.json') as Array<{id:string;label:string;type:string;location_group:string;status:string}>)
    .filter(c => c.status === 'active')

  const brain: BrainData = { destinations, hotels, activities, vehicleTypes, vehicleRules, otherItems, pickupContexts, dropoffContexts }

  return <ItineraryWizard brain={brain} />
}
```

- [ ] **Step 9: Verify the full tree type-checks**

```bash
cd itinerary-builder && npx tsc --noEmit
```

Expected: no output, exit code 0 (the error from Step 5 is now resolved because `ItineraryForm.tsx` no longer exists).

- [ ] **Step 10: Verify no dangling references to the deleted file**

```bash
grep -rn "ItineraryForm" itinerary-builder/src
```

Expected: no matches (exit code 1).

- [ ] **Step 11: Commit**

```bash
git add itinerary-builder/src/components/ResultView.tsx itinerary-builder/src/components/ItineraryWizard.tsx itinerary-builder/src/app/page.tsx
git rm itinerary-builder/src/components/ItineraryForm.tsx
git commit -m "feat(itinerary-builder): restyle ResultView and wire the 3-step ItineraryWizard"
```

---

### Task 7: Full build and manual walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Production build**

```bash
cd itinerary-builder && npm run build
```

Expected: build completes successfully (exit code 0), no type or lint errors.

- [ ] **Step 2: Start the dev server**

```bash
cd itinerary-builder && npm run dev
```

Expected: server starts on `http://localhost:3100`.

- [ ] **Step 3: Manual walkthrough checklist**

Open `http://localhost:3100` in a browser (or use the `/run` skill / Playwright) and confirm:

- [ ] Step 1 (Trip Basics) renders full-screen navy with the labeled progress bar at `Trip Basics` active (orange).
- [ ] Fill in a guest name, set guests to 2, pick a start date, leave pickup/dropoff defaults, click Continue — advances to Step 2 with a slide/fade transition.
- [ ] Step 2 shows a photo-card grid of exactly 5 destinations (Mount Bromo, Mount Ijen, Madakaripura Waterfall, Tumpak Sewu Waterfall, Papuma Beach) — no card for Malang City, Coffee & Cocoa Science Technopark, or Taman Safari Prigen.
- [ ] Selecting Mount Bromo and Mount Ijen shows a lime checkmark badge on both cards and updates the day/night estimate banner, including the Bromo and Ijen prenight warnings.
- [ ] Click Back — returns to Step 1 with all previously entered values still populated (name, guests, date, etc.).
- [ ] Click the "Destinations" segment in the progress bar from Step 1 — jumps forward to Step 2 without losing the earlier destination selection.
- [ ] Click "Continue & Generate Itinerary" — advances to Step 3 showing a sticky navy price hero (matches the price shown before restyling for the same inputs) above a cream body with Itinerary / WhatsApp / Expense Report tabs.
- [ ] In the Itinerary tab, click "Download PDF" — a PDF downloads and opens correctly with day blocks, images, and pricing (unchanged from before this feature).
- [ ] In the WhatsApp tab, click "Copy Message" — button shows a lime "Copied!" state and the clipboard contains the formatted message.
- [ ] In the Expense Report tab, the amber-turned-orange "internal only" banner and category tables render with the same totals as before restyling.
- [ ] Resize the browser to a narrow (mobile) width — all three steps remain single-column and usable; resize to a wide desktop width — Step 2's grid becomes 3 columns and content stays centered instead of stretching edge-to-edge.

- [ ] **Step 4: Stop the dev server**

Stop the process started in Step 2 (e.g. `Ctrl+C`, or `kill` the backgrounded PID).

No commit for this task — it is verification-only.
