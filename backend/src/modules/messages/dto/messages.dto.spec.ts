import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendMessageDto } from './messages.dto';

const errors = (body: unknown) => validate(plainToInstance(SendMessageDto, { body }));

describe('SendMessageDto', () => {
  it('accepts 1 to 2000 characters', async () => {
    expect(await errors('a')).toHaveLength(0);
    expect(await errors('a'.repeat(2000))).toHaveLength(0);
  });

  it('rejects 2001 characters', async () => {
    expect(await errors('a'.repeat(2001))).toHaveLength(1);
  });

  it('rejects an empty or whitespace-only body', async () => {
    expect(await errors('')).toHaveLength(1);
    expect(await errors('   ')).toHaveLength(1);
  });
});
