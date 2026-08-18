'use client';

import dynamic from 'next/dynamic';

const RaidScheduler = dynamic(() => import('@/components/RaidSceduler'), {
  ssr: false,
  loading: () => <div className="min-h-screen flex items-center justify-center">로딩중...</div>
});

export default function Home() {
  return <RaidScheduler />;
}
