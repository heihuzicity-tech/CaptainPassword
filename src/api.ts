import { invoke, isTauri as isTauriRuntime } from '@tauri-apps/api/core';
import type {
  EditableItemInput,
  GeneratedPasswordOptions,
  ItemOverview,
  LoginInput,
  LoginItem,
  PasswordInput,
  PasswordItem,
  QuickAccessShortcut,
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
  updateItem(id: string, input: EditableItemInput): Promise<VaultItem>;
  setFavorite(id: string, favorite: boolean): Promise<VaultItem>;
  generatePassword(options: GeneratedPasswordOptions): Promise<string>;
  copyText(value: string): Promise<void>;
  getQuickAccessShortcut(): Promise<QuickAccessShortcut>;
  setQuickAccessShortcut(shortcut: QuickAccessShortcut): Promise<QuickAccessShortcut>;
};

const demoItems: VaultItem[] = [
  {
    id: 'demo-mintlify',
    item_type: 'login',
    title: 'Mintlify',
    username: 'captain@example.com',
    password: 'DemoPassword-123',
    website: 'https://example.com',
    websites: ['https://example.com'],
    website_labels: ['网站'],
    notes: '演示条目，仅用于浏览器预览。',
    tags: [],
    favorite: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-fastreal',
    item_type: 'login',
    title: 'FastReal',
    username: 'demo@example.com',
    password: 'DemoPassword-456',
    website: 'https://example.com',
    websites: ['https://example.com'],
    website_labels: ['网站'],
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
    username: 'demo@example.com',
    password: 'DemoPassword-789',
    website: 'https://example.com',
    websites: ['https://example.com'],
    website_labels: ['网站'],
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
    password: 'DemoPassword-WiFi',
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

const primaryWebsite = (websites: string[], fallback: string) =>
  websites.find((website) => website.trim().length > 0) ?? websites[0] ?? fallback;

const randomPassword = (options: GeneratedPasswordOptions) => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*_-+=?';
  const alphabet = letters + (options.include_numbers ? numbers : '') + (options.include_symbols ? symbols : '');
  const bytes = new Uint32Array(options.length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
};

const quickAccessShortcutStorageKey = 'captain.quickAccessShortcut';
const defaultQuickAccessShortcut = (): QuickAccessShortcut =>
  navigator.platform.toLowerCase().includes('mac')
    ? { accelerator: 'Command+Alt+K', keys: ['⌥', '⌘', 'K'] }
    : { accelerator: 'Control+Alt+K', keys: ['Ctrl', 'Alt', 'K'] };

const readBrowserQuickAccessShortcut = () => {
  try {
    const saved = localStorage.getItem(quickAccessShortcutStorageKey);
    if (!saved) return defaultQuickAccessShortcut();
    const parsed = JSON.parse(saved) as Partial<QuickAccessShortcut>;
    if (!parsed.accelerator || !Array.isArray(parsed.keys) || parsed.keys.length < 2) {
      return defaultQuickAccessShortcut();
    }
    return { accelerator: parsed.accelerator, keys: parsed.keys };
  } catch {
    return defaultQuickAccessShortcut();
  }
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
      website_labels: input.website_labels,
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
  async updateItem(id: string, update: EditableItemInput) {
    const index = demoItems.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Item not found');
    const current = demoItems[index];
    if (current.item_type !== update.item_type) throw new Error('Item type cannot be changed');

    const now = new Date().toISOString();
    const item: VaultItem =
      update.item_type === 'login'
        ? {
            id,
            item_type: 'login',
            title: update.input.title || '未命名登录信息',
            username: update.input.username,
            password: update.input.password,
            website: primaryWebsite(update.input.websites, update.input.website),
            websites: update.input.websites,
            website_labels: update.input.website_labels,
            notes: update.input.notes,
            tags: update.input.tags,
            favorite: current.favorite,
            created_at: current.created_at,
            updated_at: now,
          }
        : {
            id,
            item_type: 'password',
            title: update.input.title || '未命名密码',
            password: update.input.password,
            notes: update.input.notes,
            tags: update.input.tags,
            favorite: current.favorite,
            created_at: current.created_at,
            updated_at: now,
          };
    demoItems[index] = item;
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
  async copyText(value: string) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch {
        // Fall back below for browser previews that deny async clipboard writes.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Clipboard copy was rejected');
  },
  async getQuickAccessShortcut() {
    return readBrowserQuickAccessShortcut();
  },
  async setQuickAccessShortcut(shortcut: QuickAccessShortcut) {
    localStorage.setItem(quickAccessShortcutStorageKey, JSON.stringify(shortcut));
    return shortcut;
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
  updateItem: (id, input) => invoke<VaultItem>('update_item', { id, input }),
  setFavorite: (id, favorite) => invoke<VaultItem>('set_item_favorite', { id, favorite }),
  generatePassword: (options) => invoke<string>('generate_password', { options }),
  copyText: (value) => invoke<void>('copy_text', { value }),
  getQuickAccessShortcut: () => invoke<QuickAccessShortcut>('get_quick_access_shortcut'),
  setQuickAccessShortcut: (shortcut) => invoke<QuickAccessShortcut>('set_quick_access_shortcut', { shortcut }),
};

export const api: Api = isTauriRuntime() ? tauriApi : browserPreviewApi;
