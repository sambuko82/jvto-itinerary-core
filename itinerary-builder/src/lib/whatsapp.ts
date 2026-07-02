import type { ItineraryResult } from '@/types'

export function rp(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID')
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatWhatsApp(result: ItineraryResult): string {
  const { input, days, vehicleType, sellingPrice, sellingPricePerPax } = result
  const { customer } = input
  const pax = customer.pax

  const startDate = days[0]?.date
  const endDate = days[days.length - 1]?.date
  const duration = `${days.length}D${days.length - 1}N`

  const lines: string[] = []

  lines.push('*☕ JAVA VOLCANO TOUR OPERATOR*')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push(`*Custom Itinerary — ${customer.name || 'Guest'}*`)
  lines.push('')
  lines.push(`📅 ${fmtDate(startDate)}${days.length > 1 ? ` – ${fmtDate(endDate)}` : ''}`)
  lines.push(`⏱️ ${duration} | 👥 ${pax} guest${pax > 1 ? 's' : ''} | 🚐 ${vehicleType.name}`)
  lines.push('')

  for (const day of days) {
    const dayInput = input.days[day.dayNumber - 1]
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push(`*DAY ${day.dayNumber}* — ${fmtDate(day.date)}`)
    lines.push('')

    if (day.pickup) {
      lines.push(`🚐 *Pickup:* ${day.pickup.location}`)
      lines.push(`   At ${day.pickup.time}`)
    }

    for (const dest of day.destinationNames) {
      lines.push('')
      lines.push(`🏔️ *${dest}*`)
    }

    if (day.hotel) {
      lines.push('')
      lines.push(`🏨 *${day.hotel.hotelName}*`)
      lines.push(`   ${day.hotel.roomTypeName} × ${day.hotel.roomCount} room${day.hotel.roomCount > 1 ? 's' : ''}`)
    }

    if (day.meals.length > 0) {
      lines.push('')
      lines.push(`🍽️ Meals: ${day.meals.join(' + ')}`)
    }

    if (day.dropoff) {
      lines.push('')
      lines.push(`🚐 *Drop-off:* ${day.dropoff.location}`)
      if (day.dropoff.estimatedTime) lines.push(`   Est. ${day.dropoff.estimatedTime}`)
    }

    if (dayInput?.notes) {
      lines.push('')
      lines.push(`📝 ${dayInput.notes}`)
    }

    lines.push('')
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push(`💰 *TOTAL PRICE: ${rp(sellingPrice)}*`)
  if (pax > 1) lines.push(`   _(per person: ${rp(sellingPricePerPax)})_`)
  lines.push('')

  lines.push('✅ *What\'s included:*')
  lines.push('   • Private AC transport (not shared)')
  if (days.some(d => d.hotel)) lines.push('   • Accommodation as per itinerary')
  if (days.some(d => d.activityNames.length > 0)) {
    lines.push('   • Destination entry tickets')
    lines.push('   • Local guide(s)')
  }
  if (days.some(d => d.meals.length > 0)) lines.push('   • Meals as per program')
  lines.push('   • Fuel & driver allowance')
  lines.push('')

  lines.push('❌ *Not included:*')
  lines.push('   • Flights / train tickets')
  lines.push('   • Personal expenses')
  lines.push('   • Guide & driver tips (optional)')
  lines.push('')

  lines.push('📩 _Info & reservasi: javavolcanotouroperator@gmail.com_')

  return lines.join('\n')
}
