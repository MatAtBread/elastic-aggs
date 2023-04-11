import { AggregationsAggregationContainer, AggregationsAvgAggregate, AggregationsCardinalityAggregate, AggregationsMaxAggregate, AggregationsMinAggregate, AggregationsMissingAggregate, AggregationsStatsAggregate, AggregationsSumAggregate, AggregationsValueCountAggregate, QueryDslQueryContainer, SearchRequest, SearchResponse } from '@elastic/elasticsearch/api/types'
import { ApiResponse, Client } from '@elastic/elasticsearch/api/new'
import { TransportRequestCallback, TransportRequestOptions, TransportRequestPromise } from '@elastic/elasticsearch/lib/Transport'
import { callbackFn } from '@elastic/elasticsearch/lib/Helpers'

type Prettify<T> = T extends infer U ? { [K in keyof U]: U[K] extends object ? Prettify<U[K]> : U[K] } : never

/****************************************************************
  Some generic type helpers - not ES specific
*****************************************************************/
type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

/* Map a type 
    {x:any} | {y:any} 
  such that it becomes 
    {x:any, y:never} | {x:never, y:any} 
  to ensure exclusivity amongst types differentiated by key names
*/
type ExclusiveUnion<T, U = T> = T extends any
  ? T & Partial<Record<Exclude<U extends any ? keyof U : never, keyof T>, never>>
  : never

type DeepReadonly<T extends {}> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

type DeepPartial<T extends {}> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
  
/* Replace a fields within an object with one of the same name but different (typically narrower) type,
 * preserving optional state 
 */

type ReType<Original, New extends ({ [K in keyof Original]: any })> =
  Omit<Original, keyof New> & New

/* Obtain the keys of a object, including nested keys in dotted notation.
 * Optionally, only match keys assignable to the specified FilterUnion type,
 * ignoring all others. Like `keyof` for nested objects
 */
type DotKeys<T extends object, FilterUnion = any, P extends (undefined|string) = undefined> = _DotKeys<T,FilterUnion,P,never>
type _DotKeys<T extends object, FilterUnion, P extends (undefined|string), Acc> = ({
  [K in keyof T]: K extends string
    ? P extends undefined 
      ? T[K] extends object 
        ? _DotKeys<T[K],FilterUnion, K, (T[K] extends FilterUnion ? K : never)>
        : Acc | (T[K] extends FilterUnion ? K : never)
      : T[K] extends object 
        ? _DotKeys<T[K],FilterUnion, `${P}.${K}`, (T[K] extends FilterUnion ? `${P}.${K}` : never)>
        : Acc | (T[K] extends FilterUnion ? `${P}.${K}` : never)
    : never
  })[keyof T]

/* Given a Doc type and dotted-notation key, obtain the type of the
  specified member
*/
type UnDot<T extends object, D extends string> =
  D extends `${infer O}.${infer P}` 
  ? O extends keyof T 
    ? T[O] extends object 
      ? UnDot<T[O], P>
      : T[O] 
    : never
  : D extends keyof T 
    ? T[D] 
    : never 

/* Recursively pick fiekds specified in dot-notation */
type DotPick<T, D> = UnionToIntersection<
 D extends `${infer P}.${infer Q}` 
  ? { [I in Extract<P,keyof T>]: DotPick<T[I],Q> }
  : Pick<T,Extract<D,keyof T>>>
  
/* A utility that maps an array type like `['a','b','c']` to `'a'|'b'|'c'` */
type CombineConstStrings<A extends Readonly<string[]>> = 
  A extends Readonly<[infer I,...infer J]>
  ? J extends Readonly<string[]>
    ? I | CombineConstStrings<J> 
    : I | J 
  : never

/****************************************************************
  Types that map ES related types to the typed-versions we use
  to generate correct aggregation responses
*****************************************************************/

/* Map an aggregation by name from the Elasticsearch definitions, replacing `field` 
 * (if it exists) with the Doc-specific union of dot-notation keys 
 */
type MapElasticAggregation<Doc extends typeof AnyDoc, Name extends keyof AggregationsAggregationContainer> = {
  [k in Name]: AggregationsAggregationContainer[Name] extends { field: string }
    ? AggregationsAggregationContainer[Name] & { field: DotKeys<Doc>}
    : AggregationsAggregationContainer[Name] extends { field?: string }
      ? AggregationsAggregationContainer[Name] & { field?: DotKeys<Doc>}
      : AggregationsAggregationContainer[Name]
}

