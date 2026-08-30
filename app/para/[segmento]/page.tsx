import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SEGMENTS, getSegmentBySlug } from '@/lib/marketing/segments';
import { SegmentPageClient } from './segment-client';

export function generateStaticParams() {
  return SEGMENTS.map((s) => ({ segmento: s.slug }));
}

export async function generateMetadata({ params }: { params: { segmento: string } }): Promise<Metadata> {
  const seg = getSegmentBySlug(params.segmento);
  if (!seg) return {};
  return {
    title: seg.metaTitle,
    description: seg.metaDescription,
    openGraph: { title: seg.metaTitle, description: seg.metaDescription },
  };
}

export default function SegmentPage({ params }: { params: { segmento: string } }) {
  const segment = getSegmentBySlug(params.segmento);
  if (!segment) notFound();
  return <SegmentPageClient segment={segment} />;
}
