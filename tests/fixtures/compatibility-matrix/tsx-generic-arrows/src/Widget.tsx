export const RenderValue = <T,>({ value }: { value: T | null }) =>
  value ? <span>{String(value)}</span> : <span>empty</span>;
