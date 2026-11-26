import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

export interface ScheduleWriteOptions {
  /** Idempotency-Key of the write; a new UUID when omitted. */
  idempotencyKey?: string;
}

/**
 * Agent schedules: messages delivered to an agent on a rule (once at a
 * time, every N seconds, or on a cron expression). A Schedule targets a
 * Channel's main session; a SessionSchedule targets one Session Inbox.
 * `put` creates the schedule of a name or replaces it.
 */
export class SchedulesResource {
  constructor(private client: AlvaClient) {}

  /** One page of a Channel's schedules; `name` selects one. */
  async list(
    channelId: string,
    query: V2Query<'/channels/{channelId}/schedules', 'get'> = {}
  ): Promise<Schema<'ScheduleList'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/channels/${channelId}/schedules`,
      { query }
    );
  }

  async put(
    channelId: string,
    body: Schema<'PutScheduleBody'>,
    options: ScheduleWriteOptions = {}
  ): Promise<Schema<'Schedule'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/channels/${channelId}/schedules`,
      { body, idempotencyKey: options.idempotencyKey }
    );
  }

  async pause(scheduleId: string): Promise<Schema<'Schedule'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/schedules/${scheduleId}/pause`
    );
  }

  async resume(scheduleId: string): Promise<Schema<'Schedule'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/schedules/${scheduleId}/resume`
    );
  }

  async delete(scheduleId: string): Promise<Record<string, never>> {
    this.client._requireAuth();
    return this.client._v2Request('DELETE', v2Path`/schedules/${scheduleId}`);
  }

  /** One page of a Session Inbox's schedules; `name` selects one. */
  async listSession(
    query: V2Query<'/session-schedules', 'get'>
  ): Promise<Schema<'SessionScheduleList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/session-schedules', { query });
  }

  async putSession(
    body: Schema<'PutSessionScheduleBody'>,
    options: ScheduleWriteOptions = {}
  ): Promise<Schema<'SessionSchedule'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/session-schedules', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  async pauseSession(
    sessionScheduleId: string
  ): Promise<Schema<'SessionSchedule'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/session-schedules/${sessionScheduleId}/pause`
    );
  }

  async resumeSession(
    sessionScheduleId: string
  ): Promise<Schema<'SessionSchedule'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/session-schedules/${sessionScheduleId}/resume`
    );
  }

  async deleteSession(
    sessionScheduleId: string
  ): Promise<Record<string, never>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'DELETE',
      v2Path`/session-schedules/${sessionScheduleId}`
    );
  }

  /** The Channel ID of the caller's Agent channel. */
  async agentChannelId(): Promise<string> {
    this.client._requireAuth();
    const page = await this.client._v2Request<Schema<'ChannelList'>>(
      'GET',
      '/me/channels',
      { query: { kind: 'AGENT' } }
    );
    const id = page.items[0]?.id;
    if (!id) {
      throw new AlvaError('NOT_FOUND', 'the caller has no Agent channel', 404);
    }
    return id;
  }
}
