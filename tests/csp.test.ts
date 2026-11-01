/**
 * The CSP is the only control that would contain an HTML-injection bug we have
 * not found yet. These tests pin it to the shipped file and prove that the guard
 * fails when the policy is weakened or when the inline bootstrap drifts from its
 * hash.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkIndexHtml, inlineScriptHashes, policyContent } from '../scripts/check-csp.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('Content-Security-Policy', () => {
  it('accepts the shipped index.html and pins its single inline script', () => {
    const result = checkIndexHtml(html);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.hashes).toHaveLength(1);
    expect(result.hashes[0]).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/);
    expect(result.policy).toContain(`'${result.hashes[0]}'`);
  });

  it('never allows inline or eval script execution', () => {
    const policy = policyContent(html);
    expect(policy).not.toBeNull();
    const scriptSrc = (policy as string)
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('script-src')) as string;
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('allows blob: media, which imported recordings require', () => {
    expect(policyContent(html)).toContain("media-src 'self' blob:");
  });

  it('fails when the inline bootstrap changes without a hash update', () => {
    const drifted = html.replace('prefers-color-scheme', 'prefers-contrast');
    expect(drifted).not.toBe(html);
    const result = checkIndexHtml(drifted);
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toContain('missing the hash');
  });

  it("fails when script-src regains 'unsafe-inline'", () => {
    const weakened = html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
    expect(weakened).not.toBe(html);
    const result = checkIndexHtml(weakened);
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toContain("'unsafe-inline'");
  });

  it('fails on an inline event handler', () => {
    const injected = html.replace('</body>', '<img src="/icons/icon-192.png" onerror="void 0"></body>');
    expect(injected).not.toBe(html);
    const result = checkIndexHtml(injected);
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toContain('on*=');
  });

  it('fails on a javascript: URL', () => {
    const injected = html.replace('</body>', '<a href="javascript:void 0">x</a></body>');
    expect(injected).not.toBe(html);
    const result = checkIndexHtml(injected);
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toContain('javascript:');
  });

  it('fails when the meta policy is missing entirely', () => {
    const stripped = html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '');
    expect(stripped).not.toBe(html);
    const result = checkIndexHtml(stripped);
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toContain('no Content-Security-Policy');
  });

  it('hashes script bodies only, never external scripts', () => {
    const hashes = inlineScriptHashes(html);
    expect(hashes).toHaveLength(1);
    expect(html).toContain('<script type="module" src="/src/app/main.ts"></script>');
  });
});
