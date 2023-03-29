import { AggregationsAggregationContainer, QueryDslQueryContainer, SearchRequest, SearchResponse, SearchSourceConfig } from '@elastic/elasticsearch/api/types'
import { ApiResponse, Client } from '@elastic/elasticsearch/api/new'
import { TransportRequestPromise } from '@elastic/elasticsearch/lib/Transport'

type Prettify<T> = T extends infer U ? { [K in keyof U]: U[K] extends object ? Prettify<U[K]> : U[K] } : never;

/* Some helper types */
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
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
}

/* Replace a field within an object with one of the same name but different (typically narrower) type,
 * preserving optional state 
*/
type ReType<T, K extends keyof T, NewType> = {
  [S in keyof T]: S extends K ? T[S] extends undefined ? undefined | NewType : NewType : T[S]
}

/* Obtain the keys of a object, including nested keys in dotted notation.
  Optionally, only match keys assignable to the specified FilterUnion type,
  ignoring all others. Like `keyof` for nested objects
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
type DotPick<T, D extends string|string[]> = UnionToIntersection<
 D extends `${infer P}.${infer Q}` 
  ? { [I in Extract<P,keyof T>]: DotPick<T[I],Q> }
  : Pick<T,Extract<D,keyof T>>>
  
/* Map an aggregation by name from the Elastocsearch definitions, replacing `field` 
  (if it exists) with the Doc-specific union of dot-notation keys 
*/
type MapElasticAggregation<Doc extends {}, Name extends keyof AggregationsAggregationContainer> = {
  [k in Name]: AggregationsAggregationContainer[Name] extends { field: string }
    ? AggregationsAggregationContainer[Name] & { field: DotKeys<Doc>}
    : AggregationsAggregationContainer[Name] extends { field?: string }
      ? AggregationsAggregationContainer[Name] & { field?: DotKeys<Doc>}
      : AggregationsAggregationContainer[Name]
}

// Replacaements for the un-dot-typed types in ES7
type TypedFields<Doc extends {}> = DotKeys<Doc> | DotKeys<Doc>[]
type TypedSearchSourceFilter<Doc extends {}> = {
  // TODO: should be exclusive
  excludes?: TypedFields<Doc>
  exclude?: TypedFields<Doc>
  includes?: TypedFields<Doc>
  include?: TypedFields<Doc>
}

type TypedSearchSourceConfig<Doc extends {}> = boolean | TypedSearchSourceFilter<Doc> | TypedFields<Doc>

/* The list of "simple" aggregations that only require a Doc parameter & can't have sub-aggregations */
type LeafAggregationKeys = 'value_count' | 'sum' | 'missing' | 'cardinality' | 'avg' | 'min' | 'max' | 'percentiles' | 'stats'
/* The list of "simple" aggregations that only require a Doc parameter & might have sub-aggregations */
type NodeAggregationKeys = 'date_histogram' | 'histogram' | 'terms'

/* The collection of mapped Elasticsearch aggregations that only 
 * require a Doc parameter keyed by distinguishing member
*/
type TypedFieldAggregations<Doc extends {}> = {
  [AggKey in NodeAggregationKeys]: MapElasticAggregation<Doc, AggKey> & OptionalNestedAggregations<Doc>
} & {
  [AggKey in LeafAggregationKeys]: MapElasticAggregation<Doc, AggKey>
} & {
  top_hits: { 
    top_hits: ReType<AggregationsAggregationContainer['top_hits'],'_source',undefined | Readonly<TypedSearchSourceConfig<Doc>>> 
  }
}

/* An interface from which aggregations thar can have nested aggregations can be extended */
interface OptionalNestedAggregations<Doc extends {}> {
  aggs?: NamedAggregations<Doc>
}

export type NamedAggregations<Doc extends {}> = DeepReadonly<{
  [aggregationName: string]: Aggregation<Doc>
}>;

type NestedAggregationResult<SubAggs,Doc extends {}> =
  SubAggs extends NamedAggregations<Doc>
  ? { [P in keyof SubAggs]: AggregationResult<SubAggs[P], Doc> }
  : unknown

declare namespace Aggregations {
  interface ValueResult {
    value: number
  }

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

  interface MissingResult {
    doc_count: number
  }

  interface PercentilesResult {
    values: { [p: string]: number }
  }

  interface StatsResult {
    count: number,
    min: number,
    max: number,
    avg: number,
    sum: number
  }
  
  type SourceDocFromTypedSourceConfig<SourceConfig extends Readonly<TypedSearchSourceConfig<Doc>>, Doc extends {}> = 
    SourceConfig extends false ? undefined 
    : SourceConfig extends true ? Doc 
    : SourceConfig extends boolean ? Doc | undefined 
    : SourceConfig extends TypedFields<Doc> ? DotPick<Doc, SourceConfig> 
    : SourceConfig extends TypedSearchSourceFilter<Doc> ? "typed-fields" 
    : never

