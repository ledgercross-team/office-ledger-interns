import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

async function errorsFor(input: Record<string, unknown>) {
  return validate(plainToInstance(ChangePasswordDto, input));
}

describe('ChangePasswordDto', () => {
  it('accepts a 10 character new password', async () => {
    expect(await errorsFor({ currentPassword: 'old', newPassword: 'a'.repeat(10) })).toHaveLength(
      0,
    );
  });

  it('rejects a new password under 10 characters', async () => {
    expect(await errorsFor({ currentPassword: 'old', newPassword: 'a'.repeat(9) })).toHaveLength(1);
  });

  it('rejects a new password over 128 characters', async () => {
    expect(await errorsFor({ currentPassword: 'old', newPassword: 'a'.repeat(129) })).toHaveLength(
      1,
    );
  });

  it('rejects a missing current password', async () => {
    expect(await errorsFor({ newPassword: 'a'.repeat(12) })).toHaveLength(1);
  });
});
