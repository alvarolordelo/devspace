/** Only parse bounded candidate code; never turn model text into host commands. */
export function extractLaoBenchmarkModule(text: unknown, exportName: string): string | null {
  if (typeof text !== "string" || text.length < 10 || text.length > 12_000 ||
      !/^[A-Za-z][A-Za-z0-9]{2,50}$/.test(exportName)) return null;
  let code = text.trim();
  const fence = /^```(?:js|javascript|mjs)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(code);
  if (fence) code = fence[1]!.trim();
  const requiredExport = new RegExp("\\bexport\\s+(?:async\\s+)?function\\s+" + exportName + "\\s*\\(");
  if (/```/.test(code) || /\0/.test(code) || code.includes("\r") ||
      !requiredExport.test(code)) return null;
  return code + "\n";
}
