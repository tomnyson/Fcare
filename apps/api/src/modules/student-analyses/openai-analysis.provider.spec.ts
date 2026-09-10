import { ServiceUnavailableException } from '@nestjs/common';
import { OpenAiAnalysisProvider } from './openai-analysis.provider';
import type { AnalysisSourceSnapshot } from './analysis-source';

const snapshot: AnalysisSourceSnapshot = {
  focusTerm: '2025A',
  enrollments: [],
  evaluations: [],
  careLogs: [],
  riskScore: {
    components: { RL: 0, RA: 0, RC: 0, RH: 0, RP: 0 },
    drs: 0,
    drsLevel: 1,
    dataForcedLevel: 1,
    evaluationCount: 0,
    medianAcademic: 0,
    medianAttitude: 0,
    triggeredCriteria: [],
    reasons: [],
  },
  limitations: ['Khong co du lieu hoc phan hoc ky trong tam'],
};

const parsedOutput = {
  riskLevel: 'LOW' as const,
  summary: 'Tong quan on dinh.',
  strengths: ['Co y thuc hoc tap'],
  trends: [],
  riskFactors: [],
  recommendations: ['Tiep tuc duy tri lich hoc deu'],
  notificationSummary: 'Ket qua hien tai on dinh.',
  dataLimitations: ['Du lieu nhan xet con it'],
  suggestedLevel: 1 as const,
  forcedEscalation: null,
};

describe('OpenAiAnalysisProvider', () => {
  it('gui request parse voi store false va cau hinh structured output mong muon', async () => {
    const parse = jest.fn().mockResolvedValue({
      output_parsed: parsedOutput,
      model: 'custom-model',
      usage: {
        input_tokens: 120,
        output_tokens: 80,
        output_tokens_details: { reasoning_tokens: 15 },
      },
    });
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'OPENAI_MODEL') return 'custom-model';
        return fallback;
      }),
    };
    const provider = new OpenAiAnalysisProvider(config as never);
    (
      provider as unknown as {
        client: { responses: { parse: typeof parse } } | null;
      }
    ).client = { responses: { parse } };
    (provider as unknown as { model: string }).model = 'custom-model';

    const result = await provider.generate(snapshot);
    const firstCall = parse.mock.calls[0] as [unknown] | undefined;
    const request = firstCall?.[0] as {
      model: string;
      store: boolean;
      reasoning: { effort: string };
      max_output_tokens: number;
      input: string;
      text: { format: unknown };
    };

    expect(request).toMatchObject({
      model: 'custom-model',
      store: false,
      reasoning: { effort: 'medium' },
      max_output_tokens: 2_000,
      input: JSON.stringify(snapshot),
    });
    expect(request.text.format).toBeDefined();
    expect(result).toEqual({
      output: parsedOutput,
      model: 'custom-model',
      inputTokens: 120,
      outputTokens: 80,
      reasoningTokens: 15,
    });
  });

  it('nem loi khi OpenAI khong tra ve output da parse hop le', async () => {
    const provider = new OpenAiAnalysisProvider({
      get: jest.fn((_: string, fallback?: string) => fallback),
    } as never);
    (
      provider as unknown as {
        client: { responses: { parse: jest.Mock } } | null;
      }
    ).client = {
      responses: {
        parse: jest.fn().mockResolvedValue({
          output_parsed: null,
          model: 'gpt-5.6-luna',
        }),
      },
    };

    await expect(provider.generate(snapshot)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
