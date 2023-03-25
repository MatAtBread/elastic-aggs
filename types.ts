import { AggregationsTopHitsAggregation, QueryDslSimpleQueryStringQuery, SearchRequest, SearchResponse } from '@elastic/elasticsearch/api/types';
import { ApiResponse, Client } from '@elastic/elasticsearch/api/new'
import { TransportRequestPromise } from '@elastic/elasticsearch/lib/Transport';


/* Some helper types */
type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

type ExclusiveUnion<T, U = T> =
T extends any
  ? T & Partial<Record<Exclude<U extends any ? keyof U : never, keyof T>, never>>
  : never;

type DotKeys<T extends object, P extends (undefined|string) = undefined> = ({
  [K in keyof T]: K extends string
    ? P extends undefined 
      ? T[K] extends object 
        ? DotKeys<T[K],K> | K
        : K
      : T[K] extends object 
        ? DotKeys<T[K],`${P}.${K}`> | `${P}.${K}`
        : `${P}.${K}` 
      : never;
})[keyof T]

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
/* 
Example of DotKeys & UnDot:   
    type Doc = {
      a: string;
      b: {
        n: number;
      },
      c: {
        o: {
          x: 'x',
          y: 'y'|'Y',
        }
      }
    }
    
    const f: UnDot<Doc,'b'> = { n: 1 };
    const z:DotKeys<Doc> = 'c.o'
*/

declare namespace Filters {
  type MatchAll = {
    match_all: {}
  };

  type Ids = {
    ids: {
      values: string[]
    }
  };

  type SimpleQueryString = {
    simple_query_string: QueryDslSimpleQueryStringQuery
  }

  type Range<T extends (number | string | Date | unknown) = (number | string | Date | unknown)> = {
    range: {
      [field: string]: {
        gte?: T
        lt?: T
      }
    }
  }
  type Nested = {
    nested: {
      path: string;
      query: Filter;
    }
  }
  type Exists = {
    exists: {
      field: string
    }
  }
  type MoreLikeThis = {
    more_like_this: {
      fields: string[];
      like: string[]; // There are other formats
      min_term_freq?: number | undefined;
    }
  };

  type Term<FieldType extends (string | number | boolean) = string | number | boolean> = {
    term: {
      [field: string]: FieldType
    }
  }
  type Terms<FieldType extends (string | number | boolean) = string | number | boolean> = {
    terms: {
      [field: string]: FieldType[]
    }
  }
  type Bool = {
    bool: {
      filter?: Filter[] | Filter | undefined
      must_not?: Filter[] | Filter | undefined
      must?: Filter[] | Filter | undefined
      should?: Filter[] | Filter | undefined
      minimum_should_match?: number | string
    }
  };
  type Overlapping = Range | Term | Terms | Bool | Exists | MoreLikeThis | MatchAll | SimpleQueryString | Ids | Nested;
  type Filter = ExclusiveUnion<Overlapping>;
}

declare namespace Aggregations {
  /* Single value aggregations & results */
  interface ValueCount {
    value_count: {
      field: string
    }
  }

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

  interface Missing {
    missing: {
      field: string
    }
  }

  interface MissingResult {
    doc_count: number;
  }

  interface Cardinality {
    cardinality: {
      field: string
    }
  }

  interface Sum {
    sum: {
      field: string,
      missing?: number // Could be a date/time & therefore string
    }
  }

  interface Avg {
    avg: {
      field: string;
      missing?: number;
    }
  }

  interface Min {
    min: {
      field: string;
      missing?: number;
    } | {
      script: {
        source: string
      }
    }
  }

  interface Max {
    max: {
      field: string;
      missing?: number;
    } | {
      script: {
        source: string
      }
    }
  }

  interface Percentiles {
    percentiles: {
      field: string;
      percents: number[];
      missing?: number;
    }
  }
  interface PercentilesResult {
    values: { [p: string]: number }
  }

  interface Stats {
    stats: {
      field: string;
    } | {
      script: { source: string }
    }
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
  type NamedSubAggregations<Keys extends string = string> = {
    [name in Keys]?: Aggregation
  }
  interface NestedAggregation {
    aggs?: NamedSubAggregations
  }

