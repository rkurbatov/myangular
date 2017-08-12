import { isEqual, cloneDeep } from 'lodash'

const Scope = function () {
  this.$$watchers = []
  this.$$lastDirtyWatch = null // Required for digest loop optimization
}

// Function is a reference value, as it equals only to itself.
// It is set as an initial watch value to distinct it from undefined
const initWatchVal = () => {}

Scope.prototype.$watch = function(watchFn, listenerFn = () => {}, valueEq = false) {
  const watcher = {
    watchFn,
    listenerFn,
    valueEq,
    last: initWatchVal
  }
  this.$$watchers.push(watcher)
}

Scope.prototype.$$areEqual = function (newValue, oldValue, valueEq) {
  if (valueEq) {
    return isEqual(newValue, oldValue)
  } else {
    return (Number.isNaN(newValue) && Number.isNaN(oldValue)) || newValue === oldValue
  }
}

Scope.prototype.$$digestOnce = function () {
  let dirty
  // Array#every allows short circuiting by return of false values
  this.$$watchers.every(watcher => {
    const newValue = watcher.watchFn(this)
    const oldValue = watcher.last
    if (!this.$$areEqual(newValue, oldValue, watcher.valueEq)) {
      this.$$lastDirtyWatch = watcher
      // We're preventing leakage of the initWatchVal out of scope
      // and sending newValue as on oldValue for the first digest
      const oldValueToPass = oldValue === initWatchVal ? newValue : oldValue
      watcher.listenerFn(newValue, oldValueToPass, this)
      watcher.last = watcher.valueEq ? cloneDeep(newValue) : newValue
      dirty = true
    } else if (watcher === this.$$lastDirtyWatch) {
      // No need to run remaining watchers as we've just run last dirty of them
      return false
    }
    return true
  })
  return dirty
}

Scope.prototype.$digest = function () {
  let dirty
  let TTL = 10
  this.$$lastDirtyWatch = null
  do {
    dirty = this.$$digestOnce()
    if (dirty && !(TTL--)) throw new Error('Maximum $watch TTL exceeded')
  } while (dirty)
}

export default Scope