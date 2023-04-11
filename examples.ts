/*** TEST CODE */

import { Client, SourceDoc } from './typed-aggregations';

type MyDoc = {n: number, o: { n: number, s: string, d: Date }, s: string};

const e = new Client({});
const p = e.search({
  Doc: SourceDoc as MyDoc,
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
          field: 'o.s'
        },
        aggs:{
          termCardinality: {
            cardinality:{
              field: 'n'
            }
          }
        }
      },
      aIndexedFilters: {
        filters: {
          filters: [{
            term: { n: 0 }
          }, {
            term: { n: 1 }
          }]
        }
      },
      aNamedFilters:{
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
              _source: ['o.n','s'] as const,
              size: 2
            }
          } 
        }
      },
      aRange: {
        range:{
          field: 'o.n',
          ranges:[{
            from: 0,
            to: 1,
            key: 'low'
          },{
            from: 1,
            key: 'high'
          }]
        }
      },
      aKeyedRange: {
        range:{
          keyed: true,
          field: 'o.n',
          ranges:[{
            from: 0,
            to: 1,
            key: 'low' as const
          },{
            from: 1,
            key: 'high' as const
          }]
        }
      }
    }
  } 
})
p.then(resp => {
  const a = resp.body.aggregations;

  a.aNamedFilters.big.doc_count;
  a.aIndexedFilters.buckets[0].key;
  a.aValueCount.value;
  a.aTerms.buckets[0].key;
  a.aTerms.buckets[0].termCardinality.value;
  a.aSum.value;
  a.aHistogram.buckets[0].key;
  a.aHistogram.buckets[0].z.doc_count
  a.aFilter.aTop.hits.hits[0]._source
  a.aRange.buckets[0].key
  a.aKeyedRange.high.doc_count
});