  type NestedAggregationResult<SubAggs> =
    SubAggs extends NamedSubAggregations
    ? { [P in keyof SubAggs]: AggregationResult<SubAggs[P]> }
    : unknown;

  interface GenericBucket<Key = string> {
    key: Key;
    doc_count: number;
  }

  interface GenericBucketResult<SubAggs> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs>>
  }

  interface ReverseNested extends NestedAggregation {
    reverse_nested: {};
  }

  interface Filter extends NestedAggregation {
    filter: Filters.Filter
  }

  type FilterResult<SubAggs> = NestedAggregationResult<SubAggs> & {
     doc_count: number;
  }

  interface NestedDoc extends NestedAggregation {
    nested: {
      path: string
    }
  }

  type NestedDocResult<SubAggs> = NestedAggregationResult<SubAggs> & {
     doc_count: number;
  }

  interface NamedFilters<Keys extends string> extends NestedAggregation {
    filters: {
      filters: { [k in Keys]: Filters.Filter }
    }
  }
  interface NamedFiltersResult<Keys extends string, SubAggs> {
    buckets: { [K in Keys]: GenericBucket & NestedAggregationResult<SubAggs> }
  }
  interface OrderedFilters extends NestedAggregation {
    filters: {
      filters: Filters.Filter[]
    }
  }
  interface OrderedFiltersResult<SubAggs> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs>>
  }

  interface Terms<Type extends string | number = string | number> extends NestedAggregation {
    terms: {
      field: string;
      min_doc_count?: number;
      size?: number;
      include?: Type[]
      missing?: Type,
      order?: ({ [k: string]: 'asc' | 'desc' }) | ({ [k: string]: 'asc' | 'desc' }[])
    }
  }

  interface TermsResult<SubAggs> {
    doc_count_error_upper_bound: number,
    sum_other_doc_count: number,
    buckets: Array<NestedAggregationResult<SubAggs> & GenericBucket>
  }

  interface Histogram extends NestedAggregation {
    histogram: {
      field: string,
      interval: string | number,
      min_doc_count: number,
      extended_bounds?: {
        min: number
        max: number
      }
    }
  }
  interface HistogramResult<SubAggs> {
    buckets: Array<GenericBucket & NestedAggregationResult<SubAggs>>;
  }

  interface DateHistogram extends NestedAggregation {
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

  interface DateHistogramResult<SubAggs> {
    buckets: Array<{
      key_as_string: string;
    } & GenericBucket<number> & NestedAggregationResult<SubAggs>>
  }

  interface GenericRange<Keyed> extends NestedAggregation {
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

  interface Range extends GenericRange<false | undefined> { }
  interface KeyedRange extends GenericRange<true> { }

  interface RangeBucket {
    doc_count: number;
    from: number | string,
    to: number | string
  }
  interface RangeResult<SubAggs> {
    buckets: Array<GenericBucket & RangeBucket & NestedAggregationResult<SubAggs>>
  }
  interface KeyedRangeResult<SubAggs> {
    buckets: { [k: string]: RangeBucket & NestedAggregationResult<SubAggs> }
  }

  type SingleValueAggregation = ExclusiveUnion<ValueCount | Missing | Cardinality
    | Sum | Avg | Min | Max
    | TopHits<any> | Percentiles | Stats>
    | ReverseNested | Filter | NamedFilters<string>
    | ScriptedMetric<any, any>;
  type MultiBucketAggregation = ExclusiveUnion<OrderedFilters | Terms
    | Histogram | DateHistogram | Range
    | NestedDoc
    | NestedAggregation // This fails at runtime. It's included as it's the "abstract base" of MultiBucketAggregation
  >;
}

interface X {
  ValueCount:{
    A: Aggregations.ValueCount
    R: Aggregations.ValueResult
  }
}

type AggregationResult<T> =
  // Terminal results which cannot have inner aggs
  T extends X['ValueCount']['A'] ? X['ValueCount']['R'] : never |
  T extends Aggregations.ScriptedMetric<infer Results,infer Params> ? Aggregations.ScriptedMetricResult<Results> : never |
  T extends Aggregations.Missing ? Aggregations.MissingResult : never |
  T extends Aggregations.Cardinality ? Aggregations.ValueResult : never |
  T extends Aggregations.Avg ? Aggregations.ValueResult : never |
  T extends Aggregations.Min ? Aggregations.ValueResult : never |
  T extends Aggregations.Max ? Aggregations.ValueResult : never |
  T extends Aggregations.Sum ? Aggregations.ValueResult : never |
  T extends Aggregations.TopHits<infer D> ? (D extends {} ? Aggregations.TopHitsResult<D> : never) : never |
  T extends Aggregations.Percentiles ? Aggregations.PercentilesResult : never |
  T extends Aggregations.Stats ? Aggregations.StatsResult : never |
  // Non-terminal aggs that _might_ have sub aggs
  T extends Aggregations.Filter ? Aggregations.FilterResult<T["aggs"]> : never |
  T extends Aggregations.NestedDoc ? Aggregations.NestedDocResult<T["aggs"]> : never |
  T extends Aggregations.Terms ? Aggregations.TermsResult<T["aggs"]> : never |
  T extends Aggregations.NamedFilters<infer Keys> ? Aggregations.NamedFiltersResult<Keys, T["aggs"]> : never |
  T extends Aggregations.OrderedFilters ? Aggregations.OrderedFiltersResult<T["aggs"]> : never |
  T extends Aggregations.Histogram ? Aggregations.HistogramResult<T["aggs"]> : never |
  T extends Aggregations.DateHistogram ? Aggregations.DateHistogramResult<T["aggs"]> : never |
  T extends Aggregations.Range ? Aggregations.RangeResult<T["aggs"]> : never |
  T extends Aggregations.ReverseNested ? Aggregations.NestedAggregationResult<T["aggs"]> : never |
  // Generic nested aggregation
  // T extends Aggregations.NestedAggregation ? Aggregations.GenericBucketResult<T["aggs"]> : never |
  never;

type AggregationResults<A extends Aggregations.NamedSubAggregations<string>> = {
  [name in keyof A]: AggregationResult<A[name]>
}

type Aggregation = ExclusiveUnion<Aggregations.SingleValueAggregation | Aggregations.MultiBucketAggregation>
type Filter = Filters.Filter

interface Document<Source extends {}> {
	//_type: string; // Deprecated in ES7
  _index: string;
  _id: string;
  _source: Source;
}

type SearchParams = Omit<SearchRequest,'body'> & {
  body: Omit<SearchRequest['body'],'aggs'> & { aggs: Aggregations.NamedSubAggregations }
}

 type SearchAggregations<T extends SearchParams> = keyof T["body"]["aggs"];

type SearchResult<T extends SearchParams, Doc extends {}> = Omit<SearchResponse,'aggregations'> & {
  aggregations: T["body"]["aggs"] extends {} ? AggregationResults<T["body"]["aggs"]> : undefined ;
}


// Exporeted so _unused_doc_type_inference_ can be supplied, as in:
//   search(_trace_,query, SearchDoc as Document)
const SourceDoc = undefined as unknown;

declare module '@elastic/elasticsearch/api/new' {
interface Client {
  search<Params extends SearchParams, Doc extends {}, TContext>(
    params: Params)
    :TransportRequestPromise<ApiResponse<SearchResult<Params,Doc>, TContext>>;
  
  search<Params extends SearchParams, Doc extends {}, TContext>(
    params: Params,
    _unused_doc_type_inference_: Doc)
    :TransportRequestPromise<ApiResponse<SearchResult<Params,Doc>, TContext>>;
  
  search<Params extends SearchParams, Doc extends {}, TContext>(
    params: Params,
    _unused_doc_type_inference_: Doc,
    _unused_context_type_inference_: TContext)
    :TransportRequestPromise<ApiResponse<SearchResult<Params,Doc>, TContext>>;
  }
}
const e = new Client({});
e.search({
  index: '',
  body:{
    query:{
      match_all: {}
    },
    aggs:{
      s: {
        sum: {
          field: 'a'
        }
      },
      v:{
        value_count:{
          field: 'b'
        }
      }
    },
  }
}).then(r => r.body.aggregations.v.value);
