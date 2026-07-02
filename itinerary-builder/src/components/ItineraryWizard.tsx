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
