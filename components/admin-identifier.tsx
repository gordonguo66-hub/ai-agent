'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function AdminIdentifier() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('identify_admin') === 'true') {
      localStorage.setItem('exclude_from_analytics', 'true');
      console.log('✓ You are now excluded from analytics tracking');
    }
  }, [searchParams]);

  return null; // This component doesn't render anything
}
