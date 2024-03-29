import {
  isEqual,
  isObject,
  forEach,
  forEachRight,
  forOwn,
  clone,
  cloneDeep,
} from 'lodash'

import { parse } from '../parse'
import { simpleCompare } from '../helpers'

// Symbol is a reference value, as it equals only to itself.
// It is set as an initial watch value to distinct it from undefined
const INIT_WATCH_VALUE = Symbol('initial watch value')

export class Scope {
  constructor() {
    this.$root = this // Makes root scope available to every child scope
    this.$$children = [] // Child scopes (will be shadowed for every new scope)
    this.$$watchers = []
    this.$$lastDirtyWatch = null // Required for digest loop optimization
    this.$$asyncQueue = []
    this.$$applyAsyncQueue = []
    this.$$applyAsyncId = null // Set if applyAsync timeout has been scheduled ($root only)
    this.$$postDigestQueue = []
    this.$$listeners = {}
    this.$$phase = null // "$digest" | "$apply" | null
  }

  // $watch function attaches watcher to the scope
  // watchFn - is the function taking the scope as an argument and returning value we should watch
  // listenerFn - is the function that is called on data change
  // valueEq — should we use shallow equality check instead of reference check
  $watch(watchFn, listenerFn = () => {
  }, valueEq = false) {
    const parsedWatchFn = parse(watchFn)

    if (parsedWatchFn.$$watchDelegate) {
      // Bypass normal watch creation and delegate it to the expression
      return parsedWatchFn.$$watchDelegate(
        this,
        listenerFn,
        valueEq,
        parsedWatchFn,
      )
    }

    const watcher = {
      watchFn: parsedWatchFn,
      listenerFn,
      valueEq,
      last: INIT_WATCH_VALUE,
    }
    // New watcher is added at the beginning and whole watchers array is
    // proceed from the end (forEachRight), that helps skip running already run watchers
    // when on of them is removed during digest.
    this.$$watchers.unshift(watcher)
    this.$root.$$lastDirtyWatch = null
    return () => {
      const index = this.$$watchers.indexOf(watcher)
      if (index >= 0) {
        this.$$watchers.splice(index, 1)
        this.$root.$$lastDirtyWatch = null
        // Watchers order is changed during removal
        // so we disable short-circuit optimization here.
      }
    }
  }

  static $$areEqual (newValue, oldValue, valueEq) {
    return valueEq ?
      isEqual(newValue, oldValue) // shallow equality
      : simpleCompare(newValue, oldValue) // simple equality
  }

  static $$isArrayLike(item) {
    return (
      Array.isArray(item) ||
      (!!item &&
        typeof item === 'object' &&
        item.hasOwnProperty('length') &&
        typeof item.length === 'number' &&
        (item.length === 0 || (item.length > 0 && item.length - 1 in item)))
    )
  }

  // Recursively calls the fn function for every scope in the hierarchy until it returns false.
  $$everyScope(fn) {
    return fn(this)
      ? this.$$children.every((child) => child.$$everyScope(fn))
      : false
  }

  $$digestOnce() {
    let dirtyFlag = false
    let continueLoop = true

    this.$$everyScope((scope) => {
      // Reverse order allows to have watchers removed during the digest cycle without skipping
      forEachRight(scope.$$watchers, (watcher) => {
        try {
          if (watcher) {
            // Watcher could be removed by other watcher
            const newValue = watcher.watchFn(scope)
            const oldValue = watcher.last
            if (!Scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
              scope.$root.$$lastDirtyWatch = watcher
              // We're preventing leakage of the initWatchVal out of scope
              // and sending newValue as on oldValue for the first digest
              const oldValueToPass =
                oldValue === INIT_WATCH_VALUE ? newValue : oldValue
              watcher.listenerFn(newValue, oldValueToPass, scope)
              watcher.last = watcher.valueEq ? cloneDeep(newValue) : newValue
              dirtyFlag = true
            } else if (watcher === this.$root.$$lastDirtyWatch) {
              continueLoop = false
              // No need to run remaining watchers as we've just run last dirty of them.
              // Returning 'false' value stops forEach cycle.
              return false
            }
          }
        } catch (err) {
          console.error(err)
        }
      })
      return continueLoop
    })
    return dirtyFlag
  }

  // Starts digest cycle
  $digest() {
    let dirtyFlag
    let TTL = 10
    this.$root.$$lastDirtyWatch = null
    this.$beginPhase('$digest')

    // Immediately flush applyAsync queue
    if (this.$root.$$applyAsyncId) {
      clearTimeout(this.$root.$$applyAsyncId)
      this.$$flushApplyAsync()
    }

    do {
      while (this.$$asyncQueue.length) {
        try {
          const asyncTask = this.$$asyncQueue.shift()
          asyncTask.scope.$eval(asyncTask.expression)
        } catch (err) {
          console.error(err)
        }
      }
      dirtyFlag = this.$$digestOnce()
      TTL -= 1
      if ((dirtyFlag || this.$$asyncQueue.length) && TTL === 0) {
        this.$clearPhase()
        throw new Error('Maximum $watch TTL exceeded')
      }
    } while (dirtyFlag || this.$$asyncQueue.length)
    this.$clearPhase()

    while (this.$$postDigestQueue.length) {
      try {
        this.$$postDigestQueue.shift()()
      } catch (err) {
        console.error(err)
      }
    }
  }

