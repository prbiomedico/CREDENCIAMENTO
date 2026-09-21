// Token renewal must not invalidate screen effects when identity is unchanged.
export function reconcileSessionUser(previous, next) {
  if (!previous || !next) return next;
  const fields = ['user_id', 'email', 'name', 'picture', 'perfil', 'detran_uf'];
  const roles = user => [...(user.roles || [])].sort().join('\u0000');
  return fields.every(field => previous[field] === next[field]) && roles(previous) === roles(next) ? previous : next;
}
