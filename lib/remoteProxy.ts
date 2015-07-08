import {visitSpec, Observable, Spec} from 'uservices'
import {Client} from 'marklogic'
import {createOperation, startRequest, Options} from 'marklogic/lib/mlrest'
import * as s from 'typescript-schema'
import {getMethodDetails, getEventDetails} from './utils'

export interface Server {
  get(path: string): Observable<any>

  post(path: string): Observable<any>

  put(path: string): Observable<any>

  del(path: string): Observable<any>
}

export function createRemoteProxy<T>(serviceSchema: s.Class, client: Client, server: Server): T {
  let proxy: any = {}
  visitSpec({
    onPromise(memberSchema:s.ClassMember, functionT:s.FunctionType):void {
      let methodDetails = getMethodDetails(memberSchema)
      let name = memberSchema.name
      if (methodDetails) {
        proxy[name] = function(...args: any[]) {
          let options: Options = {
            method: methodDetails.method.toUpperCase() || 'POST',
            path: '/v1/resources/' + methodDetails.path,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
          Object.keys(client.connectionParams).forEach(function(key) {
            options[key] = client.connectionParams[key]
          })
          let operation = createOperation(name, client, options, 'single', 'single')

          // TODO: Support more than one arg...
          operation.requestBody = JSON.stringify(args)

          return <Promise<string>> new Promise(function(resolve, reject) {
            startRequest(operation).result(resolve).catch(reject)
          })
        }
      }
    },
    onObservable(memberSchema:s.ClassMember){
      let name = memberSchema.name
      let eventDetails = getEventDetails(memberSchema)
      if (eventDetails) {
        let observable = server.post('/' + eventDetails.path).map(function(value){
          if (value.value) {
            return value.value
          } else {
            throw value.error
          }
        })
        proxy[name] = function() {
          return observable
        }
      }
    }
  }, serviceSchema)

  return <T>proxy
}
