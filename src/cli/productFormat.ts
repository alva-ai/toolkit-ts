import type { Schema } from '../platformApi.js';
import type {
  ChannelGroupSubscriptionListResponse,
  PushSubscriptionListResponse,
} from '../types.js';

export function formatAutomationList(
  result: Schema<'AutomationSummaryList'>
): string {
  const automations = result.items;
  if (automations.length === 0) return '(no automations)\n';

  const lines: string[] = [`${automations.length} automation(s):`, ''];
  for (const automation of automations) {
    lines.push(`• ${automation.name || '(unnamed)'}  [${automation.status}]`);
    lines.push(`    id: ${automation.id}`);
    if (automation.schedule.cron) {
      lines.push(`    schedule: ${automation.schedule.cron}`);
    }
    lines.push(`    runs: ${automation.totalRuns}`);
    lines.push(`    used by: ${automation.usedByCount}`);
    lines.push('');
  }
  if (result.nextPageToken !== null) {
    lines.push('(more results — pass --cursor <nextPageToken> to page)');
    lines.push(`nextPageToken: ${result.nextPageToken}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function formatAutomationDetail(result: Schema<'Automation'>): string {
  const lines: string[] = [
    `${result.name || '(unnamed)'}  [${result.status}]`,
    `  id: ${result.id}`,
  ];
  if (result.cronjobId) lines.push(`  cronjob id: ${result.cronjobId}`);
  if (result.schedule.cron) {
    lines.push(
      `  schedule: ${result.schedule.cron} (${result.schedule.timezone})`
    );
  }
  lines.push(`  runs: ${result.stats.totalRuns}`);
  lines.push(`  flow id: ${result.flow ?? '(none)'}`);
  lines.push(`  flow config path: ${result.flowConfigPath ?? '(none)'}`);
  return `${lines.join('\n')}\n`;
}

export function formatAlertList(result: PushSubscriptionListResponse): string {
  const alerts = result.items ?? [];
  if (alerts.length === 0) return '(no alerts)\n';

  const lines: string[] = [`${alerts.length} alert(s):`, ''];
  for (const alert of alerts) {
    const targetType = alert.target?.type ?? 'UNSPECIFIED';
    const status = alert.target_status ? `  [${alert.target_status}]` : '';
    lines.push(`• ${alertTitle(alert)}${status}`);
    lines.push(`    target: ${targetType} ${alert.target?.id ?? ''}`.trimEnd());
    if (alert.channel_id !== undefined) {
      lines.push(`    channel: ${alert.channel_id}`);
    }
    if (alert.kind) lines.push(`    kind: ${alert.kind}`);
    if (alert.feed_status)
      lines.push(`    automation status: ${alert.feed_status}`);
    if (alert.used_by_total !== undefined) {
      lines.push(`    used by: ${alert.used_by_total}`);
    }
    if (alert.last_pushed_at_ms) {
      lines.push(
        `    last pushed: ${new Date(alert.last_pushed_at_ms).toISOString()}`
      );
    }
    lines.push('');
  }
  if (result.next_cursor) {
    lines.push('(more results — pass --cursor <next_cursor> to page)');
    lines.push(`next_cursor: ${result.next_cursor}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function formatGroupAlertList(
  result: ChannelGroupSubscriptionListResponse
): string {
  const alerts = result.subscriptions ?? [];
  if (alerts.length === 0) return '(no group alerts)\n';

  const lines: string[] = [`${alerts.length} group alert(s):`, ''];
  for (const alert of alerts) {
    const targetID = alert.target?.id;
    const status = alert.enabled ? 'enabled' : 'disabled';
    lines.push(`• automation ${targetID ?? '(unknown)'}  [${status}]`);
    lines.push(`    event: ${alert.event_type}`);
    lines.push('');
  }
  return lines.join('\n');
}

type AlertItem = PushSubscriptionListResponse['items'][number];

function alertTitle(alert: AlertItem): string {
  if (alert.feed_name) return alert.feed_name;
  return alert.target?.id ? `target ${alert.target.id}` : '(unknown target)';
}
