# elastic-aggs
Typescript definitions for type-safe Elasticsearch aggregations

## Installation
```
npm install elastic-aggs
```

## How to use type-safe aggregations
Simply replace import for the Elasticsearch Client interface:
```
import { Client } from 'elastic-aggs';
```
The `Client` interface provided is itself based on the (peer) Elasticsearch dependancy, but with an additional function prototype for `search` that implements strongly types aggregations.

To use the types, you must as a `Doc` member to the search parameter that specifies what is stored in your ES index. If you don't have a `Doc` member, you're using the standard, Elasticsearch `search` definition.

## Example
https://user-images.githubusercontent.com/2789075/232029391-fbf8f785-1c1b-4113-9d69-5c040f135c52.mp4


In the example, we first add a `Doc` member that specifes the _type_ of the documents stored in the Elasticsearch index. This triggers the additional function prototype, which then complains because there is no `aggs` member.

As the `aggs` are entered, we're prompted for `field` values based on the fields in the `Doc`. This includes nested field member.

When handling the result, the `aggregations` have named, typed members, including nested aggregation results, quickly catching typos and incorrect aggregations.

## What's up `Doc`?
The `Doc` member is not used as run-time. It is only used to carry the type in the additional `search` function prototype. To avoid issues with the Elasticsearch library, it should evalue to `undefined`. A constant `SourceDoc = undefined as unknown` is exported so you can easily type-case your document type. Additionally, the constant `AnyDoc` is exported if you only want the aggregation result resolution and don't require field-level results.

* Why is it a member?
Typescript does not handle default type parameters (or variable type parameter lists) appropriately for this kind of call. It needs to capture not only the `Doc` but the exact, const (Readonly) type of the `search` parameter in order to be able to resolve the aggregations fully. Specifying it as an unused (undefined) parameter makes this possible.

## Status
At present, only a limited number of aggregations are provided (see `LeafAggregationKeys` and `NodeAggregationKeys` in https://github.com/MatAtBread/elastic-aggs/blob/main/typed-aggregations.ts#L122).

The same techniques can be used to implement many more and PRs to do so are welcome.


