import * as s from 'typescript-schema'
import {MLSpec} from './remoteProxy'
import {generateSpec} from 'uservices'
import {posix as path} from 'path'
import {MethodOptions} from './decorators'

export interface MLSpecs {
  [className: string]: MLSpec<any>
}

export function generateMLSpec(schema: s.Schema, moduleSchema: s.ModuleSchema): MLSpecs {
  let mlSpecs: MLSpecs = {}

  s.moduleSchemaVisitor(moduleSchema, {
    onClassDecorator: function(decoratorSchema: s.DecoratorSchema, classSchema: s.ClassSchema) {
      if (decoratorSchema.decorator === 'mlService') {
        let typeReference = <s.TypeReference> classSchema.implements[0]
        let interfaceSchema = schema[typeReference.module].interfaces[typeReference.type]
        mlSpecs[classSchema.name] = <MLSpec<any>>generateSpec(moduleSchema, interfaceSchema)
      }
    },
    onClassMember: function(memberSchema, classSchema) {
      let mlSpec = mlSpecs[classSchema.name]
      if (mlSpec) {
        let methodSpec = mlSpec.methods[memberSchema.name]
        methodSpec.path = path.join(moduleSchema.name, classSchema.name, memberSchema.name).replace(/\//g, '-')
        if (methodSpec.cardinality === 0 || methodSpec.cardinality === 1) {
          let methodSchema = <s.FunctionSchema>memberSchema.type
          methodSchema.decorators.forEach(function(decorator){
            if (decorator.decorator === 'mlMethod') {
              let methodOptions = <MethodOptions> s.expressionToLiteral(decorator.parameters[0])
              methodSpec.method = (<string>methodOptions.method).toLowerCase().trim()
            }
          })
        }
      }
    }
  })

  return mlSpecs
}
