export function sanitizeUser(user: any): any {
  if (!user) return user;
  const { password, twoFactorSecret, ...safe } = user;
  return safe;
}

export function sanitizeUsers(users: any[]): any[] {
  return users.map(sanitizeUser);
}
