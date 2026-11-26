// The only place the experiment flag is read. useExperiment records the exposure when this
// component renders, which happens only once the player presses Start and sees the evidence.

import { useExperiment } from '@flagsmith/flagsmith/react'
import type { Incident } from '../game/types.ts'
import { Chronological } from '../layouts/Chronological.tsx'
import { Grouped } from '../layouts/Grouped.tsx'
import { FLAG, LAYOUT_TREATMENT_VARIANT } from './config.ts'

export function ExperimentEvidence({ incident }: { incident: Incident }) {
  const flag = useExperiment(FLAG.layout)
  // Anything other than the treatment variant (control, missing flag) shows the control layout.
  return flag?.variant === LAYOUT_TREATMENT_VARIANT ? <Grouped incident={incident} /> : <Chronological incident={incident} />
}
