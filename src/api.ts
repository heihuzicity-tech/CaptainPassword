import { invoke, isTauri as isTauriRuntime } from '@tauri-apps/api/core';
import type { GeneratedPasswordOptions, ItemOverview, LoginInput, LoginItem, VaultStatus } from './types';

type Api = {
  getStatus(): Promise<VaultStatus>;
  initializeVault(masterPassword: string): Promise<VaultStatus>;
  unlock(masterPassword: string): Promise<VaultStatus>;
  lock(): Promise<VaultStatus>;
  listItems(): Promise<ItemOverview[]>;
  getItem(id: string): Promise<LoginItem>;
  createLogin(input: LoginInput): Promise<LoginItem>;
  setFavorite(id: string, favorite: boolean): Promise<LoginItem>;
  generatePassword(options: GeneratedPasswordOptions): Promise<string>;
};

const demoItems: LoginItem[] = [
  {
    id: 'demo-mintlify',
    item_type: 'login',
    title: 'Mintlify',
    username: 'heihuzicity@gmail.com',
    password: 'yUndKy6izwkvT26sRrib',
    website: 'https://app.mintlify.com',
    notes: 'Company name\nheihuzi-ai',
    tags: [],
    favorite: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-fastreal',
    item_type: 'login',
    title: 'FastReal',
    username: 'vim27@qq.com',
    password: '8HTnfpWgFhsskXJNEzrE',
    website: 'https://example.com',
    notes: '',
    tags: [],
    favorite: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-openai',
    item_type: 'login',
    title: 'OpenAI',
    username: 'vim27@qq.com',
    password: 'N9wQn3m9rZ',
    website: 'https://platform.openai.com',
    notes: '',
    tags: [],
    favorite: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const toOverview = (item: LoginItem): ItemOverview => ({
  id: item.id,
  item_type: item.item_type,
  title: item.title,
  subtitle: item.username,
  website: item.website,
  icon_text: item.title.slice(0, 2),
  favorite: item.favorite,
  updated_at: item.updated_at,
});

const randomPassword = (options: GeneratedPasswordOptions) => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*_-+=?';
  const alphabet = letters + (options.include_numbers ? numbers : '') + (options.include_symbols ? symbols : '');
  const bytes = new Uint32Array(options.length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
};

const browserPreviewApi: Api = {
  async getStatus() {
    return 'unlocked';
  },
  async initializeVault() {
    return 'unlocked';
  },
  async unlock() {
    return 'unlocked';
  },
  async lock() {
    return 'locked';
  },
  async listItems() {
    return demoItems.map(toOverview);
  },
  async getItem(id: string) {
    const item = demoItems.find((entry) => entry.id === id);
    if (!item) throw new Error('Item not found');
    return item;
  },
  async createLogin(input: LoginInput) {
    const now = new Date().toISOString();
    const item: LoginItem = {
      id: crypto.randomUUID(),
      item_type: 'login',
      title: input.title || '未命名登录信息',
      username: input.username,
      password: input.password,
      website: input.website,
      notes: input.notes,
      tags: input.tags,
      favorite: false,
      created_at: now,
      updated_at: now,
    };
    demoItems.unshift(item);
    return item;
  },
  async setFavorite(id: string, favorite: boolean) {
    const item = demoItems.find((entry) => entry.id === id);
    if (!item) throw new Error('Item not found');
    item.favorite = favorite;
    return item;
  },
  async generatePassword(options: GeneratedPasswordOptions) {
    return randomPassword(options);
  },
};

const tauriApi: Api = {
  getStatus: () => invoke<VaultStatus>('get_status'),
  initializeVault: (masterPassword) => invoke<VaultStatus>('initialize_vault', { masterPassword }),
  unlock: (masterPassword) => invoke<VaultStatus>('unlock_vault', { masterPassword }),
  lock: () => invoke<VaultStatus>('lock_vault'),
  listItems: () => invoke<ItemOverview[]>('list_items'),
  getItem: (id) => invoke<LoginItem>('get_item', { id }),
  createLogin: (input) => invoke<LoginItem>('create_login', { input }),
  setFavorite: (id, favorite) => invoke<LoginItem>('set_item_favorite', { id, favorite }),
  generatePassword: (options) => invoke<string>('generate_password', { options }),
};

export const api: Api = isTauriRuntime() ? tauriApi : browserPreviewApi;
