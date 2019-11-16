import { isEqual, forEachRight, cloneDeep } from "lodash";

// Symbol is a reference value, as it equals only to itself.
// It is set as an initial watch value to distinct it from undefined
const INIT_WATCH_VALUE = Symbol("initial watch value");

class Scope {
  constructor() {
    this.$$watchers = [];
    this.$$lastDirtyWatch = null; // Required for digest loop optimization
    this.$$asyncQueue = [];
  }

  $watch(watchFn, listenerFn = () => {}, valueEq = false) {
    const watcher = {
      watchFn,
      listenerFn,
      valueEq,
      last: INIT_WATCH_VALUE
    };
    // New watcher is added at the beginning and whole watchers array is
    // proceed from the end (forEachRight), that helps skip running already run watchers
    // when on of them is removed during digest.
    this.$$watchers.unshift(watcher);

    return () => {
      const index = this.$$watchers.indexOf(watcher);
      if (index >= 0) {
        this.$$watchers.splice(index, 1);
        this.$$lastDirtyWatch = null; // Watchers order is changed during removal
        // so we disable short-circuit optimization here.
      }
    };
  }

  static $$areEqual(newValue, oldValue, valueEq) {
    if (valueEq) {
      return isEqual(newValue, oldValue);
    } else {
      return (
        newValue === oldValue ||
        (Number.isNaN(newValue) && Number.isNaN(oldValue))
      );
    }
  }

  $$digestOnce() {
    let dirtyFlag = false;
    // Array#every allows short circuiting by return of false values
    forEachRight(this.$$watchers, watcher => {
      if (!watcher) return false; // Watcher was removed in some other watcher, we should skip
      try {
        const newValue = watcher.watchFn(this);
        const oldValue = watcher.last;
        if (!Scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
          this.$$lastDirtyWatch = watcher;
          // We're preventing leakage of the initWatchVal out of scope
          // and sending newValue as on oldValue for the first digest
          const oldValueToPass =
            oldValue === INIT_WATCH_VALUE ? newValue : oldValue;
          watcher.listenerFn(newValue, oldValueToPass, this);
          watcher.last = watcher.valueEq ? cloneDeep(newValue) : newValue;
          dirtyFlag = true;
        } else if (watcher === this.$$lastDirtyWatch) {
          // No need to run remaining watchers as we've just run last dirty of them.
          // Returning 'false' value stops forEach cycle.
          return false;
        }
      } catch (err) {
        console.error(err);
      }
    });
    return dirtyFlag;
  }

  $digest() {
    let dirtyFlag;
    let TTL = 10;
    this.$$lastDirtyWatch = null;
    do {
      while (this.$$asyncQueue.length) {
        const asyncTask = this.$$asyncQueue.shift();
        asyncTask.scope.$eval(asyncTask.expression);
      }
      dirtyFlag = this.$$digestOnce();
      TTL -= 1;
      if ((dirtyFlag || this.$$asyncQueue.length) && !TTL)
        throw new Error("Maximum $watch TTL exceeded");
    } while (dirtyFlag || this.$$asyncQueue.length);
  }

  $eval(expr, locals) {
    return expr(this, locals);
  }

  $apply(expr) {
    try {
      return this.$eval(expr);
    } finally {
      this.$digest();
    }
  }

  $evalAsync(expr) {
    this.$$asyncQueue.push({ scope: this, expression: expr });
  }
}

export default Scope;
