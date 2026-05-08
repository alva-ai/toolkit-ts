import type { AlvaClient } from '../client.js';

type Envelope<T> = { success: boolean; data: T; request_id?: string };

export interface PlaybookTemplateSummary {
  username: string;
  name: string;
  description: string;
  categories: string[];
  creator_uid: number;
  updated_at: string;
}

export interface PlaybookTemplateFileMeta {
  path: string;
  size_bytes: number;
}

export interface PlaybookTemplateFile {
  path: string;
  content: string;
}

export interface PlaybookTemplateMeta extends PlaybookTemplateSummary {
  files: PlaybookTemplateFileMeta[];
}

export interface PlaybookTemplateFiles {
  username: string;
  name: string;
  creator_uid: number;
  updated_at: string;
  files: PlaybookTemplateFile[];
}

export interface CategoryEntry {
  name: string;
}

export class TemplatesResource {
  constructor(private client: AlvaClient) {}

  async list(params?: {
    category?: string;
    username?: string;
  }): Promise<{ templates: PlaybookTemplateSummary[] }> {
    const query: Record<string, string> = {};
    if (params?.category) query.category = params.category;
    if (params?.username) query.username = params.username;
    const res = (await this.client._request('GET', '/api/v1/templates', {
      query,
    })) as Envelope<PlaybookTemplateSummary[]>;
    return { templates: res.data ?? [] };
  }

  async categories(): Promise<{ categories: CategoryEntry[] }> {
    const res = (await this.client._request(
      'GET',
      '/api/v1/templates/categories'
    )) as Envelope<CategoryEntry[]>;
    return { categories: res.data ?? [] };
  }

  async get(params: {
    username: string;
    name: string;
  }): Promise<PlaybookTemplateMeta> {
    const u = encodeURIComponent(params.username);
    const n = encodeURIComponent(params.name);
    const res = (await this.client._request(
      'GET',
      `/api/v1/templates/${u}/${n}`
    )) as Envelope<PlaybookTemplateMeta[]>;
    const meta = res.data?.[0];
    if (!meta) {
      throw new Error(
        `empty templates get response for ${params.username}/${params.name}`
      );
    }
    return meta;
  }

  async files(params: {
    username: string;
    name: string;
  }): Promise<PlaybookTemplateFiles> {
    const u = encodeURIComponent(params.username);
    const n = encodeURIComponent(params.name);
    const res = (await this.client._request(
      'GET',
      `/api/v1/templates/${u}/${n}/files`
    )) as Envelope<PlaybookTemplateFiles[]>;
    const out = res.data?.[0];
    if (!out) {
      throw new Error(
        `empty templates files response for ${params.username}/${params.name}`
      );
    }
    return out;
  }
}
