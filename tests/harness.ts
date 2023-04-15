import { Client } from '../typed-aggregations';

declare var client: Client;
declare const Doc:{
  timestamp: Date,
  n: number,
  o: {
    n: number,
    s: string
  },
  s: string
};

export { client, Doc };
