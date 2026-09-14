export type ClassScheduleFormEntries = Record<string, string | undefined>

/**
 * Traduz o formulário para o contrato validado da agenda.
 * Campos vazios viram ausência; zero e string vazia não contam a mesma história
 * quando se está falando de vaga, data e professor.
 */
export function parseClassScheduleForm(entries: ClassScheduleFormEntries) {
  return {
    name: entries.name,
    description: entries.description ?? '',
    staffId: entries.staffId || undefined,
    weekday: entries.weekday,
    startTime: entries.startTime,
    durationMinutes: entries.durationMinutes,
    capacity: entries.capacity,
    room: entries.room ?? '',
    startsOn: entries.startsOn,
    endsOn: entries.endsOn || undefined,
    daysAhead: entries.daysAhead || 21,
  }
}
