// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getFileUrl } from '@/lib/s3';

export const dynamic = 'force-dynamic';

// GET - Retrieve current demo video URL
export async function GET() {
  try {
    const setting = await prisma.systemSetting.findFirst({
      where: { key: 'demo_video_url' },
    });

    if (!setting) {
      return NextResponse.json({ url: null });
    }

    // If it's a cloud_storage_path, generate the public URL
    const url = setting.value.startsWith('http')
      ? setting.value
      : await getFileUrl(setting.value, true);

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Error fetching demo video:', error);
    return NextResponse.json({ url: null });
  }
}

// POST - Save demo video cloud_storage_path
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { cloud_storage_path } = await req.json();

    if (!cloud_storage_path) {
      return NextResponse.json({ error: 'Missing cloud_storage_path' }, { status: 400 });
    }

    await prisma.systemSetting.upsert({
      where: { key: 'demo_video_url' },
      update: { value: cloud_storage_path },
      create: { key: 'demo_video_url', value: cloud_storage_path },
    });

    const url = await getFileUrl(cloud_storage_path, true);

    return NextResponse.json({ url, success: true });
  } catch (error) {
    console.error('Error saving demo video:', error);
    return NextResponse.json({ error: 'Failed to save demo video' }, { status: 500 });
  }
}
