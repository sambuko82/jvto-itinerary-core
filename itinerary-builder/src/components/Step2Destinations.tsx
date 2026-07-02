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
              <span className="text-navy-muted"> — route, hotels & schedule generated automatically</span>
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
          <p className="text-center text-xs text-navy-muted mt-2">Please select at least 1 destination</p>
        )}
      </div>
    </div>
  )
}
