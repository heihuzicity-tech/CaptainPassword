export type VaultStatus = 'no_vault' | 'locked' | 'unlocked';

export type ItemType = 'login' | 'secure_note' | 'credit_card' | 'identity' | 'password' | 'document';

export type ItemOverview = {
  id: string;
  item_type: ItemType;
  title: string;
  subtitle: string;
  website?: string;
  icon_text: string;
  favorite: boolean;
  updated_at: string;
};

export type LoginItem = {
  id: string;
  item_type: 'login';
  title: string;
  username: string;
  password: string;
  website: string;
  notes: string;
  tags: string[];
  favorite: boolean;
  created_at: string;
  updated_at: string;
};

export type LoginInput = {
  title: string;
  username: string;
  password: string;
  website: string;
  notes: string;
  tags: string[];
};

export type GeneratedPasswordOptions = {
  length: number;
  include_numbers: boolean;
  include_symbols: boolean;
};
