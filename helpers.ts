type DotKeys<T extends object, P extends (undefined | string) = undefined> = ({
  [K in keyof T]: K extends string
  ? P extends undefined
    ? T[K] extends object
      ? DotKeys<T[K], K> | K
      : K
    : T[K] extends object
    ? DotKeys<T[K], `${P}.${K}`> | `${P}.${K}`
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
    : never;
  /*
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