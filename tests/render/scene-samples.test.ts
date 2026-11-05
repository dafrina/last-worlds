import { describe, expect, it } from 'vitest';
import { sceneSamples } from '../../src/render/post-pipeline';

describe('High scene target multisampling (user, 5 November: edge flicker on a phone, never on Low)', () => {
  it('multisamples on a real GPU', () => {
    expect(sceneSamples('ANGLE (Apple, ANGLE Metal Renderer: Apple A17 Pro GPU, Unspecified Version)', '')).toBe(4);
    expect(sceneSamples('Adreno (TM) 740', '')).toBe(4);
    expect(sceneSamples('', '')).toBe(4);
  });
  it('keeps software renderers (the browser tests) on the old target', () => {
    expect(sceneSamples('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', '')).toBe(0);
    expect(sceneSamples('llvmpipe (LLVM 15.0.7, 256 bits)', '')).toBe(0);
  });
  it('lets ?msaa= override either way, for comparison on a phone', () => {
    expect(sceneSamples('Adreno (TM) 740', '?msaa=0')).toBe(0);
    expect(sceneSamples('SwiftShader', '?msaa=4')).toBe(4);
    expect(sceneSamples('Adreno (TM) 740', '?msaa=16')).toBe(8);
  });
});
