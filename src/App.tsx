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
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { api } from './api';
import type { ItemOverview, ItemType, LoginInput, LoginItem, VaultStatus } from './types';
import { startWindowDrag } from './windowDrag';

type Overlay =
  | { kind: 'none' }
  | { kind: 'type-picker' }
  | { kind: 'editor'; itemType: ItemType };
type SidebarView = 'all' | 'favorites';
type CategoryFilter = 'all' | ItemType;
type ResizablePane = 'sidebar' | 'itemList';

const sidebarWidthLimits = { min: 230, max: 420, default: 276 };
const itemListWidthLimits = { min: 300, max: 520, default: 354 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const itemTypes: Array<{ type: ItemType; label: string; icon: JSX.Element; implemented: boolean }> = [
  { type: 'login', label: '登录信息', icon: <KeyRound />, implemented: true },
  { type: 'secure_note', label: '安全备注', icon: <FileText />, implemented: false },
  { type: 'credit_card', label: '信用卡', icon: <CreditCard />, implemented: false },
  { type: 'identity', label: '身份标识', icon: <IdCard />, implemented: false },
  { type: 'password', label: '密码', icon: <KeyRound />, implemented: false },
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

const fallbackLogin: LoginInput = {
  title: '',
  username: 'vim27@qq.com',
  password: 'yUndKy6izwkvT26sRrib',
  website: 'https://example.com',
  notes: '',
  tags: [],
};

export function App() {
  const [status, setStatus] = useState<VaultStatus>('locked');
  const [items, setItems] = useState<ItemOverview[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedItem, setSelectedItem] = useState<LoginItem>();
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
          onClose={() => setOverlay({ kind: 'none' })}
          onSave={async (input) => {
            const item = await api.createLogin(input);
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
  return <span className={`item-icon ${isOpenAi ? 'black' : ''}`}>{isOpenAi ? '◎' : initials}</span>;
}

function DetailPane({
  item,
  onFavoriteChange,
}: {
  item?: LoginItem;
  onFavoriteChange: (id: string, favorite: boolean) => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false);

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
          <span className="detail-icon">{item.title.slice(0, 2)}</span>
          <h1>{item.title}</h1>
        </div>
        <div className="credential-card">
          <FieldLine label="用户名" value={item.username} actionLabel="复制" onAction={() => copyValue(item.username)} />
          <div className="field-line">
            <div>
              <span className="field-label">密码</span>
              <span className="field-value password-value">{revealed ? item.password : '••••••••••'}</span>
            </div>
            <div className="field-actions">
              <span className="strength">极佳</span>
              <span className="strength-ring" />
              <button className="icon-button" onClick={() => setRevealed((value) => !value)}>
                {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <button className="field-copy" onClick={() => copyValue(item.password)}>
                复制
              </button>
            </div>
          </div>
        </div>
        <section className="detail-section">
          <span className="field-label">网站</span>
          <a href={item.website} target="_blank" rel="noreferrer">
            {item.website}
          </a>
        </section>
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

function ItemEditorModal({ onClose, onSave }: { onClose: () => void; onSave: (input: LoginInput) => Promise<void> }) {
  const [input, setInput] = useState<LoginInput>(fallbackLogin);
  const [generatorHint, setGeneratorHint] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<LoginInput>) => setInput((current) => ({ ...current, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(input);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <div className="editor-modal modal-card">
        <header className="editor-header">
          <button className="icon-button" onClick={onClose}>
            <ArrowLeft />
          </button>
          <h2>新的项目</h2>
          <button className="icon-button" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="editor-body">
          <div className="editor-title-row">
            <div className="large-item-icon">
              <KeyRound size={34} />
              <button>
                <ChevronDown size={18} />
              </button>
            </div>
            <input
              className="title-input"
              value={input.title}
              placeholder="输入标题"
              onChange={(event) => update({ title: event.target.value })}
            />
          </div>
          <div className="edit-group">
            <label className="edit-field">
              <span>用户名</span>
              <input value={input.username} onChange={(event) => update({ username: event.target.value })} />
            </label>
            <label className="edit-field password-edit-field">
              <span>密码</span>
              <input
                value={input.password}
                onFocus={() => setGeneratorHint(true)}
                onChange={(event) => update({ password: event.target.value })}
              />
              {generatorHint && !generatorOpen && (
                <button type="button" className="generate-chip" onClick={() => setGeneratorOpen(true)}>
                  <KeyRound size={18} />
                  创建新密码
                </button>
              )}
            </label>
          </div>
          <div className="field-block">
            <button className="drag-handle">
              <MoreVertical />
            </button>
            <label>
              <span>网站</span>
              <input value={input.website} onChange={(event) => update({ website: event.target.value })} />
            </label>
            <button className="icon-button">
              <SlidersHorizontal />
            </button>
            <button className="danger-icon">
              <MinusCircle />
            </button>
          </div>
          <button className="add-row">
            <Plus />
            添加另一个网站
          </button>
          <button className="add-row">
            <Plus />
            添加更多
            <ChevronDown />
          </button>
          <label className="notes-box">
            <span>备注</span>
            <textarea
              value={input.notes}
              placeholder="在这里添加关于此项目的备注。"
              onChange={(event) => update({ notes: event.target.value })}
            />
          </label>
          <button className="add-row">
            <Plus />
            添加位置
          </button>
          {generatorOpen && (
            <PasswordGeneratorPopover
              onCancel={() => setGeneratorOpen(false)}
              onUse={(password) => {
                update({ password });
                setGeneratorHint(false);
                setGeneratorOpen(false);
              }}
            />
          )}
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

function PasswordGeneratorPopover({
  onCancel,
  onUse,
}: {
  onCancel: () => void;
  onUse: (password: string) => void;
}) {
  const [length, setLength] = useState(20);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(false);
  const [password, setPassword] = useState('');

  const refresh = useCallback(async () => {
    setPassword(
      await api.generatePassword({
        length,
        include_numbers: includeNumbers,
        include_symbols: includeSymbols,
      }),
    );
  }, [includeNumbers, includeSymbols, length]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="password-popover">
      <div className="generator-actions">
        <button onClick={onCancel}>取消</button>
        <button className="icon-button" onClick={refresh}>
          <RefreshCw />
        </button>
        <button className="primary-button" onClick={() => onUse(password)}>
          使用
        </button>
      </div>
      <input className="generated-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      <div className="strength-bar" />
      <div className="generator-row">
        <span>类型</span>
        <button className="select-button">
          随机密码
          <ChevronDown size={16} />
        </button>
      </div>
      <div className="generator-row">
        <span>字符</span>
        <input type="range" min="12" max="40" value={length} onChange={(event) => setLength(Number(event.target.value))} />
        <strong className="length-value">{length}</strong>
      </div>
      <div className="generator-row">
        <span>数字</span>
        <button className={`switch ${includeNumbers ? 'on' : ''}`} onClick={() => setIncludeNumbers((value) => !value)} />
      </div>
      <div className="generator-row">
        <span>符号</span>
        <button className={`switch ${includeSymbols ? 'on' : ''}`} onClick={() => setIncludeSymbols((value) => !value)} />
      </div>
    </div>
  );
}
