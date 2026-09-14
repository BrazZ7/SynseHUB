/** Estado das server actions da agenda. */
export type ScheduleActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  createdId?: string
  generatedSessions?: number
}

export const initialScheduleState: ScheduleActionState = { status: 'idle' }
