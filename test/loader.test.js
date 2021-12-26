import { setupModuleLoader } from '../src/loader'

describe('setupModuleLoader', () => {
  describe('loader', () => {
    beforeEach(() => {
      delete window.angular
    })

    it('exposes angular on the window', () => {
      setupModuleLoader(window)
      expect(window.angular).toBeDefined()
    })
    it('creates angular just once', () => {
      setupModuleLoader(window)
      const ng = window.angular
      setupModuleLoader(window)
      expect(window.angular).toBe(ng)
    })
    it('exposes the angular module function', () => {
      setupModuleLoader(window)
      expect(window.angular.module).toBeDefined()
    })
    it('exposes the angular module function just once', () => {
      setupModuleLoader(window)
      const module = window.angular.module
      setupModuleLoader(window)
      expect(window.angular.module).toBe(module)
    })
  })

  describe('modules', () => {
    beforeEach(() => {
      delete window.angular
      setupModuleLoader(window)
    })

    it('allows registering a module', () => {
      const myModule = window.angular.module('myModule', [])
      expect(myModule).toBeDefined()
      expect(myModule.name).toEqual('myModule')
    })
    it('replaces a module when registered with same name again', () => {
      const myModule = window.angular.module('myModule', [])
      const myNewModule = window.angular.module('myModule', [])
      expect(myNewModule).not.toBe(myModule)
    })
    it('attaches the requires array to the registered module', () => {
      const myModule = window.angular.module('myModule', ['myOtherModule'])
      expect(myModule.requires).toEqual(['myOtherModule'])
    })
    it('allows getting a module', () => {
      const myModule = window.angular.module('myModule', [])
      const gotModule = window.angular.module('myModule')
      expect(gotModule).toBeDefined()
      expect(gotModule).toBe(myModule)
    })
    it('throws when trying to get a nonexistent module', () => {
      expect(() => {
        window.angular.module('myModule')
      }).toThrow()
    })
    it('does not allow a module to be called hasOwnProperty', () => {
      expect(() => {
        window.angular.module('hasOwnProperty', [])
      }).toThrow()
    })
  })
})