// Replacements for the un-dot-typed types in ES7
type TypedFields<Doc extends typeof AnyDoc> = Readonly<DotKeys<Doc>> | Readonly<DotKeys<Doc>[]>
type TypedSearchSourceFilter<Doc extends typeof AnyDoc> = {
  // TODO: should be exclusive
  excludes?: TypedFields<Doc>
  exclude?: TypedFields<Doc>
  includes?: TypedFields<Doc>
  include?: TypedFields<Doc>
}

type TypedSearchSourceConfig<Doc extends typeof AnyDoc> = boolean | TypedSearchSourceFilter<Doc> | TypedFields<Doc>

/* The list of "simple" aggregations that only require a Doc parameter & can't have sub-aggregations */
type LeafAggregationKeys = 'value_count' | 'sum' | 'missing' | 'cardinality' | 'avg' | 'min' | 'max' | 'percentiles' | 'stats'
/* The list of "simple" aggregations that only require a Doc parameter & might have sub-aggregations */
type NodeAggregationKeys = 'date_histogram' | 'histogram' | 'terms' | 'filters' | 'filter' | 'range' | 'nested' | 'reverse_nested'

/* The collection of mapped Elasticsearch aggregations that only 
 * require a Doc parameter keyed by distinguishing member
*/
export type TypedFieldAggregations<Doc extends typeof AnyDoc> = {
  [AggKey in NodeAggregationKeys]: MapElasticAggregation<Doc, AggKey> & OptionalNestedAggregations<Doc>
} & {
  [AggKey in LeafAggregationKeys]: MapElasticAggregation<Doc, AggKey>
} & {
  top_hits: { 
    top_hits: ReType<AggregationsAggregationContainer['top_hits'],{
      '_source': TypedSearchSourceConfig<Doc>
    }> 
  }
}

/* An interface from which aggregations thar can have nested aggregations can be extended */
interface OptionalNestedAggregations<Doc extends typeof AnyDoc> {
  aggs?: NamedAggregations<Doc>
}

type NamedAggregations<Doc extends typeof AnyDoc> = DeepReadonly<{
  [aggregationName: string]: Aggregation<Doc>
}>

type NestedAggregationResult<ThisAgg,Doc extends typeof AnyDoc> =
  ThisAgg extends OptionalNestedAggregations<Doc>
  ? { [P in keyof ThisAgg['aggs']]: AggregationResult<ThisAgg['aggs'][P], Doc> }
  : unknown

declare namespace AggregationResults {
  interface ScriptedMetric<Results extends (string | number | Array<string | number>), Params extends { [k: string]: number | string } = {}> {
    scripted_metric: {
      "init_script": string,
      "map_script": string,
      "combine_script": string,
      "reduce_script": string,
      "params": Params
    },
    "resultDoc": Results  // This field MUST ALWAYS BE UNDEFINED - it's only used to carry the type
  }

  interface ScriptedMetricResult<Result extends (string | number)[] | number | string> {
    value: Result
  }

  interface PercentilesResult {
    values: { [p: string]: number }
  }

  type SourceDocFromTypedSourceConfig<SourceConfig extends TypedSearchSourceConfig<Doc>, Doc extends typeof AnyDoc> = 
    SourceConfig extends false ? undefined 
    : SourceConfig extends true ? Doc 
    : SourceConfig extends boolean ? Doc | undefined 
    : SourceConfig extends string ? DotPick<Doc, SourceConfig> 
    : SourceConfig extends Readonly<string[]> ? DotPick<Doc, CombineConstStrings<SourceConfig>>
    : SourceConfig extends TypedSearchSourceFilter<Doc>
        ? (SourceConfig['include'] | SourceConfig['includes']) extends TypedFields<Doc> 
        // TODO : Omit the fields in `exclude|excludes`
        ? SourceDocFromTypedSourceConfig<(SourceConfig['include'] | SourceConfig['includes']), Doc> 
        : never
    // We can't understands the _source specification, so just assume the 
    // result is some kind of partial Doc - some fields might be present/absent
    : DeepPartial<Doc>

  interface TopHitsResult<ThisAgg extends TypedFieldAggregations<Doc>['top_hits'], Doc extends typeof AnyDoc> {
    hits: {
      total: number
      max_score: number
      hits: Document<SourceDocFromTypedSourceConfig<ThisAgg['top_hits']['_source'], Doc>>[]
    }
  }

  /* Multi-value aggregations with buckets that can be nested */
  interface GenericBucket<Key = string|number> {
    key: Key
    doc_count: number
  }

  interface GenericBucketResult<ThisAgg extends OptionalNestedAggregations<Doc>, Doc extends typeof AnyDoc> {
    buckets: Array<GenericBucket & NestedAggregationResult<ThisAgg, Doc>>
  }

  interface ReverseNested<Doc extends typeof AnyDoc> extends OptionalNestedAggregations<Doc> {
    reverse_nested: {}
  }

