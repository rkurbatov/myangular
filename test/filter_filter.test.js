import { filter } from '../src/filter'
import { parse } from '../src/parse'

describe('filter filter', () => {
  it('is available', () => {
    expect(filter('filter')).toBeDefined()
  })
  it('can filter an array with a predicate function', () => {
    const fn = parse('[1, 2, 3, 4] | filter:isOdd')
    const scope = {
      isOdd: function (n) {
        return n % 2 !== 0
      },
    }
    expect(fn(scope)).toEqual([1, 3])
  })
  it('can filter an array of strings with a string', () => {
    const fn = parse('arr | filter:"a"')
    expect(fn({ arr: ['a', 'b', 'a'] })).toEqual(['a', 'a'])
  })
  it('filters an array of strings with substring matching', () => {
    const fn = parse('arr | filter:"o"')
    expect(fn({ arr: ['quick', 'brown', 'fox'] })).toEqual(['brown', 'fox'])
  })
  it('filters an array of strings ignoring case', () => {
    const fn = parse('arr | filter:"o"')
    expect(fn({ arr: ['quick', 'BROWN', 'fox'] })).toEqual(['BROWN', 'fox'])
  })
  it('filters an array of objects where any value matches', () => {
    const fn = parse('arr | filter:"o"')
    expect(
      fn({
        arr: [
          { firstName: 'John', lastName: 'Brown' },
          { firstName: 'Jane', lastName: 'Fox' },
          { firstName: 'Mary', lastName: 'Quick' },
        ],
      }),
    ).toEqual([
      { firstName: 'John', lastName: 'Brown' },
      { firstName: 'Jane', lastName: 'Fox' },
    ])
  })
  it('filters an array of objects where a nested value matches', () => {
    const fn = parse('arr | filter:"o"')
    expect(
      fn({
        arr: [
          { name: { first: 'John', last: 'Brown' } },
          { name: { first: 'Jane', last: 'Fox' } },
          { name: { first: 'Mary', last: 'Quick' } },
        ],
      }),
    ).toEqual([
      { name: { first: 'John', last: 'Brown' } },
      { name: { first: 'Jane', last: 'Fox' } },
    ])
  })
  it('filters an array of arrays where a nested value matches', () => {
    const fn = parse('arr | filter:"o"')
    expect(
      fn({ arr: [[{ name: 'John' }, { name: 'Mary' }], [{ name: 'Jane' }]] }),
    ).toEqual([[{ name: 'John' }, { name: 'Mary' }]])
  })
  it('filters with a number', () => {
    const fn = parse('arr | filter:42')
    expect(
      fn({
        arr: [
          { name: 'Mary', age: 42 },
          { name: 'John', age: 43 },
          { name: 'Jane', age: 44 },
        ],
      }),
    ).toEqual([{ name: 'Mary', age: 42 }])
  })
  it('filters with a boolean value', () => {
    const fn = parse('arr | filter:true')
    expect(
      fn({
        arr: [
          { name: 'Mary', admin: true },
          { name: 'John', admin: true },
          { name: 'Jane', admin: false },
        ],
      }),
    ).toEqual([
      { name: 'Mary', admin: true },
      { name: 'John', admin: true },
    ])
  })
  it('filters with a substring numeric value', () => {
    const fn = parse('arr | filter:42')
    expect(fn({ arr: ['contains 42'] })).toEqual(['contains 42'])
  })
  it('filters matching null', () => {
    const fn = parse('arr | filter:null')
    expect(fn({ arr: [null, 'not null'] })).toEqual([null])
  })
  it('does not match null value with the string null', () => {
    const fn = parse('arr | filter:"null"')
    expect(fn({ arr: [null, 'not null'] })).toEqual(['not null'])
  })
  it('does not match undefined values', () => {
    const fn = parse('arr | filter:"undefined"')
    expect(fn({ arr: [undefined, 'undefined'] })).toEqual(['undefined'])
  })
  it('allows negating string filter', () => {
    const fn = parse('arr | filter:"!o"')
    expect(fn({ arr: ['quick', 'brown', 'fox'] })).toEqual(['quick'])
  })
})
