# 1Password 单机复刻版分析

日期：2026-06-22  
当前目录：`/Users/zhangya/workspace/1pass`  
目标：实现一个像 1Password 的本地单机密码管理器，不依赖云端账号、团队协作、订阅或官方服务。

## 结论先行

可以做，而且最合理的路线不是“逆向复制 1Password”，而是“复刻 1Password 的产品结构、安全边界和核心体验，用自己的实现重建”。

本机安装的 1Password 8.12.24 说明它的关键架构是：

- Electron 外壳 + React 前端。
- Native/Rust 核心负责加密、数据库、Keychain、系统解锁、浏览器集成、SSH/passkey/TOTP 等敏感能力。
- 前端通过受控 preload API / IPC / GraphQL 风格调用进入 native core。
- 本地 SQLite 里主要保存 BLOB，不把密码字段明文拆成普通列。
- Electron 缓存目录和真实密码库数据目录分离。
- 浏览器填充不是主程序直接干，而是独立 Browser Helper + Native Messaging + 浏览器签名校验。

单机版第一阶段应该做成：

- 本地 vault。
- 主密码解锁。
- 本地加密 SQLite。
- 项目类型：登录、密钥、银行卡、安全笔记、身份、API Key、SSH Key、TOTP。
- 搜索、收藏、标签、复制、自动清空剪贴板、自动锁定。
- macOS Keychain / Touch ID 作为可选快速解锁，不作为唯一安全根。

第一阶段不建议做：

- 云同步。
- 团队共享。
- 官方 1Password 账号兼容。
- 浏览器自动填充。
- passkey provider。
- SSH agent。
- Watchtower 在线泄露检查。

这些不是不能做，而是它们会把项目从“单机密码库”升级成“系统级凭据平台”，权限、审计和攻击面都会明显扩大。

## 法律和工程边界

1Password 是专有软件。本次本机分析只用于理解架构、文件分布、公开安全模型和可复刻的产品行为。不要复制它的 JS bundle、资源、图标、文案、私有协议、私有模块命名体系或数据库内容。

可以借鉴的是：

- 信息架构。
- 安全模型。
- IPC 分层。
- 本地加密存储思路。
- 系统集成边界。
- UI 交互习惯。

不应该借鉴的是：

- 专有代码实现。
- 官方品牌和商标视觉。
- 真实用户数据。
- 1Password 专有服务协议。
- 反编译后的函数和算法细节。

## 本机 1Password 应用包证据

本机应用路径：

```text
/Applications/1Password.app
```

基础信息：

```text
CFBundleIdentifier: com.1password.1password
CFBundleShortVersionString: 8.12.24
Executable: 1Password
TeamIdentifier: 2BUA8C4S2C
Notarization Ticket: stapled
Copyright: 2026 1Password
```

包体结构要点：

```text
/Applications/1Password.app/Contents/MacOS/1Password
/Applications/1Password.app/Contents/MacOS/1Password-Crash-Handler
/Applications/1Password.app/Contents/MacOS/1Password-LastPass-Exporter
/Applications/1Password.app/Contents/MacOS/onepassword-mcp
/Applications/1Password.app/Contents/MacOS/op-ssh-sign
/Applications/1Password.app/Contents/Resources/app.asar
/Applications/1Password.app/Contents/Frameworks/index.node
/Applications/1Password.app/Contents/Frameworks/libop_sdk_ipc_client.dylib
/Applications/1Password.app/Contents/Frameworks/libop_sdk_lib_core.dylib
```

体积侧面说明：

```text
1Password.app: 505M
Electron Framework.framework: 266M
app.asar: 35M
index.node: 149M
libop_sdk_lib_core.dylib: 17M
```

判断：

- `1Password` 主可执行文件很小，真正重量在 Electron 和 native core。
- `index.node` 是 Node native addon，是 JS/Electron 与核心能力之间的桥。
- `libop_sdk_lib_core.dylib`、`libop_sdk_ipc_client.dylib` 说明 native SDK / IPC 是独立层。
- `onepassword-mcp` 和 `op-ssh-sign` 说明官方客户端已经扩展到开发者凭据场景。

## app.asar 结构

`app.asar` 里不是源码目录，而是生产构建产物。主要入口包括：

