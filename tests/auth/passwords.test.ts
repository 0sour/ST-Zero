import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signToken, verifyToken, toSafeUser, User } from '@server/auth/passwords';

const user: User = {
  id: 'u1',
  username: 'test',
  password_hash: '',
  role: 'admin',
  enabled: 1,
  display_name: '测试',
  created_at: 0,
  updated_at: 0,
  ver: 0,
};

describe('认证', () => {
  it('密码哈希与验证', () => {
    const hash = hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(verifyPassword('secret123', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('相同密码不同盐产生不同哈希', () => {
    const h1 = hashPassword('same');
    const h2 = hashPassword('same');
    expect(h1).not.toBe(h2);
    expect(verifyPassword('same', h1)).toBe(true);
    expect(verifyPassword('same', h2)).toBe(true);
  });

  it('JWT 签名与验证', () => {
    const token = signToken(user);
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('u1');
    expect(payload!.role).toBe('admin');
    expect(payload!.ver).toBe(0);
  });

  it('篡改 token 验证失败', () => {
    const token = signToken(user);
    const tampered = token.slice(0, -4) + 'xxxx';
    expect(verifyToken(tampered)).toBeNull();
  });

  it('toSafeUser 不暴露密码', () => {
    const safe = toSafeUser({ ...user, password_hash: 'hash' });
    expect(safe).not.toHaveProperty('password_hash');
    expect(safe.username).toBe('test');
    expect(safe.role).toBe('admin');
  });
});
