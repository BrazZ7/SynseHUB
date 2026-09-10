/** Estado das server actions de check-in. */
export type CheckInState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  studentName?: string
}

export const initialCheckInState: CheckInState = { status: 'idle' }