  interface TopHitsResult<Doc extends {}, ThisAgg extends TypedFieldAggregations<Doc>['top_hits']> {
    hits: {
      total: number
      max_score: number
      hits: Document<SourceDocFromTypedSourceConfig<ThisAgg['top_hits']['_source'], Doc>>[]
    }
  }

  /* Multi-value aggregations with buckets that can be nested */
  interface GenericBucket<Key = string> {
    key: Key
    doc_count: number
  }

  interface GenericBucketResult<SubAggs, Doc extends {}> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs, Doc>>
  }

  interface ReverseNested<Doc> extends OptionalNestedAggregations<Doc> {
    reverse_nested: {}
  }

  interface Filter<Doc> extends OptionalNestedAggregations<Doc> {
    filter: QueryDslQueryContainer
  }

  type FilterResult<SubAggs, Doc extends {}> = NestedAggregationResult<SubAggs, Doc> & {
     doc_count: number
  }

  interface NestedDoc<Doc> extends OptionalNestedAggregations<Doc> {
    nested: {
      path: string
    }
  }

  type NestedDocResult<SubAggs, Doc extends {}> = NestedAggregationResult<SubAggs, Doc> & {
     doc_count: number
  }

  interface NamedFilters<Doc extends {}, Keys extends string> extends OptionalNestedAggregations<Doc> {
    filters: {
      filters: { [k in Keys]: QueryDslQueryContainer }
    }
  }
  interface NamedFiltersResult<Keys extends string, SubAggs, Doc extends {}> {
    buckets: { [K in Keys]: GenericBucket & NestedAggregationResult<SubAggs, Doc> }
  }
  interface OrderedFilters<Doc extends {}> extends OptionalNestedAggregations<Doc> {
    filters: {
      filters: QueryDslQueryContainer[]
    }
  }
  interface OrderedFiltersResult<Doc extends {}, SubAggs> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs, Doc>>
  }

  interface TermsResult<SubAggs, Doc extends {}> {
    doc_count_error_upper_bound: number,
    sum_other_doc_count: number,
    buckets: Array<NestedAggregationResult<SubAggs, Doc> & GenericBucket>
  }

  interface HistogramResult<SubAggs, Doc extends {}> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs, Doc>>
  }

  interface DateHistogramResult<SubAggs, Doc extends {}> {
    buckets: Array<{
      key_as_string: string
    } & GenericBucket<number> & NestedAggregationResult<SubAggs, Doc>>
  }

  interface GenericRange<Doc extends {}, Keyed> extends OptionalNestedAggregations<Doc> {
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

  interface Range<Doc extends {}> extends GenericRange<Doc, false | undefined> { }
  interface KeyedRange<Doc extends {}> extends GenericRange<Doc, true> { }

  interface RangeBucket {
    doc_count: number
    from: number | string,
    to: number | string
  }
  interface RangeResult<SubAggs, Doc extends {}> {
    buckets: Array<GenericBucket & RangeBucket & NestedAggregationResult<SubAggs, Doc>>
  }
  interface KeyedRangeResult<SubAggs, Doc extends {}> {
    buckets: { [k: string]: RangeBucket & NestedAggregationResult<SubAggs, Doc> }
  }
}

