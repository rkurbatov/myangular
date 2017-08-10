import { sayHello } from '../src/hello'

describe('Hello', () => {

  it('says hello', () => {
    expect(sayHello('Jane')).toBe('Hello, Jane!');
  })

})
