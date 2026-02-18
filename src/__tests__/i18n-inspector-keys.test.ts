import { describe, it, expect } from 'vitest'
import en from '../locales/en.json'
import zhCN from '../locales/zh-CN.json'

describe('i18n Inspector Keys Parity', () => {
  const getKeys = (obj: any, prefix = ''): string[] => {
    return Object.keys(obj).reduce((res: string[], el) => {
      if (Array.isArray(obj[el])) {
        return res
      } else if (typeof obj[el] === 'object' && obj[el] !== null) {
        return [...res, ...getKeys(obj[el], prefix + el + '.')]
      }
      return [...res, prefix + el]
    }, [])
  }

  it('should have parity for inspector namespace', () => {
    const enInspectorKeys = getKeys((en as any).inspector || {}).sort()
    const zhInspectorKeys = getKeys((zhCN as any).inspector || {}).sort()

    expect(enInspectorKeys).toEqual(zhInspectorKeys)
  })

  it('should have specific required inspector keys', () => {
    const enInspectorKeys = getKeys((en as any).inspector || {})
    const requiredKeys = [
      'title',
      'longText',
      'citations',
      'noCitations',
      'attachments',
      'fileNotAvailable',
      'ai.title',
      'ai.active'
    ]

    requiredKeys.forEach(key => {
      expect(enInspectorKeys).toContain(key)
    })
  })
})
