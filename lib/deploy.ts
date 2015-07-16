import * as s from 'typescript-schema'
import {Client} from 'marklogic'
import * as admin from 'ml-admin'
import {MethodOptions, EventOptions, TaskOptions, FrequencyType} from './decorators'
import * as path from 'path'
import * as fs from 'fs'
import * as ts from 'typescript'
import {visitSpec} from 'uservices'
import {getMethodDetails, getEventDetails} from './utils'
import {Wirings, Wiring} from 'tschuss'

function addWiring(source: string, baseUri:string, schema:s.Schema, wiring:Wiring[]): string {
  let sf = ts.createSourceFile('blah.ts', source, ts.ScriptTarget.ES5)
  let count = 0
  function _addWiring(node: ts.Node) {
    ts.forEachChild(node, function(node) {
      if (node.kind === ts.SyntaxKind.Constructor && wiring) {
        let constructorDeclaration = <ts.ConstructorDeclaration> node
        let start = constructorDeclaration.body.getStart(sf) + count
        let code = ''
        wiring.forEach(function(wiring){
          let bindingModule = schema[wiring.binding.type.module]
          let classSchema = bindingModule.classes[wiring.binding.type.name]
          let methods:string[] = []
          if (classSchema) {
            visitSpec({
              onPromise: function(memberSchema) {
                methods.push(memberSchema.name)
                },onObservable: function(memberSchema) {
                  // TODO
                }
            }, classSchema)
          } else {
            let intSchema = bindingModule.interfaces[wiring.binding.type.name]
            visitSpec({
              onPromise: function(memberSchema) {
                methods.push(memberSchema.name)
              },onObservable: function(memberSchema) {
                // TODO
              }
            }, intSchema)
          }

          let servicePath = path.posix.join(wiring.binding.type.module, wiring.binding.type.name).replace(/\//g, '-')
          code += `
var proxy = new RemoteProxy('${baseUri + servicePath}', {
headers: {
"content-type": "application/json"
}
});

${wiring.injection.name} = {
${methods[0]}: proxy.invokeMethod.bind(proxy, "${methods[0]}")`
          for (let i = 1; i < methods.length; i++) {
            code += `,
${methods[i]}: proxy.invokeMethod.bind(proxy, "${methods[i]}")`
          }
          code += `
}`
        })
        let before = source.substring(0, start)
        let after = source.substring(start)
        count += code.length
        source = before + code + after
      }
      _addWiring(node)
    })
  }
  _addWiring(sf)
  return source
}

function removeDecorators(source: string, baseUri:string, schema:s.Schema, wiring:Wiring[]): string {
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

/*function inject(method: s.FunctionType, source: string, parsed:ts.SourceFile) {
  method.parameters.forEach(function(parameter){
    if (parameter.decorators) {
      let inject = parameter.decorators.filter(function(decorator){
        return decorator.decorator === 'inject'
      })[0]
      if (inject) {

      }
    }
  })
}*/

export interface DeployOptions {
  client: Client,
  adminClient: Client,
  configClient: Client,
  baseUri: string,
  moduleName: string,
  moduleSchema: s.Module,
  schema: s.Schema,
  wirings:Wirings,
  code: string,
  contentDatabase: string,
  modulesDatabase: string,
  taskUser: string
}

export function deploy(options:DeployOptions): Promise<any> {
  let hasService = false
  let task:TaskOptions
  let wiring:Wiring[]
  s.moduleSchemaVisitor(options.moduleSchema, {
    onClassMemberDecorator: function(decorator, classMember) {
      switch (decorator.decorator) {
        case 'mlMethod':
          hasService = true
          break
        case 'mlEvent':
          hasService = true
          break
        case 'task':
          task = s.expressionToLiteral(decorator.parameters[0])
          break
      }
    },

    onClass: function(classSchema:s.Class) {
      wiring = options.wirings[classSchema.container.name + '.' + classSchema.name]
/*
      if (classSchema.decorators) {
        let serviceDecorator = classSchema.decorators.filter(decorator=> decorator.decorator === 'mlService')[0]
        if (serviceDecorator) {
          hasService = true
        }
        let proxyDecorator = classSchema.decorators.filter(decorator=> decorator.decorator === 'mlProxy')[0]
        if (proxyDecorator) {
          hasService = true
        }
      }*/

    }
  })
  if (hasService || task) {
    let code = removeDecorators(options.code, options.baseUri, options.schema, wiring)
    //code = addWiring(code, options.baseUri, options.schema, wiring)

    console.log(code)

    code = ts.transpile(code)
    code = code.replace('require("ml-uservices")', 'require("/ext/ml-uservices")')
    code = code.replace('require(\'ml-uservices\')', 'require("/ext/ml-uservices")')
    if (wiring) {
      code = "var RemoteProxy = require('/ext/ml-uservices').RemoteProxy;\n" + code
    }


    return admin.installModule(options.client, options.moduleName, code).then(function() {
      return new Promise(function(resolve, reject) {
        fs.readFile(path.join(__dirname, 'rfp.js'), 'utf8', function(err, data) {
          if (err) {
            reject(err)
          }
          admin.installModule(options.client, 'ml-uservices', data).then(resolve).catch(reject)
        })
      })
    }).then(function() {
      if (hasService) {
        let promises: Promise<any>[] = []

        s.moduleSchemaVisitor(options.moduleSchema, {
          onClass: function(classSchema) {
            if (classSchema.decorators) {
              let serviceDecorator = classSchema.decorators.filter(decorator=> decorator.decorator === 'mlService')[0]
              if (serviceDecorator) {
                visitSpec({
                  onPromise: function(memberSchema) {
                    let methodDetails = getMethodDetails(memberSchema)
                    if (methodDetails) {
                      let sjs = `var Service = require('/ext/${options.moduleName}').${classSchema.name};
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

                      promises.push(admin.installServiceResourceExtension(options.client, {
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

                      promises.push(admin.installModule(options.client, eventDetails.path, `
  var Service = require('/ext/${options.moduleName}').${classSchema.name};
  var service = new Service();
  var rfp = require('/ext/ml-uservices');
  var observable = service.${memberSchema.name}();
  observable.subscribe(new rfp.HttpObserver(
    '${options.baseUri + eventDetails.path}',
    {
      headers: {
        "content-type": "application/json"
      }
    }));

  module.exports = function(uri, content){
    observable.onNext({uri: uri, content: content});
  }`
                        ).then(function() {
                          return admin.installAlert(options.client, {
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
              /*let proxyDecorator = classSchema.decorators.filter(decorator=> decorator.decorator === 'mlProxy')[0]
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
              }*/
            }
          }
        })

        return Promise.all(promises)
      } else if (task) {
        let type:string
        switch (task.type) {
          case FrequencyType.MINUTES:
            type = 'minutely'
            break
          case FrequencyType.HOURS:
            type = 'hourly'
            break
          case FrequencyType.DAYS:
            type = 'daily'
            break
        }
        // TODO: Typescript-schema doesnt yet support enums
        type = 'minutely'

        console.log({
          'task-enabled':true,
          'task-path': `/ext/${options.moduleName}.sjs`,
          'task-root': '/',
          'task-type': type,
          'task-period': task.frequency,
          'task-database': options.contentDatabase,
          'task-modules': options.modulesDatabase,
          'task-user': options.taskUser
        })
        return admin.createTask(options.configClient, {
          'task-enabled':true,
          'task-path': `/ext/${options.moduleName}.sjs`,
          'task-root': '/',
          'task-type': type,
          'task-period': task.frequency,
          'task-database': options.contentDatabase,
          'task-modules': options.modulesDatabase,
          'task-user': options.taskUser
        }, 'Default')
      }
    })
  } else {
    return Promise.resolve(true)
  }
}