```text
/main.js
/preload.js
/primary.html
/quickAccess.html
/authPrompt.html
/passkeyPrompt.html
/secondary.html
/primaryRenderer.css
/quickAccessRenderer.css
/authPromptRenderer.css
/passkeyPromptRenderer.css
/vendors.js
/primaryRenderer.js
/index.node
/package.json
/assets/*.woff2
/images/*
```

`package.json` 显示的前端栈：

- React 19。
- React DOM。
- React Router。
- Redux。
- Apollo Client / GraphQL。
- Lingui i18n。
- dnd-kit。
- motion。
- 1Password 内部 workspace 包：`@1password/app-ui`、`@1password/core-node`、`@1password/ui` 等。

`primary.html` 有很严格的 CSP：

- 默认禁止外部资源。
- 脚本限制为自身资源。
- 图片仅允许自身、data、blob。
- 字体仅自身。
- form action 禁止。

这对单机版是一个重要信号：桌面应用也应该像浏览器高风险页面一样约束前端能力。

## preload / IPC 边界

`preload.js` 暴露了一个白名单式 `window.op` API，不是把 Node 全量开放给前端。它覆盖的能力可归类为：

- 资源与配置：前端配置、资源加载、本地化。
- 锁屏和解锁：获取 lock screen、认证提示、passkey 提示。
- 密码功能：TOTP 生成、secure copy、二维码扫描。
- 窗口控制：显示、隐藏、居中、最大化、标题栏、菜单。
- Quick Access：快速搜索、快速动作。
- 项目动作：字段动作、条目动作、选择状态。
- 系统能力：相机权限、通知权限、打开链接、文件选择、打印。
- WebAuthn/passkey：注册、选择、签名。
- GraphQL 风格调用：普通 invoke、subscription request/response。

这个边界值得单机版直接学习：前端永远不应该直接访问文件系统、数据库、Keychain 或加密密钥。

## native core 证据

从 native 二进制字符串中可以看到大量 Rust/Swift/macOS 相关模块名。只按模块能力归纳：

- `op-crypto`
- `op-srp`
- `op-totp`
- `op-model-item`
- `op-db-queue`
- `op-core-node`
- `op-edit-item`
- `op-vault-creation`
- `op-ssh-keys`
- `op-openssh-keys`
- `CoreFoundation/SystemKeychain.swift`
- `LocalAuthentication`
- `DeviceUnlockMonitor`
- `BrowserHelperXPCConnection`
- `ProcessValidation+BrowserHelper.swift`

出现的能力关键词包括：

- AES-GCM。
- HKDF。
- PBKDF2。
- SRP。
- TOTP。
- WebAuthn/passkey。
- SSH key。
- Keychain。
- Touch ID / Face ID / Apple Watch / device unlock。
- browser process validation。
- secure copy / clipboard。

判断：

- 1Password 并不是把加密逻辑写在 React 前端里。
- 加密、密钥派生、Keychain、系统认证、浏览器验证、SSH/passkey 这类能力都在 native core。
- 单机复刻如果想认真做，也应该把安全核心放在 Rust/Swift/Go 这类 native 层，前端只做展示和交互。

## 本地数据目录

Electron 应用状态：

```text
~/Library/Application Support/1Password
```

这里主要有：

- Electron / Chromium cache。
- Local Storage。
- Session Storage。
- Cookies。
- window state。
- partition 数据。

真实密码库数据：

```text
~/Library/Group Containers/2BUA8C4S2C.com.1password/Library/Application Support/1Password/Data
```

核心文件：

```text
1password.sqlite
1password.sqlite-wal
1password.sqlite-shm
1password_resources.sqlite
1password_resources.sqlite-wal
1password_resources.sqlite-shm
settings/settings.json
logs/*
```

`1password.sqlite` schema 只看结构，不读取数据：

```sql
CREATE TABLE accounts (
  account_uuid TEXT PRIMARY KEY NOT NULL,
  data BLOB NOT NULL
);

CREATE TABLE vaults (
  account_uuid TEXT NOT NULL,
  vault_uuid TEXT NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (account_uuid, vault_uuid)
);

CREATE TABLE items (
  account_uuid TEXT NOT NULL,
  vault_uuid TEXT NOT NULL,
  item_uuid TEXT NOT NULL,
  local_edit_count INTEGER NOT NULL,
  rejection_reason INTEGER NOT NULL,
  version INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (account_uuid, vault_uuid, item_uuid)
);

CREATE TABLE config (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE objects_associated (
  type INT NOT NULL,
  account_uuid TEXT NOT NULL,
  key_name TEXT NOT NULL,
  data BLOB NOT NULL,
  vault_uuid TEXT,
  item_uuid TEXT,
  PRIMARY KEY (type, account_uuid, key_name)
);

CREATE TABLE objects_unassociated (
  key_name TEXT NOT NULL,
  type INT NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (key_name, type)
);
```

