import { AVATARS } from '../../shared/types';

/** Placeholder avatar (a coloured helmet badge) until the pixel sprites go in during Phase 3. */
export function Avatar({ avatar, size = 40, dim = false }: { avatar: number; size?: number; dim?: boolean }) {
  const a = AVATARS[avatar] ?? AVATARS[0];
  return (
    <span className="avatar" title={a.name} aria-hidden="true"
      style={{ width: size, height: size, borderColor: a.color, opacity: dim ? 0.35 : 1 }}>
      <span className="visor" />
      <span className="lamp" style={{ background: a.color }} />
    </span>
  );
}
