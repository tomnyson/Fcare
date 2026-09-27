import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { resolveAnalysisProviderKey } from './analysis-provider';
import { NOTE_DRAFT_INSTRUCTIONS } from './evaluation-note-draft';

const OPENAI_DEFAULT_MODEL = 'gpt-5.6-luna';
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';
const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com';
/** Đoạn nhận xét 2-4 câu; trần rộng cho model suy luận tính cả phần nghĩ. */
const MAX_OUTPUT_TOKENS = 2_000;

/**
 * Viết nháp ô "Nhận xét" — tách khỏi AcademicAnalysisProvider để không đổi
 * hợp đồng của luồng phân tích học kỳ. Dùng cùng AI_PROVIDER và API key.
 */
@Injectable()
export class EvaluationNoteDrafter {
  private readonly provider: 'openai' | 'deepseek';
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.provider = resolveAnalysisProviderKey(
      config.get<string>('AI_PROVIDER'),
    );
    if (this.provider === 'deepseek') {
      const apiKey = config.get<string>('DEEPSEEK_API_KEY');
      const baseURL = config.get<string>(
        'DEEPSEEK_BASE_URL',
        DEEPSEEK_DEFAULT_BASE_URL,
      );
      this.client = apiKey ? new OpenAI({ apiKey, baseURL }) : null;
      this.model = config.get<string>('DEEPSEEK_MODEL', DEEPSEEK_DEFAULT_MODEL);
    } else {
      const apiKey = config.get<string>('OPENAI_API_KEY');
      this.client = apiKey ? new OpenAI({ apiKey }) : null;
      this.model = config.get<string>('OPENAI_MODEL', OPENAI_DEFAULT_MODEL);
    }
  }

  async draft(prompt: string): Promise<string> {
    if (!this.client) {
      throw new ServiceUnavailableException({
        message: 'Chưa cấu hình khoá AI trên hệ thống.',
        code: 'AI_NOT_CONFIGURED',
      });
    }
    if (this.provider === 'deepseek') {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: NOTE_DRAFT_INSTRUCTIONS },
          { role: 'user', content: prompt },
        ],
      });
      return completion.choices[0]?.message?.content?.trim() ?? '';
    }
    const response = await this.client.responses.create({
      model: this.model,
      instructions: NOTE_DRAFT_INSTRUCTIONS,
      input: prompt,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });
    return response.output_text.trim();
  }
}
