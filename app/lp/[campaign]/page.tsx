// @ts-nocheck
import { notFound } from 'next/navigation';
import {
  getCampaign,
  getAllCampaignSlugs,
} from '@/lib/marketing/ppc-campaigns';
import { getCaseStudyBySlug } from '@/lib/marketing/case-studies';
import PPCLandingClient from './ppc-client';

export async function generateStaticParams() {
  return getAllCampaignSlugs().map((campaign) => ({ campaign }));
}

export async function generateMetadata({
  params,
}: {
  params: { campaign: string };
}) {
  const c = getCampaign(params.campaign);
  if (!c) return { title: 'Landing não encontrada' };
  return {
    title: c.metaTitle,
    description: c.metaDescription,
  };
}

export default function PPCLandingPage({
  params,
  searchParams,
}: {
  params: { campaign: string };
  searchParams: Record<string, string | undefined>;
}) {
  const campaign = getCampaign(params.campaign);
  if (!campaign) notFound();

  const testimonial = campaign.testimonialSlug
    ? getCaseStudyBySlug(campaign.testimonialSlug)
    : null;

  const utms = {
    utm_source: searchParams?.utm_source || '',
    utm_medium: searchParams?.utm_medium || '',
    utm_campaign: searchParams?.utm_campaign || '',
    utm_content: searchParams?.utm_content || '',
    utm_term: searchParams?.utm_term || '',
    gclid: searchParams?.gclid || '',
  };

  return (
    <PPCLandingClient
      campaign={campaign}
      testimonial={testimonial}
      utms={utms}
    />
  );
}
