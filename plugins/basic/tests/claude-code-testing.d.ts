// Types for tsc only; `claude plugin test` provides the real module at run time.
declare module 'claude-code/testing' {
  export const test: any;
  export const expect: any;
  export const mock: any;
}
