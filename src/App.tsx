import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  Banknote,
  BookUser,
  Braces,
  CarFront,
  Check,
  ChevronDown,
  CreditCard,
  Database,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Gift,
  Grid2X2,
  HeartPulse,
  IdCard,
  KeyRound,
  Landmark,
  ListFilter,
  Lock,
  LockKeyhole,
  LogOut,
  Mail,
  MinusCircle,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Server,
  Share,
  ShieldCheck,
  SlidersHorizontal,
  SquareTerminal,
  Star,
  Trees,
  WalletCards,
  Wifi,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { api } from './api';
import type { ItemOverview, ItemType, LoginInput, PasswordInput, VaultItem, VaultStatus } from './types';
import { startWindowDrag } from './windowDrag';

type Overlay =
  | { kind: 'none' }
  | { kind: 'type-picker' }
  | { kind: 'editor'; itemType: ItemType };
type SidebarView = 'all' | 'favorites';
type CategoryFilter = 'all' | ItemType;
type ResizablePane = 'sidebar' | 'itemList';
type FieldBorderStyle = 'top' | 'middle' | 'bottom' | 'single';
type FieldTone = 'primary' | 'secondary';
type PasswordGeneratorType = 'random' | 'memorable' | 'pin';

const sidebarWidthLimits = { min: 230, max: 420, default: 276 };
const itemListWidthLimits = { min: 300, max: 520, default: 354 };
const passwordLengthLimits = { min: 8, max: 40, default: 8 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const itemTypes: Array<{ type: ItemType; label: string; icon: JSX.Element; implemented: boolean }> = [
  { type: 'login', label: '登录信息', icon: <KeyRound />, implemented: true },
  { type: 'secure_note', label: '安全备注', icon: <FileText />, implemented: false },
  { type: 'credit_card', label: '信用卡', icon: <CreditCard />, implemented: false },
  { type: 'identity', label: '身份标识', icon: <IdCard />, implemented: false },
  { type: 'password', label: '密码', icon: <KeyRound />, implemented: true },
  { type: 'document', label: '文档', icon: <FileText />, implemented: false },
];

const categoryOptions: Array<{ value: CategoryFilter; label: string; icon: JSX.Element }> = [
  { value: 'all', label: '所有类别', icon: <Grid2X2 /> },
  ...itemTypes.map((item) => ({ value: item.type, label: item.label, icon: item.icon })),
];

const moreItemTypes: Array<{ label: string; icon: JSX.Element }> = [
  { label: 'SSH 密钥', icon: <SquareTerminal /> },
  { label: 'API 凭据', icon: <Braces /> },
  { label: '会员信息', icon: <BadgeCheck /> },
  { label: '加密钱包', icon: <WalletCards /> },
  { label: '医疗记录', icon: <HeartPulse /> },
  { label: '奖励', icon: <Gift /> },
  { label: '户外许可证', icon: <Trees /> },
  { label: '护照', icon: <BookUser /> },
  { label: '数据库', icon: <Database /> },
  { label: '无线路由器', icon: <Wifi /> },
  { label: '服务器', icon: <Server /> },
  { label: '电子邮件', icon: <Mail /> },
  { label: '社会保险号码', icon: <ShieldCheck /> },
  { label: '软件许可', icon: <BadgeCheck /> },
  { label: '银行账户', icon: <Landmark /> },
  { label: '驾驶执照', icon: <CarFront /> },
  { label: '银行卡', icon: <Banknote /> },
];

const passwordGeneratorTypes: Array<{ value: PasswordGeneratorType; label: string }> = [
  { value: 'random', label: '随机密码' },
  { value: 'memorable', label: '易记密码' },
  { value: 'pin', label: 'PIN 码' },
];

const memorablePasswordWords = [
  'river',
  'mint',
  'solar',
  'paper',
  'north',
  'copper',
  'forest',
  'pixel',
  'orbit',
  'summer',
  'quiet',
  'stone',
];

const fallbackLogin: LoginInput = {
  title: '',
  username: 'vim27@qq.com',
  password: 'yUndKy6izwkvT26sRrib',
  website: 'https://example.com',
  websites: ['https://example.com'],
  notes: '',
  tags: [],
};

const fallbackPassword: PasswordInput = {
  title: '',
  password: 'yUndKy6izwkvT26sRrib',
  notes: '',
  tags: [],
};

const websitesForLogin = (input: Pick<LoginInput, 'website' | 'websites'>) =>
  input.websites.length > 0 ? input.websites : [input.website];

const websitePatch = (websites: string[]): Pick<LoginInput, 'website' | 'websites'> => {
  const nextWebsites = websites.length > 0 ? websites : [''];
  const primaryWebsite = nextWebsites.find((website) => website.trim().length > 0) ?? nextWebsites[0] ?? '';
  return {
    website: primaryWebsite,
    websites: nextWebsites,
  };
};

export function App() {
  const [status, setStatus] = useState<VaultStatus>('locked');
  const [items, setItems] = useState<ItemOverview[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedItem, setSelectedItem] = useState<VaultItem>();
  const [query, setQuery] = useState('');
  const [sidebarView, setSidebarView] = useState<SidebarView>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(sidebarWidthLimits.default);
  const [itemListWidth, setItemListWidth] = useState(itemListWidthLimits.default);
  const [resizingPane, setResizingPane] = useState<ResizablePane>();
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });
  const [error, setError] = useState('');

  const shellStyle = useMemo(
    () =>
      ({
        '--sidebar-width': `${sidebarWidth}px`,
        '--item-list-width': `${itemListWidth}px`,
      }) as CSSProperties,
    [itemListWidth, sidebarWidth],
  );

  const refreshItems = useCallback(async () => {
    const nextItems = await api.listItems();
    setItems(nextItems);
    setSelectedId((current) => current ?? nextItems[0]?.id);
  }, []);

  useEffect(() => {
    api
      .getStatus()
      .then(async (nextStatus) => {
        setStatus(nextStatus);
        if (nextStatus === 'unlocked') await refreshItems();
      })
      .catch((err) => setError(String(err)));
  }, [refreshItems]);

  useEffect(() => {
    if (status !== 'unlocked' || !selectedId) {
      setSelectedItem(undefined);
      return;
    }
    api.getItem(selectedId).then(setSelectedItem).catch((err) => setError(String(err)));
  }, [selectedId, status]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      if (sidebarView === 'favorites' && !item.favorite) return false;
      if (categoryFilter !== 'all' && item.item_type !== categoryFilter) return false;
      if (!normalized) return true;
      return [item.title, item.subtitle, item.website].some((value) => value?.toLowerCase().includes(normalized));
    });
  }, [categoryFilter, items, query, sidebarView]);

  useEffect(() => {
    if (status !== 'unlocked') return;
    if (filteredItems.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !filteredItems.some((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId, status]);

  const handleUnlocked = async (nextStatus: VaultStatus) => {
    setStatus(nextStatus);
    setError('');
    if (nextStatus === 'unlocked') await refreshItems();
  };

  const handleFavoriteChange = async (id: string, favorite: boolean) => {
    const updatedItem = await api.setFavorite(id, favorite);
    setSelectedItem(updatedItem);
    setItems((currentItems) =>
      currentItems.map((item) => (item.id === updatedItem.id ? { ...item, favorite: updatedItem.favorite } : item)),
    );
  };

  const setPaneWidth = useCallback((pane: ResizablePane, value: number) => {
    if (pane === 'sidebar') {
      setSidebarWidth(clamp(value, sidebarWidthLimits.min, sidebarWidthLimits.max));
      return;
    }
    setItemListWidth(clamp(value, itemListWidthLimits.min, itemListWidthLimits.max));
  }, []);

  const beginPaneResize = useCallback(
    (pane: ResizablePane, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = pane === 'sidebar' ? sidebarWidth : itemListWidth;
      setResizingPane(pane);
      document.body.classList.add('is-resizing-pane');

      const onPointerMove = (moveEvent: PointerEvent) => {
        setPaneWidth(pane, startWidth + moveEvent.clientX - startX);
      };
      const stopResize = () => {
        setResizingPane(undefined);
        document.body.classList.remove('is-resizing-pane');
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', stopResize);
        window.removeEventListener('pointercancel', stopResize);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', stopResize);
      window.addEventListener('pointercancel', stopResize);
    },
    [itemListWidth, setPaneWidth, sidebarWidth],
  );

  const handlePaneResizeKey = useCallback(
    (pane: ResizablePane, event: ReactKeyboardEvent<HTMLDivElement>) => {
      const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      const currentWidth = pane === 'sidebar' ? sidebarWidth : itemListWidth;
      setPaneWidth(pane, currentWidth + direction * 12);
    },
    [itemListWidth, setPaneWidth, sidebarWidth],
  );

  if (status === 'no_vault') {
    return <SetupScreen error={error} onError={setError} onReady={handleUnlocked} />;
  }

  if (status === 'locked') {
    return <UnlockScreen error={error} onError={setError} onReady={handleUnlocked} />;
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={shellStyle}>
      {!sidebarCollapsed && (
        <>
          <Sidebar
            selectedView={sidebarView}
            onViewChange={setSidebarView}
            onToggleSidebar={() => setSidebarCollapsed(true)}
            onLock={async () => {
              const nextStatus = await api.lock();
              setStatus(nextStatus);
              setSelectedId(undefined);
            }}
          />
          <PaneResizer
            className="sidebar-resizer"
            active={resizingPane === 'sidebar'}
            label="调整侧边栏宽度"
            onPointerDown={(event) => beginPaneResize('sidebar', event)}
            onKeyDown={(event) => handlePaneResizeKey('sidebar', event)}
          />
        </>
      )}
      <main className="main-area">
        <TopToolbar
          query={query}
          sidebarCollapsed={sidebarCollapsed}
          onQueryChange={setQuery}
          onToggleSidebar={() => setSidebarCollapsed(false)}
          onNewItem={() => setOverlay({ kind: 'type-picker' })}
        />
        <section className="content-split">
          <ItemListPane
            items={filteredItems}
            selectedId={selectedId}
            sidebarCollapsed={sidebarCollapsed}
            viewTitle={sidebarView === 'favorites' ? '收藏夹' : '所有项目'}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            onSelect={setSelectedId}
          />
          <PaneResizer
            className="item-list-resizer"
            active={resizingPane === 'itemList'}
            label="调整项目列表宽度"
            onPointerDown={(event) => beginPaneResize('itemList', event)}
            onKeyDown={(event) => handlePaneResizeKey('itemList', event)}
          />
          <DetailPane item={selectedItem} onFavoriteChange={handleFavoriteChange} />
        </section>
      </main>

      {overlay.kind === 'type-picker' && (
        <TypePickerModal
          onClose={() => setOverlay({ kind: 'none' })}
          onPick={(itemType) => setOverlay({ kind: 'editor', itemType })}
        />
      )}

      {overlay.kind === 'editor' && (
        <ItemEditorModal
          itemType={overlay.itemType}
          onClose={() => setOverlay({ kind: 'none' })}
          onSaveLogin={async (input) => {
            const item = await api.createLogin(input);
            await refreshItems();
            setSelectedId(item.id);
            setSelectedItem(item);
            setOverlay({ kind: 'none' });
          }}
          onSavePassword={async (input) => {
            const item = await api.createPassword(input);
            await refreshItems();
            setSelectedId(item.id);
            setSelectedItem(item);
            setOverlay({ kind: 'none' });
          }}
        />
      )}
    </div>
  );
}

function SetupScreen({
  error,
  onError,
  onReady,
}: {
  error: string;
  onError: (value: string) => void;
  onReady: (status: VaultStatus) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password.length < 8) {
      onError('主密码至少需要 8 个字符。');
      return;
    }
    if (password !== confirmPassword) {
      onError('两次输入的主密码不一致。');
      return;
    }
    setBusy(true);
    try {
      onReady(await api.initializeVault(password));
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="创建本地密码库"
      description="主密码只在本机用于解锁加密数据，不会写入数据库。"
      error={error}
      password={password}
      confirmPassword={confirmPassword}
      busy={busy}
      submitLabel="创建并解锁"
      onPasswordChange={setPassword}
      onConfirmPasswordChange={setConfirmPassword}
      onSubmit={submit}
    />
  );
}

function UnlockScreen({
  error,
  onError,
  onReady,
}: {
  error: string;
  onError: (value: string) => void;
  onReady: (status: VaultStatus) => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      onReady(await api.unlock(password));
    } catch {
      onError('无法解锁。请检查主密码。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="OnePass Local 已锁定"
      description="输入主密码后才会在内存中解开本地密钥。"
      error={error}
      password={password}
      busy={busy}
      submitLabel="解锁"
      onPasswordChange={setPassword}
      onSubmit={submit}
    />
  );
}

function AuthScreen({
  title,
  description,
  error,
  password,
  confirmPassword,
  busy,
  submitLabel,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
}: {
  title: string;
  description: string;
  error: string;
  password: string;
  confirmPassword?: string;
  busy: boolean;
  submitLabel: string;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange?: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-mark">
          <Lock size={34} />
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
        <label className="auth-field">
          <span>主密码</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && onSubmit()}
          />
        </label>
        {onConfirmPasswordChange && (
          <label className="auth-field">
            <span>确认主密码</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => onConfirmPasswordChange(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && onSubmit()}
            />
          </label>
        )}
        {error && <div className="auth-error">{error}</div>}
        <button className="primary-button auth-submit" disabled={busy} onClick={onSubmit}>
          {busy ? '处理中...' : submitLabel}
        </button>
      </div>
    </div>
  );
}

function Sidebar({
  selectedView,
  onViewChange,
  onToggleSidebar,
  onLock,
}: {
  selectedView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  onToggleSidebar: () => void;
  onLock: () => void;
}) {
  return (
    <aside className="sidebar" data-tauri-drag-region="deep" onMouseDown={startWindowDrag}>
      <button className="sidebar-toggle-button" aria-label="折叠侧边栏" onClick={onToggleSidebar}>
        <PanelLeftClose size={22} />
      </button>
      <div className="sidebar-account">
        <div className="avatar">ya</div>
        <div className="account-name">ya zhang</div>
        <ChevronDown size={18} />
      </div>
      <nav className="sidebar-nav">
        <SidebarButton icon={<Archive />} label="所有项目" selected={selectedView === 'all'} onClick={() => onViewChange('all')} />
        <SidebarButton
          icon={<Star />}
          label="收藏夹"
          selected={selectedView === 'favorites'}
          tone="favorite"
          onClick={() => onViewChange('favorites')}
        />
      </nav>
      <div className="sidebar-footer">
        <button className="sidebar-button compact" onClick={onLock}>
          <LogOut size={17} />
          <span>锁定</span>
        </button>
      </div>
    </aside>
  );
}

function PaneResizer({
  className,
  active,
  label,
  onPointerDown,
  onKeyDown,
}: {
  className: string;
  active: boolean;
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`pane-resizer ${className} ${active ? 'active' : ''}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

function SidebarButton({
  icon,
  label,
  selected,
  compact,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  selected?: boolean;
  compact?: boolean;
  tone?: 'favorite';
  onClick?: () => void;
}) {
  return (
    <button
      className={`sidebar-button ${selected ? 'selected' : ''} ${compact ? 'compact' : ''} ${tone ? `tone-${tone}` : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TopToolbar({
  query,
  sidebarCollapsed,
  onQueryChange,
  onToggleSidebar,
  onNewItem,
}: {
  query: string;
  sidebarCollapsed: boolean;
  onQueryChange: (value: string) => void;
  onToggleSidebar: () => void;
  onNewItem: () => void;
}) {
  return (
    <header
      className={`top-toolbar ${sidebarCollapsed ? 'with-sidebar-toggle' : ''}`}
      data-tauri-drag-region="deep"
      onMouseDown={startWindowDrag}
    >
      {sidebarCollapsed && (
        <button className="icon-button toolbar-sidebar-toggle" aria-label="展开侧边栏" onClick={onToggleSidebar}>
          <PanelLeftOpen size={21} />
        </button>
      )}
      <label className="global-search">
        <Search size={20} />
        <input value={query} placeholder="在“ya zhang”中搜索" onChange={(event) => onQueryChange(event.target.value)} />
      </label>
      <button className="link-button">帮助</button>
      <button className="primary-button new-item" onClick={onNewItem}>
        <Plus size={21} />
        新的项目
      </button>
    </header>
  );
}

function ItemListPane({
  items,
  selectedId,
  sidebarCollapsed,
  viewTitle,
  categoryFilter,
  onCategoryChange,
  onSelect,
}: {
  items: ItemOverview[];
  selectedId?: string;
  sidebarCollapsed: boolean;
  viewTitle: string;
  categoryFilter: CategoryFilter;
  onCategoryChange: (category: CategoryFilter) => void;
  onSelect: (id: string) => void;
}) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const selectedCategory = categoryOptions.find((option) => option.value === categoryFilter) ?? categoryOptions[0];

  return (
    <section className="item-list-pane">
      <div className={`list-head ${sidebarCollapsed ? 'with-title' : ''}`}>
        {sidebarCollapsed && <h2 className="list-title">{viewTitle}</h2>}
        <div className="list-controls">
          <div className="category-control">
            <button
              className={`category-button ${categoryFilter !== 'all' ? 'filtered' : ''}`}
              aria-expanded={categoryOpen}
              onClick={() => setCategoryOpen((value) => !value)}
            >
              <span className={`category-button-icon category-icon-${selectedCategory.value}`}>{selectedCategory.icon}</span>
              {selectedCategory.label}
              <ChevronDown size={17} />
            </button>
            {categoryOpen && (
              <div className="category-menu">
                {categoryOptions.map((option, index) => (
                  <button
                    key={option.value}
                    className={`category-option ${option.value === categoryFilter ? 'selected' : ''} ${
                      index === 1 ? 'after-divider' : ''
                    }`}
                    onClick={() => {
                      onCategoryChange(option.value);
                      setCategoryOpen(false);
                    }}
                  >
                    <span className={`category-option-icon category-icon-${option.value}`}>{option.icon}</span>
                    <span>{option.label}</span>
                    {option.value === categoryFilter && <Check className="category-check" size={22} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="list-tools">
            <button className="icon-button" aria-label="筛选">
              <Search size={18} />
            </button>
            <button className="icon-button" aria-label="排序">
              <ListFilter size={18} />
            </button>
          </div>
        </div>
      </div>
      <div className="month-label">2026年6月</div>
      <div className="item-list" role="listbox" aria-label="Item list">
        {items.map((item) => (
          <button
            key={item.id}
            className={`item-row ${item.id === selectedId ? 'selected' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <ItemIcon item={item} />
            <span className="item-row-text">
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ItemIcon({ item }: { item: ItemOverview }) {
  const initials = item.icon_text.slice(0, 2);
  const isOpenAi = item.title.toLowerCase().includes('openai');
  if (item.item_type === 'password') {
    return (
      <span className="item-icon item-icon-password">
        <KeyRound size={22} />
      </span>
    );
  }
  return <span className={`item-icon ${isOpenAi ? 'black' : ''}`}>{isOpenAi ? '◎' : initials}</span>;
}

function DetailPane({
  item,
  onFavoriteChange,
}: {
  item?: VaultItem;
  onFavoriteChange: (id: string, favorite: boolean) => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false);
  const itemWebsites = item?.item_type === 'login' ? item.websites?.length ? item.websites : [item.website] : [];

  useEffect(() => {
    setRevealed(false);
  }, [item?.id]);

  if (!item) {
    return (
      <section className="detail-pane empty-detail">
        <div className="vault-illustration">
          <Lock size={74} />
        </div>
      </section>
    );
  }

  const copyValue = async (value: string) => {
    await navigator.clipboard?.writeText(value);
  };

  return (
    <section className="detail-pane">
      <div className="detail-toolbar">
        <div className="detail-scope">
          <span className="mini-avatar">ya</span>
          <strong>ya zhang</strong>
        </div>
        <div className="detail-actions">
          <button
            className={`detail-action favorite-action ${item.favorite ? 'active' : ''}`}
            onClick={() => onFavoriteChange(item.id, !item.favorite)}
          >
            <Star size={20} />
            {item.favorite ? '已收藏' : '收藏'}
          </button>
          <button className="detail-action">
            <Share size={20} />
            分享
          </button>
          <button className="detail-action">
            <Edit3 size={20} />
            编辑
          </button>
          <button className="icon-button">
            <MoreVertical size={22} />
          </button>
        </div>
      </div>
      <div className="detail-content">
        <div className="detail-title-row">
          <span className={`detail-icon detail-icon-${item.item_type}`}>
            {item.item_type === 'password' ? <KeyRound size={34} /> : item.title.slice(0, 2)}
          </span>
          <h1>{item.title}</h1>
        </div>
        {item.item_type === 'login' ? (
          <>
            <div className="credential-card">
              <FieldLine label="用户名" value={item.username} actionLabel="复制" onAction={() => copyValue(item.username)} />
              <SecretFieldLine
                password={item.password}
                revealed={revealed}
                onReveal={() => setRevealed((value) => !value)}
                onCopy={() => copyValue(item.password)}
              />
            </div>
            <section className="detail-section">
              <span className="field-label">网站</span>
              {itemWebsites.map((website, index) => (
                <a key={`${index}-${website}`} href={website} target="_blank" rel="noreferrer">
                  {website}
                </a>
              ))}
            </section>
          </>
        ) : (
          <div className="credential-card">
            <SecretFieldLine
              password={item.password}
              revealed={revealed}
              highlighted
              onReveal={() => setRevealed((value) => !value)}
              onCopy={() => copyValue(item.password)}
            />
          </div>
        )}
        {item.notes && (
          <section className="detail-section notes">
            {item.notes.split('\n').map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        )}
        {item.tags.length > 0 && (
          <section className="detail-section">
            <span className="field-label">标签</span>
            <div className="tag-row">
              {item.tags.map((tag) => (
                <span key={tag} className="tag-pill">
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}
        <button className="metadata-row">
          <ChevronDown size={18} className="rotate-right" />
          最后编辑 {new Date(item.updated_at).toLocaleString('zh-CN')}
        </button>
      </div>
    </section>
  );
}

function SecretFieldLine({
  password,
  revealed,
  highlighted,
  onReveal,
  onCopy,
}: {
  password: string;
  revealed: boolean;
  highlighted?: boolean;
  onReveal: () => void;
  onCopy: () => void;
}) {
  return (
    <div className={`field-line ${highlighted ? 'highlighted' : ''}`}>
      <div>
        <span className="field-label">密码</span>
        <span className="field-value password-value">{revealed ? password : '••••••••••'}</span>
      </div>
      <div className="field-actions">
        <span className="strength">极佳</span>
        <span className="strength-ring" />
        <button className="icon-button" onClick={onReveal}>
          {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
        <button className="field-copy" onClick={onCopy}>
          复制
        </button>
      </div>
    </div>
  );
}

function FieldLine({
  label,
  value,
  actionLabel,
  onAction,
}: {
  label: string;
  value: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="field-line highlighted">
      <div>
        <span className="field-label">{label}</span>
        <span className="field-value">{value}</span>
      </div>
      <button className="field-copy" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

function TypePickerModal({ onClose, onPick }: { onClose: () => void; onPick: (itemType: ItemType) => void }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTypes = itemTypes.filter((item) => item.label.toLowerCase().includes(normalizedQuery));
  const visibleMoreTypes = moreItemTypes.filter((item) => item.label.toLowerCase().includes(normalizedQuery));
  const showMoreTypes = expanded || normalizedQuery.length > 0;

  return (
    <div className="overlay">
      <div className="type-picker modal-card">
        <button className="modal-close" onClick={onClose}>
          <X />
        </button>
        <h2>你想要添加什么？</h2>
        <label className="type-search">
          <Search />
          <input autoFocus value={query} placeholder="尝试搜索任意内容" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="type-grid">
          {visibleTypes.map((item) => (
            <button
              key={item.type}
              className={`type-card ${item.type === 'login' ? 'selected' : ''}`}
              disabled={!item.implemented}
              onClick={() => item.implemented && onPick(item.type)}
            >
              <span>{item.icon}</span>
              <strong>{item.label}</strong>
              {!item.implemented && <em>后续</em>}
            </button>
          ))}
        </div>
        {showMoreTypes && visibleMoreTypes.length > 0 && (
          <>
            <div className="more-type-divider" />
            <div className="more-type-grid">
              {visibleMoreTypes.map((item) => (
                <button key={item.label} className="more-type-card" disabled>
                  <span className="more-type-icon">{item.icon}</span>
                  <strong>{item.label}</strong>
                </button>
              ))}
            </div>
          </>
        )}
        <button className="show-more" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '显示更少' : '显示更多'}
        </button>
      </div>
    </div>
  );
}

function ItemEditorModal({
  itemType,
  onClose,
  onSaveLogin,
  onSavePassword,
}: {
  itemType: ItemType;
  onClose: () => void;
  onSaveLogin: (input: LoginInput) => Promise<void>;
  onSavePassword: (input: PasswordInput) => Promise<void>;
}) {
  const typeConfig = itemTypes.find((item) => item.type === itemType) ?? itemTypes[0];
  const isPassword = itemType === 'password';
  const [loginInput, setLoginInput] = useState<LoginInput>(fallbackLogin);
  const [passwordInput, setPasswordInput] = useState<PasswordInput>(fallbackPassword);
  const [generatorHint, setGeneratorHint] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateLogin = (patch: Partial<LoginInput>) => setLoginInput((current) => ({ ...current, ...patch }));
  const updatePassword = (patch: Partial<PasswordInput>) => setPasswordInput((current) => ({ ...current, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      if (isPassword) {
        await onSavePassword(passwordInput);
      } else {
        await onSaveLogin(loginInput);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <div className="editor-modal modal-card" role="dialog" aria-modal="true" aria-labelledby="new-item-title">
        <header className="editor-header">
          <button className="icon-button" aria-label="返回" onClick={onClose}>
            <ArrowLeft />
          </button>
          <h2 id="new-item-title">新的项目</h2>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className={`editor-body editor-details ${generatorOpen ? 'generator-open' : ''}`}>
          <div className="editor-elements">
            <EditorTitle
              itemType={itemType}
              icon={typeConfig.icon}
              value={isPassword ? passwordInput.title : loginInput.title}
              onChange={(title) => (isPassword ? updatePassword({ title }) : updateLogin({ title }))}
            />
            {isPassword ? (
              <PasswordEditorFields
                input={passwordInput}
                generatorHint={generatorHint}
                generatorOpen={generatorOpen}
                onGeneratorHintChange={setGeneratorHint}
                onGeneratorOpenChange={setGeneratorOpen}
                onChange={updatePassword}
              />
            ) : (
              <LoginEditorFields
                input={loginInput}
                generatorHint={generatorHint}
                generatorOpen={generatorOpen}
                onGeneratorHintChange={setGeneratorHint}
                onGeneratorOpenChange={setGeneratorOpen}
                onChange={updateLogin}
              />
            )}
          </div>
        </div>
        <footer className="editor-footer">
          <button className="primary-button save-button" disabled={saving} onClick={save}>
            {saving ? '保存中...' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function EditorTitle({
  itemType,
  icon,
  value,
  onChange,
}: {
  itemType: ItemType;
  icon: JSX.Element;
  value: string;
  onChange: (value: string) => void;
}) {
  const [customIconUrl, setCustomIconUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorIcon = itemType === 'login' ? <LockKeyhole /> : icon;

  useEffect(() => {
    return () => {
      if (customIconUrl) {
        URL.revokeObjectURL(customIconUrl);
      }
    };
  }, [customIconUrl]);

  return (
    <div className="editor-title-row">
      <div className="large-item-icon-wrap">
        <button
          type="button"
          className={`large-item-icon large-item-icon-${itemType}`}
          aria-label="选择新图标"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="large-item-icon-glyph">
            {customIconUrl ? <img className="large-item-custom-icon" src={customIconUrl} alt="" /> : editorIcon}
          </span>
        </button>
        <input
          ref={fileInputRef}
          className="icon-file-input"
          type="file"
          accept="image/*"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) {
              return;
            }
            setCustomIconUrl(URL.createObjectURL(file));
            event.currentTarget.value = '';
          }}
        />
      </div>
      <input
        autoFocus
        className="title-input"
        value={value}
        placeholder="输入标题"
        data-title-field
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function EditableFieldGroup({ children }: { children: ReactNode }) {
  return <div className="edit-group editable-field-group">{children}</div>;
}

function EditableTextField({
  label,
  value,
  borderStyle = 'single',
  tone = 'primary',
  actions,
  inputClassName,
  onChange,
}: {
  label: string;
  value: string;
  borderStyle?: FieldBorderStyle;
  tone?: FieldTone;
  actions?: ReactNode;
  inputClassName?: string;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();

  return (
    <div className={`editable-field ${tone} field-${borderStyle} ${actions ? 'with-actions' : ''}`}>
      <div className="editable-field-content">
        <label className="editable-field-label" htmlFor={fieldId}>
          {label}
        </label>
        <div className="editable-field-value-container">
          <input
            id={fieldId}
            className={`editable-field-value ${inputClassName ?? ''}`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      </div>
      {actions && <div className="editable-field-actions">{actions}</div>}
    </div>
  );
}

function LoginEditorFields({
  input,
  generatorHint,
  generatorOpen,
  onGeneratorHintChange,
  onGeneratorOpenChange,
  onChange,
}: {
  input: LoginInput;
  generatorHint: boolean;
  generatorOpen: boolean;
  onGeneratorHintChange: (value: boolean) => void;
  onGeneratorOpenChange: (value: boolean) => void;
  onChange: (patch: Partial<LoginInput>) => void;
}) {
  return (
    <>
      <EditableFieldGroup>
        <EditableTextField
          label="用户名"
          value={input.username}
          borderStyle="top"
          onChange={(username) => onChange({ username })}
        />
        <EditablePasswordField
          value={input.password}
          borderStyle="bottom"
          generatorHint={generatorHint}
          generatorOpen={generatorOpen}
          onGeneratorHintChange={onGeneratorHintChange}
          onGeneratorOpenChange={onGeneratorOpenChange}
          onChange={(password) => onChange({ password })}
        />
      </EditableFieldGroup>
      <WebsiteFields input={input} onChange={onChange} />
      <EditorNotes value={input.notes} onChange={(notes) => onChange({ notes })} />
    </>
  );
}

function WebsiteFields({
  input,
  onChange,
}: {
  input: LoginInput;
  onChange: (patch: Partial<LoginInput>) => void;
}) {
  const websites = websitesForLogin(input);
  const updateWebsite = (index: number, website: string) => {
    const nextWebsites = websites.map((currentWebsite, currentIndex) =>
      currentIndex === index ? website : currentWebsite,
    );
    onChange(websitePatch(nextWebsites));
  };
  const addWebsite = () => {
    onChange(websitePatch([...websites, 'https://example.com']));
  };
  const removeWebsite = (index: number) => {
    if (websites.length === 1) {
      onChange(websitePatch(['']));
      return;
    }
    onChange(websitePatch(websites.filter((_, currentIndex) => currentIndex !== index)));
  };

  return (
    <div className="website-field-group">
      {websites.map((website, index) => (
        <div className="optional-field-row" key={`${index}-${websites.length}`}>
          <button type="button" className="drag-handle" aria-label="调整网站字段">
            <MoreVertical />
          </button>
          <EditableTextField
            label="网站"
            value={website}
            borderStyle={index === 0 ? 'top' : 'middle'}
            tone="secondary"
            onChange={(nextWebsite) => updateWebsite(index, nextWebsite)}
            actions={
              <>
                <button type="button" className="icon-button" aria-label="网站字段选项">
                  <SlidersHorizontal />
                </button>
                <button type="button" className="danger-icon" aria-label="移除网站字段" onClick={() => removeWebsite(index)}>
                  <MinusCircle />
                </button>
              </>
            }
          />
        </div>
      ))}
      <button type="button" className="add-row" onClick={addWebsite}>
        <Plus />
        添加另一个网站
      </button>
    </div>
  );
}

function PasswordEditorFields({
  input,
  generatorHint,
  generatorOpen,
  onGeneratorHintChange,
  onGeneratorOpenChange,
  onChange,
}: {
  input: PasswordInput;
  generatorHint: boolean;
  generatorOpen: boolean;
  onGeneratorHintChange: (value: boolean) => void;
  onGeneratorOpenChange: (value: boolean) => void;
  onChange: (patch: Partial<PasswordInput>) => void;
}) {
  return (
    <>
      <EditableFieldGroup>
        <EditablePasswordField
          value={input.password}
          borderStyle="single"
          generatorHint={generatorHint}
          generatorOpen={generatorOpen}
          onGeneratorHintChange={onGeneratorHintChange}
          onGeneratorOpenChange={onGeneratorOpenChange}
          onChange={(password) => onChange({ password })}
        />
      </EditableFieldGroup>
      <EditorNotes value={input.notes} onChange={(notes) => onChange({ notes })} />
    </>
  );
}

function EditablePasswordField({
  value,
  borderStyle = 'single',
  generatorHint,
  generatorOpen,
  onGeneratorHintChange,
  onGeneratorOpenChange,
  onChange,
}: {
  value: string;
  borderStyle?: FieldBorderStyle;
  generatorHint: boolean;
  generatorOpen: boolean;
  onGeneratorHintChange: (value: boolean) => void;
  onGeneratorOpenChange: (value: boolean) => void;
  onChange: (password: string) => void;
}) {
  const fieldId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const showGeneratorHint = () => {
    if (!generatorOpen) {
      onGeneratorHintChange(true);
    }
  };

  useEffect(() => {
    if (!generatorHint || generatorOpen) {
      return undefined;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!fieldRef.current?.contains(event.target as Node)) {
        onGeneratorHintChange(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [generatorHint, generatorOpen, onGeneratorHintChange]);

  return (
    <>
      {generatorOpen && (
        <button
          type="button"
          className="password-generator-backdrop"
          aria-label="关闭密码生成器"
          onClick={() => onGeneratorOpenChange(false)}
        />
      )}
      <div
        ref={fieldRef}
        className={`editable-field primary field-${borderStyle} password-edit-field ${generatorOpen ? 'generator-open' : ''}`}
        onPointerDownCapture={showGeneratorHint}
      >
        <div className="editable-field-content">
          <label className="editable-field-label" htmlFor={fieldId}>
            密码
          </label>
          <div className="editable-field-value-container">
            <input
              id={fieldId}
              className="editable-field-value"
              value={value}
              spellCheck={false}
              onFocus={showGeneratorHint}
              onClick={showGeneratorHint}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
        </div>
        {generatorHint && !generatorOpen && (
          <button type="button" className="generate-chip" onClick={() => onGeneratorOpenChange(true)}>
            <KeyRound size={18} />
            创建新密码
          </button>
        )}
        {generatorOpen && (
          <PasswordGeneratorPopover
            onCancel={() => onGeneratorOpenChange(false)}
            onUse={(password) => {
              onChange(password);
              onGeneratorHintChange(false);
              onGeneratorOpenChange(false);
            }}
          />
        )}
      </div>
    </>
  );
}

function EditorNotes({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const fieldId = useId();

  return (
    <div className="notes-box editable-note-field">
      <label htmlFor={fieldId}>备注</label>
      <textarea
        id={fieldId}
        value={value}
        placeholder="在这里添加关于此项目的备注。"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function PasswordGeneratorPopover({
  onCancel,
  onUse,
}: {
  onCancel: () => void;
  onUse: (password: string) => void;
}) {
  const [length, setLength] = useState(passwordLengthLimits.default);
  const [generatorType, setGeneratorType] = useState<PasswordGeneratorType>('random');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(false);
  const [password, setPassword] = useState('');
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const selectedType = passwordGeneratorTypes.find((option) => option.value === generatorType) ?? passwordGeneratorTypes[0];
  const lengthProgress =
    ((length - passwordLengthLimits.min) / (passwordLengthLimits.max - passwordLengthLimits.min)) * 100;
  const setClampedLength = (nextLength: number) =>
    setLength(clamp(nextLength, passwordLengthLimits.min, passwordLengthLimits.max));

  const generateLocalPassword = useCallback(() => {
    const pick = <T,>(values: T[]) => {
      const bytes = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      return values[bytes[0] % values.length];
    };

    if (generatorType === 'pin') {
      const digits = new Uint32Array(length);
      crypto.getRandomValues(digits);
      return Array.from(digits, (value) => String(value % 10)).join('');
    }

    const words: string[] = [];
    while (words.join('-').length < length) {
      words.push(pick(memorablePasswordWords));
    }
    return words.join('-').slice(0, length);
  }, [generatorType, length]);

  const refresh = useCallback(async () => {
    if (generatorType === 'random') {
      setPassword(
        await api.generatePassword({
          length,
          include_numbers: includeNumbers,
          include_symbols: includeSymbols,
        }),
      );
      return;
    }

    setPassword(generateLocalPassword());
  }, [generateLocalPassword, generatorType, includeNumbers, includeSymbols, length]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!typeMenuOpen) {
      return undefined;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!typeMenuRef.current?.contains(event.target as Node)) {
        setTypeMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [typeMenuOpen]);

  useEffect(() => {
    if (!password) return;
    passwordInputRef.current?.focus();
    passwordInputRef.current?.select();
  }, [password]);

  return (
    <div className="password-popover">
      <div className="generator-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="icon-button" aria-label="重新生成密码" onClick={refresh}>
          <RefreshCw size={22} />
        </button>
        <button type="button" className="primary-button" onClick={() => onUse(password)}>
          使用
        </button>
      </div>
      <input
        ref={passwordInputRef}
        className="generated-password"
        aria-label="生成的密码"
        spellCheck={false}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <div className="strength-bar" />
      <div className="generator-row">
        <span>类型</span>
        <div className="generator-type-control" ref={typeMenuRef}>
          <button
            type="button"
            className="select-button"
            aria-haspopup="menu"
            aria-expanded={typeMenuOpen}
            onClick={() => setTypeMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setTypeMenuOpen(false);
              }
            }}
          >
            {selectedType.label}
            <ChevronDown size={16} />
          </button>
          {typeMenuOpen && (
            <div className="generator-type-menu" role="menu">
              {passwordGeneratorTypes.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.value === generatorType}
                  className={option.value === generatorType ? 'selected' : ''}
                  onClick={() => {
                    setGeneratorType(option.value);
                    setTypeMenuOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === generatorType && <Check size={18} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="generator-row generator-row-slider">
        <span>字符</span>
        <div className="generator-slider-wrap" style={{ '--range-progress': `${lengthProgress}%` } as CSSProperties}>
          <input
            className="generator-slider"
            type="range"
            min={passwordLengthLimits.min}
            max={passwordLengthLimits.max}
            value={length}
            aria-label="密码字符数"
            onChange={(event) => setClampedLength(Number(event.target.value))}
          />
          <input
            className="length-value"
            type="number"
            min={passwordLengthLimits.min}
            max={passwordLengthLimits.max}
            value={length}
            aria-label="密码长度"
            onChange={(event) => setClampedLength(Number(event.target.value))}
          />
        </div>
      </div>
      <div className="generator-row">
        <span>数字</span>
        <button
          type="button"
          className={`switch ${includeNumbers ? 'on' : ''}`}
          aria-pressed={includeNumbers}
          aria-label="包含数字"
          onClick={() => setIncludeNumbers((value) => !value)}
        />
      </div>
      <div className="generator-row">
        <span>符号</span>
        <button
          type="button"
          className={`switch ${includeSymbols ? 'on' : ''}`}
          aria-pressed={includeSymbols}
          aria-label="包含符号"
          onClick={() => setIncludeSymbols((value) => !value)}
        />
      </div>
    </div>
  );
}
