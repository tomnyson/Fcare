import { resolveAnalysisProviderKey } from './analysis-provider';

describe('resolveAnalysisProviderKey', () => {
  it('chon deepseek khi cau hinh yeu cau deepseek', () => {
    expect(resolveAnalysisProviderKey('deepseek')).toBe('deepseek');
  });

  it('bo qua khoang trang va chu hoa trong cau hinh', () => {
    expect(resolveAnalysisProviderKey('  DeepSeek ')).toBe('deepseek');
  });

  it('mac dinh openai khi chua cau hinh', () => {
    expect(resolveAnalysisProviderKey(undefined)).toBe('openai');
    expect(resolveAnalysisProviderKey('')).toBe('openai');
  });

  it('gia tri la thi roi ve openai thay vi lam sap ung dung', () => {
    expect(resolveAnalysisProviderKey('gemini')).toBe('openai');
  });
});
