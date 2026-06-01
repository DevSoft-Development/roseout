export function renderKbTemplate(content: string, variables: Record<string, string | number | boolean | null | undefined>) {
  return content.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
