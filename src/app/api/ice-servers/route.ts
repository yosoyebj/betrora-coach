import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/ice-servers
 * Returns ICE server configuration for WebRTC peer connections
 * Falls back to default STUN servers if Xirsys or other service fails
 */
export async function GET(request: NextRequest) {
  try {
    // Default STUN servers (fallback)
    const defaultIceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ];

    // Try to fetch from Xirsys API if configured
    const xirsysApiKey = process.env.XIRSYS_API_KEY;
    const xirsysApiSecret = process.env.XIRSYS_API_SECRET;
    const xirsysChannel = process.env.XIRSYS_CHANNEL || 'default';
    const xirsysApplication = process.env.XIRSYS_APPLICATION || 'default';

    if (xirsysApiKey && xirsysApiSecret) {
      try {
        // Xirsys API endpoint format
        const xirsysUrl = `https://service.xirsys.com/ice?ident=${encodeURIComponent(xirsysApiKey)}&secret=${encodeURIComponent(xirsysApiSecret)}&domain=${encodeURIComponent(xirsysApplication)}&application=${encodeURIComponent(xirsysChannel)}&room=${encodeURIComponent('session-room')}&secure=1`;

        const response = await fetch(xirsysUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          
          // Xirsys returns data in format: { d: { iceServers: [...] } }
          if (data?.d?.iceServers && Array.isArray(data.d.iceServers)) {
            return NextResponse.json(
              { iceServers: data.d.iceServers },
              { headers: { 'Cache-Control': 'no-store' } }
            );
          }
        }
      } catch (xirsysError) {
        console.error('Xirsys ICE server fetch failed, using fallback:', xirsysError);
      }
    }

    // Fallback to default STUN servers
    return NextResponse.json(
      { iceServers: defaultIceServers },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('Error in ICE servers endpoint:', error);
    
    // Return default STUN servers even on error
    return NextResponse.json(
      { 
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ]
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
