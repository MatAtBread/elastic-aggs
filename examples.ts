/*** TEST CODE */

import { AggregationResult, Client, SourceDoc, TypedFieldAggregations } from './typed-aggregations';

type MyDoc = {n: number, o: { n: number, s: string, d: Date }, s: string};

const e = new Client({});
e.vsearch({
  index: '',
  body:{
    query:{
      bool:{
        filter:{
          match_all:{}
        }
      }
    },
    aggs: {
      aValueCount:{
        value_count:{
          field: 'o.n'
        }
      },
      aSum: {
        sum: {
          field: 'o.n'
        }
      },
      aHistogram: {
        histogram:{
          field: 'n'
        },
        aggs:{
          z:{
            missing:{
              field:'s'
            }
          }
        }
      },
      aTerms: {
        terms:{
          field: 'o.n'
        },
        aggs:{
          termCardinality: {
            cardinality:{
              field: 'n'
            }
          }
        }
      },
      aFilters:{
        filters: {
          filters: {
            big: {
              range: {
                'o.n': {
                  gte: 10
                }
              }
            },
            small: {
              range: {
                'o.n': {
                  lt: 10
                }
              }
            }
          }
        }
      },
      aFilter: {
        filter:{
          match_all: {}
        },
        aggs:{
          aTop:{
            top_hits:{
              _source:['n','o.n'],
              size: 2
            } as const
          } 
        }
      }
    }
  } 
}, SourceDoc as MyDoc).then(({ body: { aggregations : a }}) => {
  a.aFilters.buckets.big.doc_count;
  a.aValueCount.value;
  a.aTerms.buckets[0].key;
  a.aTerms.buckets[0].termCardinality.value;
  a.aSum.value;
  a.aHistogram.buckets[0].key;
  a.aHistogram.buckets[0].z.doc_count
  a.aFilter.aTop.hits.hits[0]._source
});

const DOC = {doc: 'abc', z: 123, q: { m: 456 }};
const TOP: TypedFieldAggregations<typeof DOC>['top_hits'] = {
  top_hits: {
    _source: 'q.m'
  }
}

const RES: AggregationResult<typeof TOP, typeof DOC> = {
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
      }
    }]
  }
}

//var w: MapElasticAggregation<MyDoc,'value_count'>;
//w.value_count.field = 'o.n';

/*
a.v.value;
a.t.buckets[0].c.value;
a.s.value;
a.h.buckets[0].z.doc_count;

var n: Aggregations.NamedSubAggregations<MyDoc> = {
  name:{
    value_count:{
      field: 'o.n'
    }
  }
}

var tt: TypedFieldAggregations<MyDoc>['terms'] = {
  terms:{
    field: 's'
  },
  aggs:{
    sub2: {
      min: {
        field: 'n'
      }
    },
    sub1:{
      sum:{
        field: 'o.n'
      }
    }
  } 
} as const;
tt.aggs

var y: AggregationResult<typeof tt, MyDoc>;
y.buckets[0]

var ka:DotKeys<MyDoc>;
ka = 'o'
var kn:DotKeys<MyDoc,number>;
kn = 'o.n'
var ks:DotKeys<MyDoc,string>;
ks = 'o.s'
var ko:DotKeys<MyDoc,number|string>;
ko = 'n'
*/