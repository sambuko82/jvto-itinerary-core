export class ZodError extends Error { issues: Array<{path:(string|number)[]; message:string}> }
export type infer<T> = any;
export type ZodType<T = any> = any;
declare class Schema { safeParse(v: unknown): {success:true; data:any}|{success:false; error:ZodError}; parse(v:unknown): any; optional(): any; nullable(): any; default(v:any): any; min(n:number): any; int(): any; positive(): any; nonnegative(): any; passthrough(): any; extend(shape:any): any; }
export const z: { ZodError: typeof ZodError; object(shape:any): Schema; array(s:any): Schema; string(): Schema; boolean(): Schema; number(): Schema; literal(v:any): Schema; null(): Schema; enum(v:any[]): Schema; unknown(): Schema; record(v:any): Schema; union(v:any[]): Schema; coerce:{number(): Schema}; };
export default z;
