import type {
  FeedListResponse,
  PushSubscriptionListResponse,
} from '../types.js';

export function formatAutomationList(result: FeedListResponse): string {
  const automations = result.feeds ?? [];
  if (automations.length === 0) return '(no automations)\n';

  const lines: string[] = [`${automations.length} automation(s):`, ''];
  for (const automation of automations) {
    const status = automation.status ? `  [${automation.status}]` : '';
    lines.push(`• ${automation.name || '(unnamed)'}${status}`);
    lines.push(`    id: ${automation.id}`);
    if (automation.cron_expression) {
      lines.push(`    schedule: ${automation.cron_expression}`);
    }
    lines.push(`    runs: ${automation.total_runs ?? 0}`);
    lines.push(`    used by: ${automation.used_by_total ?? 0}`);
    lines.push('');
  }
  if (result.has_more) {
    lines.push('(more results — pass --cursor <next_cursor> to page)');
    if (result.next_cursor) lines.push(`next_cursor: ${result.next_cursor}`);
    lines.push('');
  }
  return lines.join('\n');
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

type AlertItem = PushSubscriptionListResponse['items'][number];

function alertTitle(alert: AlertItem): string {
  if (alert.playbook) {
    return `${alert.playbook.owner_username}/${alert.playbook.name}`;
  }
  if (alert.feed_name) return alert.feed_name;
  return alert.target?.id ? `target ${alert.target.id}` : '(unknown target)';
}
