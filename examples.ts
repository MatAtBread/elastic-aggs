import { Client, SourceDoc } from './typed-aggregations';

/* This is what is stored in the ES index */
type MyDoc = {
  timestamp: Date,
  n: number, 
  o: { 
    n: number, 
    s: string
  }, 
  s: string
};

const es = new Client({
  node: 'localhost:9200'
});

es.search({
  // Typed aggs needs to know the document structure:
  Doc: SourceDoc as MyDoc,

  index: 'my-index',
  body: {
    query: {
      range: {
        timestamp: {
          gte: 'now-1d'
        }
      }
    },
    aggs:{
      chart:{
        date_histogram:{
          field: 'timestamp', // Constrained by the Doc fields
          interval: '15m'
        },
        aggs:{
          info:{
            stats:{
              field: 'o.n'
            }
          }
        }
      }
    }
  }
}).then( res => {
  return res.body.aggregations.chart.buckets.map(b => b.info.avg);
})


const p = es.search({
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
});
p.then(resp => {
  const a = resp.body.aggregations;

  a.aNamedFilters.buckets.big.doc_count;
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
