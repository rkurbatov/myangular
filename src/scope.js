import { isEqual, cloneDeep } from 'lodash'

// Symbol is a reference value, as it equals only to itself.
// It is set as an initial watch value to distinct it from undefined
const INIT_WATCH_VALUE = Symbol('initial watch value')

class Scope {

  constructor () {
    this.$$watchers = []
    this.$$lastDirtyWatch = null // Required for digest loop optimization
  }

  $watch (watchFn, listenerFn = () => {}, valueEq = false) {
    const watcher = {
      watchFn,
      listenerFn,
      valueEq,
      last: INIT_WATCH_VALUE
    }
    this.$$watchers.push(watcher)
  }


  static $$areEqual (newValue, oldValue, valueEq) {
    if (valueEq) {
      return isEqual(newValue, oldValue)
    } else {
      return newValue === oldValue ||
             (Number.isNaN(newValue) && Number.isNaN(oldValue))
    }
  }

  $$digestOnce () {
    let dirtyFlag = false
    // Array#every allows short circuiting by return of false values
    this.$$watchers.every(watcher => {
      const newValue = watcher.watchFn(this)
      const oldValue = watcher.last
      if (!Scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
        this.$$lastDirtyWatch = watcher
        // We're preventing leakage of the initWatchVal out of scope
        // and sending newValue as on oldValue for the first digest
        const oldValueToPass = oldValue === INIT_WATCH_VALUE ? newValue : oldValue
        watcher.listenerFn(newValue, oldValueToPass, this)
        watcher.last = watcher.valueEq ? cloneDeep(newValue) : newValue
        dirtyFlag = true
      } else if (watcher === this.$$lastDirtyWatch) {
        // No need to run remaining watchers as we've just run last dirty of them
        return false
      }
      return true
    })
    return dirtyFlag
  }

  $digest () {
    let dirtyFlag
    let TTL = 10
    this.$$lastDirtyWatch = null
    do {
      dirtyFlag = this.$$digestOnce()
      if (dirtyFlag && !(TTL--)) throw new Error('Maximum $watch TTL exceeded')
    } while (dirtyFlag)
  }

}

export default Scope