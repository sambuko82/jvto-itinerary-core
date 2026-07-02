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

const LABEL_CLASS = 'block text-xs font-semibold text-navy-muted mb-1'
const INPUT_CLASS = 'w-full border border-navy-border rounded-[10px] px-3 py-2 text-sm bg-navy text-white outline-none focus:border-orange focus:ring-2 focus:ring-orange/15'

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
              <label htmlFor="trip-name" className={LABEL_CLASS}>Name (optional)</label>
              <input id="trip-name" className={INPUT_CLASS} placeholder="Guest / group name"
                value={name} onChange={e => onNameChange(e.target.value)} />
            </div>
            <div>
              <label htmlFor="trip-pax" className={LABEL_CLASS}>No. of Guests</label>
              <input id="trip-pax" className={INPUT_CLASS} type="number" min={1} max={30} value={pax}
                onChange={e => onPaxChange(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div>
              <label htmlFor="trip-start-date" className={LABEL_CLASS}>Start Date</label>
              <input id="trip-start-date" className={INPUT_CLASS} type="date" value={startDate}
                onChange={e => onStartDateChange(e.target.value)} />
            </div>
            <div>
              <label htmlFor="trip-pickup-point" className={LABEL_CLASS}>Pickup Point</label>
              <select id="trip-pickup-point" className={INPUT_CLASS} value={originId} onChange={e => onOriginIdChange(e.target.value)}>
                {brain.pickupContexts.map(c => (
                  <option key={c.id} value={c.id}>{locationLabel[c.id] ?? c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="trip-pickup-time" className={LABEL_CLASS}>Pickup Time</label>
              <input id="trip-pickup-time" className={INPUT_CLASS} type="time" value={pickupTime}
                onChange={e => onPickupTimeChange(e.target.value)} />
            </div>
            <div>
              <label htmlFor="trip-dropoff-point" className={LABEL_CLASS}>Drop-off Point</label>
              <select id="trip-dropoff-point" className={INPUT_CLASS} value={endCityId} onChange={e => onEndCityIdChange(e.target.value)}>
                {brain.dropoffContexts.map(c => (
                  <option key={c.id} value={c.id}>{locationLabel[c.id] ?? c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="trip-dropoff-time" className={LABEL_CLASS}>Est. Drop-off Time</label>
              <input id="trip-dropoff-time" className={INPUT_CLASS} type="time" value={dropoffTime}
                onChange={e => onDropoffTimeChange(e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>

        <button onClick={onContinue}
          className="mt-6 w-full sm:w-auto sm:ml-auto flex bg-orange text-white font-bold px-8 py-4 rounded-full hover:brightness-110 transition-all items-center justify-center gap-2">
          Continue <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
