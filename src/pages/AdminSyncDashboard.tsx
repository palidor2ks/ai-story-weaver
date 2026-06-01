/**
 * Admin Sync Dashboard
 * 
 * Monitor and control the data sync agent.
 * Shows sync status, history, and allows manual triggers.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Clock, Play, RefreshCw } from 'lucide-react';

interface SyncStatusRecord {
  table_name: string;
  last_sync_at: string | null;
  last_sync_duration_seconds: number | null;
  records_synced: number;
  records_inserted: number;
  records_updated: number;
  records_deleted: number;
  last_error: string | null;
  status: string;
}

interface SyncHistoryRecord {
  id: string;
  table_name: string;
  sync_started_at: string;
  sync_completed_at: string | null;
  duration_seconds: number | null;
  records_processed: number;
  records_inserted: number;
  records_updated: number;
  records_deleted: number;
  status: string;
  error_message: string | null;
}

export default function AdminSyncDashboard() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [manualSyncError, setManualSyncError] = useState<string | null>(null);

  // Fetch current sync status
  const { data: syncStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['sync-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_status')
        .select('*')
        .order('table_name');

      if (error) throw error;
      return data as SyncStatusRecord[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch sync history
  const { data: syncHistory } = useQuery({
    queryKey: ['sync-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_history')
        .select('*')
        .order('sync_started_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as SyncHistoryRecord[];
    },
    refetchInterval: 30000,
  });

  // Trigger manual sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    setManualSyncError(null);

    try {
      const response = await fetch('/api/admin/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to trigger sync: ${response.statusText}`);
      }

      // Refetch status
      await refetchStatus();
    } catch (error) {
      setManualSyncError(String(error));
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-600">Completed</Badge>;
      case 'running':
        return <Badge className="bg-blue-600">Running</Badge>;
      case 'failed':
        return <Badge className="bg-red-600">Failed</Badge>;
      case 'pending':
        return <Badge className="bg-gray-600">Pending</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Data Sync Dashboard</h1>
        <p className="text-gray-600 mt-2">Monitor and control automated data synchronization</p>
      </div>

      {/* Manual Sync Control */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Sync Control</CardTitle>
          <CardDescription>Trigger an immediate sync cycle</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {manualSyncError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm text-red-700">{manualSyncError}</span>
            </div>
          )}
          <Button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="gap-2"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Trigger Sync Now
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Current Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle>Table Sync Status</CardTitle>
          <CardDescription>Current status of each data source</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {syncStatus?.map((table) => (
              <div
                key={table.table_name}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="font-medium">{table.table_name}</div>
                  <div className="text-sm text-gray-600">
                    {table.last_sync_at ? (
                      <>
                        Last sync: {new Date(table.last_sync_at).toLocaleString()} (
                        {formatDuration(table.last_sync_duration_seconds)})
                      </>
                    ) : (
                      'Never synced'
                    )}
                  </div>
                  {table.last_error && (
                    <div className="text-sm text-red-600 mt-1">Error: {table.last_error}</div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <div className="text-gray-600">
                      +{table.records_inserted} | ~{table.records_updated} | -{table.records_deleted}
                    </div>
                  </div>
                  {getStatusBadge(table.status)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sync History</CardTitle>
          <CardDescription>Last 50 sync operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {syncHistory?.map((record) => (
              <div
                key={record.id}
                className="flex items-start justify-between p-3 border rounded-lg text-sm hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    {record.status === 'completed' ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : record.status === 'failed' ? (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    ) : (
                      <Clock className="w-4 h-4 text-gray-600" />
                    )}
                    {record.table_name}
                  </div>
                  <div className="text-gray-600 text-xs mt-1">
                    {new Date(record.sync_started_at).toLocaleString()}
                  </div>
                  {record.error_message && (
                    <div className="text-red-600 text-xs mt-1">{record.error_message}</div>
                  )}
                </div>

                <div className="text-right text-xs text-gray-600">
                  <div>+{record.records_inserted} | ~{record.records_updated} | -{record.records_deleted}</div>
                  <div className="mt-1">{formatDuration(record.duration_seconds)}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Configuration Info */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Current sync settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Schedule</div>
              <div className="font-medium">Daily at 2:00 AM UTC</div>
            </div>
            <div>
              <div className="text-gray-600">Max Duration</div>
              <div className="font-medium">23 hours</div>
            </div>
            <div>
              <div className="text-gray-600">Data Sources</div>
              <div className="font-medium">FEC.gov, Congress.gov, Google Civic API</div>
            </div>
            <div>
              <div className="text-gray-600">Sync Strategy</div>
              <div className="font-medium">Incremental + Upsert</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

