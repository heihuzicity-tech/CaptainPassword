import { invoke, isTauri as isTauriRuntime } from '@tauri-apps/api/core';
import type {
  GeneratedPasswordOptions,
  ItemOverview,
  LoginInput,
  LoginItem,
  PasswordInput,
  PasswordItem,
  VaultItem,
  VaultStatus,
} from './types';

type Api = {
  getStatus(): Promise<VaultStatus>;
  initializeVault(masterPassword: string): Promise<VaultStatus>;
  unlock(masterPassword: string): Promise<VaultStatus>;
  lock(): Promise<VaultStatus>;
  listItems(): Promise<ItemOverview[]>;
  getItem(id: string): Promise<VaultItem>;
  createLogin(input: LoginInput): Promise<LoginItem>;
  createPassword(input: PasswordInput): Promise<PasswordItem>;
  setFavorite(id: string, favorite: boolean): Promise<VaultItem>;
  generatePassword(options: GeneratedPasswordOptions): Promise<string>;
};

const demoItems: VaultItem[] = [
  {
    id: 'demo-mintlify',
    item_type: 'login',
    title: 'Mintlify',
    username: 'heihuzicity@gmail.com',
    password: 'yUndKy6izwkvT26sRrib',
    website: 'https://app.mintlify.com',
    websites: ['https://app.mintlify.com'],
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
    websites: ['https://example.com'],
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
    websites: ['https://platform.openai.com'],
    notes: '',
    tags: [],
    favorite: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-wifi-password',
    item_type: 'password',
    title: 'WiFi 密码',
    password: '8HTnfpWgFhsskXJNEzrE',
    notes: '本地演示用的独立密码项目。',
    tags: [],
    favorite: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const toOverview = (item: VaultItem): ItemOverview => ({
  id: item.id,
  item_type: item.item_type,
  title: item.title,
  subtitle: item.item_type === 'login' ? item.username : '密码',
  website: item.item_type === 'login' ? item.website : undefined,
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
      websites: input.websites,
      notes: input.notes,
      tags: input.tags,
      favorite: false,
      created_at: now,
      updated_at: now,
    };
    demoItems.unshift(item);
    return item;
  },
  async createPassword(input: PasswordInput) {
    const now = new Date().toISOString();
    const item: PasswordItem = {
      id: crypto.randomUUID(),
      item_type: 'password',
      title: input.title || '未命名密码',
      password: input.password,
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
  getItem: (id) => invoke<VaultItem>('get_item', { id }),
  createLogin: (input) => invoke<LoginItem>('create_login', { input }),
  createPassword: (input) => invoke<PasswordItem>('create_password', { input }),
  setFavorite: (id, favorite) => invoke<VaultItem>('set_item_favorite', { id, favorite }),
  generatePassword: (options) => invoke<string>('generate_password', { options }),
};

export const api: Api = isTauriRuntime() ? tauriApi : browserPreviewApi;