`1password_resources.sqlite` schema：

```sql
CREATE TABLE resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name BLOB NOT NULL,
  data BLOB NOT NULL,
  k_bucket INTEGER NULL,
  account_uuid TEXT NULL,
  cache_control INTEGER NULL,
  UNIQUE (account_uuid, name) ON CONFLICT REPLACE
);
```

判断：

- 它没有把 login username/password/URL 等拆成普通明文列。
- `accounts`、`vaults`、`items` 都是 `data BLOB`，说明核心数据是序列化后加密/封装存储。
- `local_edit_count`、`rejection_reason`、`version` 这类同步/冲突相关元数据是外层列。
- 单机版可以用更简单的 schema，但应该保留“敏感内容整体加密成 BLOB”的原则。

## 浏览器集成证据

Native Messaging 配置存在于多个浏览器目录，例如：

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.1password.1password.json
~/Library/Application Support/Mozilla/NativeMessagingHosts/com.1password.1password.json
```

配置指向：

```text
/Applications/1Password.app/Contents/Library/LoginItems/1Password Browser Helper.app/Contents/MacOS/1Password-BrowserSupport
```

应用包里还有：

```text
/Applications/1Password.app/Contents/Library/LoginItems/1Password Browser Helper.app
/Applications/1Password.app/Contents/Library/LoginItems/1Password Launcher.app
```

Browser Helper 字符串中能看到：

- browser verification。
- code signature validation。
- allowed browser bundle identifiers。
- XPC connection。
- Native Messaging stdio。
- lock state change。

判断：

- 浏览器扩展不是直接读主数据库。
- 浏览器扩展通过 Native Messaging 与本地 helper 通信。
- helper 会校验浏览器进程/签名。
- helper 和主 app 共享 application group。
- 这部分是高风险系统集成，不应进入第一版。

## 官方安全模型可借鉴点

官方公开资料确认的核心点：

- 端到端加密。
- AES-GCM-256 认证加密。
- PBKDF2-HMAC-SHA256 用于账号密码派生强化。
- Secret Key 与账号密码组合保护数据。
- 账号密码不传给 1Password。
- SRP 用于服务端认证，避免把密码发到服务器。
- 自动锁定、剪贴板清理、浏览器代码签名校验、用户主动确认填充是安全功能的一部分。

对单机版的转化：

- 单机版没有服务器认证，所以不需要 SRP。
- 单机版不需要 Secret Key 来抵御云端数据库泄漏，但可以保留“主密码 + 本机随机设备密钥/恢复密钥”的双因素密钥思路。
- 必须保留强 KDF、认证加密、密钥分层、锁定态无明文密钥。
- 如果做浏览器填充，必须保留“用户主动确认 + 域名匹配 + 浏览器进程校验”的原则。

官方资料：

- <https://support.1password.com/1password-security/>
- <https://support.1password.com/secret-key-security/>
- <https://agilebits.github.io/security-design/>

## 单机版推荐技术路线

推荐：Tauri 2 + React + Rust core + SQLite。

理由：

- 比 Electron 轻很多。
- Rust 适合做加密、密钥生命周期和 SQLite 封装。
- Tauri 的前端权限面比 Electron 默认更小。
- 依然可以实现 macOS 菜单、托盘、窗口、自动锁定、Keychain、Touch ID。
- 后续如需浏览器集成，也可以另写 native helper。

备选：Electron + React + Rust/N-API。

适合场景：

- 想最大程度复刻 1Password 的技术形态。
- 需要复杂多窗口、preload、Chromium 行为。
- 团队已经熟悉 Electron。

不推荐：纯 Web 本地页面。

原因：

- 浏览器本地存储和剪贴板能力边界不够可控。
- 无法可靠接入 Keychain / Touch ID / 自动锁定 / 本地文件加密。
- 密钥生命周期不好控制。

## 推荐模块划分

```text
apps/desktop
  src/
    ui/                 React UI
    routes/             lock, home, item detail, settings
    components/
    state/
    ipc-client.ts       typed command client

