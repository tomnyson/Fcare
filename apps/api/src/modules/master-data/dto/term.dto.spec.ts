import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTermDto } from './term.dto';

async function errorsFor(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(UpdateTermDto, body));
  return errors.map((error) => error.property);
}

describe('UpdateTermDto.currentBlockOverride', () => {
  it('nhận 1, 2 hoặc null (bỏ ghi đè)', async () => {
    expect(await errorsFor({ currentBlockOverride: 1 })).toEqual([]);
    expect(await errorsFor({ currentBlockOverride: 2 })).toEqual([]);
    expect(await errorsFor({ currentBlockOverride: null })).toEqual([]);
  });

  it('từ chối giá trị khác 1 | 2', async () => {
    expect(await errorsFor({ currentBlockOverride: 3 })).toEqual([
      'currentBlockOverride',
    ]);
  });
});
