'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Bus, Mountain, Hotel, UtensilsCrossed, CalendarDays, MessageCircle, Calculator, Download, Copy, Check, CheckCircle2, XCircle } from 'lucide-react'
import type { ItineraryResult, BrainData, DayInput } from '@/types'
import { formatWhatsApp, rp } from '@/lib/whatsapp'
import { DEST_IMAGE, VEH_IMAGE } from '@/lib/images'

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtDateShort(d: string) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface Props {
  result: ItineraryResult
  brain: BrainData
  editableDays: DayInput[]
  onHotelChange: (dayIdx: number, hotelId: number | null) => void
  onBack: () => void
}

export default function ResultView({ result, brain, editableDays, onHotelChange, onBack }: Props) {
  const [tab, setTab] = useState<'itinerary' | 'whatsapp' | 'rekap'>('itinerary')
  const [copied, setCopied] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsPDFRef = useRef<any>(null)
  const imgCacheRef = useRef<Record<string, string>>({})

  const { days, vehicleType, vehicleSummary, vehicleLines, vehicleCost, crewLines, crewCost, otherLines, otherTotal, totalExpense, sellingPrice, sellingPricePerPax, input } = result
  const pax = input.customer.pax
  const waText = formatWhatsApp(result)

  useEffect(() => {
    import('jspdf').then(({ jsPDF }) => { jsPDFRef.current = jsPDF })
  }, [])

  // Preload images as JPEG data URLs (canvas conversion handles WEBP/PNG)
  useEffect(() => {
    const toLoad = new Set<string>()
    days.forEach(d => d.destinationNames.forEach(n => { if (DEST_IMAGE[n]) toLoad.add(DEST_IMAGE[n]) }))
    const vImg = VEH_IMAGE[vehicleType.name]
    if (vImg) toLoad.add(vImg)

    const loadAsJpeg = (src: string) => {
      if (imgCacheRef.current[src]) return
      const img = new Image()
      img.onload = () => {
        const MAX = 900
        const scale = Math.min(1, MAX / img.naturalWidth)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        imgCacheRef.current[src] = canvas.toDataURL('image/jpeg', 0.82)
      }
      img.src = src
    }
    toLoad.forEach(loadAsJpeg)
  }, [days, vehicleType.name])

  const copyWa = async () => {
    await navigator.clipboard.writeText(waText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const downloadPDF = () => {
    const JsPDF = jsPDFRef.current
    if (!JsPDF) return
    const doc = new JsPDF('p', 'mm', 'a4')
    const W = 210, M = 15, CW = W - M * 2
    const G: [number, number, number] = [21, 128, 61]
    const NAVY: [number, number, number] = [30, 58, 95]
    const imgs = imgCacheRef.current

    // Build destination lookup for pro tips
    const destByName = Object.fromEntries(brain.destinations.map(d => [d.name, d]))
    const activitiesByDest: Record<string, string[]> = {}
    for (const act of brain.activities) {
      const destName = brain.destinations.find(d => d.id === act.destination_id)?.name ?? ''
      if (!activitiesByDest[destName]) activitiesByDest[destName] = []
      if (act.is_default_jvto) activitiesByDest[destName].push(act.name)
    }

    const addImg = (src: string, x: number, yy: number, w: number, h: number) => {
      const data = imgs[src]
      if (!data) return
      try { doc.addImage(data, 'JPEG', x, yy, w, h) } catch (_) { /* skip */ }
    }

    let y = 0

    // ── HEADER BAR ──────────────────────────────────────────────────────────
    doc.setFillColor(...G)
    doc.rect(0, 0, W, 28, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text('JVTO — Custom Itinerary', M, 11)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    doc.text('Java Volcano Tour Operator', M, 18)
    doc.setFontSize(7)
    doc.setTextColor(200, 230, 210)
    doc.text('javavolcano-touroperator.com', W - M, 24, { align: 'right' })
    y = 36

    // ── PRICE HERO ──────────────────────────────────────────────────────────
    doc.setTextColor(...G)
    doc.setFontSize(22); doc.setFont('helvetica', 'bold')
    doc.text(rp(sellingPrice), M, y); y += 8
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    if (pax > 1) { doc.text(rp(sellingPricePerPax) + ' / person  ×  ' + pax + ' guests', M, y); y += 5 }
    const dateRange = days[0]?.date
      ? fmtDateShort(days[0].date) + (days.length > 1 ? ' – ' + fmtDateShort(days[days.length - 1].date) : '')
      : ''
    doc.setFontSize(8)
    doc.text(
      days.length + ' Day' + (days.length !== 1 ? 's' : '') + '  ' + (days.length - 1) + ' Night' + (days.length - 1 !== 1 ? 's' : '') + (dateRange ? '  |  ' + dateRange : '') + '  |  ' + vehicleType.name,
      M, y
    ); y += 4.5
    if (input.customer.name) {
      doc.text('Prepared for: ' + input.customer.name, M, y); y += 4.5
    }
    y += 3

    // Thin green divider
    doc.setDrawColor(...G); doc.setLineWidth(0.5)
    doc.line(M, y, W - M, y); y += 8
    doc.setLineWidth(0.2)

    // ── DAY BLOCKS ──────────────────────────────────────────────────────────
    for (const day of days) {
      const imgSrc = DEST_IMAGE[day.destinationNames[0] ?? '']
      const hasImg = !!(imgSrc && imgs[imgSrc])
      const imgH = hasImg ? 32 : 0

      // Pro tip lookup
      const firstDest = day.destinationNames[0]
      const destInfo = firstDest ? destByName[firstDest] : null
      const proTip = destInfo?.tips_for_visitors ?? null

      // Estimate content lines
      const contentLines =
        (day.pickup ? 1 : 0) +
        day.destinationNames.length * 2 +
        (day.notes ? 2 : 0) +
        (day.hotel ? 1 : 0) +
        (day.meals.length > 0 ? 1 : 0) +
        (day.dropoff ? 1 : 0) +
        (proTip ? 4 : 0)
      const estimatedH = 9 + imgH + contentLines * 6 + 14

      if (y + estimatedH > 282) { doc.addPage(); y = 15 }

      // Day header bar — dark navy
      doc.setFillColor(...NAVY)
      doc.rect(M - 2, y - 5, CW + 4, 8, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
      const dayLabel = 'DAY ' + day.dayNumber + (day.date ? '   |   ' + fmtDate(day.date).toUpperCase() : '')
      doc.text(dayLabel, M, y)
      y += 7

      // Destination image
      if (hasImg) {
        addImg(imgSrc, M, y, CW, imgH)
        y += imgH + 2
      }

      // Content
      doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)

      // PROGRAM label
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...G); doc.setFontSize(7.5)
      doc.text('PROGRAM', M + 2, y); y += 4.5
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(8.5)

      if (day.pickup) {
        doc.text('• Pickup at ' + day.pickup.location + ' — ' + day.pickup.time, M + 2, y); y += 5
      }

      for (const dest of day.destinationNames) {
        const acts = activitiesByDest[dest] ?? []
        doc.setFont('helvetica', 'bold')
        doc.text('• ' + dest, M + 2, y)
        doc.setFont('helvetica', 'normal')
        if (acts.length > 0) {
          const actText = acts.slice(0, 3).join(', ')
          doc.setTextColor(90, 90, 90); doc.setFontSize(8)
          const actLines = doc.splitTextToSize('  ' + actText, CW - 6)
          doc.text(actLines, M + 4, y + 4.5)
          y += 4.5 + actLines.length * 4
          doc.setTextColor(40, 40, 40); doc.setFontSize(8.5)
        } else {
          y += 5
        }
      }

      if (day.notes) {
        doc.setTextColor(100, 100, 100); doc.setFontSize(8)
        const nl = doc.splitTextToSize('• ' + day.notes, CW - 6)
        doc.text(nl, M + 2, y); y += nl.length * 4.5 + 1
        doc.setTextColor(40, 40, 40); doc.setFontSize(8.5)
      }

      // ACCOMMODATION
      if (day.hotel) {
        y += 1.5
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...G); doc.setFontSize(7.5)
        doc.text('ACCOMMODATION', M + 2, y); y += 4.5
        doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(8.5)
        doc.text(
          '• ' + day.hotel.hotelName + ' — ' + day.hotel.roomTypeName + ' × ' + day.hotel.roomCount + ' room' + (day.hotel.roomCount !== 1 ? 's' : ''),
          M + 2, y
        ); y += 5
      }

      // MEALS
      if (day.meals.length > 0) {
        y += 1.5
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...G); doc.setFontSize(7.5)
        doc.text('MEALS', M + 2, y); y += 4.5
        doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(8.5)
        doc.text('• ' + day.meals.join('  +  '), M + 2, y); y += 5
      }

      // DROP-OFF
      if (day.dropoff) {
        y += 1.5
        const dropLine = 'DROP-OFF: ' + day.dropoff.location + (day.dropoff.estimatedTime ? '  ~' + day.dropoff.estimatedTime : '')
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60)
        doc.text(dropLine, M + 2, y); y += 5
      }

      // PRO TIP box
      if (proTip) {
        y += 2
        if (y + 16 > 282) { doc.addPage(); y = 15 }
        const tipText = 'Pro Tip: ' + proTip
        doc.setFontSize(7.5)
        const tipLines = doc.splitTextToSize(tipText, CW - 10)
        const tipBoxH = tipLines.length * 4 + 6
        doc.setFillColor(245, 247, 250)
        doc.roundedRect(M, y, CW, tipBoxH, 2, 2, 'F')
        doc.setTextColor(80, 80, 120); doc.setFont('helvetica', 'italic')
        doc.text(tipLines, M + 4, y + 4.5)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40)
        y += tipBoxH + 2
      }

      y += 7 // gap between days
    }

    // ── VEHICLE SECTION ──────────────────────────────────────────────────────
    if (y > 245) { doc.addPage(); y = 15 }
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3)
    doc.line(M, y, W - M, y); y += 7

    const vImgSrc = VEH_IMAGE[vehicleType.name]
    if (vImgSrc && imgs[vImgSrc]) {
      addImg(vImgSrc, M, y, 70, 44)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY)
      doc.text(vehicleSummary, M + 74, y + 10)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 100, 100)
      doc.text('Private AC transport', M + 74, y + 17)
      y += 50
    } else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(40, 40, 40)
      doc.text('Vehicle: ' + vehicleSummary, M, y); y += 7
    }

    // ── INCLUDED / EXCLUDED ──────────────────────────────────────────────────
    if (y > 252) { doc.addPage(); y = 15 }
    doc.setDrawColor(180, 180, 180)
    doc.line(M, y, W - M, y); y += 6

    const includedItems: string[] = [
      'Private AC Transport',
      ...(days.some(d => d.hotel) ? ['Accommodation'] : []),
      ...(days.some(d => d.activityNames.length > 0) ? ['Destination entry tickets', 'Local guide(s)'] : []),
      ...(days.some(d => d.meals.length > 0) ? ['Meals as per program'] : []),
      'Fuel & driver allowance',
    ]
    const incBoxH = 6 + includedItems.length * 5 + 4
    doc.setFillColor(240, 249, 244)
    doc.rect(M, y, CW, incBoxH, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(21, 100, 50)
    doc.text("What's included:", M + 3, y + 5); y += 9
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 80, 50)
    for (const item of includedItems) {
      doc.text('✓  ' + item, M + 5, y); y += 5
    }
    y += 4

    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(120, 40, 40)
    doc.text('Not included:', M, y); y += 5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 60, 60)
    for (const item of ['Flights / train tickets', 'Personal expenses', 'Guide & driver tips (optional)']) {
      doc.text('×  ' + item, M + 2, y); y += 5
    }
    y += 5

    // ── FOOTER NOTE ──────────────────────────────────────────────────────────
    doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(150, 150, 150)
    doc.text('* Estimated price. Final price confirmed after coordination with JVTO team.', M, y)

    const slug = input.customer.name ? input.customer.name.replace(/\s+/g, '_') : 'Guest'
    const arrayBuffer = doc.output('arraybuffer')
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'JVTO-Itinerary-' + slug + '.pdf'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // Categorical expense data for Rekap tab
  const destNameById = Object.fromEntries(brain.destinations.map(d => [d.id, d.name]))
  const actToDestName: Record<string, string> = {}
  for (const act of brain.activities) {
    if (!actToDestName[act.name]) actToDestName[act.name] = destNameById[act.destination_id] ?? ''
  }
  const hotelNameSet = new Set(brain.hotels.map(h => h.name))
  const hotelToDestName = Object.fromEntries(brain.hotels.map(h => [h.name, destNameById[h.destination_id] ?? '']))

  type RekapLine = { no: number; subCat: string; item: string; qty: number; unitCost: number; total: number }
  const rekapAccom: RekapLine[] = []
  const rekapDest: RekapLine[] = []

  for (const day of days) {
    const primDest = day.destinationNames[0] ?? ''
    const htlDest = day.hotel ? (hotelToDestName[day.hotel.hotelName] ?? '') : ''
    for (const line of day.expenseLines) {
      if (hotelNameSet.has(line.label)) {
        rekapAccom.push({ no: 0, subCat: line.label, item: line.detail.split(' × ')[0], qty: line.quantity, unitCost: line.unitCost, total: line.total })
      } else {
        const isMeal = line.label === 'Lunch' || line.label === 'Dinner'
        const subCat = isMeal
          ? (primDest || htlDest || 'Day ' + day.dayNumber)
          : (actToDestName[line.label] || primDest || 'Day ' + day.dayNumber)
        rekapDest.push({ no: 0, subCat, item: line.label, qty: line.quantity, unitCost: line.unitCost, total: line.total })
      }
    }
  }
  const rekapTransp = vehicleLines.map(l => ({ no: 0, subCat: l.label, item: l.detail, qty: l.quantity, unitCost: l.unitCost, total: l.total }))
  const rekapCrew  = crewLines.map(l  => ({ no: 0, subCat: l.label, item: l.detail, qty: l.quantity, unitCost: l.unitCost, total: l.total }))
  const rekapOther = otherLines.map(l => ({ no: 0, subCat: 'Additional', item: l.label, qty: l.quantity, unitCost: l.unitCost, total: l.total }))
  // Reassign sequential numbers in render order
  let n = 1
  for (const r of [...rekapAccom, ...rekapDest, ...rekapTransp, ...rekapCrew, ...rekapOther]) r.no = n++

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

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-cream">
      {/* Hero */}
      <div className="bg-navy text-white px-4 sm:px-6 py-6">
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
                    {day.routeDescription && (
                      <div className="bg-cream border border-ink/10 rounded-xl p-3 mb-1">
                        <p className="text-xs text-ink/70 italic leading-relaxed">&ldquo;{day.routeDescription}&rdquo;</p>
                      </div>
                    )}
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