  // Executes the code in context of scope
  $eval(expr, locals) {
    const parsedExpr = parse(expr)
    return parsedExpr(this, locals)
  }

  // Executes the function in context of scope and starts digest.
  // Used for library integrations. Digest starts from the root scope recursively.
  $apply(expr) {
    try {
      this.$beginPhase('$apply')
      return this.$eval(expr)
    } finally {
      this.$clearPhase()
      this.$root.$digest()
    }
  }

  // Deferred execution of the function but guaranteed during the current digest cycle.
  // If there is no digest, the one is started. Digest starts from the root scope recursively.
  $evalAsync(expr) {
    if (!this.$$phase && !this.$$asyncQueue.length) {
      setTimeout(() => {
        if (this.$$asyncQueue.length) {
          this.$root.$digest()
        }
      }, 0)
    }
    this.$$asyncQueue.push({ scope: this, expression: expr })
  }

  // Deferred execution of the function but guaranteed during the next digest cycle.
  // Optimizes quick succession of events running all of them in one digest, should be used
  // instead of several applies in a row.
  $applyAsync(expr) {
    this.$$applyAsyncQueue.push(() => {
      this.$eval(expr)
    })
    if (this.$root.$$applyAsyncId === null) {
      this.$root.$$applyAsyncId = setTimeout(() => {
        this.$apply(this.$$flushApplyAsync.bind(this))
      }, 0)
    }
  }

  $$flushApplyAsync() {
    while (this.$$applyAsyncQueue.length) {
      try {
        this.$$applyAsyncQueue.shift()()
      } catch (err) {
        console.error(err)
      }
    }
    this.$root.$$applyAsyncId = null
  }

  $beginPhase(phase) {
    if (this.$$phase) {
      throw this.$$phase + ' already in progress.'
    }
    this.$$phase = phase
  }

  $clearPhase() {
    this.$$phase = null
  }

  // Puts the function to be executed after the next digest cycle without running the digest.
  $$postDigest(fn) {
    this.$$postDigestQueue.push(fn)
  }

  // Watch the group of values to change, apply single listener function.
  $watchGroup(watchFns, listenerFn) {
    const newValues = new Array(watchFns.length)
    const oldValues = new Array(watchFns.length)

    let changeReactionScheduled = false // The flag signalling listener is scheduled already
    let firstRun = true

    // Early return on empty watchers array
    if (watchFns.length === 0) {
      let shouldCall = true
      this.$evalAsync(() => {
        if (shouldCall) {
          listenerFn(newValues, newValues, this)
        }
      })
      return () => {
        shouldCall = false
      }
    }

    const watchGroupListener = () => {
      if (firstRun) {
        firstRun = false
        // Pass newValues as oldValues for the first run
        listenerFn(newValues, newValues, this)
      } else {
        listenerFn(newValues, oldValues, this)
      }
      changeReactionScheduled = false
    }

    const destroyFns = watchFns.map((watchFn, i) =>
      this.$watch(watchFn, (newValue, oldValue) => {
        newValues[i] = newValue
        oldValues[i] = oldValue
        if (!changeReactionScheduled) {
          changeReactionScheduled = true
          this.$evalAsync(watchGroupListener)
        }
      }),
    )

    return () => {
      destroyFns.forEach((destroyFn) => destroyFn())
    }
  }

