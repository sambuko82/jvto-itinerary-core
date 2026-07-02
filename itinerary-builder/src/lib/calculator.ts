import type {
  ItineraryInput,
  BrainData,
  ItineraryResult,
  DayResult,
  Activity,
  VehicleType,
  ExpenseLine,
  OtherItem,
} from '@/types'

const MARKUP = 1.20

function evalFormula(formula: string, pax: number): number {
  if (formula === 'pax') return pax
  if (formula === '1') return 1
  const numMatch = formula.match(/^\d+$/)
  if (numMatch) return parseInt(formula)
  const ceilMatch = formula.match(/Math\.ceil\(pax\s*\/\s*(\d+)\)/)
  if (ceilMatch) return Math.ceil(pax / parseInt(ceilMatch[1]))
  const floorMatch = formula.match(/Math\.floor\(pax\s*\/\s*(\d+)\)/)
  if (floorMatch) return Math.floor(pax / parseInt(floorMatch[1]))
  return pax
}

function getActivitiesForDestination(destId: number, allActivities: Activity[]): Activity[] {
  return allActivities.filter(a => a.destination_id === destId && a.is_default_jvto)
}

function selectTransport(
  pax: number,
  days: number,
  brain: BrainData
): {
  vehicleType: VehicleType
  vehicleSummary: string
  vehicleLines: ExpenseLine[]
  vehicleCost: number
  crewLines: ExpenseLine[]
  crewCost: number
} {
  const jvtoRules = brain.vehicleRules
    .filter(r => r.order_channel_id === 1)
    .sort((a, b) => a.pax - b.pax)

  const rule = jvtoRules.find(r => r.pax === pax) ?? jvtoRules[jvtoRules.length - 1]

  const primaryVehicleTypeId = rule?.vehicles[0]?.vehicle_type_id ?? 3
  const vehicleType = brain.vehicleTypes.find(v => v.id === primaryVehicleTypeId) ?? brain.vehicleTypes[0]

  const vehicleLines: ExpenseLine[] = []
  const crewLines: ExpenseLine[] = []

  for (const v of rule?.vehicles ?? []) {
    vehicleLines.push({
      label: v.vehicle_name,
      detail: `× ${days} hari`,
      quantity: days,
      unitCost: v.vehicle_rate_per_day,
      total: v.vehicle_rate_per_day * days,
    })
    crewLines.push({
      label: v.crew_role_name,
      detail: `× ${days} hari`,
      quantity: days,
      unitCost: v.crew_rate_per_day,
      total: v.crew_rate_per_day * days,
    })
  }

  const vehicleCost = vehicleLines.reduce((s, l) => s + l.total, 0)
  const crewCost = crewLines.reduce((s, l) => s + l.total, 0)

  return { vehicleType, vehicleSummary: rule?.summary ?? vehicleType.name, vehicleLines, vehicleCost, crewLines, crewCost }
}

const MEAL_DEFAULTS = { breakfast: 50000, lunch: 65000, dinner: 80000 }
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

function buildOtherLines(items: OtherItem[], pax: number, hasBali: boolean): ExpenseLine[] {
  const lines: ExpenseLine[] = []
  for (const item of items) {
    if (item.order_channel_id !== 1) continue
    if (!item.is_default_jvto) continue
    const qty = evalFormula(item.quantity_formula, pax)
    lines.push({
      label: `${item.name} (${item.code})`,
      detail: item.quantity_formula === 'pax' ? `× ${pax} orang` : item.quantity_formula === '1' ? 'per trip' : item.quantity_formula,
      quantity: qty,
      unitCost: item.price_idr,
      total: item.price_idr * qty,
    })
  }
  if (hasBali) {
    for (const item of items) {
      if (item.order_channel_id !== 1) continue
      if (item.id !== 10 && item.id !== 11) continue
      const qty = item.quantity_formula === 'pax' ? pax : 1
      lines.push({
        label: `${item.name} (${item.code})`,
        detail: item.quantity_formula === 'pax' ? `× ${pax} orang` : 'per trip',
        quantity: qty,
        unitCost: item.price_idr,
        total: item.price_idr * qty,
      })
    }
  }
  return lines
}

