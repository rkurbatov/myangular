import { isObject } from 'lodash'

import { filterFilter } from './filterFilter'

const filters = {}

export function register(name, factory) {
  if (isObject(name)) {
    for (const [key, value] of Object.entries(name)) {
      filters[key] = register(key, value)
    }
  } else {
    const filter = factory()
    filters[name] = filter
    return filter
  }
}

export function filter(name) {
  return filters[name]
}

register('filter', filterFilter)