type AggregationResult<T,Doc> =
  // Terminal results which cannot have inner aggs
  T extends TypedFieldAggregations<Doc>['value_count'] ? Aggregations.ValueResult : never |
  T extends TypedFieldAggregations<Doc>['missing'] ? Aggregations.MissingResult : never |
  T extends TypedFieldAggregations<Doc>['cardinality'] ? Aggregations.ValueResult : never |
  T extends TypedFieldAggregations<Doc>['avg'] ? Aggregations.ValueResult : never |
  T extends TypedFieldAggregations<Doc>['min'] ? Aggregations.ValueResult : never |
  T extends TypedFieldAggregations<Doc>['max'] ? Aggregations.ValueResult : never |
  T extends TypedFieldAggregations<Doc>['sum'] ? Aggregations.ValueResult : never |
  T extends TypedFieldAggregations<Doc>['percentiles'] ? Aggregations.PercentilesResult : never |
  T extends TypedFieldAggregations<Doc>['stats'] ? Aggregations.StatsResult : never |

  T extends Aggregations.ScriptedMetric<infer Results,infer Params> ? Aggregations.ScriptedMetricResult<Results> : never |
  T extends TypedFieldAggregations<Doc>['top_hits'] ? Aggregations.TopHitsResult<Doc, T> : never |

  // Non-terminal aggs that _might_ have sub aggs
  T extends TypedFieldAggregations<Doc>['terms'] ? Aggregations.TermsResult<T["aggs"], Doc> : never |
  T extends TypedFieldAggregations<Doc>['histogram'] ? Aggregations.HistogramResult<T["aggs"], Doc> : never |

  T extends Aggregations.Filter<Doc> ? Aggregations.FilterResult<T["aggs"], Doc> : never |
  T extends Aggregations.NestedDoc<Doc> ? Aggregations.NestedDocResult<T["aggs"], Doc> : never |
  T extends Aggregations.NamedFilters<Doc, infer Keys> ? Aggregations.NamedFiltersResult<Keys, T["aggs"], Doc> : never |
  T extends Aggregations.OrderedFilters<Doc> ? Aggregations.OrderedFiltersResult<T["aggs"], Doc> : never |
  T extends Aggregations.Range<Doc> ? Aggregations.RangeResult<T["aggs"], Doc> : never |
  T extends Aggregations.ReverseNested<Doc> ? NestedAggregationResult<T["aggs"], Doc> : never |
  // Generic nested aggregation
  //T extends NestedAggregation<Doc> ? Aggregations.GenericBucketResult<T["aggs"], Doc> : never |
  never

type AggregationResults<A extends NamedAggregations<Doc>, Doc extends {}> = {
  [name in keyof A]: AggregationResult<A[name], Doc>
}

type Aggregation<Doc extends {}> = ExclusiveUnion<
/* Single-valued */
TypedFieldAggregations<Doc>[LeafAggregationKeys] 
| TypedFieldAggregations<Doc>['top_hits']
| Aggregations.ReverseNested<Doc> 
| Aggregations.Filter<Doc> 
| Aggregations.NamedFilters<Doc, string>
| Aggregations.ScriptedMetric<any, any>

/* Multi-valued */
| TypedFieldAggregations<Doc>[NodeAggregationKeys] 
| Aggregations.OrderedFilters<Doc> 
//| Aggregations.TopHits<any>
| Aggregations.Range<Doc>
| Aggregations.NestedDoc<Doc>

/* This fails at runtime - there is no such aggregations. 
  It's included as it's the "abstract base" of MultiBucketAggregation */
| OptionalNestedAggregations<Doc> 
>

interface Document<Source extends {}> {
  _index: string
  _id: string
  _source: Source
}

interface SearchParams<Doc extends {}> extends Omit<SearchRequest,'body'> {
  body: Omit<SearchRequest['body'],'aggs'> & {
    aggs: NamedAggregations<Doc>
  }
}

interface SearchResult <T extends SearchParams<Doc>, Doc extends {}> extends Omit<SearchResponse,'aggregations'> {
  aggregations: AggregationResults<T["body"]["aggs"], Doc>
}

// Exporeted so _unused_doc_type_inference_ can be supplied, as in:
//   search(..., SearchDoc as Document)
export const SourceDoc = undefined as unknown
type AnyDocField = string | number | boolean | { [field: string]: AnyDocField }
//   search(..., AnyDoc)
export const AnyDoc = undefined as { [field: string]: AnyDocField }

declare module '@elastic/elasticsearch/api/new' {
  interface Client {
    vsearch<Params extends SearchParams<typeof AnyDoc>>(
      params: Params)
      : TransportRequestPromise<ApiResponse<SearchResult<Params, typeof AnyDoc>, unknown>>
    
    vsearch<Doc extends {}, Params extends SearchParams<Doc>>(
      params: Params,
      _unused_doc_type_inference_?: Doc)
      : TransportRequestPromise<ApiResponse<SearchResult<Params, Doc>, unknown>>

    vsearch<Doc extends {}, Params extends SearchParams<Doc>, TContext>(
      params: Params,
      _unused_doc_type_inference_?: Doc,
      _unused_context_type_inference_?: TContext)
      : TransportRequestPromise<ApiResponse<SearchResult<Params,Doc>, TContext>>
  }
}

export { Client }

const DOC = {doc: 'abc', z: 123, q: { m: 456 }};
const TOP: TypedFieldAggregations<typeof DOC>['top_hits'] = {
  top_hits: {
    _source: 'q.m'
  }
}

const RES:Aggregations.TopHitsResult<typeof DOC,typeof TOP> = {
  hits:{
    max_score:0,
    total:0,
    hits:[{
      _id:'',
      _index: '',
      _source: {
        q:{
          m: 456
        }
      } as DotPick<typeof DOC, 'q.m'> // Need to find a way to derive this from the original Agg
    }]
  }
}

