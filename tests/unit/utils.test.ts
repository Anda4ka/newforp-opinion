import { describe, it, expect } from 'vitest'
import { 
  noAsYes, 
  marketPrice, 
  priceChangePct, 
  determineUnderpriced,
  isValidPrice,
  safeDivide,
  parsePrice,
  hoursUntil
} from '@/lib/utils'

describe('Utility Functions', () => {
  describe('noAsYes', () => {
    it('should convert NO price to YES equivalent', () => {
      expect(noAsYes(0.3)).toBeCloseTo(0.7, 10)
      expect(noAsYes(0.8)).toBeCloseTo(0.2, 10)
      expect(noAsYes(0)).toBe(1)
      expect(noAsYes(1)).toBe(0)
    })
  })

  describe('marketPrice', () => {
    it('should calculate market price correctly', () => {
      expect(marketPrice(0.6, 0.3)).toBeCloseTo(0.65, 10) // (0.6 + 0.7) / 2
      expect(marketPrice(0.5, 0.5)).toBe(0.5)  // (0.5 + 0.5) / 2
    })
  })

  describe('priceChangePct', () => {
    it('should calculate price change percentage', () => {
      expect(priceChangePct(1.1, 1.0)).toBeCloseTo(0.1, 10)
      expect(priceChangePct(0.9, 1.0)).toBeCloseTo(-0.1, 10)
    })

    it('should handle zero division', () => {
      expect(priceChangePct(1.0, 0)).toBe(0)
    })
  })



  describe('determineUnderpriced', () => {
    it('should determine underpriced token', () => {
      expect(determineUnderpriced(0.4, 0.5)).toBe('YES_UNDERPRICED') // 0.4 < (1 - 0.5)
      expect(determineUnderpriced(0.6, 0.3)).toBe('YES_UNDERPRICED')  // 0.6 < (1 - 0.3) = 0.7
    })
  })

  describe('isValidPrice', () => {
    it('should validate prices correctly', () => {
      expect(isValidPrice(0.5)).toBe(true)
      expect(isValidPrice(0)).toBe(true)
      expect(isValidPrice(-1)).toBe(false)
      expect(isValidPrice(NaN)).toBe(false)
      expect(isValidPrice(Infinity)).toBe(false)
    })
  })

  describe('safeDivide', () => {
    it('should perform safe division', () => {
      expect(safeDivide(10, 2)).toBe(5)
      expect(safeDivide(10, 0)).toBe(0)
      expect(safeDivide(10, 0, -1)).toBe(-1)
    })
  })

  describe('parsePrice', () => {
    it('should parse valid price strings', () => {
      expect(parsePrice('0.5')).toBe(0.5)
      expect(parsePrice('1.23')).toBe(1.23)
    })

    it('should handle invalid price strings', () => {
      expect(parsePrice('invalid')).toBe(0)
      expect(parsePrice('')).toBe(0)
    })
  })

  describe('hoursUntil', () => {
    it('should calculate hours until timestamp', () => {
      const now = Date.now() / 1000
      const oneHourLater = now + 3600
      expect(hoursUntil(oneHourLater)).toBeCloseTo(1, 2)
    })
  })
})