import { AggregationsAggregationContainer, AggregationsTopHitsAggregation, QueryDslQueryContainer, SearchRequest, SearchResponse } from '@elastic/elasticsearch/api/types';
import { ApiResponse, Client } from '@elastic/elasticsearch/api/new'
import { TransportRequestPromise } from '@elastic/elasticsearch/lib/Transport';

/* Some helper types */
type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

/* Map a type 
    {x:any} | {y:any} 
  such that it becomes 
    {x:any, y:never} | {x:never, y:any} 
  to ensure exclusivity amongst types differentiated by key names
*/
type ExclusiveUnion<T, U = T> =
T extends any
  ? T & Partial<Record<Exclude<U extends any ? keyof U : never, keyof T>, never>>
  : never;

/* Obtain the keys of a object, including nested keys in dotted notation.
  Optionally, only match keys assignable to the specified FilterUnion type,
  ignoring all others. Like `keyof` for nested objects
*/
type DotKeys<T extends object, FilterUnion = any, P extends (undefined|string) = undefined> = _DotKeys<T,FilterUnion,P,never>;
type _DotKeys<T extends object, FilterUnion, P extends (undefined|string), Acc> = ({
  [K in keyof T]: K extends string
    ? P extends undefined 
      ? T[K] extends object 
        ? _DotKeys<T[K],FilterUnion, K, (T[K] extends FilterUnion ? K : never)>
        : Acc | (T[K] extends FilterUnion ? K : never)
      : T[K] extends object 
        ? _DotKeys<T[K],FilterUnion, `${P}.${K}`, (T[K] extends FilterUnion ? `${P}.${K}` : never)>
        : Acc | (T[K] extends FilterUnion ? `${P}.${K}` : never)
    : never;
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
    : never ; 


/* Map an aggregation by name from the Elastocsearch definitions, replacing `field` 
  (if it exists) with the Doc-specific union of dot-notation keys 
*/
type MapElasticAggregation<Doc extends {}, Name extends keyof AggregationsAggregationContainer> = {
  [k in Name]: AggregationsAggregationContainer[Name] extends { field?: string }
    ? AggregationsAggregationContainer[Name] & { field?: DotKeys<Doc>}
    : AggregationsAggregationContainer[Name] extends { field: string }
      ? AggregationsAggregationContainer[Name] & { field: DotKeys<Doc>}
      : AggregationsAggregationContainer[Name];
};

/* The list of "simple" aggregations that only require a Doc parameter & can't have sub-aggregations */
type LeafAggregations = 'value_count' | 'sum' | 'missing' | 'cardinality' | 'avg' | 'min' | 'max' | 'percentiles' | 'stats';
/* The list of "simple" aggregations that only require a Doc parameter & can have sub-aggregations */
type NodeAggregations = 'histogram' | 'terms';

/* The collection of mapped Elasticsearch aggregations that only 
 * require a Doc parameter keyed by distinguishing member
*/
interface WithNestedAggregations<Doc extends {},T> extends Aggregations.NestedAggregation<Doc> {}
type TypedFieldAggregations<Doc extends {}> = {
  [AggKey in NodeAggregations]: MapElasticAggregation<Doc, AggKey> & Aggregations.NestedAggregation<Doc>;
} & {
  [AggKey in LeafAggregations]: MapElasticAggregation<Doc, AggKey>;
}

export interface NamedSubAggregations<Doc extends {}> {
    [name: string]: Aggregation<Doc>
  }

declare namespace Aggregations {
  interface ValueResult {
    value: number;
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
    doc_count: number;
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

  interface TopHits<Doc> {
    top_hits: Omit<AggregationsTopHitsAggregation, '_source'> & {
      _source?: {
        includes: (keyof Doc)[]
      }
    }
  }

  interface TopHitsResult<Doc extends {}, HighLightResult = Doc> {
    hits: {
      total: number;
      max_score: number;
      hits: Document<Doc>[]
    }
  }

  /* Multi-value aggregations with buckets that can be nested */
  interface NestedAggregation<Doc extends {}> {
    aggs?: NamedSubAggregations<Doc>
  }

  type NestedAggregationResult<SubAggs,Doc extends {}> =
    SubAggs extends NamedSubAggregations<Doc>
    ? { [P in keyof SubAggs]: AggregationResult<SubAggs[P], Doc> }
    : unknown;

  interface GenericBucket<Key = string> {
    key: Key;
    doc_count: number;
  }

  interface GenericBucketResult<SubAggs, Doc extends {}> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs, Doc>>
  }

  interface ReverseNested<Doc> extends NestedAggregation<Doc> {
    reverse_nested: {};
  }

  interface Filter<Doc> extends NestedAggregation<Doc> {
    filter: QueryDslQueryContainer
  }

  type FilterResult<SubAggs, Doc extends {}> = NestedAggregationResult<SubAggs, Doc> & {
     doc_count: number;
  }

  interface NestedDoc<Doc> extends NestedAggregation<Doc> {
    nested: {
      path: string
    }
  }

  type NestedDocResult<SubAggs, Doc extends {}> = NestedAggregationResult<SubAggs, Doc> & {
     doc_count: number;
  }

  interface NamedFilters<Doc extends {}, Keys extends string> extends NestedAggregation<Doc> {
    filters: {
      filters: { [k in Keys]: QueryDslQueryContainer }
    }
  }
  interface NamedFiltersResult<Keys extends string, SubAggs, Doc extends {}> {
    buckets: { [K in Keys]: GenericBucket & NestedAggregationResult<SubAggs, Doc> }
  }
  interface OrderedFilters<Doc extends {}> extends NestedAggregation<Doc> {
    filters: {
      filters: QueryDslQueryContainer[]
    }
  }
  interface OrderedFiltersResult<Doc extends {}, SubAggs> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs, Doc>>
  }

  /*interface Terms<Doc extends {},Type extends string | number = string | number> extends NestedAggregation<Doc> {
    terms: {
      field: DotKeys<Doc, string | number | boolean>;
      min_doc_count?: number;
      size?: number;
      include?: Type[]
      missing?: Type,
      order?: ({ [k: string]: 'asc' | 'desc' }) | ({ [k: string]: 'asc' | 'desc' }[])
    }
  }*/

  interface TermsResult<SubAggs, Doc extends {}> {
    doc_count_error_upper_bound: number,
    sum_other_doc_count: number,
    buckets: Array<NestedAggregationResult<SubAggs, Doc> & GenericBucket>
  }

  /*interface Histogram<Doc extends {}> extends NestedAggregation<Doc> {
    histogram: {
      field: string,
      interval: string | number,
      min_doc_count: number,
      extended_bounds?: {
        min: number
        max: number
      }
    }
  }*/
  interface HistogramResult<SubAggs, Doc extends {}> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs, Doc>>;
  }

  interface DateHistogram<Doc extends {}> extends NestedAggregation<Doc> {
    date_histogram: {
      field: string,
      interval: string | number,
      min_doc_count?: number,
      offset?: number | string,
      extended_bounds?: {
        min: number | string,
        max: number | string
      }
    }
  }

  interface DateHistogramResult<SubAggs, Doc extends {}> {
    buckets: Array<{
      key_as_string: string;
    } & GenericBucket<number> & NestedAggregationResult<SubAggs, Doc>>
  }

  interface GenericRange<Doc extends {}, Keyed> extends NestedAggregation<Doc> {
    range: {
      field: string;
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
    doc_count: number;
    from: number | string,
    to: number | string
  }
  interface RangeResult<SubAggs, Doc extends {}> {
    buckets: Array<GenericBucket & RangeBucket & NestedAggregationResult<SubAggs, Doc>>
  }
  interface KeyedRangeResult<SubAggs, Doc extends {}> {
    buckets: { [k: string]: RangeBucket & NestedAggregationResult<SubAggs, Doc> }
  }

  type AggregationExUnion<Doc extends {}> = ExclusiveUnion<
    TypedFieldAggregations<Doc>[LeafAggregations] 
    /* Single-valued */
    | ReverseNested<Doc> | Filter<Doc> | NamedFilters<Doc, string>
    | ScriptedMetric<any, any>

    /* Multi-valued */
    | TypedFieldAggregations<Doc>[NodeAggregations] 

    | OrderedFilters<Doc> 
    //| Terms<Doc>
    | TopHits<any>
    //| Histogram<Doc> 
    | DateHistogram<Doc> | Range<Doc>
    | NestedDoc<Doc>
    /* This fails at runtime. It's included as it's the "abstract base" of MultiBucketAggregation */
    | NestedAggregation<Doc> 
  >;
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
  T extends Aggregations.TopHits<infer D> ? (D extends {} ? Aggregations.TopHitsResult<D> : never) : never |

  // Non-terminal aggs that _might_ have sub aggs
  T extends TypedFieldAggregations<Doc>['terms'] ? Aggregations.TermsResult<T["aggs"], Doc> : never |
  T extends TypedFieldAggregations<Doc>['histogram'] ? Aggregations.HistogramResult<T["aggs"], Doc> : never |

  T extends Aggregations.Filter<Doc> ? Aggregations.FilterResult<T["aggs"], Doc> : never |
  T extends Aggregations.NestedDoc<Doc> ? Aggregations.NestedDocResult<T["aggs"], Doc> : never |
  T extends Aggregations.NamedFilters<Doc, infer Keys> ? Aggregations.NamedFiltersResult<Keys, T["aggs"], Doc> : never |
  T extends Aggregations.OrderedFilters<Doc> ? Aggregations.OrderedFiltersResult<T["aggs"], Doc> : never |
  T extends Aggregations.DateHistogram<Doc> ? Aggregations.DateHistogramResult<T["aggs"], Doc> : never |
  T extends Aggregations.Range<Doc> ? Aggregations.RangeResult<T["aggs"], Doc> : never |
  T extends Aggregations.ReverseNested<Doc> ? Aggregations.NestedAggregationResult<T["aggs"], Doc> : never |
  // Generic nested aggregation
  //T extends Aggregations.NestedAggregation<Doc> ? Aggregations.GenericBucketResult<T["aggs"], Doc> : never |
  never;

type AggregationResults<A extends NamedSubAggregations<Doc>, Doc extends {}> = {
  [name in keyof A]: AggregationResult<A[name], Doc>
}

type Aggregation<Doc extends {}> = Aggregations.AggregationExUnion<Doc>;

interface Document<Source extends {}> {
  _index: string;
  _id: string;
  _source: Source;
}

type SearchParamsBody<Doc extends {}> = Omit<SearchRequest['body'],'aggs'> & {
  aggs: NamedSubAggregations<Doc>;
}

interface SearchParams<Doc extends {}> extends Omit<SearchRequest,'body'> {
  //Doc: Doc,
  body: SearchParamsBody<Doc>;
}

interface SearchResult <T extends SearchParams<Doc>, Doc extends {}> extends Omit<SearchResponse,'aggregations'> {
  aggregations: AggregationResults<T["body"]["aggs"], Doc>;
}

// Exporeted so _unused_doc_type_inference_ can be supplied, as in:
//   search(..., SearchDoc as Document)
export const SourceDoc = undefined as unknown;
type AnyDocField = string | number | boolean | { [field: string]: AnyDocField }
//   search(..., AnyDoc)
export const AnyDoc = undefined as { [field: string]: AnyDocField }

declare module '@elastic/elasticsearch/api/new' {
  interface Client {
    /*search<Params extends SearchParams, Doc extends {}, TContext>(
      params: Params)
      :TransportRequestPromise<ApiResponse<SearchResult<Params,Doc>, TContext>>;*/

    vsearch<Params extends SearchParams<typeof AnyDoc>, TContext>(
      params: Params)
      : TransportRequestPromise<ApiResponse<SearchResult<Params, typeof AnyDoc>, TContext>>;

    vsearch<Params extends SearchParams<Doc>, Doc extends {}, TContext>(
      params: Params,
      _unused_doc_type_inference_: Doc)
      : TransportRequestPromise<ApiResponse<SearchResult<Params, Doc>, TContext>>;

    /*search<Params extends SearchParams, Doc extends {}, TContext>(
      params: Params,
      _unused_doc_type_inference_: Doc,
      _unused_context_type_inference_: TContext)
      :TransportRequestPromise<ApiResponse<SearchResult<Params,Doc>, TContext>>;*/
  }
}

export { Client };

