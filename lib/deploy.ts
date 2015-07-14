import * as s from 'typescript-schema'
import {Client} from 'marklogic'
import * as admin from 'ml-admin'
import {MethodOptions, EventOptions} from './decorators'
import * as path from 'path'
import * as fs from 'fs'
import * as ts from 'typescript'
import {visitSpec} from 'uservices'
import {getMethodDetails, getEventDetails} from './utils'

function removeDecorators(source: string): string {
  let count = 0
  let sf = ts.createSourceFile('blah.ts', source, ts.ScriptTarget.ES5)
  function _removeDecorators(node: ts.Node) {
    ts.forEachChild(node, function(node) {
      if (node.decorators) {
        node.decorators.forEach(function(decorator) {
          let start = decorator.getStart(sf) - count
          let end = decorator.getEnd() - count
          count += (end - start)
          let before = source.substring(0, start)
          let after = source.substring(end)
          source = before + after
        })
      }
      _removeDecorators(node)
    })
  }
  _removeDecorators(sf)
  return source
}

export function deploy(client: Client, adminClient: Client, baseUri: string, moduleName: string, moduleSchema: s.Module, code: string): Promise<any> {
  let hasService = false
  s.moduleSchemaVisitor(moduleSchema, {
    onClass: function(classSchema) {
      if (classSchema.decorators) {
        let serviceDecorator = classSchema.decorators.filter(decorator=> decorator.decorator === 'mlService')[0]
        if (serviceDecorator) {
          hasService = true
        }
        let proxyDecorator = classSchema.decorators.filter(decorator=> decorator.decorator === 'mlProxy')[0]
        if (proxyDecorator) {
          hasService = true
        }
      }
    }
  })

  if (hasService) {
    code = removeDecorators(code)
    code = ts.transpile(code)
    code = code.replace('require("ml-uservices")', 'require("/ext/ml-uservices")')
    code = code.replace('require(\'ml-uservices\')', 'require("/ext/ml-uservices")')

    return admin.installModule(client, moduleName, code).then(function() {
      return new Promise(function(resolve, reject) {
        fs.readFile(path.join(__dirname, 'rfp.js'), 'utf8', function(err, data) {
          if (err) {
            reject(err)
          }
          admin.installModule(client, 'ml-uservices', data).then(resolve).catch(reject)
        })
      })
    }).then(function() {
      let promises: Promise<any>[] = []

      s.moduleSchemaVisitor(moduleSchema, {
        onClass: function(classSchema) {
          if (classSchema.decorators) {
            let serviceDecorator = classSchema.decorators.filter(decorator=> decorator.decorator === 'mlService')[0]
            if (serviceDecorator) {
              visitSpec({
                onPromise: function(memberSchema) {
                  let methodDetails = getMethodDetails(memberSchema)
                  if (methodDetails) {
                    let sjs = `var Service = require('/ext/${moduleName}').${classSchema.name};
  var service = new Service();`
                    let methodType = methodDetails.method.trim().toUpperCase()
                    let methods = {}
                    methods[methodType] = {}

                    sjs += `
exports.${methodType} = function(context, params, input){
  context.outputTypes = ["application/json"];
  // TODO: Support multiple inputs + this will only work for PUT
  var promise = service.${memberSchema.name}.apply(service, input.toObject());
  var value;
  var error;
  promise.then(function(v){
    value = v;
  }, function(e){
    error = e;
  });
  if (error) {
    throw error;
  } else {
    return value
  }
};`

                    promises.push(admin.installServiceResourceExtension(client, {
                      name: methodDetails.path,
                      methods: methods,
                      description: '',
                      version: '1'
                    }, sjs))
                  }
                },
                onObservable: function(memberSchema) {
                  let eventDetails = getEventDetails(memberSchema)
                  if (eventDetails) {
                    let states: string[]
                    if (!eventDetails.states) {
                      states = ['create', 'modify']
                    } else if (Array.isArray(eventDetails.states)) {
                      states = <Array<string>>eventDetails.states
                    } else {
                      states = [<string>eventDetails.states]
                    }

                    promises.push(admin.installModule(client, eventDetails.path, `
var Service = require('/ext/${moduleName}').${classSchema.name};
var service = new Service();
var rfp = require('/ext/ml-uservices');
var observable = service.${memberSchema.name}();
observable.subscribe(new rfp.HttpObserver(
  '${baseUri + eventDetails.path}',
  {
    headers: {
      "content-type": "application/json"
    }
  }));

module.exports = function(uri, content){
  observable.onNext({uri: uri, content: content});
}`
                      ).then(function() {
                        return admin.installAlert(client, {
                          alertUri: eventDetails.path,
                          alertName: memberSchema.name,
                          actionName: memberSchema.name + 'Action',
                          actionModule: `/ext/${eventDetails.path}.sjs`,
                          triggerStates: states,
                          triggerScope: eventDetails.scope
                        })
                      }))
                  }
                }
              }, classSchema)
            }
            let proxyDecorator = classSchema.decorators.filter(decorator=> decorator.decorator === 'mlProxy')[0]
            if (proxyDecorator) {
              let methods:string[] = []
              visitSpec({
                onPromise: function(memberSchema) {
                  methods.push(memberSchema.name)
                },onObservable: function(memberSchema) {
                  // TODO
                }
              }, classSchema)

              if (methods.length > 0) {
                let servicePath = path.posix.join(classSchema.container.name, classSchema.name).replace(/\//g, '-')
                let code = `
var proxy = new (require('/ext/ml-uservices').RemoteProxy)('${baseUri + servicePath}', {
  headers: {
  "content-type": "application/json"
  }
});

module.exports = {
  ${methods[0]}: proxy.invokeMethod.bind(proxy, "${methods[0]}")`
                for (let i = 1; i < methods.length; i++) {
                  code += `,
  ${methods[i]}: proxy.invokeMethod.bind(proxy, "${methods[i]}")`
                }
                code += `
}`
                promises.push(admin.installModule(client, servicePath, code))
              }
            }
          }
        }
      })

      return Promise.all(promises)
    })
  } else {
    return Promise.resolve(true)
  }
}
