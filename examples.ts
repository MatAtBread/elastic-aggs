/*** TEST CODE */

import { Client, SourceDoc } from './typed-aggregations';

type MyDoc = {n: number, o: { n: number, s: string }, s: string};

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
          field: 's'
        },
        aggs:{
          termCardinality: {
            cardinality:{
              field: 'n'
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
  a.aValueCount.value;
  a.aTerms.buckets[0].termCardinality.value;
  a.aSum.value;
  a.aHistogram.buckets[0].z.doc_count;
  a.aFilter.doc_count
});


/*
//var w: MapElasticAggregation<MyDoc,'value_count'>;
//w.value_count.field = 'o.n';


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