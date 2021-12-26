export function setupModuleLoader(window) {
  const ensure = (obj, name, factory) => obj[name] || (obj[name] = factory())

  const angular = ensure(window, 'angular', Object)

  const createModule = (name, requires, modules) => {
    if (name === 'hasOwnProperty') {
      throw '"hasOwnProperty" is not a valid module name'
    }

    const moduleInstance = { name, requires }
    modules[name] = moduleInstance
    return moduleInstance
  }

  const getModule = (name, modules) => {
    if (modules.hasOwnProperty(name)) {
      return modules[name]
    } else {
      throw 'Module' + name + 'is not available'
    }
  }

  ensure(angular, 'module', () => {
    const modules = {}
    return (name, requires) => {
      if (requires) {
        return createModule(name, requires, modules)
      } else {
        return getModule(name, modules)
      }
    }
  })
}
