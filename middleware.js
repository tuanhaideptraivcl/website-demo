import { NextRequest, NextResponse } from 'next/server';

// Cấu hình HaiFlare server
const HAIFLARE_HOST = '45.86.155.150';
const HAIFLARE_PORT = 6055;
const TIMEOUT = 8000;

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Bỏ qua static files
  if (pathname.startsWith('/_next') || 
      pathname.includes('.') || 
      pathname === '/favicon.ico') {
    return NextResponse.next();
  }
  
  try {
    // Forward thẳng đến HaiFlare
    const haiflareResponse = await forwardToHaiFlare(request);
    return haiflareResponse;
    
  } catch (error) {
    console.error(`🔥 HaiFlare error:`, error.message);
    
    // Fail-open: cho đi qua nếu HaiFlare down
    return NextResponse.next();
  }
}

async function forwardToHaiFlare(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
  
  try {
    // Copy headers
    const headers = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    // Thêm client IP
    headers['x-forwarded-for'] = getClientIP(request);
    headers['x-real-ip'] = getClientIP(request);
    
    // Đọc body
    let body = null;
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      try {
        body = await request.clone().text();
      } catch (e) {}
    }
    
    // Forward đến HaiFlare
    const haiflareURL = `http://${HAIFLARE_HOST}:${HAIFLARE_PORT}${request.nextUrl.pathname}${request.nextUrl.search}`;
    
    const response = await fetch(haiflareURL, {
      method: request.method,
      headers,
      body,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // Copy response headers
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    // Đọc response
    const responseBody = await response.text();
    
    // Relay y hệt
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function getClientIP(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         request.headers.get('x-real-ip') ||
         request.headers.get('cf-connecting-ip') ||
         request.ip ||
         'unknown';
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot)).*)',
  ],
};
