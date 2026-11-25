import { AVATARS } from '../../shared/types';

/** Pixel-art crew sprite (20×20, scaled up crisply). */
export function Avatar({ avatar, size = 40, dim = false }: { avatar: number; size?: number; dim?: boolean }) {
  const a = AVATARS[avatar] ?? AVATARS[0];
  return (
    <img className="avatar" src={`/assets/sprites/crew-${a.id}.png`} alt="" title={a.name} width={size} height={size}
      style={{ opacity: dim ? 0.35 : 1 }} draggable={false} />
  );
}
