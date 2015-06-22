import {Spec, visitor, Method} from 'uservices'
import {Client} from 'marklogic'
import {createOperation, startRequest, Options} from 'marklogic/lib/mlrest'
import {Observable} from 'rx'

export interface Server {
  get(path: string): Observable<any>

  post(path: string): Observable<any>

  put(path: string): Observable<any>

  del(path: string): Observable<any>
}

export interface MLMethod extends Method {
  path: string
  method?: string
}

export interface MLMethods {
  [name: string]: MLMethod
}

export interface MLSpec<T> extends Spec<T> {
  methods: MLMethods
}

export function createRemoteProxy<T>(spec: MLSpec<T>, client: Client, server: Server): T {
  let proxy: any = {}
  visitor(function(name, method) {
    let mlMethod = <MLMethod> method
    if (mlMethod.cardinality < 0) {
      let observable = server.post('/' + mlMethod.path).map(function(value){
        if (value.value) {
          return value.value
        } else {
          throw value.error
        }
      })
      proxy[name] = function() {
        return observable
      }
    } else {
      proxy[name] = function(...args: any[]) {
        let options: Options = {
          method: mlMethod.method.toUpperCase() || 'POST',
          path: '/v1/resources/' + mlMethod.path,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
        Object.keys(client.connectionParams).forEach(function(key) {
          options[key] = client.connectionParams[key]
        })
        let operation = createOperation(name, client, options, 'single', 'single')

        operation.requestBody = JSON.stringify(args)

        return <Promise<string>> new Promise(function(resolve, reject) {
          startRequest(operation).result(resolve).catch(reject)
        })
      }
    }
  })(spec)
  return <T>proxy
}
