import { afterEach, describe, expect, it } from 'vitest'
import { defaultHomeMode, isHomeMode, readHomeMode, writeHomeMode } from './homeMode'

afterEach(() => {
  window.localStorage.clear()
})

describe('home mode', () => {
  it('starts phones on the classic home and larger screens on the full-screen office', () => {
    expect(defaultHomeMode(390)).toBe('classic')
    expect(defaultHomeMode(640)).toBe('classic')
    expect(defaultHomeMode(641)).toBe('office')
    expect(defaultHomeMode(1440)).toBe('office')
  })

  it('remembers the choice per person in this browser', () => {
    expect(readHomeMode('a')).toBeNull()
    writeHomeMode('a', 'classic')
    writeHomeMode('b', 'office')
    expect(readHomeMode('a')).toBe('classic')
    expect(readHomeMode('b')).toBe('office')
    window.localStorage.setItem('sqa.home-mode.c', 'grid')
    expect(readHomeMode('c')).toBeNull()
    expect(isHomeMode('office')).toBe(true)
    expect(isHomeMode('grid')).toBe(false)
  })
})
