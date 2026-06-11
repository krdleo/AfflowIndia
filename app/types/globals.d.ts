declare namespace JSX {
  interface IntrinsicElements {
    // Catch-all for non-React custom elements; `any` is required because
    // narrowing it would reject arbitrary attributes on those elements.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [elemName: string]: any;
  }
}
