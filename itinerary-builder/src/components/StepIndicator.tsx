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
              step.id === currentStep ? 'text-orange' : step.id < currentStep ? 'text-lime' : 'text-navy-muted'
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
