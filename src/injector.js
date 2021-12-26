import { forEach, dropRight } from 'lodash'

export function createInjector(modulesToLoad) {
  const cache = {}
  const loadedModules = {} // keeps map of loaded modules to prevent circular dependencies

  const $provide = {
    constant: function (key, value) {
      if (key === 'hasOwnProperty') {
        throw '"hasOwnProperty" is not a valid constant name'
      }

      cache[key] = value
    },
  }

  // Recursive function to load module and all of its dependencies
  const loadModule = (moduleName) => {
    if (loadedModules.hasOwnProperty(moduleName)) return

    const module = window.angular.module(moduleName)
    loadedModules[moduleName] = true

    forEach(module.requires, loadModule)
    forEach(module._invokeQueue, ([method, args]) => {
      $provide[method].apply($provide, args)
    })
  }

  forEach(modulesToLoad, loadModule)

  // Applies injected arguments to the provided function
  const invoke = (fn, self, locals) => {
    const args = (fn.$inject || []).map((token) => {
      if (typeof token === 'string') {
        // Provided locals can override injections (used by directives)
        return locals && locals.hasOwnProperty(token)
          ? locals[token]
          : cache[token]
      } else {
        throw 'Incorrect injection token! Expected a string, got ' + token
      }
    })
    return fn.apply(self, args)
  }

  const annotate = (fn) => {
    if (Array.isArray(fn)) {
      // ['a', 'b', function (a, b) {}] case
      return dropRight(fn)
    } else if (fn.$inject) {
      // fn.$inject = ['a', 'b'] case
      return fn.$inject
    } else {
      return []
    }
  }

  return {
    has: (key) => cache.hasOwnProperty(key),
    get: (key) => cache[key],
    invoke,
    annotate,
  }
}
