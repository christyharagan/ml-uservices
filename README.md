Marklogic uServices Library
==

Overview
--

Deploy remote proxies of [uServices](https://github.com/christyharagan/uservices) from Marklogic.


Usage
--

Install:
```
npm install ml-uservices
```

Basic Usage:

For a uService on Marklogic:

```TypeScript
import * as mlu from 'ml-uservices'
import {Observable} from 'uservices'
import {Message} from '../common/models/message'
import {ChatService} from '../common/services/chatService'

export class MessageBroadcast extends mlu.AlertObservable<Message, Message> {
  transform(uri: string, content: any) {
    return content
  }
}

@mlu.mlService()
export class ChatServiceML implements ChatService {
  private contentSearch = new ContentSearch()

  @mlu.mlMethod({
    method: 'put'
  })
  sendMessage(message: Message) {
    xdmp.documentInsert('/chatMessages/' + message.timestamp, message)
  }

  @mlu.mlEvent({
    states: ['create', 'modify'],
    scope: '/chatMessages/'
  })
  messageBroadcast() {
    return new MessageBroadcast()
  }
}

```

Then to proxy that to another tier:

```TypeScript
import {createRemoteProxy} from 'ml-uservices'
import * as RxRouter from 'koa-rx-router'

let router = new RxRouter({
    prefix: '/mlListener'
})
let chatService = createRemoteProxy(chatSpec, client, router)

```
