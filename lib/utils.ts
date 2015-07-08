import * as s from 'typescript-schema'
import {posix as path} from 'path'
import {MethodOptions, EventOptions} from './decorators'

export interface MethodDetails extends MethodOptions {
  path: string
}

export interface EventDetails extends EventOptions {
  path: string
}

export function getMethodDetails(memberSchema:s.ClassMember):MethodDetails {
  let mlMethodDecorator = memberSchema.decorators ? memberSchema.decorators.filter(function(decorator){
    return decorator.decorator === 'mlMethod'
  })[0] : null
  if (mlMethodDecorator) {
    let methodOptions = <MethodDetails> s.expressionToLiteral(mlMethodDecorator.parameters[0])
    methodOptions.path = path.join(memberSchema.parent.container.name, memberSchema.parent.name, memberSchema.name).replace(/\//g, '-')

    return methodOptions
  } else {
    return null
  }
}


export function getEventDetails(memberSchema:s.ClassMember):EventDetails {
  let mlMethodDecorator = memberSchema.decorators ? memberSchema.decorators.filter(function(decorator){
    return decorator.decorator === 'mlEvent'
  })[0] : null
  if (mlMethodDecorator) {
    let eventOptions = <EventDetails> s.expressionToLiteral(mlMethodDecorator.parameters[0])
    eventOptions.path = path.join(memberSchema.parent.container.name, memberSchema.parent.name, memberSchema.name).replace(/\//g, '-')

    return eventOptions
  } else {
    return null
  }
}
