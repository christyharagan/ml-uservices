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

// export interface SearchableOptions {
//   searches: Object[]
// }
//
// export interface RangeIndexedOptions {
//   name?: string
//   facets?: Object[]
// }

// export function searchable(options: SearchableOptions) {
//   return function(target: Object, propertyKey: string) {
//   }
// }
//
// export function rangeIndexed(options: RangeIndexedOptions) {
//   return function(target: Object, propertyKey: string) {
//   }
// }
//
// export interface SearchOptions {
//   search: Object
// }
//
// export function mlSearch(options: SearchOptions) {
//   return function<T>(target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<(query:string)=>SearchResult<any>>) {
//   }
// }
