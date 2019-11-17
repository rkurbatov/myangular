import { range, times } from "lodash";

import Scope from "../src/scope";

describe("Scope", () => {
  it("can be constructed and used as an object", () => {
    const scope = new Scope();
    scope.aProperty = 1;

    expect(scope.aProperty).toBe(1);
  });

  describe("digest", () => {
    let scope;

    beforeEach(() => {
      scope = new Scope();
    });

    it("calls the listener function of a watch on first $digest", () => {
      const watchFn = () => "wat";
      const listenerFn = jasmine.createSpy();

      scope.$watch(watchFn, listenerFn);
      scope.$digest();

      expect(listenerFn).toHaveBeenCalled();
    });

    it("calls the watch function with the scope as the argument", () => {
      const watchFn = jasmine.createSpy();
      const listenerFn = () => {};

      scope.$watch(watchFn, listenerFn);
      scope.$digest();

      expect(watchFn).toHaveBeenCalledWith(scope);
    });

    it("calls the listener function when the watched value changes", () => {
      scope.someValue = "a";
      scope.counter = 0;

      scope.$watch(
        scope => scope.someValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );

      expect(scope.counter).toBe(0);
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.someValue = "b";
      expect(scope.counter).toBe(1);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it("calls listener when watch value is first undefined", () => {
      scope.counter = 0;

      scope.$watch(
        scope => scope.someValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();

      expect(scope.counter).toBe(1);
    });

    it("calls listener with new value as old value for the first time", () => {
      scope.someValue = 123;
      let oldValueGiven;

      scope.$watch(
        scope => scope.someValue,
        (newValue, oldValue, scope) => {
          oldValueGiven = oldValue;
        }
      );
      scope.$digest();

      expect(oldValueGiven).toBe(123);
    });

    it("may have watchers that omit the listener functions", () => {
      const watchFn = jasmine.createSpy().and.returnValue("something");
      scope.$watch(watchFn);
      scope.$digest();
      expect(watchFn).toHaveBeenCalled();
    });

    it("triggers chained watchers in the same digest", () => {
      scope.name = "Jane";

      scope.$watch(
        scope => scope.nameUpper,
        (newValue, oldValue, scope) => {
          if (newValue) {
            scope.initial = newValue.substring(0, 1) + ".";
          }
        }
      );

      scope.$watch(
        scope => scope.name,
        (newValue, oldValue, scope) => {
          if (newValue) {
            scope.nameUpper = newValue.toUpperCase();
          }
        }
      );

      scope.$digest();
      expect(scope.initial).toBe("J.");

      scope.name = "Bob";
      scope.$digest();
      expect(scope.initial).toBe("B.");
    });

    it("gives up on the watches after 10 iterations", () => {
      scope.counterA = 0;
      scope.counterB = 0;

      scope.$watch(
        scope => scope.counterA,
        (newValue, oldValue, scope) => {
          scope.counterB++;
        }
      );

      scope.$watch(
        scope => scope.counterB,
        (newValue, oldValue, scope) => {
          scope.counterA++;
        }
      );

      expect(() => scope.$digest()).toThrow();
    });

    it("ends up the digest when the last watch is clean", () => {
      scope.array = range(100);
      let watchExecutions = 0;

      times(100, i => {
        scope.$watch(
          scope => {
            watchExecutions++;
            return scope.array[i];
          },
          () => {}
        );
      });

      scope.$digest();
      expect(watchExecutions).toBe(200);

      scope.array[0] = 420;
      scope.$digest();
      expect(watchExecutions).toBe(301);
    });

    it("compares based on values if enabled", () => {
      scope.aValue = [1, 2, 3];
      scope.counter = 0;

      scope.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        },
        true
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.aValue.push(4);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it("correctly handles NaNs", () => {
      scope.number = 0 / 0; //NaN
      scope.counter = 0;

      scope.$watch(
        scope => scope.number,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it("catches exceptions in watch function and continues", () => {
      scope.aValue = "abc";
      scope.counter = 0;

      scope.$watch(
        scope => {
          throw "Error";
        },
        (newValue, oldValue, scope) => {}
      );
      scope.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it("catches exception in listener function and continues", () => {
      scope.aValue = "abc";
      scope.counter = 0;

      scope.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          throw "Error";
        }
      );
      scope.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it("allows destroying a $watch with a removal function", () => {
      scope.aValue = "abc";
      scope.counter = 0;

      const destroyWatch = scope.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.aValue = "def";
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.aValue = "ghi";
      destroyWatch();
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it("allows destrotying $watch during digest", () => {
      scope.aValue = "abc";

      let watchCalls = [];

      scope.$watch(scope => {
        watchCalls.push("first");
        return scope.aValue;
      });

      const destroyWatch = scope.$watch(scope => {
        watchCalls.push("second");
        destroyWatch();
      });

      scope.$watch(scope => {
        watchCalls.push("third");
        return scope.aValue;
      });

      scope.$digest();
      expect(watchCalls).toEqual([
        "first",
        "second",
        "third",
        "first",
        "third"
      ]);
    });

    it("allows a $watch to destroy another during digest", () => {
      scope.aValue = "abc";
      scope.counter = 0;

      scope.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          destroyWatch();
        }
      );

      const destroyWatch = scope.$watch(
        scope => {},
        (newValue, oldValue, scope) => {}
      );

      scope.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it("allows destroying several $watches during digest", () => {
      scope.aValue = "abc";
      scope.counter = 0;

      const destroyWatch1 = scope.$watch(scope => {
        destroyWatch1();
        destroyWatch2();
      });

      const destroyWatch2 = scope.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(0);
    });
  });

  describe("$eval", () => {
    let scope;

    beforeEach(() => {
      scope = new Scope();
    });

    it("executes $eval'ed function an returns result", () => {
      scope.aValue = 42;

      const result = scope.$eval(scope => scope.aValue);
      expect(result).toBe(42);
    });

    it("passes the second $eval argument straight through", () => {
      scope.aValue = 42;

      const result = scope.$eval((scope, arg) => scope.aValue + arg, 2);
      expect(result).toBe(44);
    });
  });

  describe("$apply", () => {
    let scope;

    beforeEach(() => {
      scope = new Scope();
    });

    it("executes the given function and starts the digest", () => {
      scope.aValue = "someValue";
      scope.counter = 0;

      scope.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.$apply(scope => (scope.aValue = "someOtherValue"));
      expect(scope.counter).toBe(2);
    });
  });

  describe("$evalAsync", () => {
    let scope;

    beforeEach(() => {
      scope = new Scope();
    });

    it("executes given function later in the same cycle", () => {
      scope.aValue = [1, 2, 3];
      scope.asyncEvaluated = false;
      scope.asyncEvaluatedImmediately = false;

      scope.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.$evalAsync(scope => {
            scope.asyncEvaluated = true;
          });
          scope.asyncEvaluatedImmediately = scope.asyncEvaluated;
        }
      );

      scope.$digest();
      expect(scope.asyncEvaluated).toBeTruthy();
      expect(scope.asyncEvaluatedImmediately).toBeFalsy();
    });

    it("executes $evalAsynced functions added by watch functions", () => {
      scope.aValue = [1, 2, 3];
      scope.asyncEvaluatedTimes = 0;

      scope.$watch(
        scope => {
          if (scope.asyncEvaluatedTimes < 2) {
            scope.$evalAsync(scope => {
              scope.asyncEvaluatedTimes++;
            });
          }
          return scope.aValue;
        },
        (newValue, oldValue, scope) => {}
      );
      scope.$digest();
      expect(scope.asyncEvaluatedTimes).toBe(2);
    });

    it("executes $evalAsync'ed functions even when non dirty", () => {
      scope.aValue = [1, 2, 3];
      scope.asyncEvaluatedTimes = 0;

      scope.$watch(
        scope => {
          if (!scope.asyncEvaluated) {
            scope.$evalAsync(scope => {
              scope.asyncEvaluated = true;
            });
          }
          return scope.aValue;
        },
        (newValue, oldValue, scope) => {}
      );
      scope.$digest();
      expect(scope.asyncEvaluated).toBeTruthy();
    });

    it("eventually halts $evalAsyncs added by watches", () => {
      scope.aValue = [1, 2, 3];

      scope.$watch(
        scope => {
          scope.$evalAsync(scope => {});
          return scope.aValue;
        },
        (newValue, oldValue, scope) => {}
      );
      expect(() => scope.$digest()).toThrow();
    });
    it("schedules a digest in $evalAsync", function(done) {
      scope.aValue = "abc";
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$evalAsync(function(scope) {});
      expect(scope.counter).toBe(0);
      setTimeout(function() {
        expect(scope.counter).toBe(1);
        done();
      }, 50);
    });
    it("has a $$phase field whose value is the current digest phase", function() {
      scope.aValue = [1, 2, 3];
      scope.phaseInWatchFunction = undefined;
      scope.phaseInListenerFunction = undefined;
      scope.phaseInApplyFunction = undefined;
      scope.$watch(
        function(scope) {
          scope.phaseInWatchFunction = scope.$$phase;
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.phaseInListenerFunction = scope.$$phase;
        }
      );
      scope.$apply(function(scope) {
        scope.phaseInApplyFunction = scope.$$phase;
      });
      expect(scope.phaseInWatchFunction).toBe("$digest");
      expect(scope.phaseInListenerFunction).toBe("$digest");
      expect(scope.phaseInApplyFunction).toBe("$apply");
    });
    it("allows async $apply with $applyAsync", function(done) {
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.$applyAsync(function(scope) {
        scope.aValue = "abc";
      });
      expect(scope.counter).toBe(1);
      setTimeout(function() {
        expect(scope.counter).toBe(2);
        done();
      }, 50);
    });
    it("never executes $applyAsync'ed function in the same cycle", function(done) {
      scope.aValue = [1, 2, 3];
      scope.asyncApplied = false;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.$applyAsync(function(scope) {
            scope.asyncApplied = true;
          });
        }
      );
      scope.$digest();
      expect(scope.asyncApplied).toBe(false);
      setTimeout(function() {
        expect(scope.asyncApplied).toBe(true);
        done();
      }, 50);
    });
    it("coalesces many calls to $applyAsync", function(done) {
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          scope.counter++;
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {}
      );
      scope.$applyAsync(function(scope) {
        scope.aValue = "abc";
      });
      scope.$applyAsync(function(scope) {
        scope.aValue = "def";
      });
      setTimeout(function() {
        expect(scope.counter).toBe(2);
        done();
      }, 50);
    });
    it("cancels and flushes $applyAsync if digested first", function(done) {
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          scope.counter++;
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {}
      );
      scope.$applyAsync(function(scope) {
        scope.aValue = "abc";
      });
      scope.$applyAsync(function(scope) {
        scope.aValue = "def";
      });
      scope.$digest();
      expect(scope.counter).toBe(2);
      expect(scope.aValue).toEqual("def");
      setTimeout(function() {
        expect(scope.counter).toBe(2);
        done();
      }, 50);
    });
    it("runs a $$postDigest function after each digest", function() {
      scope.counter = 0;
      scope.$$postDigest(function() {
        scope.counter++;
      });
      expect(scope.counter).toBe(0);
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.$digest();
      expect(scope.counter).toBe(1);
    });
    it("does not include $$postDigest in the digest", function() {
      scope.aValue = "original value";
      scope.$$postDigest(function() {
        scope.aValue = "changed value";
      });
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.watchedValue = newValue;
        }
      );
      scope.$digest();
      expect(scope.watchedValue).toBe("original value");
      scope.$digest();
      expect(scope.watchedValue).toBe("changed value");
    });
    it("catches exceptions in $evalAsync", function(done) {
      scope.aValue = "abc";
      scope.counter = 0;
      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      scope.$evalAsync(function(scope) {
        throw "Error";
      });
      setTimeout(function() {
        expect(scope.counter).toBe(1);
        done();
      }, 50);
    });
    it("catches exceptions in $applyAsync", function(done) {
      scope.$applyAsync(function(scope) {
        throw "Error";
      });
      scope.$applyAsync(function(scope) {
        throw "Error";
      });
      scope.$applyAsync(function(scope) {
        scope.applied = true;
      });
      setTimeout(function() {
        expect(scope.applied).toBe(true);
        done();
      }, 50);
    });
    it("catches exceptions in $$postDigest", function() {
      var didRun = false;
      scope.$$postDigest(function() {
        throw "Error";
      });
      scope.$$postDigest(function() {
        didRun = true;
      });
      scope.$digest();
      expect(didRun).toBe(true);
    });
  });

  describe("$watchGroup", () => {
    let scope;

    beforeEach(() => {
      scope = new Scope();
    });

    it("takes watches as an array and calls listener with arrays", function() {
      var gotNewValues, gotOldValues;
      scope.aValue = 1;
      scope.anotherValue = 2;
      scope.$watchGroup(
        [scope => scope.aValue, scope => scope.anotherValue],
        (newValues, oldValues, scope) => {
          gotNewValues = newValues;
          gotOldValues = oldValues;
        }
      );
      scope.$digest();
      expect(gotNewValues).toEqual([1, 2]);
      expect(gotOldValues).toEqual([1, 2]);
    });
    it("only calls listener once per digest", function() {
      var counter = 0;
      scope.aValue = 1;
      scope.anotherValue = 2;
      scope.$watchGroup(
        [scope => scope.aValue, scope => scope.anotherValue],
        (newValues, oldValues, scope) => {
          counter++;
        }
      );
      scope.$digest();
      expect(counter).toEqual(1);
    });
    it("uses the same array of old and new values on first run", function() {
      var gotNewValues, gotOldValues;
      scope.aValue = 1;
      scope.anotherValue = 2;
      scope.$watchGroup(
        [scope => scope.aValue, scope => scope.anotherValue],
        (newValues, oldValues, scope) => {
          gotNewValues = newValues;
          gotOldValues = oldValues;
        }
      );
      scope.$digest();
      expect(gotNewValues).toBe(gotOldValues);
    });
    it("uses different arrays for old and new values on subsequent runs", function() {
      var gotNewValues, gotOldValues;
      scope.aValue = 1;
      scope.anotherValue = 2;
      scope.$watchGroup(
        [scope => scope.aValue, scope => scope.anotherValue],
        (newValues, oldValues, scope) => {
          gotNewValues = newValues;
          gotOldValues = oldValues;
        }
      );
      scope.$digest();
      scope.anotherValue = 3;
      scope.$digest();
      expect(gotNewValues).toEqual([1, 3]);
      expect(gotOldValues).toEqual([1, 2]);
    });
    it("calls the listener once when the watch array is empty", function() {
      var gotNewValues, gotOldValues;
      scope.$watchGroup([], (newValues, oldValues, scope) => {
        gotNewValues = newValues;
        gotOldValues = oldValues;
      });
      scope.$digest();
      expect(gotNewValues).toEqual([]);
      expect(gotOldValues).toEqual([]);
    });
    it("can be deregistered", function() {
      var counter = 0;
      scope.aValue = 1;
      scope.anotherValue = 2;
      var destroyGroup = scope.$watchGroup(
        [scope => scope.aValue, scope => scope.anotherValue],
        (newValues, oldValues, scope) => {
          counter++;
        }
      );
      scope.$digest();
      scope.anotherValue = 3;
      destroyGroup();
      scope.$digest();
      expect(counter).toEqual(1);
    });
    it("does not call the zero-watch listener when deregistered first", function() {
      var counter = 0;
      var destroyGroup = scope.$watchGroup(
        [],
        (newValues, oldValues, scope) => {
          counter++;
        }
      );
      destroyGroup();
      scope.$digest();
      expect(counter).toEqual(0);
    });
  });

  describe("inheritance", () => {
    it("inherits the parent's properties", () => {
      var parent = new Scope();
      parent.aValue = [1, 2, 3];
      var child = parent.$new();
      expect(child.aValue).toEqual([1, 2, 3]);
    });
    it("does not cause a parent to inherit its properties", () => {
      var parent = new Scope();
      var child = parent.$new();
      child.aValue = [1, 2, 3];
      expect(parent.aValue).toBeUndefined();
    });
    it("inherits the parent's properties whenever they are defined", () => {
      var parent = new Scope();
      var child = parent.$new();
      parent.aValue = [1, 2, 3];
      expect(child.aValue).toEqual([1, 2, 3]);
    });
    it("can manipulate a parent scope's property", () => {
      var parent = new Scope();
      var child = parent.$new();
      parent.aValue = [1, 2, 3];
      child.aValue.push(4);
      expect(child.aValue).toEqual([1, 2, 3, 4]);
      expect(parent.aValue).toEqual([1, 2, 3, 4]);
    });
    it("can watch a property in the parent", () => {
      var parent = new Scope();
      var child = parent.$new();
      parent.aValue = [1, 2, 3];
      child.counter = 0;
      child.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        },
        true
      );
      child.$digest();
      expect(child.counter).toBe(1);
      parent.aValue.push(4);
      child.$digest();
      expect(child.counter).toBe(2);
    });
    it("can be nested at any depth", () => {
      var a = new Scope();
      var aa = a.$new();
      var aaa = aa.$new();
      var aab = aa.$new();
      var ab = a.$new();
      var abb = ab.$new();
      a.value = 1;
      expect(aa.value).toBe(1);
      expect(aaa.value).toBe(1);
      expect(aab.value).toBe(1);
      expect(ab.value).toBe(1);
      expect(abb.value).toBe(1);
      ab.anotherValue = 2;
      expect(abb.anotherValue).toBe(2);
      expect(aa.anotherValue).toBeUndefined();
      expect(aaa.anotherValue).toBeUndefined();
    });
    it("shadows a parent's property with the same name", () => {
      var parent = new Scope();
      var child = parent.$new();
      parent.name = "Joe";
      child.name = "Jill";
      expect(child.name).toBe("Jill");
      expect(parent.name).toBe("Joe");
    });
    it("does not shadow members of parent scope's attributes", () => {
      var parent = new Scope();
      var child = parent.$new();
      parent.user = { name: "Joe" };
      child.user.name = "Jill";
      expect(child.user.name).toBe("Jill");
      expect(parent.user.name).toBe("Jill");
    });
    it("does not digest its parent(s)", () => {
      var parent = new Scope();
      var child = parent.$new();
      parent.aValue = "abc";
      parent.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.aValueWas = newValue;
        }
      );
      child.$digest();
      expect(child.aValueWas).toBeUndefined();
    });
    it("keeps a record of its children", () => {
      var parent = new Scope();
      var child1 = parent.$new();
      var child2 = parent.$new();
      var child2_1 = child2.$new();
      expect(parent.$$children.length).toBe(2);
      expect(parent.$$children[0]).toBe(child1);
      expect(parent.$$children[1]).toBe(child2);
      expect(child1.$$children.length).toBe(0);
      expect(child2.$$children.length).toBe(1);
      expect(child2.$$children[0]).toBe(child2_1);
    });
    it("digests its children", () => {
      var parent = new Scope();
      var child = parent.$new();
      parent.aValue = "abc";
      child.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.aValueWas = newValue;
        }
      );
      parent.$digest();
      expect(child.aValueWas).toBe("abc");
    });
    it("digests from root on $apply", () => {
      var parent = new Scope();
      var child = parent.$new();
      var child2 = child.$new();
      parent.aValue = "abc";
      parent.counter = 0;
      parent.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      child2.$apply(scope => {});
      expect(parent.counter).toBe(1);
    });
    it("schedules a digest from root on $evalAsync", done => {
      var parent = new Scope();
      var child = parent.$new();
      var child2 = child.$new();
      parent.aValue = "abc";
      parent.counter = 0;
      parent.$watch(
        scope => scope.value,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      child2.$evalAsync(scope => {});
      setTimeout(() => {
        expect(parent.counter).toBe(1);
        done();
      }, 50);
    });
    it("does not have access to parent attributes when isolated", () => {
      var parent = new Scope();
      var child = parent.$new(true);
      parent.aValue = "abc";
      expect(child.aValue).toBeUndefined();
    });
    it("cannot watch parent attributes when isolated", () => {
      var parent = new Scope();
      var child = parent.$new(true);
      parent.aValue = "abc";
      child.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.aValueWas = newValue;
        }
      );
      child.$digest();
      expect(child.aValueWas).toBeUndefined();
    });
    it("digests its isolated children", () => {
      var parent = new Scope();
      var child = parent.$new(true);
      child.aValue = "abc";
      child.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.aValueWas = newValue;
        }
      );
      parent.$digest();
      expect(child.aValueWas).toBe("abc");
    });
    it("digests from root on $apply when isolated", () => {
      var parent = new Scope();
      var child = parent.$new(true);
      var child2 = child.$new();
      parent.aValue = "abc";
      parent.counter = 0;
      parent.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      child2.$apply(function(scope) {});
      expect(parent.counter).toBe(1);
    });
    it("schedules a digest from root on $evalAsync when isolated", done => {
      var parent = new Scope();
      var child = parent.$new(true);
      var child2 = child.$new();
      parent.aValue = "abc";
      parent.counter = 0;
      parent.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      child2.$evalAsync(scope => {});
      setTimeout(() => {
        expect(parent.counter).toBe(1);
        done();
      }, 50);
    });
    it("executes $evalAsync functions on isolated scopes", done => {
      var parent = new Scope();
      var child = parent.$new(true);
      child.$evalAsync(scope => {
        scope.didEvalAsync = true;
      });
      setTimeout(() => {
        expect(child.didEvalAsync).toBe(true);
        done();
      }, 50);
    });
    it("executes $$postDigest functions on isolated scopes", () => {
      var parent = new Scope();
      var child = parent.$new(true);
      child.$$postDigest(() => {
        child.didPostDigest = true;
      });
      parent.$digest();
      expect(child.didPostDigest).toBe(true);
    });
    it("can take some other scope as the parent", () => {
      var prototypeParent = new Scope();
      var hierarchyParent = new Scope();
      var child = prototypeParent.$new(false, hierarchyParent);
      prototypeParent.a = 42;
      expect(child.a).toBe(42);
      child.counter = 0;
      child.$watch(scope => {
        scope.counter++;
      });
      prototypeParent.$digest();
      expect(child.counter).toBe(0);
      hierarchyParent.$digest();
      expect(child.counter).toBe(2);
    });
    it("is no longer digested when $destroy has been called", () => {
      var parent = new Scope();
      var child = parent.$new();
      child.aValue = [1, 2, 3];
      child.counter = 0;
      child.$watch(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        },
        true
      );
      parent.$digest();
      expect(child.counter).toBe(1);
      child.aValue.push(4);
      parent.$digest();
      expect(child.counter).toBe(2);
      child.$destroy();
      child.aValue.push(5);
      parent.$digest();
      expect(child.counter).toBe(2);
    });
  });

  describe("$watchCollection", () => {
    let scope;
    beforeEach(() => {
      scope = new Scope();
    });

    it("works like a normal watch for non-collections", () => {
      var valueProvided;
      scope.aValue = 42;
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          valueProvided = newValue;
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      expect(valueProvided).toBe(scope.aValue);
      scope.aValue = 43;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("works like a normal watch for NaNs", () => {
      scope.aValue = 0 / 0;
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.$digest();
      expect(scope.counter).toBe(1);
    });
    it("notices when the value becomes an array", () => {
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.arr,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arr = [1, 2, 3];
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("notices an item added to an array", () => {
      scope.arr = [1, 2, 3];
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.arr,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arr.push(4);
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("notices an item removed from an array", () => {
      scope.arr = [1, 2, 3];
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.arr,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arr.shift();
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("notices an item replaced in an array", () => {
      scope.arr = [1, 2, 3];
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.arr,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arr[1] = 42;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("notices items reordered in an array", () => {
      scope.arr = [2, 1, 3];
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.arr,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arr.sort();
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("does not fail on NaNs in arrays", () => {
      scope.arr = [2, NaN, 3];
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.arr,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
    });
    it("notices an item replaced in an arguments object", () => {
      (function() {
        scope.arrayLike = arguments;
      })(1, 2, 3);
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.arrayLike,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.arrayLike[1] = 42;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("notices an item replaced in a NodeList object", () => {
      document.documentElement.appendChild(document.createElement("div"));
      scope.arrayLike = document.getElementsByTagName("div");
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.arrayLike,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      document.documentElement.appendChild(document.createElement("div"));
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("notices when the value becomes an object", () => {
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.obj,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.obj = { a: 1 };
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("notices when an attribute is added to an object", () => {
      scope.counter = 0;
      scope.obj = { a: 1 };
      scope.$watchCollection(
        scope => scope.obj,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.obj.b = 2;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("notices when an attribute is changed in an object", () => {
      scope.counter = 0;
      scope.obj = { a: 1 };
      scope.$watchCollection(
        scope => scope.obj,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      scope.obj.a = 2;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("does not fail on NaN attributes in objects", () => {
      scope.counter = 0;
      scope.obj = { a: NaN };
      scope.$watchCollection(
        scope => scope.obj,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
    });
    it("notices when an attribute is removed from an object", () => {
      scope.counter = 0;
      scope.obj = { a: 1 };
      scope.$watchCollection(
        scope => scope.obj,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      expect(scope.counter).toBe(1);
      delete scope.obj.a;
      scope.$digest();
      expect(scope.counter).toBe(2);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("does not consider any object with a length property an array", () => {
      scope.obj = { length: 42, otherKey: "abc" };
      scope.counter = 0;
      scope.$watchCollection(
        scope => scope.obj,
        (newValue, oldValue, scope) => {
          scope.counter++;
        }
      );
      scope.$digest();
      scope.obj.newKey = "def";
      scope.$digest();
      expect(scope.counter).toBe(2);
    });
    it("gives the old non-collection value to listeners", () => {
      scope.aValue = 42;
      var oldValueGiven;
      scope.$watchCollection(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          oldValueGiven = oldValue;
        }
      );
      scope.$digest();
      scope.aValue = 43;
      scope.$digest();
      expect(oldValueGiven).toBe(42);
    });
    it("gives the old array value to listeners", () => {
      scope.aValue = [1, 2, 3];
      var oldValueGiven;
      scope.$watchCollection(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          oldValueGiven = oldValue;
        }
      );
      scope.$digest();
      scope.aValue.push(4);
      scope.$digest();
      expect(oldValueGiven).toEqual([1, 2, 3]);
    });
    it("gives the old object value to listeners", () => {
      scope.aValue = { a: 1, b: 2 };
      var oldValueGiven;
      scope.$watchCollection(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          oldValueGiven = oldValue;
        }
      );
      scope.$digest();
      scope.aValue.c = 3;
      scope.$digest();
      expect(oldValueGiven).toEqual({ a: 1, b: 2 });
    });
    it("uses the new value as the old value on first digest", () => {
      scope.aValue = { a: 1, b: 2 };
      var oldValueGiven;
      scope.$watchCollection(
        scope => scope.aValue,
        (newValue, oldValue, scope) => {
          oldValueGiven = oldValue;
        }
      );
      scope.$digest();
      expect(oldValueGiven).toEqual({ a: 1, b: 2 });
    });
  });
});
