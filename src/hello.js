import { template } from 'lodash'

export const sayHello = (to) => template('Hello, <%= name %>!')({name: to})
