import { constant, repeat } from 'lodash'
import { parse } from '../src/parse'
import { register } from '../src/filter'

describe('parse', () => {
  describe('numbers', () => {
    it('can parse an integer', () => {
      const fn = parse('42')
      expect(fn).toBeDefined()
      expect(fn()).toBe(42)
    })
    it('can parse a floating point number', () => {
      const fn = parse('4.2')
      expect(fn()).toBe(4.2)
    })
    it('can parse a floating point number without an integer part', () => {
      const fn = parse('.42')
      expect(fn()).toBe(0.42)
    })
    it('can parse a number in scientific notation', () => {
      const fn = parse('42e3')
      expect(fn()).toBe(42000)
    })
    it('can parse scientific notation with a float coefficient', () => {
      const fn = parse('.42e2')
      expect(fn()).toBe(42)
    })
    it('can parse scientific notation with negative exponents', () => {
      const fn = parse('4200e-2')
      expect(fn()).toBe(42)
    })
    it('can parse scientific notation with the + sign', () => {
      const fn = parse('.42e+2')
      expect(fn()).toBe(42)
    })
    it('can parse upper case scientific notation', () => {
      const fn = parse('.42E2')
      expect(fn()).toBe(42)
    })
    it('will not parse invalid scientific notation', () => {
      expect(() => {
        parse('42e-')
      }).toThrow()
      expect(() => {
        parse('42e-a')
      }).toThrow()
    })
  })

  describe('strings', () => {
    it('can parse a string in single quotes', () => {
      const fn = parse("'abc'")
      expect(fn()).toEqual('abc')
    })
    it('can parse a string in double quotes', () => {
      const fn = parse('"abc"')
      expect(fn()).toEqual('abc')
    })
    it('will not parse a string with mismatching quotes', () => {
      expect(function () {
        parse('"abc\'')
      }).toThrow()
    })
    it('can parse a string with single quotes inside', () => {
      const fn = parse("'a\\'b'")
      expect(fn()).toEqual("a'b")
    })
    it('can parse a string with double quotes inside', () => {
      const fn = parse('"a\\"b"')
      expect(fn()).toEqual('a"b')
    })
    it('will parse a string with unicode escapes', () => {
      const fn = parse('"\\u00A0"')
      expect(fn()).toEqual('\u00A0')
    })
    it('will not parse a string with invalid unicode escapes', () => {
      expect(function () {
        parse('"\\u00T0"')
      }).toThrow()
    })
  })

  describe('primitive values', () => {
    it('will parse null', () => {
      const fn = parse('null')
      expect(fn()).toBe(null)
    })
    it('will parse true', () => {
      const fn = parse('true')
      expect(fn()).toBe(true)
    })
    it('will parse false', () => {
      const fn = parse('false')
      expect(fn()).toBe(false)
    })
    it('ignores whitespace', () => {
      const fn = parse(' \n42 ')
      expect(fn()).toEqual(42)
    })
  })

  describe('array', () => {
    it('will parse an empty array', () => {
      const fn = parse('[]')
      expect(fn()).toEqual([])
    })
    it('will parse a non-empty array', () => {
      const fn = parse('[1, "two", [3], true]')
      expect(fn()).toEqual([1, 'two', [3], true])
    })
    it('will parse an array with trailing commas', () => {
      const fn = parse('[1, 2, 3, ]')
      expect(fn()).toEqual([1, 2, 3])
    })
  })

  describe('object', () => {
    it('will parse an empty object', () => {
      const fn = parse('{}')
      expect(fn()).toEqual({})
    })
    it('will parse a non-empty object', () => {
      const fn = parse('{"a key": 1, \'another-key\': 2}')
      expect(fn()).toEqual({ 'a key': 1, 'another-key': 2 })
    })
    it('will parse an object with identifier keys', () => {
      const fn = parse('{a: 1, b: [2, 3], c: {d: 4}}')
      expect(fn()).toEqual({ a: 1, b: [2, 3], c: { d: 4 } })
    })
  })

  describe('attribute lookup', () => {
    it('looks up an attribute from the scope', () => {
      const fn = parse('aKey')
      expect(fn({ aKey: 42 })).toBe(42)
    })
    it('returns undefined when looking up attribute from undefined', () => {
      const fn = parse('aKey')
      expect(fn()).toBeUndefined()
    })
  })

  describe('this', () => {
    it('will parse this', () => {
      const fn = parse('this')
      const scope = {}
      expect(fn(scope)).toBe(scope)
      expect(fn()).toBeUndefined()
    })
  })

  describe('non-computed attribute lookup', () => {
    it('looks up a member from an object', () => {
      const fn = parse('{aKey: 42}.aKey')
      expect(fn()).toBe(42)
    })
    it('looks up a 2-part identifier path from the scope', () => {
      const fn = parse('aKey.anotherKey')
      expect(fn({ aKey: { anotherKey: 42 } })).toBe(42)
      expect(fn({ aKey: {} })).toBeUndefined()
      expect(fn({})).toBeUndefined()
    })
    it('looks up a 4-part identifier path from the scope', () => {
      const fn = parse('aKey.secondKey.thirdKey.fourthKey')
      expect(fn({ aKey: { secondKey: { thirdKey: { fourthKey: 42 } } } })).toBe(
        42,
      )
      expect(fn({ aKey: { secondKey: { thirdKey: {} } } })).toBeUndefined()
      expect(fn({ aKey: {} })).toBeUndefined()
      expect(fn()).toBeUndefined()
    })
  })

  describe('expressions with locals', () => {
    it('uses locals instead of scope when there is a matching key', () => {
      const fn = parse('aKey')
      const scope = { aKey: 42 }
      const locals = { aKey: 43 }
      expect(fn(scope, locals)).toBe(43)
    })
    it('does not use locals instead of scope when no matching key', () => {
      const fn = parse('aKey')
      const scope = { aKey: 42 }
      const locals = { otherKey: 43 }
      expect(fn(scope, locals)).toBe(42)
    })
    it('uses locals instead of scope when the first part matches', () => {
      const fn = parse('aKey.anotherKey')
      const scope = { aKey: { anotherKey: 42 } }
      const locals = { aKey: {} }
      expect(fn(scope, locals)).toBeUndefined()
    })
    it('will parse $locals', () => {
      let fn = parse('$locals')
      let scope = {}
      let locals = {}
      expect(fn(scope, locals)).toBe(locals)
      expect(fn(scope)).toBeUndefined()
      fn = parse('$locals.aKey')
      scope = { aKey: 42 }
      locals = { aKey: 43 }
      expect(fn(scope, locals)).toBe(43)
    })
  })

  describe('computed attribute lookup', () => {
    it('parses a simple computed property access', () => {
      const fn = parse('aKey["anotherKey"]')
      expect(fn({ aKey: { anotherKey: 42 } })).toBe(42)
    })
    it('parses a computed numeric array access', () => {
      const fn = parse('anArray[1]')
      expect(fn({ anArray: [1, 2, 3] })).toBe(2)
    })
    it('parses a computed access with another key as property', () => {
      const fn = parse('lock[key]')
      expect(fn({ key: 'theKey', lock: { theKey: 42 } })).toBe(42)
    })
    it('parses computed access with another access as property', () => {
      const fn = parse('lock[keys["aKey"]]')
      expect(fn({ keys: { aKey: 'theKey' }, lock: { theKey: 42 } })).toBe(42)
    })
  })

  describe('function calls', () => {
    it('parses a function call', () => {
      const fn = parse('aFunction()')
      expect(
        fn({
          aFunction: function () {
            return 42
          },
        }),
      ).toBe(42)
      const fn2 = parse('anArrowFunction()')
      expect(
        fn2({
          anArrowFunction: () => 43,
        }),
      ).toBe(43)
    })
    it('parses a function call with a single number argument', () => {
      const fn = parse('aFunction(42)')
      expect(
        fn({
          aFunction: function (n) {
            return n
          },
        }),
      ).toBe(42)
    })
    it('parses a function call with a single identifier argument', () => {
      const fn = parse('aFunction(n)')
      expect(
        fn({
          n: 42,
          aFunction: function (arg) {
            return arg
          },
        }),
      ).toBe(42)
    })
    it('parses a function call with a single function call argument', () => {
      const fn = parse('aFunction(argFn())')
      expect(
        fn({
          argFn: constant(42),
          aFunction: (arg) => arg,
        }),
      ).toBe(42)
    })
    it('parses a function call with multiple arguments', () => {
      const fn = parse('aFunction(37, n, argFn())')
      expect(
        fn({
          n: 3,
          argFn: constant(2),
          aFunction: function (a1, a2, a3) {
            return a1 + a2 + a3
          },
        }),
      ).toBe(42)
    })
    it('calls methods accessed as computed properties', () => {
      const scope = {
        anObject: {
          aMember: 42,
          aFunction: function () {
            return this.aMember
          },
        },
      }
      const fn = parse('anObject["aFunction"]()')
      expect(fn(scope)).toBe(42)
    })
    it('calls methods accessed as non-computed properties', () => {
      const scope = {
        anObject: {
          aMember: 42,
          aFunction: function () {
            return this.aMember
          },
        },
      }
      const fn = parse('anObject.aFunction()')
      expect(fn(scope)).toBe(42)
    })
    it('binds bare functions to the scope', () => {
      const scope = {
        aFunction: function () {
          return this
        },
      }
      const fn = parse('aFunction()')
      expect(fn(scope)).toBe(scope)
    })
    it('binds bare functions on locals to the locals', () => {
      const scope = {}
      const locals = {
        aFunction: function () {
          return this
        },
      }
      const fn = parse('aFunction()')
      expect(fn(scope, locals)).toBe(locals)
    })
  })

  describe('assignments', () => {
    it('parses a simple attribute assignment', () => {
      const fn = parse('anAttribute = 42')
      const scope = {}
      fn(scope)
      expect(scope.anAttribute).toBe(42)
    })
    it('can assign any primary expression', () => {
      const fn = parse('anAttribute = aFunction()')
      const scope = { aFunction: constant(42) }
      fn(scope)
      expect(scope.anAttribute).toBe(42)
    })
    it('can assign a computed object property', () => {
      const fn = parse('anObject["anAttribute"] = 42')
      const scope = { anObject: {} }
      fn(scope)
      expect(scope.anObject.anAttribute).toBe(42)
    })
    it('can assign a non-computed object property', () => {
      const fn = parse('anObject.anAttribute = 42')
      const scope = { anObject: {} }
      fn(scope)
      expect(scope.anObject.anAttribute).toBe(42)
    })
    it('can assign a nested object property', () => {
      const fn = parse('anArray[0].anAttribute = 42')
      const scope = { anArray: [{}] }
      fn(scope)
      expect(scope.anArray[0].anAttribute).toBe(42)
    })
    it('creates the objects in the assignment path that do not exist', () => {
      const fn = parse('some["nested"].property.path = 42')
      const scope = {}
      fn(scope)
      expect(scope.some.nested.property.path).toBe(42)
    })
  })

  describe('safety in member access', () => {
    it('does not allow calling the function constructor', () => {
      expect(() => {
        const fn = parse('aFunction.constructor("return window;")()')
        fn({
          aFunction: () => {},
        })
      }).toThrow(
        'Attempting to access a disallowed field in Angular expressions!',
      )
    })
    it('does not allow accessing __proto__', () => {
      expect(() => {
        const fn = parse('obj.__proto__')
        fn({ obj: {} })
      }).toThrow(
        'Attempting to access a disallowed field in Angular expressions!',
      )
    })
    it('does not allow calling __defineGetter__', function () {
      expect(function () {
        var fn = parse('obj.__defineGetter__("evil", fn)')
        fn({
          obj: {},
          fn: function () {},
        })
      }).toThrow(
        'Attempting to access a disallowed field in Angular expressions!',
      )
    })
    it('does not allow calling __defineSetter__', () => {
      expect(() => {
        const fn = parse('obj.__defineSetter__("evil", fn)')
        fn({
          obj: {},
          fn: () => {},
        })
      }).toThrow(
        'Attempting to access a disallowed field in Angular expressions!',
      )
    })
    it('does not allow calling __lookupGetter__', () => {
      expect(() => {
        const fn = parse('obj.__lookupGetter__("evil")')
        fn({ obj: {} })
      }).toThrow(
        'Attempting to access a disallowed field in Angular expressions!',
      )
    })
    it('does not allow calling __lookupSetter__', () => {
      expect(() => {
        const fn = parse('obj.__lookupSetter__("evil")')
        fn({ obj: {} })
      }).toThrow(
        'Attempting to access a disallowed field in Angular expressions!',
      )
    })
    it('does not allow accessing window as computed property', () => {
      const fn = parse('anObject["wnd"]')
      expect(() => {
        fn({ anObject: { wnd: window } })
      }).toThrow('Referencing window in Angular expressions is disallowed!')
    })
    it('does not allow accessing window as non-computed property', () => {
      const fn = parse('anObject.wnd')
      expect(() => {
        fn({ anObject: { wnd: window } })
      }).toThrow('Referencing window in Angular expressions is disallowed!')
    })
    it('does not allow passing window as function argument', () => {
      const fn = parse('aFunction(wnd)')
      expect(() => {
        fn({
          aFunction: () => {},
          wnd: window,
        })
      }).toThrow('Referencing window in Angular expressions is disallowed!')
    })
    it('does not allow calling methods on window', () => {
      const fn = parse('wnd.scrollTo(0)')
      expect(function () {
        fn({ wnd: window })
      }).toThrow('Referencing window in Angular expressions is disallowed!')
    })
    it('does not allow functions to return window', () => {
      const fn = parse('getWnd()')
      expect(() => {
        fn({ getWnd: constant(window) })
      }).toThrow('Referencing window in Angular expressions is disallowed!')
    })
    it('does not allow assigning window', () => {
      const fn = parse('wnd = anObject')
      expect(() => {
        fn({ anObject: window })
      }).toThrow('Referencing window in Angular expressions is disallowed!')
    })
    it('does not allow referencing window', () => {
      const fn = parse('wnd')
      expect(() => {
        fn({ wnd: window })
      }).toThrow('Referencing window in Angular expressions is disallowed!')
    })
    it('does not allow calling functions on DOM elements', () => {
      const fn = parse('el.setAttribute("evil", "true")')
      expect(() => {
        fn({ el: document.documentElement })
      }).toThrow('Referencing DOM nodes in Angular expressions is disallowed!')
    })
    it('does not allow calling the aliased function constructor', () => {
      const fn = parse('fnConstructor("return window;")')
      expect(() => {
        fn({
          fnConstructor: function () {}.constructor,
        })
      }).toThrow('Referencing Function in Angular expressions is disallowed!')
    })
    it('does not allow calling functions on Object', () => {
      const fn = parse('obj.create({})')
      expect(() => {
        fn({ obj: Object })
      }).toThrow('Referencing Object in Angular expressions is disallowed!')
    })
    it('does not allow calling call', () => {
      const fn = parse('fun.call(obj)')
      expect(() => {
        fn({ fun: function () {}, obj: {} })
      }).toThrow()
    })
    it('does not allow calling apply', () => {
      const fn = parse('fun.apply(obj)')
      expect(() => {
        fn({ fun: function () {}, obj: {} })
      }).toThrow()
    })
  })

  describe('operators', () => {
    it('parses a unary +', () => {
      expect(parse('+42')()).toBe(42)
      expect(parse('+a')({ a: 42 })).toBe(42)
    })
    it('replaces undefined with zero for unary +', () => {
      expect(parse('+a')({})).toBe(0)
    })
    it('parses a unary !', () => {
      expect(parse('!true')()).toBe(false)
      expect(parse('!42')()).toBe(false)
      expect(parse('!a')({ a: false })).toBe(true)
      expect(parse('!!a')({ a: false })).toBe(false)
    })
    it('parses a unary -', () => {
      expect(parse('-42')()).toBe(-42)
      expect(parse('-a')({ a: -42 })).toBe(42)
      expect(parse('--a')({ a: -42 })).toBe(-42)
      expect(parse('-a')({})).toBe(0)
    })
    it('parses a ! in a string', () => {
      expect(parse('"!"')()).toBe('!') // the quoted string that contains '!' should be parsed as a string
    })
    it('parses a multiplication', () => {
      expect(parse('21 * 2')()).toBe(42)
    })
    it('parses a division', () => {
      expect(parse('84 / 2')()).toBe(42)
    })
    it('parses a remainder', () => {
      expect(parse('85 % 43')()).toBe(42)
    })
    it('parses several multiplicatives', () => {
      expect(parse('36 * 2 % 5')()).toBe(2)
    })
    it('parses an addition', () => {
      expect(parse('20 + 22')()).toBe(42)
    })
    it('parses a subtraction', () => {
      expect(parse('42 - 22')()).toBe(20)
    })
    it('parses multiplicatives on a higher precedence than additives', () => {
      expect(parse('2 + 3 * 5')()).toBe(17)
      expect(parse('2 + 3 * 2 + 3')()).toBe(11)
    })
    it('substitutes undefined with zero in addition', () => {
      expect(parse('a + 22')()).toBe(22)
      expect(parse('42 + a')()).toBe(42)
    })
    it('substitutes undefined with zero in subtraction', () => {
      expect(parse('a - 22')()).toBe(-22)
      expect(parse('42 - a')()).toBe(42)
    })
  })

  describe('relational and equality operators', () => {
    it('parses relational operators', () => {
      expect(parse('1 < 2')()).toBe(true)
      expect(parse('1 > 2')()).toBe(false)
      expect(parse('1 <= 2')()).toBe(true)
      expect(parse('2 <= 2')()).toBe(true)
      expect(parse('1 >= 2')()).toBe(false)
      expect(parse('2 >= 2')()).toBe(true)
    })
    it('parses equality operators', () => {
      expect(parse('42 == 42')()).toBe(true)
      expect(parse('42 == "42"')()).toBe(true)
      expect(parse('42 != 42')()).toBe(false)
      expect(parse('42 === 42')()).toBe(true)
      expect(parse('42 === "42"')()).toBe(false)
      expect(parse('42 !== 42')()).toBe(false)
    })
    it('parses relationals on a higher precedence than equality', () => {
      expect(parse('2 == "2" > 2 === "2"')()).toBe(false)
    })
    it('parses additives on a higher precedence than relationals', () => {
      expect(parse('2 + 3 < 6 - 2')()).toBe(false)
    })
  })

  describe('logical operators', () => {
    it('parses logical AND', () => {
      expect(parse('true && true')()).toBe(true)
      expect(parse('true && false')()).toBe(false)
    })
    it('parses logical OR', () => {
      expect(parse('true || true')()).toBe(true)
      expect(parse('true || false')()).toBe(true)
      expect(parse('false || false')()).toBe(false)
    })
    it('parses multiple ANDs', () => {
      expect(parse('true && true && true')()).toBe(true)
      expect(parse('true && true && false')()).toBe(false)
    })
    it('parses multiple ORs', () => {
      expect(parse('true || true || true')()).toBe(true)
      expect(parse('true || true || false')()).toBe(true)
      expect(parse('false || false || true')()).toBe(true)
      expect(parse('false || false || false')()).toBe(false)
    })
    it('short-circuits AND', () => {
      let invoked
      const scope = {
        fn: function () {
          invoked = true
        },
      }
      parse('false && fn()')(scope)
      expect(invoked).toBeUndefined()
    })
    it('short-circuits OR', () => {
      let invoked
      const scope = {
        fn: function () {
          invoked = true
        },
      }
      parse('true || fn()')(scope)
      expect(invoked).toBeUndefined()
    })
    it('parses AND with a higher precedence than OR', () => {
      expect(parse('false && true || true')()).toBe(true)
    })
    it('parses OR with a lower precedence than equality', () => {
      expect(parse('1 === 2 || 2 === 2')()).toBeTruthy()
    })
  })
  describe('ternary operator', () => {
    it('parses the ternary expression', () => {
      expect(parse('a === 42 ? true : false')({ a: 42 })).toBe(true)
      expect(parse('a === 42 ? true : false')({ a: 43 })).toBe(false)
    })
    it('parses OR with a higher precedence than ternary', () => {
      expect(parse('0 || 1 ? 0 || 2 : 0 || 3')()).toBe(2)
    })
    it('parses nested ternaries', () => {
      expect(
        parse(
          'a === 42 ? b === 42 ? "a and b" : "a" : c === 42 ? "c" : "none"',
        )({
          a: 44,
          b: 43,
          c: 42,
        }),
      ).toEqual('c')
    })
  })
  describe('precedence and statements', () => {
    it('parses parentheses altering precedence order', () => {
      expect(parse('21 * (3 - 1)')()).toBe(42)
      expect(parse('false && (true || true)')()).toBe(false)
      expect(parse('-((a % 2) === 0 ? 1 : 2)')({ a: 42 })).toBe(-1)
    })
    it('parses several statements', () => {
      const fn = parse('a = 1; b = 2; c = 3')
      const scope = {}
      fn(scope)
      expect(scope).toEqual({ a: 1, b: 2, c: 3 })
    })
    it('returns the value of the last statement', () => {
      expect(parse('a = 1; b = 2; a + b')({})).toBe(3)
    })
  })

  describe('filters', () => {
    it('can parse filter expressions', () => {
      register('upcase', () => (str) => str.toUpperCase())

      const fn = parse('aString | upcase')
      expect(fn({ aString: 'Hello' })).toEqual('HELLO')
    })
    it('can parse filter chain expressions', () => {
      register('upcase', () => (s) => s.toUpperCase())
      register('exclamate', () => (s) => s + '!')

      const fn = parse('"hello" | upcase | exclamate')
      expect(fn()).toEqual('HELLO!')
    })
    it('can pass an additional argument to filters', () => {
      register('repeat', () => (s, times) => repeat(s, times))

      const fn = parse('"hello" | repeat:3')
      expect(fn()).toEqual('hellohellohello')
    })
    it('can pass several additional arguments to filters', () => {
      register('surround', () => (s, left, right) => left + s + right)

      const fn = parse('"hello" | surround:"*":"!"')
      expect(fn()).toEqual('*hello!')
    })
  })

  describe('watching expressions', () => {
    it('returns the function itself when given one', () => {
      const fn = function () {}
      expect(parse(fn)).toBe(fn)
    })
  })
})
