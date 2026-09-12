import { describe, expect, it } from 'vitest'

import {
  formatDistance,
  formatDuration,
  formatPace,
  formatPaceDelta,
  formatRecordDistance,
  formatSpeed,
} from '@/features/synse-run/format'

describe('formatadores', () => {
  it('distância em quilômetro, com vírgula', () => {
    expect(formatDistance(5734)).toBe('5,73')
    expect(formatDistance(0)).toBe('0,00')
    expect(formatDistance(12_500, 1)).toBe('12,5')
  })

  it('duração ganha hora só quando passa de uma', () => {
    expect(formatDuration(1842)).toBe('30:42')
    expect(formatDuration(3742)).toBe('01:02:22')
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(-5)).toBe('00:00')
  })

  it('pace sem distância é travessão, não zero', () => {
    // 00:00 sugeriria velocidade infinita — é pior que admitir que não sabe.
    expect(formatPace(null)).toBe('--:--')
    expect(formatPace(0)).toBe('--:--')
    expect(formatPace(Infinity)).toBe('--:--')
    expect(formatPace(332)).toBe('05:32')
    expect(formatPace(3600)).toBe('60:00')
  })

  it('velocidade converte de m/s para km/h', () => {
    // O 3,6 que todo mundo esquece em algum lugar.
    expect(formatSpeed(3)).toBe('10,8')
    expect(formatSpeed(0)).toBe('0,0')
  })

  it('diferença de pace ignora variação irrelevante', () => {
    expect(formatPaceDelta(320, 332)).toBe('12s mais rápido')
    expect(formatPaceDelta(345, 332)).toBe('13s mais lento')
    expect(formatPaceDelta(333, 332)).toBeNull()
  })

  it('distâncias clássicas têm nome', () => {
    expect(formatRecordDistance(400)).toBe('400 m')
    expect(formatRecordDistance(1609)).toBe('1 milha')
    expect(formatRecordDistance(21097)).toBe('Meia maratona')
    expect(formatRecordDistance(42195)).toBe('Maratona')
    expect(formatRecordDistance(5000)).toBe('5 km')
  })
})
