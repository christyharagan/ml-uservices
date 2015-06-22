import * as s from 'typescript-schema'
import {Client} from 'marklogic'
import {MLSpecs} from './mlSpecGenerator'
import * as admin from 'ml-admin'
import {MethodOptions, EventOptions} from './decorators'
import * as path from 'path'
import * as fs from 'fs'
import * as ts from 'typescript'

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

export function deploy(client: Client, adminClient: Client, baseUri: string, moduleName: string, specs: MLSpecs, moduleSchema: s.ModuleSchema, code: string): Promise<any> {
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
            s.classSchemaVisitor(classSchema, {
              onClassMember: function(memberSchema) {
                if (memberSchema.type['parameters']) {
                  let functionSchema = <s.FunctionSchema> memberSchema.type

                  let methodDecorator = functionSchema.decorators.filter(decorator=> decorator.decorator === 'mlMethod')[0]
                  if (methodDecorator) {
                    //let sjs = `var service = new (require('/ext/${moduleName}').${classSchema.name})();`
                    let sjs = `var Service = require('/ext/${moduleName}').${classSchema.name};
var service = new Service();`
                    let methodOptions = <MethodOptions> s.expressionToLiteral(methodDecorator.parameters[0])
                    //let methodOptions = (<s.ObjectExpression>methodDecorator.parameters[0]).properties
                    //let methodType = (<string>(<s.Literal>methodOptions['method']).value).toUpperCase()
                    let methodType = methodOptions.method.trim().toUpperCase()
                    let methods = {}
                    methods[methodType] = {}

                    sjs += `
exports.${methodType} = function(context, params, input){
  context.outputTypes = ["application/json"];
  // TODO: Hockey: Shouldn't need, but guarentees a normal object. Look to remove
  return service.${memberSchema.name}.apply(service, JSON.parse(input.toString()));
};`

                    promises.push(admin.installServiceResourceExtension(adminClient, {
                      name: specs[classSchema.name].methods[memberSchema.name].path,
                      methods: methods,
                      description: '',
                      version: '1'
                    }, sjs))
                  }
                  let eventDecorator = functionSchema.decorators.filter(decorator=> decorator.decorator === 'mlEvent')[0]
                  if (eventDecorator) {
                    let moduleUri = path.posix.join(moduleName, classSchema.name, memberSchema.name)
                    let eventOptions = <EventOptions>s.expressionToLiteral(eventDecorator.parameters[0])
                    //let eventOptions = (<s.ObjectExpression>eventDecorator.parameters[0]).properties
                    let states: string[]
                    if (Array.isArray(eventOptions.states)) {
                      states = <Array<string>>eventOptions.states
                    } else {
                      states = [<string>eventOptions.states]
                    }

                    promises.push(admin.installModule(client, moduleUri, `
var Service = require('/ext/${moduleName}').${classSchema.name};
var service = new Service();
var rfp = require('/ext/ml-uservices');
var observable = service.${memberSchema.name}();
observable.subscribe(new rfp.HttpObserver(
  '${baseUri + specs[classSchema.name].methods[memberSchema.name].path}',
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
                          alertUri: moduleUri,
                          alertName: memberSchema.name,
                          actionName: memberSchema.name + 'Action',
                          actionModule: `/ext/${moduleUri}.sjs`,
                          triggerStates: states,
                          triggerScope: eventOptions.scope
                        })
                      }))
                  }
                }
              }
            })
          }
        }
      }
    })

    return Promise.all(promises)
  })
}
