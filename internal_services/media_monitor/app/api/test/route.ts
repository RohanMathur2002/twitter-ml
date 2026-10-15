import { NextResponse } from 'next/server';
import { searchKeywords } from '@/services/keywordService';

export async function GET() {
  try {
    const dbRes = await searchKeywords('trump', 1, 25, 'db');
    return NextResponse.json({ success: true, dbRes });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, stack: err.stack });
  }
}
