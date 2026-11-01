export interface CspCheck {
  ok: boolean;
  problems: string[];
  hashes: string[];
  policy: string | null;
}

export function inlineScriptHashes(html: string): string[];
export function policyContent(html: string): string | null;
export function parsePolicy(policy: string): Record<string, string[]>;
export function checkIndexHtml(html: string): CspCheck;
