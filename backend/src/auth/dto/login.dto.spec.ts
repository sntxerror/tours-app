import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

const errorsFor = async (plain: object) =>
  (await validate(plainToInstance(LoginDto, plain))).map((e) => e.property);

describe('LoginDto', () => {
  it('accepts a valid email and password', async () => {
    expect(await errorsFor({ email: 'a@example.com', password: 'secret' })).toEqual([]);
  });

  it('rejects a malformed email', async () => {
    expect(await errorsFor({ email: 'not-an-email', password: 'secret' })).toEqual(['email']);
  });

  it('rejects an empty or missing password', async () => {
    expect(await errorsFor({ email: 'a@example.com', password: '' })).toEqual(['password']);
    expect(await errorsFor({ email: 'a@example.com' })).toEqual(['password']);
  });

  it('rejects over-long values', async () => {
    expect(await errorsFor({ email: 'a@example.com', password: 'x'.repeat(129) })).toEqual([
      'password',
    ]);
    expect(await errorsFor({ email: `${'a'.repeat(250)}@example.com`, password: 'x' })).toEqual([
      'email',
    ]);
  });
});
