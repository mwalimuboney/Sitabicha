// Supabase Edge Function — google-drive
// Superadmin connects Google Drive; files are stored there instead of Supabase storage.
// Body: { action: 'upload'|'list'|'delete', accessToken, fileName?, mimeType?, content? (base64), fileId? }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { action, accessToken, fileName, mimeType, content, fileId, folderId } = await req.json();
    if (!accessToken) throw new Error('accessToken required');
    const auth = { Authorization: `Bearer ${accessToken}` };

    if (action === 'list') {
      const q = folderId ? `'${folderId}' in parents and trashed=false` : 'trashed=false';
      const res = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,mimeType,modifiedTime)`, { headers: auth });
      return new Response(await res.text(), { headers: CORS });
    }

    if (action === 'upload') {
      if (!fileName || !content) throw new Error('fileName and content required');
      const bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0));
      const meta  = JSON.stringify({ name: fileName, parents: folderId ? [folderId] : [] });
      const form  = new FormData();
      form.append('metadata', new Blob([meta], { type: 'application/json' }));
      form.append('file',     new Blob([bytes], { type: mimeType || 'application/octet-stream' }));
      const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, { method: 'POST', headers: auth, body: form });
      return new Response(await res.text(), { headers: CORS });
    }

    if (action === 'delete') {
      if (!fileId) throw new Error('fileId required');
      await fetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE', headers: auth });
      return new Response(JSON.stringify({ deleted: fileId }), { headers: CORS });
    }

    throw new Error('Unknown action');
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: CORS });
  }
});
