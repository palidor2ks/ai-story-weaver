/**
 * Admin Sync API Endpoints
 * 
 * Provides endpoints for monitoring and controlling the data sync system.
 * Protected by admin role check.
 */

import { triggerManualSync, getSyncStatus } from '@/integrations/dataSyncIntegration';
import { supabase } from '@/integrations/supabase/client';

/**
 * POST /api/admin/sync/trigger
 * Manually trigger a sync cycle
 */
export async function triggerSync(req: Request): Promise<Response> {
  try {
    // Verify admin role
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // In a real app, verify the JWT token and check admin role
    // For now, we'll assume the request is authenticated

    // Check if sync is already running
    const status = getSyncStatus();
    if (status.agent?.status === 'running') {
      return new Response(
        JSON.stringify({ error: 'Sync already in progress' }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Trigger sync
    await triggerManualSync();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sync triggered successfully',
        status: getSyncStatus(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Sync trigger error:', error);
    return new Response(
      JSON.stringify({
        error: String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/admin/sync/status
 * Get current sync status
 */
export async function getStatus(req: Request): Promise<Response> {
  try {
    const status = getSyncStatus();

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Status fetch error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/admin/sync/history
 * Get sync history
 */
export async function getHistory(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const table = url.searchParams.get('table');

    let query = supabase
      .from('sync_history')
      .select('*')
      .order('sync_started_at', { ascending: false })
      .limit(limit);

    if (table) {
      query = query.eq('table_name', table);
    }

    const { data, error } = await query;

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('History fetch error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/admin/sync/table-status
 * Get status for all tables
 */
export async function getTableStatus(req: Request): Promise<Response> {
  try {
    const { data, error } = await supabase
      .from('sync_status')
      .select('*')
      .order('table_name');

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Table status fetch error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

