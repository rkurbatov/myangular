import { forEach, dropRight, last } from 'lodash'

export function createInjector(modulesToLoad, strictDi) {
  const cache = {}
  const loadedModules = {} // keeps map of loaded modules to prevent circular dependencies
  strictDi = strictDi === true // the value should be true, not just truthy

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
    const args = annotate(fn).map((token) => {
      if (typeof token === 'string') {
        // Provided locals can override injections (used by directives)
        return locals && locals.hasOwnProperty(token)
          ? locals[token]
          : cache[token]
      } else {
        throw 'Incorrect injection token! Expected a string, got ' + token
      }
    })
    if (Array.isArray(fn)) {
      fn = last(fn)
    }
    return fn.apply(self, args)
  }

  const annotate = (fn) => {
    if (Array.isArray(fn)) {
      // ['a', 'b', function (a, b) {}] case
      return dropRight(fn)
    } else if (fn.$inject) {
      // fn.$inject = ['a', 'b'] case
      return fn.$inject
    } else if (!fn.length) {
      // Non-annotated function without arguments
      return []
    } else {
      if (strictDi) {
        throw 'fn is not using explicit annotation and cannot be invoked in strict mode'
      }

      // Extracts arguments list out of function definition
      const FN_ARGS = /^function\s*[^(]*\(\s*([^)]*)\)/m
      // Removes surrounding whitespaces (and underscores like _a_ => a)
      const FN_ARG = /^\s*(_?)(\S+?)\1\s*$/
      // Strips two types of comments, multiline
      const STRIP_COMMENTS = /(\/\/.*$)|(\/\*.*?\*\/)/gm

      const source = fn.toString().replace(STRIP_COMMENTS, '')
      const argDeclaration = source.match(FN_ARGS)
      return argDeclaration[1]
        .split(',')
        .map((argName) => argName.match(FN_ARG)[2])
    }
  }

  // Used to inject constructor functions
  const instantiate = (Type, locals) => {
    const UnwrappedType = Array.isArray(Type) ? last(Type) : Type
    const instance = Object.create(UnwrappedType.prototype)
    invoke(Type, instance, locals)
    return instance
  }

  return {
    has: (key) => cache.hasOwnProperty(key),
    get: (key) => cache[key],
    invoke,
    annotate,
    instantiate,
  }
}