  type FilterResult<ThisAgg extends TypedFieldAggregations<Doc>['filter'], Doc extends typeof AnyDoc> = NestedAggregationResult<ThisAgg, Doc> & {
     doc_count: number
  }

  interface NestedDoc<Doc extends typeof AnyDoc> extends OptionalNestedAggregations<Doc> {
    nested: {
      path: string
    }
  }

  type NestedDocResult<ThisAgg extends (TypedFieldAggregations<Doc>['nested'] | TypedFieldAggregations<Doc>['reverse_nested']), 
    Doc extends typeof AnyDoc> = NestedAggregationResult<ThisAgg, Doc> & {
     doc_count: number
  }

  type FiltersResult<ThisAgg extends TypedFieldAggregations<Doc>["filters"], Doc extends typeof AnyDoc> =
    ThisAgg['filters']['filters'] extends Array<infer F> 
    ? { buckets: Array<GenericBucket & NestedAggregationResult<ThisAgg, Doc>> }
    : { [K in keyof ThisAgg['filters']['filters']]: GenericBucket & NestedAggregationResult<ThisAgg, Doc> }

  interface TermsResult<ThisAgg extends TypedFieldAggregations<Doc>["terms"], Doc extends typeof AnyDoc> {
    doc_count_error_upper_bound: number,
    sum_other_doc_count: number,
    buckets: Array<NestedAggregationResult<ThisAgg, Doc> & GenericBucket<UnDot<Doc,ThisAgg['terms']['field']>>>
  }

  interface HistogramResult<ThisAgg extends TypedFieldAggregations<Doc>['histogram'], Doc extends typeof AnyDoc> {
    buckets: Array<GenericBucket<UnDot<Doc,ThisAgg['histogram']['field']>> & NestedAggregationResult<ThisAgg, Doc>>
  }

  interface DateHistogramResult<ThisAgg extends TypedFieldAggregations<Doc>['date_histogram'], Doc extends typeof AnyDoc> {
    buckets: Array<{
      key_as_string: string
    } & GenericBucket<number> & NestedAggregationResult<ThisAgg, Doc>>
  }

  interface GenericRange<Doc extends typeof AnyDoc, Keyed> extends OptionalNestedAggregations<Doc> {
    range: {
      field: string
      keyed?: Keyed
      ranges: Array<{
        // Ideally we'd generate this from the source aggregation passed as a Generic
        name?: Keyed extends true ? string : never
      } & ({
        from?: number | string,
        to?: number | string
      } | {
        gte?: number | string,
        lt?: number | string
      })>
    }
  }

  interface RangeBucket<T> extends GenericBucket<string> {
    from: T,
    to: T
  }

  type RangeResult<ThisAgg extends TypedFieldAggregations<Doc>['range'], Doc extends typeof AnyDoc> = 
    ThisAgg['range']['keyed'] extends true 
      ? { [k in ThisAgg['range']['ranges'][0]['key']]: RangeBucket<UnDot<Doc,ThisAgg['range']['field']>> & NestedAggregationResult<ThisAgg, Doc> } 
      : { buckets: Array<RangeBucket<UnDot<Doc,ThisAgg['range']['field']>> & NestedAggregationResult<ThisAgg, Doc>> } 
}

interface ValueAggMap {
  value_count: AggregationsValueCountAggregate,
  missing: AggregationsMissingAggregate,
  cardinality: AggregationsCardinalityAggregate,
  avg: AggregationsAvgAggregate,
  min: AggregationsMinAggregate,
  max: AggregationsMaxAggregate,
  sum: AggregationsSumAggregate,
  stats: AggregationsStatsAggregate,
  percentiles: AggregationResults.PercentilesResult
}

