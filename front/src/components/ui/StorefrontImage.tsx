import Image from 'next/image';
import type { StoreImage } from '../../data/types';
import styles from './StorefrontImage.module.css';

export interface StorefrontImageProps {
  image: StoreImage;
  /** `alt=""` marks the image as decorative. */
  alt?: string | undefined;
  /** Fill the parent box instead of using intrinsic dimensions. */
  fill?: boolean | undefined;
  sizes?: string | undefined;
  priority?: boolean | undefined;
  className?: string | undefined;
}

/**
 * The storefront image. Every asset is a small, pre-compressed WebP file that
 * ships with the app, so the Next.js optimizer is disabled (see next.config.ts)
 * and the intrinsic dimensions are always declared to keep the layout stable.
 */
export function StorefrontImage({
  image,
  alt,
  fill = false,
  sizes,
  priority = false,
  className,
}: StorefrontImageProps) {
  if (fill) {
    return (
      <Image
        src={image.src}
        alt={alt ?? image.alt}
        fill
        sizes={sizes ?? '(max-width: 1023px) 100vw, 50vw'}
        priority={priority}
        className={`${styles.image} ${className ?? ''}`}
      />
    );
  }

  return (
    <Image
      src={image.src}
      alt={alt ?? image.alt}
      width={image.width}
      height={image.height}
      priority={priority}
      className={`${styles.image} ${className ?? ''}`}
    />
  );
}
