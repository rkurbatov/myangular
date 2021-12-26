export const isDomNode = (obj) =>
  obj.children && (obj.nodeName || (obj.prop && obj.find && obj.attr))

export const simpleCompare = (newValue, oldValue) =>
  newValue === oldValue || (Number.isNaN(newValue) && Number.isNaN(oldValue))
