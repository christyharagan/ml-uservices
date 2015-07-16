export interface MethodOptions {
  method: string
}

export interface EventOptions {
  states?: string|string[]
  scope?: string
}

export function mlService() {
  return function <S>(target: S) {
    return target
  }
}

export function mlMethod(options: MethodOptions) {
  return function(target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) {
  }
}

export function mlEvent(options: EventOptions) {
  return function(target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) {
  }
}

export enum FrequencyType {
  MINUTES, HOURS, DAYS
}

export interface TaskOptions {
  type: FrequencyType,
  frequency: number
}

export function task(definition?: TaskOptions) {
  return function(target: Object, propertyKey:string): void {
  }
}
