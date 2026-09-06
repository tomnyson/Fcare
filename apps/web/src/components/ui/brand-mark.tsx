import Image from 'next/image';

interface BrandMarkProps {
  /** Cạnh của logo tính bằng px — logo vuông nên dùng chung cho width/height. */
  size?: number;
  /** Ưu tiên tải: chỉ bật ở logo nằm trên màn hình đầu tiên (header, trang đăng nhập). */
  priority?: boolean;
  className?: string;
}

/**
 * Logo FCare. Luôn đi kèm chữ "FCare" nên ảnh để `alt=""` (trang trí), tránh
 * trình đọc màn hình đọc lặp tên thương hiệu hai lần.
 */
export function BrandMark({ size = 40, priority = false, className = '' }: BrandMarkProps) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 rounded-[22%] ${className}`}
    />
  );
}
