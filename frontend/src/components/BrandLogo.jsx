import React from 'react';
import { cn } from '@/lib/utils';

const ASSETS = {
  mark: '/brand/sigcr-mark.png',
  horizontal: '/brand/sigcr-logo-horizontal.png',
};

export default function BrandLogo({ variant = 'mark', className, alt = 'SIGCR' }) {
  return <img src={ASSETS[variant] || ASSETS.mark} alt={alt} className={cn('block object-contain', className)} />;
}