  // Watches collection changes — intermediate between watch and watch with shallow equality
  $watchCollection(watchFn, listenerFn) {
    let newValue
    let oldValue
    let oldLength // Keep length of old object value to prevent non-required object iterations
    let veryOldValue // Non-modified version of newValue for listener
    let trackVeryOldValue = listenerFn.length > 1 // Listener is called with 2 or 3 args: newVal, oldVal, scope
    let changeCount = 0 // counter inside watchFn closure increases on every detected change
    let firstRun = true

    const parsedWatchFn = parse(watchFn)

    const internalWatchFn = (scope) => {
      let newLength
      newValue = parsedWatchFn(scope)
      if (isObject(newValue)) {
        if (Scope.$$isArrayLike(newValue)) {
          if (!Array.isArray(oldValue)) {
            changeCount++
            oldValue = []
          }
          if (newValue.length !== oldValue.length) {
            changeCount++
            oldValue.length = newValue.length
          }
          // LoDash #forEach supports array-like objects
          forEach(newValue, (newItem, i) => {
            const bothNaN = Number.isNaN(newItem) && Number.isNaN(oldValue[i])
            if (!bothNaN && oldValue[i] !== newItem) {
              changeCount++
              oldValue[i] = newItem
            }
          })
        } else {
          if (!isObject(oldValue) || Scope.$$isArrayLike(oldValue)) {
            changeCount++
            oldValue = {}
            oldLength = 0
          }
          newLength = 0
          forOwn(newValue, (newVal, key) => {
            newLength++
            if (oldValue.hasOwnProperty(key)) {
              const bothNaN =
                Number.isNaN(newVal) && Number.isNaN(oldValue[key])
              if (!bothNaN && newVal !== oldValue[key]) {
                changeCount++
                oldValue[key] = newVal
              }
            } else {
              changeCount++
              oldLength++
              oldValue[key] = newVal
            }
          })
          if (oldLength > newLength) {
            changeCount++
            forOwn(oldValue, (oldVal, key) => {
              if (!newValue.hasOwnProperty(key)) {
                oldLength--
                changeCount++
                delete oldValue[key]
              }
            })
          }
        }
      } else {
        if (!Scope.$$areEqual(oldValue, newValue, false)) {
          changeCount++
        }
        oldValue = newValue
      }
      return changeCount // $watch call will compare old and new counter on every collection change
    }
    const internalListenerFn = () => {
      if (firstRun) {
        firstRun = false
        listenerFn(newValue, newValue, this)
      } else {
        listenerFn(newValue, veryOldValue, this)
      }
      if (trackVeryOldValue) {
        veryOldValue = clone(newValue)
      }
    }

    return this.$watch(internalWatchFn, internalListenerFn)
  }

  // Creates the parent scope. If isolate is true the scope will be isolated
  // (no parent values sharing, no parent watch).
  $new(isolate, parent = this) {
    let child

    if (isolate) {
      child = new Scope()
      child.$root = parent.$root // Required for $apply and $evalAsync to work (still recursively)
      child.$$asyncQueue = parent.$$asyncQueue // Even isolated scopes share the same queues
      child.$$postDigestQueue = parent.$$postDigestQueue
      child.$$applyAsyncQueue = parent.$$applyAsyncQueue
    } else {
      const ChildScope = class {
      }
      // Class cannot extend object (this) so we need to set prototype explicitly
      Object.setPrototypeOf(ChildScope.prototype, this)

      child = new ChildScope()
    }

    child.$parent = parent
    child.$$watchers = [] // Child scope should have its own watchers, children and listeners
    child.$$children = [] // so we are shadowing parent's value
    child.$$listeners = {}
    parent.$$children.push(child)
    return child
  }

  $destroy() {
    if (this === this.$root) return // Don't destroy root scope
    const siblings = this.$parent.$$children
    const indexOfThis = siblings.indexOf(this)
    if (indexOfThis >= 0) {
      this.$broadcast('$destroy')
      siblings.splice(indexOfThis, 1)
    }
    this.$$watchers = null
    this.$$listeners = {}
  }

  // Fills the map of event handlers for the current scope.
  $on(eventName, listener) {
    if (this.$$listeners[eventName]) {
      this.$$listeners[eventName].push(listener)
    } else {
      this.$$listeners[eventName] = [listener]
    }
    // Returns the destroyer function
    return () => {
      const index = this.$$listeners[eventName].indexOf(listener)
      // Mark listener as null in case one of the listeners removes another one.
      // Array splicing will be done in fireEventOnScope function.
      if (index >= 0) {
        this.$$listeners[eventName][index] = null
      }
    }
  }

  // All scopes upwards till the root scope receive events.
  // Propagation can be stopped.
  $emit(eventName, ...rest) {
    let propagationStopped = false
    const event = {
      name: eventName,
      targetScope: this,
      stopPropagation: () => {
        propagationStopped = true
      },
      preventDefault: () => {
        event.defaultPrevented = true
      },
    }
    let scope = this
    do {
      event.currentScope = scope
      scope.$$fireEventOnScope(eventName, event, ...rest)
      scope = scope.$parent
    } while (scope && !propagationStopped)
    event.currentScope = null
    return event
  }

  // Broadcast is expensive as broadcasted events cannot be stopped.
  // All scopes beneath receive events recursively.
  $broadcast(eventName, ...rest) {
    const event = {
      name: eventName,
      targetScope: this,
      preventDefault: () => {
        event.defaultPrevented = true
      },
    }
    this.$$everyScope((scope) => {
      event.currentScope = scope
      scope.$$fireEventOnScope(eventName, event, ...rest)
      return true
    })
    event.currentScope = null
    return event
  }

  $$fireEventOnScope(eventName, event, ...rest) {
    const listeners = this.$$listeners[eventName] || []
    let i = 0

    while (i < listeners.length) {
      if (listeners[i] === null) {
        listeners.splice(i, 1)
      } else {
        try {
          listeners[i](event, ...rest)
        } catch (err) {
          console.error(err)
        }
        i++
      }
    }
  }
}
