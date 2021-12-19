import { register, filter } from '../src/filter'

describe('filter', () => {
  it('can be registered and obtained', () => {
    const myFilter = function () {}
    const myFilterFactory = function () {
      return myFilter
    }
    register('my', myFilterFactory)
    expect(filter('my')).toBe(myFilter)
  })

  it('allows registering multiple filters with an object', function () {
    const myFilter = function () {}
    const myOtherFilter = function () {}

    register({
      my: function () {
        return myFilter
      },
      myOther: function () {
        return myOtherFilter
      },
    })

    expect(filter('my')).toBe(myFilter)
    expect(filter('myOther')).toBe(myOtherFilter)
  })
})
