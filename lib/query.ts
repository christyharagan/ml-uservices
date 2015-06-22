import {Observable} from 'uservices'

export interface ValueAndQuantity {
  value: any
  quantity: number
}

export class Facet {
  get values(): Observable<ValueAndQuantity> {
    // TODO
    return null
  }
}
export interface Facets {
  [index:string]:any
}

export class SearchResult<T> {
  values: T[]
  numberPages: number
  getPage(i: number): Promise<SearchResult<T>> {
    // TODO
    return null
  }
  next(): Promise<SearchResult<T>> {
    // TODO
    return null
  }
  prev(): Promise<SearchResult<T>> {
    // TODO
    return null
  }
}

export interface SearchOptions {
  numberPerPage: number
}

export class Search <T>{
  search(query:string, options?: SearchOptions, facets?:Facets): Promise<SearchResult<T>> {
    // TODO
    return null
  }
}
