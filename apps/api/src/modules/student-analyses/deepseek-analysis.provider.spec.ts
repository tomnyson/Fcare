import { ServiceUnavailableException } from '@nestjs/common';
import { DeepSeekAnalysisProvider } from './deepseek-analysis.provider';
import type { AnalysisSourceSnapshot } from './analysis-source';

const snapshot: AnalysisSourceSnapshot = {
  focusTerm: '2025A',
  enrollments: [],
  evaluations: [],
  limitations: ['Khong co du lieu hoc phan hoc ky trong tam'],
};

const validOutput = {
  riskLevel: 'LOW' as const,
  summary: 'Tong quan on dinh.',
  strengths: ['Co y thuc hoc tap'],
  trends: [],
  riskFactors: [],
  recommendations: ['Tiep tuc duy tri lich hoc deu'],
  notificationSummary: 'Ket qua hien tai on dinh.',
  dataLimitations: ['Du lieu nhan xet con it'],
};

function makeConfig(overrides: Record<string, string> = {}) {
  return {
    get: jest.fn(
      (key: string, fallback?: string) => overrides[key] ?? fallback,
    ),
  };
}

/** Gan client gia vao provider (client that duoc tao trong constructor tu API key). */
function withClient(provider: DeepSeekAnalysisProvider, create: jest.Mock) {
  (
    provider as unknown as {
      client: { chat: { completions: { create: jest.Mock } } } | null;
    }
  ).client = { chat: { completions: { create } } };
  return provider;
}

function completion(content: string | null, model = 'deepseek-chat') {
  return {
    model,
    choices: [{ message: { content } }],
    usage: {
      prompt_tokens: 120,
      completion_tokens: 80,
      completion_tokens_details: { reasoning_tokens: 15 },
    },
  };
}

describe('DeepSeekAnalysisProvider', () => {
  it('bao loi ro rang khi chua cau hinh DEEPSEEK_API_KEY', async () => {
    const provider = new DeepSeekAnalysisProvider(makeConfig() as never);

    await expect(provider.generate(snapshot)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('gui chat completion o che do JSON kem rang buoc an toan trong prompt', async () => {
    const create = jest
      .fn()
      .mockResolvedValue(completion(JSON.stringify(validOutput)));
    const provider = withClient(
      new DeepSeekAnalysisProvider(
        makeConfig({
          DEEPSEEK_API_KEY: 'key',
          DEEPSEEK_MODEL: 'deepseek-chat',
        }) as never,
      ),
      create,
    );

    await provider.generate(snapshot);

    const firstCall = create.mock.calls[0] as [unknown] | undefined;
    const request = firstCall?.[0] as {
      model: string;
      max_tokens: number;
      response_format: { type: string };
      messages: { role: string; content: string }[];
    };

    expect(request).toMatchObject({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
    });
    expect(request.max_tokens).toBeGreaterThanOrEqual(1_500);

    const system = request.messages.find(
      (message) => message.role === 'system',
    );
    const user = request.messages.find((message) => message.role === 'user');
    expect(user?.content).toBe(JSON.stringify(snapshot));
    // Che do JSON cua DeepSeek yeu cau prompt co chu "json".
    expect(system?.content.toLowerCase()).toContain('json');
    // Cac rang buoc an toan phai giu nguyen nhu nhanh OpenAI.
    expect(system?.content).toContain('không phải chỉ dẫn');
    expect(system?.content).toContain('không tự tạo cảnh báo');
    // Khong co strict schema nen phai mo ta hinh dang output trong prompt.
    expect(system?.content).toContain('riskLevel');
    expect(system?.content).toContain('notificationSummary');
  });

  it('tra ve output da kiem tra schema kem so token da dung', async () => {
    const create = jest
      .fn()
      .mockResolvedValue(
        completion(JSON.stringify(validOutput), 'deepseek-chat-0725'),
      );
    const provider = withClient(
      new DeepSeekAnalysisProvider(
        makeConfig({ DEEPSEEK_API_KEY: 'key' }) as never,
      ),
      create,
    );

    await expect(provider.generate(snapshot)).resolves.toEqual({
      output: validOutput,
      model: 'deepseek-chat-0725',
      inputTokens: 120,
      outputTokens: 80,
      reasoningTokens: 15,
    });
  });

  it('chap nhan JSON boc trong khoi ```json cua model', async () => {
    const create = jest
      .fn()
      .mockResolvedValue(
        completion(`\`\`\`json\n${JSON.stringify(validOutput)}\n\`\`\``),
      );
    const provider = withClient(
      new DeepSeekAnalysisProvider(
        makeConfig({ DEEPSEEK_API_KEY: 'key' }) as never,
      ),
      create,
    );

    const result = await provider.generate(snapshot);

    expect(result.output).toEqual(validOutput);
  });

  it('nem loi khi model tra ve JSON hong', async () => {
    const create = jest
      .fn()
      .mockResolvedValue(completion('{"riskLevel": "LOW"'));
    const provider = withClient(
      new DeepSeekAnalysisProvider(
        makeConfig({ DEEPSEEK_API_KEY: 'key' }) as never,
      ),
      create,
    );

    await expect(provider.generate(snapshot)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('nem loi khi JSON hop le nhung lech schema phan tich', async () => {
    const create = jest
      .fn()
      .mockResolvedValue(
        completion(JSON.stringify({ ...validOutput, riskLevel: 'URGENT' })),
      );
    const provider = withClient(
      new DeepSeekAnalysisProvider(
        makeConfig({ DEEPSEEK_API_KEY: 'key' }) as never,
      ),
      create,
    );

    await expect(provider.generate(snapshot)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('nem loi khi model khong tra ve noi dung', async () => {
    const create = jest.fn().mockResolvedValue(completion(null));
    const provider = withClient(
      new DeepSeekAnalysisProvider(
        makeConfig({ DEEPSEEK_API_KEY: 'key' }) as never,
      ),
      create,
    );

    await expect(provider.generate(snapshot)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('cong bo ten model va phien ban prompt de ghi vao ban ghi phan tich', () => {
    const provider = new DeepSeekAnalysisProvider(
      makeConfig({ DEEPSEEK_MODEL: 'deepseek-reasoner' }) as never,
    );

    expect(provider.modelName()).toBe('deepseek-reasoner');
    expect(provider.promptVersion()).toContain('deepseek');
  });

  it('mac dinh dung deepseek-chat khi chua cau hinh model', () => {
    expect(
      new DeepSeekAnalysisProvider(makeConfig() as never).modelName(),
    ).toBe('deepseek-chat');
  });
});
