import { client, Doc } from './harness';

var { body: { aggregations: aggs } } = await client.search({
  Doc,
  body: {
    aggs: {
      t: {
        terms:{
          field: 's',
          missing: 0
        }
      },
      u: {
        terms: {
          missing: '0',
          field: 'o.n'
        }
      }
    }
  }
});

aggs = {
  t:{
    doc_count_error_upper_bound:0,
    sum_other_doc_count: 0,
    buckets:[{
      doc_count: 0,
      key: ''
    },{
      doc_count: 0,
      key: ''
    }]
  },
  u:{
    doc_count_error_upper_bound:0,
    sum_other_doc_count: 0,
    buckets:[{
      doc_count: 0,
      key: 0.0
    },{
      doc_count: 0,
      key: 0.1
    }]
  }
}
