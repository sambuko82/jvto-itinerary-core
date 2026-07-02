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