crates/core
  src/
    crypto/             KDF, AEAD, key wrapping, random
    vault/              vault service, item service
    store/              SQLite repository
    search/             unlocked in-memory index
    generator/          password/passphrase/TOTP
    import_export/      CSV/1PUX/KeePass/Bitwarden later
    platform/           macOS Keychain, Touch ID, clipboard
    audit/              local event log without secrets

crates/cli
  optional local CLI

crates/browser-helper
  future native messaging helper
```

如果先快速出 MVP，也可以不做 monorepo，直接：

```text
src-tauri/
src/
```

但核心代码要从一开始按 `crypto`、`store`、`vault`、`platform` 分开。

## 密钥设计

推荐密钥层级：

```text
Master Password
  -> Argon2id(master_password, salt, params)
  -> Unlock Key

Random Root Key
  -> encrypted by Unlock Key
  -> stored in database header

Vault Key
  -> encrypted by Root Key
  -> one per vault

Item Data
  -> encrypted by Vault Key or per-item Data Key
```

解释：

- 主密码不直接加密所有 item。
- 首次创建时生成随机 Root Key。
- 主密码只用于派生 Unlock Key，Unlock Key 用来解开 Root Key。
- 改主密码时只需要重新包裹 Root Key，不需要重加密所有 item。
- 多 vault 时每个 vault 独立 key，后续做导出/共享/删除更清晰。

KDF 建议：

- 首选 Argon2id。
- 参数可调，并写入数据库 header。
- 默认参数要按目标机器性能校准，例如解锁耗时 300ms 到 800ms。
- 每个数据库独立 salt。

认证加密建议：

- `XChaCha20-Poly1305` 或 `AES-256-GCM`。
- nonce 每次随机生成，不复用。
- associated data 包含 schema version、record type、record id、vault id。
- 每个加密 blob 包含版本、算法、KDF 参数引用、nonce、ciphertext、tag。

内存处理：

- 使用 `zeroize` 清理密钥。
- 使用 `secrecy` 包裹密钥材料。
- 锁定时清空 root key、vault key、搜索索引、明文 item cache。
- 日志永远不输出 secret、password、TOTP seed、recovery code、private key。

Touch ID / Keychain 快速解锁：

- 不能把主密码明文放 Keychain。
- 推荐生成本机 Device Unlock Key，存入 macOS Keychain，并用 biometry / user presence 保护。
- Device Unlock Key 只用于解开本地 Root Key 的一个额外包裹副本。
- 设置“每隔 N 天必须输入主密码”，避免生物识别成为永久绕过主密码的入口。
- 设备 biometrics 变化后失效，需要主密码重新开启。

## 数据库设计

推荐 SQLite schema：

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE keysets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  kdf_json TEXT NOT NULL,
  encrypted_root_key BLOB NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE vaults (
  id TEXT PRIMARY KEY,
  encrypted_meta BLOB NOT NULL,
  encrypted_vault_key BLOB NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  type TEXT NOT NULL,
  encrypted_overview BLOB NOT NULL,
  encrypted_details BLOB NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (vault_id) REFERENCES vaults(id)
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  encrypted_meta BLOB NOT NULL,
  encrypted_blob BLOB NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE item_history (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  encrypted_snapshot BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

说明：

- `type`、`favorite`、`created_at`、`updated_at` 是否明文要取决于威胁模型。
- 更强隐私：只保留最小明文列，甚至 favorite 也放进加密 overview。
- 更好性能：保留 type/favorite/updated_at 方便列表过滤。
- 搜索索引不要落明文库；解锁后在内存建立。

## Item 数据模型

建议采用 schema 化 JSON，再整体加密：

```json
{
  "id": "uuid",
  "type": "login",
  "title": "GitHub",
  "tags": ["dev"],
  "fields": [
    {
      "id": "username",
      "label": "Username",
      "kind": "text",
      "value": "alice@example.com"
    },
    {
      "id": "password",
      "label": "Password",
      "kind": "concealed",
      "value": "..."
    },
    {
      "id": "otp",
      "label": "One-time password",
      "kind": "totp",
      "value": "otpauth://..."
    }
  ],
  "websites": [
    {
      "url": "https://github.com",
      "autofill": "exact-host"
    }
  ],
  "notes": "..."
}
```

内置类型：

- `login`
- `secure_note`
- `credit_card`
- `identity`
- `api_credential`
- `ssh_key`
- `database`
- `server`
- `software_license`
- `crypto_wallet`
- `document`

字段类型：

- `text`
- `concealed`
- `url`
- `email`
- `phone`
- `totp`
- `date`
- `month_year`
- `address`
- `ssh_private_key`
- `file`

## UI 信息架构

1Password 的核心 UI 可以抽象成三栏：

```text
Sidebar -> Item List -> Item Detail / Editor
```

单机版建议：

- 左栏：所有项目、收藏、最近、分类、标签、vault、回收站、安全检查。
- 中栏：搜索框、过滤、排序、条目列表。
- 右栏：详情、复制动作、显示/隐藏、编辑、历史、附件。

关键窗口：

- Lock Screen。
- Main Window。
- Quick Access。
- Settings。
- Add/Edit Item Modal 或右侧编辑态。
- Password Generator。
- Import/Export。

核心交互：

- Cmd+F 搜索。
- Cmd+N 新建。
- Cmd+L 锁定。
- Copy password / username / TOTP。
- Reveal with hold-to-reveal 或点击 reveal。
- 密码复制后倒计时清空剪贴板。
- 自动锁定：空闲、系统锁屏、应用关闭、睡眠。

## 安全功能优先级

P0 必须有：

- 主密码创建和解锁。
- Argon2id KDF。
- 认证加密。
- SQLite 加密 BLOB 存储。
- 自动锁定。
- 剪贴板自动清除。
- 密码生成器。
- TOTP seed 加密存储。
- 锁定态清内存。
- 日志脱敏。

P1 应该有：

- Touch ID / Keychain 快速解锁。
- 项目历史版本。
- 加密备份导出。
- CSV / Bitwarden / KeePass 导入。
- 安全检查：弱密码、重复密码、无 2FA、HTTP URL。
- 附件加密。
- 搜索索引在内存中构建。

P2 后续再做：

- 浏览器扩展。
- Native Messaging helper。
- SSH agent。
- passkey provider。
- 多设备局域网同步。
- iCloud Drive / WebDAV / Git remote 加密同步。
- 泄露密码检查。

## 浏览器自动填充设计边界

如果后续做浏览器扩展，必须独立成第二阶段。

基本结构：

```text
Browser Extension
  <-> Native Messaging