export function calculate(input: ItineraryInput, brain: BrainData): ItineraryResult {
  const { customer, days } = input
  const { pax } = customer

  const hotelMap = Object.fromEntries(brain.hotels.map(h => [h.id, h]))
  const destMap = Object.fromEntries(brain.destinations.map(d => [d.id, d]))
  const hasBali = days.some(d => d.destinationIds.includes(3))

  const { vehicleType, vehicleSummary, vehicleLines, vehicleCost, crewLines, crewCost } =
    selectTransport(pax, days.length, brain)

  const dayResults: DayResult[] = days.map((day, dayIdx) => {
    const expenseLines: ExpenseLine[] = []

    const allActNames: string[] = []
    const destNames: string[] = []
    for (const destId of day.destinationIds) {
      const dest = destMap[destId]
      if (dest) destNames.push(dest.name)
      const acts = getActivitiesForDestination(destId, brain.activities)
      for (const act of acts) {
        const qty = evalFormula(act.quantity_formula, pax)
        const total = act.cost_idr * qty
        allActNames.push(act.name)
        expenseLines.push({
          label: act.name,
          detail: act.quantity_formula === 'pax'
            ? `× ${pax} orang`
            : act.quantity_formula === '1'
            ? 'per grup'
            : `formula: ${act.quantity_formula}`,
          quantity: qty,
          unitCost: act.cost_idr,
          total,
        })
      }
    }

    let hotelDisplay: DayResult['hotel'] = null
    if (day.hotelId && day.roomTypeId) {
      const h = hotelMap[day.hotelId]
      const room = h?.room_types.find(r => r.id === day.roomTypeId)
      if (h && room) {
        hotelDisplay = {
          hotelName: h.name,
          roomTypeName: room.room_name,
          roomCount: day.roomCount,
        }
        expenseLines.push({
          label: h.name,
          detail: `${room.room_name} × ${day.roomCount} kamar`,
          quantity: day.roomCount,
          unitCost: room.rate_idr,
          total: room.rate_idr * day.roomCount,
        })
      }
    }

    const mealLabels: string[] = []
    for (const type of ['breakfast', 'lunch', 'dinner'] as const) {
      if (!day.meals[type]) continue
      // Breakfast is free (included in hotel rate) — show in itinerary but not in expense
      if (type === 'breakfast') { mealLabels.push(MEAL_LABELS[type]); continue }
      const h = day.hotelId ? hotelMap[day.hotelId] : null
      // For lunch/dinner, if this day has no hotel (e.g. departure day), use previous night's hotel rate
      const prevH = !h && dayIdx > 0 ? (days[dayIdx - 1].hotelId ? hotelMap[days[dayIdx - 1].hotelId!] : null) : null
      let rate = MEAL_DEFAULTS[type]
      if (type === 'lunch') rate = (h?.lunch_rate_idr || prevH?.lunch_rate_idr) ?? MEAL_DEFAULTS.lunch
      if (type === 'dinner') rate = (h?.dinner_rate_idr || prevH?.dinner_rate_idr) ?? MEAL_DEFAULTS.dinner
      mealLabels.push(MEAL_LABELS[type])
      expenseLines.push({
        label: MEAL_LABELS[type],
        detail: `× ${pax} orang`,
        quantity: pax,
        unitCost: rate,
        total: rate * pax,
      })
    }

    const daySubtotal = expenseLines.reduce((s, l) => s + l.total, 0)

    return {
      dayNumber: day.dayNumber,
      date: day.date,
      pickup: day.pickup,
      dropoff: day.dropoff,
      destinationNames: destNames,
      activityNames: allActNames,
      hotel: hotelDisplay,
      meals: mealLabels,
      notes: day.notes,
      routeDescription: day.routeDescription,
      expenseLines,
      daySubtotal,
    }
  })

  const otherLines = buildOtherLines(brain.otherItems, pax, hasBali)
  const otherTotal = otherLines.reduce((s, l) => s + l.total, 0)

  const actHotelTotal = dayResults.reduce((s, d) => s + d.daySubtotal, 0)
  const totalExpense = actHotelTotal + vehicleCost + crewCost + otherTotal

  const sellingPrice = Math.ceil((totalExpense * MARKUP) / 1000) * 1000
  const sellingPricePerPax = Math.ceil(sellingPrice / pax / 1000) * 1000

  return {
    input,
    vehicleType,
    vehicleSummary,
    days: dayResults,
    vehicleDays: days.length,
    vehicleLines,
    vehicleCost,
    crewLines,
    crewCost,
    otherLines,
    otherTotal,
    totalExpense,
    sellingPrice,
    sellingPricePerPax,
  }
}
