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
