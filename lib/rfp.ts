import {Observable, Observer, Disposable} from 'uservices'

export interface Doc {
  uri: string
  content: any
}

export class AlertObservable<InputType, OutputType> implements Observable<OutputType>, Observer<Doc> {
  private observer: Observer<any>

  transform(uri: string, content: InputType): OutputType {
    throw 'Unimplemented Abstract Method'
  }

  onNext(doc: Doc) {
    this.observer.onNext(this.transform(doc.uri, doc.content))
  }

  onError(e) {
    this.observer.onError(e)
  }

  onCompleted() {
    this.observer.onCompleted()
  }

  subscribe(observer: Observer<OutputType>): Disposable {
    this.observer = observer
    return null
  }

  subscribeOnNext(onNext: (value: OutputType) => void, thisArg?: any): Disposable {
    return null
  }
  subscribeOnError(onError: (exception: any) => void, thisArg?: any): Disposable {
    return null
  }
  subscribeOnCompleted(onCompleted: () => void, thisArg?: any): Disposable {
    return null
  }
}

export class HttpObserver implements Observer<any> {
  constructor(uri: string, options: xdmp.HttpOptions) {
    this.uri = uri
    this.options = options || {}
  }

  private uri: string
  private options: xdmp.HttpOptions

  onNext(value: any): void {
    xdmp.httpPost(this.uri, this.options, { value: value })
  }
  onError(exception: any): void {
    xdmp.httpPost(this.uri, this.options, { error: exception })
  }
  onCompleted(): void {
  }
}
