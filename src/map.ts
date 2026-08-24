import type { Obj } from './types'

type DataType = 'dict' | 'record' | void

function checkType(item?: Obj, key?: string, labelField?: string): DataType {
  if (item && typeof item === 'object') {
    return (key && labelField) || ('value' in item && 'label' in item)
      ? 'dict'
      : key && key in item
      ? 'record'
      : undefined
  }
}

export function buildMap(list: Obj[], keyField?: string, labelField?: string) {
  const dataType = checkType(list?.[0], keyField, labelField)
  if (dataType && list.length > 0) {
    const map: Obj = Object.create(null)
    for (const item of list) {
      if (dataType === 'record') {
        const value = item[keyField as string]
        if (value !== undefined && value !== null) map[value] = item
      } else if (dataType === 'dict') {
        const key = item[keyField || 'value']
        const label = item[labelField || 'label']
        if (key !== undefined && key !== null) map[key] = label
      }
    }
    return map
  }
}