/* Type that relates any defined aggregation for a Doc to its result */
export type AggregationResult<T,Doc extends typeof AnyDoc> =
  // Terminal results which cannot have inner aggs
  // T extends TypedFieldAggregations<Doc>[infer K extends keyof ValueAggMap] ? ValueAggMap[K] : never |

  T extends TypedFieldAggregations<Doc>['value_count'] ? ValueAggMap['value_count'] : never |
  T extends TypedFieldAggregations<Doc>['missing'] ? ValueAggMap['missing'] : never |
  T extends TypedFieldAggregations<Doc>['cardinality'] ? ValueAggMap['cardinality'] : never |
  T extends TypedFieldAggregations<Doc>['avg'] ? ValueAggMap['avg'] : never |
  T extends TypedFieldAggregations<Doc>['min'] ? ValueAggMap['min'] : never |
  T extends TypedFieldAggregations<Doc>['max'] ? ValueAggMap['max'] : never |
  T extends TypedFieldAggregations<Doc>['sum'] ? ValueAggMap['sum'] : never |
  T extends TypedFieldAggregations<Doc>['stats'] ? ValueAggMap['stats'] : never |
  T extends TypedFieldAggregations<Doc>['percentiles'] ? ValueAggMap['percentiles'] : never |

  // Special responses & aggs  
  T extends TypedFieldAggregations<Doc>['top_hits'] ? AggregationResults.TopHitsResult<T, Doc> : never |
  T extends AggregationResults.ScriptedMetric<infer Results,infer Params> ? AggregationResults.ScriptedMetricResult<Results> : never |

  // Non-terminal aggs that _might_ have sub aggs
  T extends TypedFieldAggregations<Doc>['terms'] ? AggregationResults.TermsResult<T, Doc> : never |
  T extends TypedFieldAggregations<Doc>['histogram'] ? AggregationResults.HistogramResult<T, Doc> : never |
  T extends TypedFieldAggregations<Doc>['date_histogram'] ? AggregationResults.DateHistogramResult<T, Doc> : never |
  T extends TypedFieldAggregations<Doc>['filters'] ? AggregationResults.FiltersResult<T, Doc> : never |
  T extends TypedFieldAggregations<Doc>['filter'] ? AggregationResults.FilterResult<T, Doc> : never |
  T extends TypedFieldAggregations<Doc>['range'] ? AggregationResults.RangeResult<T, Doc> : never |
  T extends TypedFieldAggregations<Doc>['nested'] ? AggregationResults.NestedDocResult<T, Doc> : never |
  T extends TypedFieldAggregations<Doc>['reverse_nested'] ? AggregationResults.NestedDocResult<T, Doc> : never |
  // Generic nested aggregations, if present
  T extends OptionalNestedAggregations<Doc> ? AggregationResults.GenericBucketResult<T, Doc> : never |
  never

type AggregationResults<A extends NamedAggregations<Doc>, Doc extends typeof AnyDoc> = {
  [name in keyof A]: AggregationResult<A[name], Doc>
}

type Aggregation<Doc extends typeof AnyDoc> = ExclusiveUnion<
  /* Single-valued */
  TypedFieldAggregations<Doc>[LeafAggregationKeys] 
  | TypedFieldAggregations<Doc>['top_hits']
  | AggregationResults.ReverseNested<Doc> 
  | AggregationResults.ScriptedMetric<any, any>

  /* Multi-valued */
  | TypedFieldAggregations<Doc>[NodeAggregationKeys] 
  | AggregationResults.NestedDoc<Doc>

  /* This fails at runtime - there is no such aggregations. 
    It's included as it's the "abstract base" of MultiBucketAggregation */
  | OptionalNestedAggregations<Doc> 
  >

interface Document<Source extends {}> {
  _index: string
  _id: string
  _source: Source
}

interface SearchParams<Doc extends typeof AnyDoc> extends Omit<SearchRequest,'body'> {
  body: Omit<SearchRequest['body'],'aggs'> & {
    aggs: NamedAggregations<Doc>
  }
}

interface SearchResult <T extends SearchParams<Doc>, Doc extends typeof AnyDoc> extends Omit<SearchResponse,'aggregations'> {
  aggregations: AggregationResults<T["body"]["aggs"], Doc>
}

// Exporeted so _unused_doc_type_inference_ can be supplied, as in:
//   search(..., SearchDoc as Document)
export const SourceDoc = undefined as unknown
type AnyDocField = string | number | boolean | Date | { [field: string]: AnyDocField }
//   search(..., AnyDoc)
export const AnyDoc = undefined as { [field: string]: AnyDocField }

declare module '@elastic/elasticsearch/api/new' {
  interface Client {
    search<Doc extends typeof AnyDoc, Params extends SearchParams<Doc>, TContext = unknown>(
      params: Params & { Doc: Doc, Context?: TContext },
      options?: TransportRequestOptions)
      : TransportRequestPromise<ApiResponse<SearchResult<Params, Doc>, TContext>>
  }
}

export { Client }

/* Other search prototypes
search<TDocument = unknown, TContext = unknown>(callback: callbackFn<T.SearchResponse<TDocument>, TContext>): TransportRequestCallback
search<TDocument = unknown, TContext = unknown>(params: T.SearchRequest, callback: callbackFn<T.SearchResponse<TDocument>, TContext>): TransportRequestCallback
search<TDocument = unknown, TContext = unknown>(params: T.SearchRequest, options: TransportRequestOptions, callback: callbackFn<T.SearchResponse<TDocument>, TContext>): TransportRequestCallback
*/