Browser Helper
  <-> Local IPC
Desktop Core
  <-> Encrypted Vault
```

最低要求：

- 扩展不能直接访问数据库。
- 扩展只能请求候选项。
- 主 app 或 helper 必须确认当前 lock state。
- 域名匹配必须在 core 层做，不信任网页传参。
- 填充前要有用户意图，例如点击扩展、快捷键、系统提示。
- native helper 必须校验浏览器来源。
- Native Messaging manifest 只允许自己的扩展 ID。
- 永远不要把所有密码批量发给扩展。

MVP 不做浏览器填充是正确选择。

## 与 1Password 功能对照

| 能力 | 官方 1Password | 单机 MVP | 建议 |
|---|---|---|---|
| 本地 vault | 有本地缓存/数据层 | 必须有 | 做 |
| 云同步 | 有 | 无 | 不做 |
| 团队/权限 | 有 | 无 | 不做 |
| 主密码 | 有 | 必须有 | 做 |
| Secret Key | 有 | 可选变体 | 不照搬 |
| SRP | 有，服务端认证 | 无需 | 不做 |
| Touch ID | 有 | P1 | 做 |
| TOTP | 有 | P0/P1 | 做 |
| 密码生成器 | 有 | P0 | 做 |
| 浏览器填充 | 有 | P2 | 后做 |
| SSH agent | 有 | P2 | 后做 |
| passkey | 有 | P2 | 后做 |
| Watchtower | 有 | P1/P2 | 先做离线检查 |
| 导入导出 | 有 | P1 | 做 |

## 推荐实现路线

### 阶段 0：项目骨架

- 选 Tauri 2 + React + TypeScript + Rust。
- 建立 typed command 边界。
- 主窗口 + 锁屏 + 空 vault UI。
- SQLite 初始化。
- 基础测试框架。

验收：

- 应用可启动。
- 不能从前端直接访问文件系统。
- Rust command 有类型定义。

### 阶段 1：本地加密库

- 创建主密码。
- Argon2id 派生 Unlock Key。
- 生成 Root Key。
- 建库并写入加密 header。
- 解锁后保存 Root Key 到内存。
- 锁定后清空内存。

验收：

- 数据库落盘后看不到明文密码。
- 错误主密码无法解锁。
- 改一个 bit 解密失败。
- 锁定后 API 不能返回 item。

### 阶段 2：项目 CRUD

- vault CRUD。
- item CRUD。
- 登录、安全笔记、银行卡、身份、API Key。
- 字段类型。
- 搜索、标签、收藏。
- 项目历史。

验收：

- 新增、编辑、删除、恢复正常。
- 重启后可解锁恢复。
- 搜索只在解锁后可用。

### 阶段 3：安全体验

- 密码生成器。
- TOTP。
- secure copy。
- 剪贴板清空。
- 自动锁定。
- reveal/hold reveal。
- 日志脱敏。

验收：

- 复制密码后指定秒数清空。
- 系统睡眠/锁屏后自动锁。
- 日志没有 secret 值。

### 阶段 4：macOS 集成

- Keychain 快速解锁。
- Touch ID。
- 菜单栏。
- 全局快捷键打开 Quick Access。
- window state。

验收：

- Touch ID 失败时回落主密码。
- 生物识别状态变化后要求主密码。
- Quick Access 不泄漏锁定态数据。

### 阶段 5：导入导出

- 加密备份格式。
- CSV 导入。
- Bitwarden / KeePass 导入。
- 1Password 1PUX 可选导入。

验收：

- 导出文件本身加密。
- 导入字段映射可预览。
- 导入日志不含密码。

### 阶段 6：浏览器集成

- Native Messaging helper。
- Chrome/Firefox extension。
- 域名匹配。
- 用户确认填充。
- 浏览器来源校验。

验收：

- 扩展无法在锁定态获得数据。
- 非匹配域名不返回密码。
- 非授权扩展 ID 不可连接。

## 安全测试清单

必须做自动化测试：

- KDF 参数写入/读取。
- 同一明文多次加密 ciphertext 不同。
- nonce 不复用。
- 错误密码解锁失败。
- 篡改 ciphertext/tag 解密失败。
- 改主密码后旧密码失效、新密码可用。
- 锁定后 item API 返回 locked error。
- 日志脱敏。
- 剪贴板清除。
- TOTP 生成符合 RFC 6238。

建议做手动测试：

- 数据库用 `strings` 扫描，不应出现测试密码。
- 进程退出后重启解锁。
- macOS 锁屏后自动锁。
- Touch ID 取消、失败、多次失败。
- 导入异常 CSV。
- 大量 item 搜索性能。

## 风险点

最大的风险不是 UI，而是安全错觉。

容易犯的错：

- 把数据存在 SQLite 明文字段里，只给数据库文件加权限。
- 使用普通 SHA256 派生密码。
- 没有认证加密，只做 AES-CBC。
- nonce 复用。
- 主密码改动时全量重加密导致中途损坏。
- 前端能直接调用任意文件/命令。
- 锁屏只是 UI 状态，core 仍然持有可用明文缓存。
- 搜索索引落明文。
- 剪贴板不清理。
- 日志记录密码值。
- 浏览器扩展一次拿到所有密码。

## 我的建议

第一版目标定义成：

> 一个 macOS 单机 1Password-like 密码库，支持本地强加密、主密码/Touch ID 解锁、登录/笔记/API Key/TOTP 管理、快速搜索和安全复制；暂不做云同步和浏览器自动填充。

技术决策：

- 用 Tauri 2，而不是 Electron。
- UI 用 React + TypeScript。
- 核心用 Rust。
- SQLite 只存加密 BLOB。
- 密钥分层：主密码派生 Unlock Key，只包裹 Root Key。
- 搜索索引只在解锁后存在内存。
- Touch ID 是快速解锁，不是安全根。

这样能最大限度复刻 1Password 的核心价值，同时避免第一版就掉进浏览器、云同步、团队权限、passkey/SSH agent 的复杂度里。

