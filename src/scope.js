import { isEqual, forEachRight, cloneDeep } from "lodash";

// Symbol is a reference value, as it equals only to itself.
// It is set as an initial watch value to distinct it from undefined
const INIT_WATCH_VALUE = Symbol("initial watch value");

class Scope {
  constructor() {
    this.$$watchers = [];
    this.$$lastDirtyWatch = null; // Required for digest loop optimization
    this.$$asyncQueue = [];
    this.$$applyAsyncQueue = [];
    this.$$applyAsyncId = null; // Set if applyAsync timeout has been scheduled
    this.$$phase = null; // "$digest" | "$apply" | null
  }

  // $watch function attaches watcher to the scope
  // watchFn - is the function taking the scope as an argument and returning value we should watch
  // listenerFn - is the function that is called on data change
  // valueEq — should we use shallow equality check instead of reference check
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

  // Starts digest cycle
  $digest() {
    let dirtyFlag;
    let TTL = 10;
    this.$$lastDirtyWatch = null;
    this.$beginPhase("$digest");

    // Immediately flush applyAsync queue
    if (this.$$applyAsyncId) {
      clearTimeout(this.$$applyAsyncId);
      this.$$flushApplyAsync();
    }

    do {
      while (this.$$asyncQueue.length) {
        const asyncTask = this.$$asyncQueue.shift();
        asyncTask.scope.$eval(asyncTask.expression);
      }
      dirtyFlag = this.$$digestOnce();
      TTL--;
      if ((dirtyFlag || this.$$asyncQueue.length) && !TTL) {
        this.$clearPhase();
        throw new Error("Maximum $watch TTL exceeded");
      }
    } while (dirtyFlag || this.$$asyncQueue.length);
    this.$clearPhase();
  }

  // Executes the code in context of scope
  $eval(expr, locals) {
    return expr(this, locals);
  }

  // Executes the function in context of scope and starts digest.
  // Used for library integrations.
  $apply(expr) {
    try {
      this.$beginPhase("$apply");
      return this.$eval(expr);
    } finally {
      this.$clearPhase();
      this.$digest();
    }
  }

  // Deferred execution of the function but guaranteed during the current digest cycle.
  // If there is no digest, the one is started.
  $evalAsync(expr) {
    if (!this.$$phase && !this.$$asyncQueue.length) {
      setTimeout(() => {
        if (this.$$asyncQueue.length) {
          this.$digest();
        }
      }, 0);
    }
    this.$$asyncQueue.push({ scope: this, expression: expr });
  }

  // Deferred execution of the function but guaranteed during the next digest cycle.
  // Optimizes quick succession of events running all of them in one digest, should be used
  // instead of several applies in a row.
  $applyAsync(expr) {
    this.$$applyAsyncQueue.push(() => {
      this.$eval(expr);
    });
    if (this.$$applyAsyncId === null) {
      this.$$applyAsyncId = setTimeout(() => {
        this.$apply(this.$$flushApplyAsync.bind(this));
      }, 0);
    }
  }

  $$flushApplyAsync() {
    while (this.$$applyAsyncQueue.length) {
      this.$$applyAsyncQueue.shift()();
    }
    this.$$applyAsyncId = null;
  }

  $beginPhase(phase) {
    if (this.$$phase) {
      throw this.$$phase + " already in progress.";
    }
    this.$$phase = phase;
  }

  $clearPhase() {
    this.$$phase = null;
  }
}

export default Scope;
