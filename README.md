# elastic-aggs
Typescript definitions for type-safe Elasticsearch aggregations

## Installation
```
npm install elastic-aggs
```

## How to use
Simply replace import for the Elasticsearch Client interface:
```
import { Client } from 'elastic-aggs';
```
The `Client` interface provided is itself based on the (peer) Elasticsearch dependancy, but with an additional function prototype for `search` that implements striogly types aggregations.

To use the types, you must as a `Doc` member to the search parameter that specifies what is stored in your ES index

## Example
https://user-images.githubusercontent.com/2789075/232029391-fbf8f785-1c1b-4113-9d69-5c040f135c52.mp4

