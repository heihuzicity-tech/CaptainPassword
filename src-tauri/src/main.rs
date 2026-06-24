use std::{fs, path::PathBuf, sync::Mutex};

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chacha20poly1305::{
    aead::rand_core::RngCore,
    aead::{Aead, KeyInit, OsRng, Payload},
    XChaCha20Poly1305, XNonce,
};
use chrono::Utc;
use rand::{seq::SliceRandom, Rng};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use uuid::Uuid;
use zeroize::Zeroize;

#[derive(Default)]
struct AppState {
    session: Mutex<Option<Session>>,
}

struct Session {
    root_key: [u8; 32],
}

impl Drop for Session {
    fn drop(&mut self) {
        self.root_key.zeroize();
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum VaultStatus {
    NoVault,
    Locked,
    Unlocked,
}

#[derive(Serialize, Deserialize)]
struct CipherBlob {
    v: u8,
    alg: String,
    nonce: String,
    ciphertext: String,
}

#[derive(Serialize, Deserialize)]
struct KdfParams {
    alg: String,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
}

#[derive(Serialize, Deserialize)]
struct ItemOverview {
    id: String,
    item_type: String,
    title: String,
    subtitle: String,
    website: Option<String>,
    icon_text: String,
    #[serde(default)]
    favorite: bool,
    updated_at: String,
}

#[derive(Serialize, Deserialize)]
struct LoginDetails {
    id: String,
    item_type: String,
    title: String,
    username: String,
    password: String,
    website: String,
    #[serde(default)]
    websites: Vec<String>,
    #[serde(default)]
    website_labels: Vec<String>,
    notes: String,
    tags: Vec<String>,
    #[serde(default)]
    favorite: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize, Deserialize)]
struct PasswordDetails {
    id: String,
    item_type: String,
    title: String,
    password: String,
    notes: String,
    tags: Vec<String>,
    #[serde(default)]
    favorite: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
struct LoginInput {
    title: String,
    username: String,
    password: String,
    website: String,
    #[serde(default)]
    websites: Vec<String>,
    #[serde(default)]
    website_labels: Vec<String>,
    notes: String,
    tags: Vec<String>,
}

#[derive(Deserialize)]
struct PasswordInput {
    title: String,
    password: String,
    notes: String,
    tags: Vec<String>,
}

#[derive(Deserialize)]
#[serde(tag = "item_type", content = "input", rename_all = "snake_case")]
enum ItemUpdateInput {
    Login(LoginInput),
    Password(PasswordInput),
}

#[derive(Deserialize)]
struct GeneratedPasswordOptions {
    length: usize,
    include_numbers: bool,
    include_symbols: bool,
}

#[derive(Clone, Serialize, Deserialize)]
struct ShortcutPreference {
    accelerator: String,
    keys: Vec<String>,
}

fn data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .ok_or_else(|| "Unable to resolve local data directory".to_string())?;
    let current = base.join("CaptainPassword");
    let legacy = base.join("OnePass Local");

    let current_has_data = current.join("captain-password.sqlite").exists()
        || current.join("preferences.json").exists();
    let legacy_has_data =
        legacy.join("onepass.sqlite").exists() || legacy.join("preferences.json").exists();

    if current_has_data || (current.exists() && !legacy_has_data) {
        return Ok(current);
    }
    if legacy_has_data {
        return Ok(legacy);
    }
    Ok(current)
}

fn db_path() -> Result<PathBuf, String> {
    let dir = data_dir()?;
    let current = dir.join("captain-password.sqlite");
    if current.exists() {
        return Ok(current);
    }
    let legacy = dir.join("onepass.sqlite");
    if legacy.exists() {
        return Ok(legacy);
    }
    Ok(current)
}

fn preferences_path() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("preferences.json"))
}

fn default_quick_access_shortcut() -> ShortcutPreference {
    if cfg!(target_os = "macos") {
        ShortcutPreference {
            accelerator: "Command+Alt+K".to_string(),
            keys: vec!["⌥".to_string(), "⌘".to_string(), "K".to_string()],
        }
    } else {
        ShortcutPreference {
            accelerator: "Control+Alt+K".to_string(),
            keys: vec!["Ctrl".to_string(), "Alt".to_string(), "K".to_string()],
        }
    }
}

fn read_quick_access_shortcut() -> ShortcutPreference {
    let Ok(path) = preferences_path() else {
        return default_quick_access_shortcut();
    };
    let Ok(content) = fs::read_to_string(path) else {
        return default_quick_access_shortcut();
    };
    serde_json::from_str::<ShortcutPreference>(&content)
        .unwrap_or_else(|_| default_quick_access_shortcut())
}

fn write_quick_access_shortcut(shortcut: &ShortcutPreference) -> Result<(), String> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let content = serde_json::to_string_pretty(shortcut).map_err(|err| err.to_string())?;
    fs::write(preferences_path()?, content).map_err(|err| err.to_string())
}

fn show_quick_search<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("quick-search") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn register_quick_access_shortcut<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &ShortcutPreference,
) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|err| err.to_string())?;
    app.global_shortcut()
        .on_shortcut(shortcut.accelerator.as_str(), |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                show_quick_search(app);
            }
        })
        .map_err(|err| err.to_string())
}

fn open_db() -> Result<Connection, String> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let conn = Connection::open(db_path()?).map_err(|err| err.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|err| err.to_string())?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS keysets (
          id TEXT PRIMARY KEY,
          kdf_json TEXT NOT NULL,
          salt BLOB NOT NULL,
          encrypted_root_key BLOB NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          item_type TEXT NOT NULL,
          encrypted_overview BLOB NOT NULL,
          encrypted_details BLOB NOT NULL,
          favorite INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1
        );
        "#,
    )
    .map_err(|err| err.to_string())?;

    let has_favorite_column: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name = 'favorite'",
            [],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?;
    if has_favorite_column == 0 {
        conn.execute(
            "ALTER TABLE items ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|err| err.to_string())?;
    }

    Ok(())
}

fn has_vault(conn: &Connection) -> Result<bool, String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM keysets", [], |row| row.get(0))
        .map_err(|err| err.to_string())?;
    Ok(count > 0)
}

fn derive_unlock_key(master_password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let params = Params::new(19_456, 2, 1, Some(32)).map_err(|err| err.to_string())?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0_u8; 32];
    argon2
        .hash_password_into(master_password.as_bytes(), salt, &mut key)
        .map_err(|err| err.to_string())?;
    Ok(key)
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0_u8; N];
    OsRng.fill_bytes(&mut bytes);
    bytes
}

fn encrypt_bytes(key: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let nonce = random_bytes::<24>();
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|err| err.to_string())?;
    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|err| err.to_string())?;
    let blob = CipherBlob {
        v: 1,
        alg: "xchacha20poly1305".to_string(),
        nonce: BASE64.encode(nonce),
        ciphertext: BASE64.encode(ciphertext),
    };
    serde_json::to_vec(&blob).map_err(|err| err.to_string())
}

fn decrypt_bytes(key: &[u8; 32], aad: &[u8], encrypted: &[u8]) -> Result<Vec<u8>, String> {
    let blob: CipherBlob = serde_json::from_slice(encrypted).map_err(|err| err.to_string())?;
    if blob.v != 1 || blob.alg != "xchacha20poly1305" {
        return Err("Unsupported encrypted blob".to_string());
    }
    let nonce = BASE64.decode(blob.nonce).map_err(|err| err.to_string())?;
    let ciphertext = BASE64
        .decode(blob.ciphertext)
        .map_err(|err| err.to_string())?;
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|err| err.to_string())?;
    cipher
        .decrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: ciphertext.as_ref(),
                aad,
            },
        )
        .map_err(|_| "Decryption failed".to_string())
}

fn encrypt_json<T: Serialize>(key: &[u8; 32], aad: &[u8], value: &T) -> Result<Vec<u8>, String> {
    let plaintext = serde_json::to_vec(value).map_err(|err| err.to_string())?;
    encrypt_bytes(key, aad, &plaintext)
}

fn decrypt_json<T: for<'de> Deserialize<'de>>(
    key: &[u8; 32],
    aad: &[u8],
    encrypted: &[u8],
) -> Result<T, String> {
    let plaintext = decrypt_bytes(key, aad, encrypted)?;
    serde_json::from_slice(&plaintext).map_err(|err| err.to_string())
}

fn current_root_key(state: &tauri::State<AppState>) -> Result<[u8; 32], String> {
    let guard = state
        .session
        .lock()
        .map_err(|_| "Session lock poisoned".to_string())?;
    guard
        .as_ref()
        .map(|session| session.root_key)
        .ok_or_else(|| "Vault is locked".to_string())
}

fn title_or_default(title: &str, fallback: &str) -> String {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn icon_text(title: &str) -> String {
    title.chars().take(2).collect::<String>()
}

fn normalize_websites(primary: String, websites: Vec<String>) -> Vec<String> {
    let mut values = if websites.is_empty() {
        vec![primary]
    } else {
        websites
    };
    if values.is_empty() {
        values.push(String::new());
    }
    values
}

fn normalize_website_labels(mut labels: Vec<String>, len: usize) -> Vec<String> {
    labels.truncate(len);
    while labels.len() < len {
        labels.push("网站".to_string());
    }
    labels
}

fn primary_website(websites: &[String]) -> String {
    websites
        .iter()
        .find(|website| !website.trim().is_empty())
        .or_else(|| websites.first())
        .cloned()
        .unwrap_or_default()
}

fn details_value_with_favorite(
    root_key: &[u8; 32],
    id: &str,
    encrypted_details: &[u8],
    favorite: bool,
) -> Result<serde_json::Value, String> {
    let aad = format!("item-details:{id}");
    let mut details: serde_json::Value = decrypt_json(root_key, aad.as_bytes(), encrypted_details)?;
    if let Some(object) = details.as_object_mut() {
        object.insert("favorite".to_string(), serde_json::Value::Bool(favorite));
    }
    Ok(details)
}

#[tauri::command]
fn get_status(state: tauri::State<AppState>) -> Result<VaultStatus, String> {
    if state
        .session
        .lock()
        .map_err(|_| "Session lock poisoned".to_string())?
        .is_some()
    {
        return Ok(VaultStatus::Unlocked);
    }
    if !db_path()?.exists() {
        return Ok(VaultStatus::NoVault);
    }
    let conn = open_db()?;
    if has_vault(&conn)? {
        Ok(VaultStatus::Locked)
    } else {
        Ok(VaultStatus::NoVault)
    }
}

#[tauri::command]
fn initialize_vault(
    master_password: String,
    state: tauri::State<AppState>,
) -> Result<VaultStatus, String> {
    if master_password.len() < 8 {
        return Err("Master password must contain at least 8 characters".to_string());
    }

    let conn = open_db()?;
    if has_vault(&conn)? {
        return Err("A local vault already exists".to_string());
    }

    let salt = random_bytes::<16>();
    let mut unlock_key = derive_unlock_key(&master_password, &salt)?;
    let root_key = random_bytes::<32>();
    let encrypted_root_key = encrypt_bytes(&unlock_key, b"root-key", &root_key)?;
    unlock_key.zeroize();

    let now = Utc::now().to_rfc3339();
    let kdf = KdfParams {
        alg: "argon2id".to_string(),
        memory_kib: 19_456,
        iterations: 2,
        parallelism: 1,
    };

    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)",
        params!["schema_version", "1"],
    )
    .map_err(|err| err.to_string())?;
    conn.execute(
        "INSERT INTO keysets (id, kdf_json, salt, encrypted_root_key, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            serde_json::to_string(&kdf).map_err(|err| err.to_string())?,
            salt.as_slice(),
            encrypted_root_key,
            now,
            now
        ],
    )
    .map_err(|err| err.to_string())?;

    *state
        .session
        .lock()
        .map_err(|_| "Session lock poisoned".to_string())? = Some(Session { root_key });
    Ok(VaultStatus::Unlocked)
}

#[tauri::command]
fn unlock_vault(
    master_password: String,
    state: tauri::State<AppState>,
) -> Result<VaultStatus, String> {
    let conn = open_db()?;
    let (salt, encrypted_root_key): (Vec<u8>, Vec<u8>) = conn
        .query_row(
            "SELECT salt, encrypted_root_key FROM keysets ORDER BY created_at LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "No local vault was found".to_string())?;
    let mut unlock_key = derive_unlock_key(&master_password, &salt)?;
    let root_key_bytes = decrypt_bytes(&unlock_key, b"root-key", &encrypted_root_key)?;
    unlock_key.zeroize();
    if root_key_bytes.len() != 32 {
        return Err("Root key is invalid".to_string());
    }
    let mut root_key = [0_u8; 32];
    root_key.copy_from_slice(&root_key_bytes);
    *state
        .session
        .lock()
        .map_err(|_| "Session lock poisoned".to_string())? = Some(Session { root_key });
    Ok(VaultStatus::Unlocked)
}

#[tauri::command]
fn lock_vault(state: tauri::State<AppState>) -> Result<VaultStatus, String> {
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "Session lock poisoned".to_string())?;
    if let Some(mut session) = guard.take() {
        session.root_key.zeroize();
    }
    Ok(VaultStatus::Locked)
}

#[tauri::command]
fn list_items(state: tauri::State<AppState>) -> Result<Vec<ItemOverview>, String> {
    let root_key = current_root_key(&state)?;
    let conn = open_db()?;
    let mut stmt = conn
        .prepare("SELECT id, encrypted_overview, favorite FROM items WHERE deleted_at IS NULL ORDER BY updated_at DESC")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Vec<u8>>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|err| err.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        let (id, encrypted_overview, favorite) = row.map_err(|err| err.to_string())?;
        let aad = format!("item-overview:{id}");
        let mut overview: ItemOverview =
            decrypt_json(&root_key, aad.as_bytes(), &encrypted_overview)?;
        overview.favorite = favorite != 0;
        items.push(overview);
    }
    Ok(items)
}

#[tauri::command]
fn get_item(id: String, state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let root_key = current_root_key(&state)?;
    let conn = open_db()?;
    let (encrypted_details, favorite): (Vec<u8>, i64) = conn
        .query_row(
            "SELECT encrypted_details, favorite FROM items WHERE id = ?1 AND deleted_at IS NULL",
            params![id.clone()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Item not found".to_string())?;
    details_value_with_favorite(&root_key, &id, &encrypted_details, favorite != 0)
}

#[tauri::command]
fn create_login(input: LoginInput, state: tauri::State<AppState>) -> Result<LoginDetails, String> {
    let root_key = current_root_key(&state)?;
    let conn = open_db()?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let title = title_or_default(&input.title, "未命名登录信息");
    let icon_text = icon_text(&title);
    let websites = normalize_websites(input.website, input.websites);
    let website_labels = normalize_website_labels(input.website_labels, websites.len());
    let website = primary_website(&websites);
    let details = LoginDetails {
        id: id.clone(),
        item_type: "login".to_string(),
        title: title.clone(),
        username: input.username,
        password: input.password,
        website,
        websites,
        website_labels,
        notes: input.notes,
        tags: input.tags,
        favorite: false,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let overview = ItemOverview {
        id: id.clone(),
        item_type: "login".to_string(),
        title,
        subtitle: details.username.clone(),
        website: Some(details.website.clone()),
        icon_text,
        favorite: false,
        updated_at: now.clone(),
    };

    let overview_aad = format!("item-overview:{id}");
    let details_aad = format!("item-details:{id}");
    let encrypted_overview = encrypt_json(&root_key, overview_aad.as_bytes(), &overview)?;
    let encrypted_details = encrypt_json(&root_key, details_aad.as_bytes(), &details)?;

    conn.execute(
        "INSERT INTO items (id, item_type, encrypted_overview, encrypted_details, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, "login", encrypted_overview, encrypted_details, now, now],
    )
    .map_err(|err| err.to_string())?;

    Ok(details)
}

#[tauri::command]
fn create_password(
    input: PasswordInput,
    state: tauri::State<AppState>,
) -> Result<PasswordDetails, String> {
    let root_key = current_root_key(&state)?;
    let conn = open_db()?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let title = title_or_default(&input.title, "未命名密码");
    let icon_text = icon_text(&title);
    let details = PasswordDetails {
        id: id.clone(),
        item_type: "password".to_string(),
        title: title.clone(),
        password: input.password,
        notes: input.notes,
        tags: input.tags,
        favorite: false,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let overview = ItemOverview {
        id: id.clone(),
        item_type: "password".to_string(),
        title,
        subtitle: "密码".to_string(),
        website: None,
        icon_text,
        favorite: false,
        updated_at: now.clone(),
    };

    let overview_aad = format!("item-overview:{id}");
    let details_aad = format!("item-details:{id}");
    let encrypted_overview = encrypt_json(&root_key, overview_aad.as_bytes(), &overview)?;
    let encrypted_details = encrypt_json(&root_key, details_aad.as_bytes(), &details)?;

    conn.execute(
        "INSERT INTO items (id, item_type, encrypted_overview, encrypted_details, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, "password", encrypted_overview, encrypted_details, now, now],
    )
    .map_err(|err| err.to_string())?;

    Ok(details)
}

#[tauri::command]
fn update_item(
    id: String,
    input: ItemUpdateInput,
    state: tauri::State<AppState>,
) -> Result<serde_json::Value, String> {
    let root_key = current_root_key(&state)?;
    let conn = open_db()?;
    let (existing_type, favorite, created_at): (String, i64, String) = conn
        .query_row(
            "SELECT item_type, favorite, created_at FROM items WHERE id = ?1 AND deleted_at IS NULL",
            params![id.clone()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Item not found".to_string())?;

    let favorite_bool = favorite != 0;
    let now = Utc::now().to_rfc3339();

    match input {
        ItemUpdateInput::Login(input) => {
            if existing_type != "login" {
                return Err("Item type cannot be changed".to_string());
            }

            let title = title_or_default(&input.title, "未命名登录信息");
            let icon_text = icon_text(&title);
            let websites = normalize_websites(input.website, input.websites);
            let website_labels = normalize_website_labels(input.website_labels, websites.len());
            let website = primary_website(&websites);
            let details = LoginDetails {
                id: id.clone(),
                item_type: "login".to_string(),
                title: title.clone(),
                username: input.username,
                password: input.password,
                website,
                websites,
                website_labels,
                notes: input.notes,
                tags: input.tags,
                favorite: favorite_bool,
                created_at: created_at.clone(),
                updated_at: now.clone(),
            };
            let overview = ItemOverview {
                id: id.clone(),
                item_type: "login".to_string(),
                title,
                subtitle: details.username.clone(),
                website: Some(details.website.clone()),
                icon_text,
                favorite: favorite_bool,
                updated_at: now.clone(),
            };
            let overview_aad = format!("item-overview:{id}");
            let details_aad = format!("item-details:{id}");
            let encrypted_overview = encrypt_json(&root_key, overview_aad.as_bytes(), &overview)?;
            let encrypted_details = encrypt_json(&root_key, details_aad.as_bytes(), &details)?;

            conn.execute(
                "UPDATE items SET encrypted_overview = ?1, encrypted_details = ?2, updated_at = ?3, version = version + 1 WHERE id = ?4 AND deleted_at IS NULL",
                params![encrypted_overview, encrypted_details, now, id],
            )
            .map_err(|err| err.to_string())?;

            serde_json::to_value(details).map_err(|err| err.to_string())
        }
        ItemUpdateInput::Password(input) => {
            if existing_type != "password" {
                return Err("Item type cannot be changed".to_string());
            }

            let title = title_or_default(&input.title, "未命名密码");
            let icon_text = icon_text(&title);
            let details = PasswordDetails {
                id: id.clone(),
                item_type: "password".to_string(),
                title: title.clone(),
                password: input.password,
                notes: input.notes,
                tags: input.tags,
                favorite: favorite_bool,
                created_at,
                updated_at: now.clone(),
            };
            let overview = ItemOverview {
                id: id.clone(),
                item_type: "password".to_string(),
                title,
                subtitle: "密码".to_string(),
                website: None,
                icon_text,
                favorite: favorite_bool,
                updated_at: now.clone(),
            };
            let overview_aad = format!("item-overview:{id}");
            let details_aad = format!("item-details:{id}");
            let encrypted_overview = encrypt_json(&root_key, overview_aad.as_bytes(), &overview)?;
            let encrypted_details = encrypt_json(&root_key, details_aad.as_bytes(), &details)?;

            conn.execute(
                "UPDATE items SET encrypted_overview = ?1, encrypted_details = ?2, updated_at = ?3, version = version + 1 WHERE id = ?4 AND deleted_at IS NULL",
                params![encrypted_overview, encrypted_details, now, id],
            )
            .map_err(|err| err.to_string())?;

            serde_json::to_value(details).map_err(|err| err.to_string())
        }
    }
}

#[tauri::command]
fn set_item_favorite(
    id: String,
    favorite: bool,
    state: tauri::State<AppState>,
) -> Result<serde_json::Value, String> {
    let root_key = current_root_key(&state)?;
    let conn = open_db()?;
    let changed = conn
        .execute(
            "UPDATE items SET favorite = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![if favorite { 1 } else { 0 }, id.clone()],
        )
        .map_err(|err| err.to_string())?;
    if changed == 0 {
        return Err("Item not found".to_string());
    }

    let encrypted_details: Vec<u8> = conn
        .query_row(
            "SELECT encrypted_details FROM items WHERE id = ?1",
            params![id.clone()],
            |row| row.get(0),
        )
        .map_err(|_| "Item not found".to_string())?;
    details_value_with_favorite(&root_key, &id, &encrypted_details, favorite)
}

#[tauri::command]
fn generate_password(options: GeneratedPasswordOptions) -> Result<String, String> {
    let length = options.length.clamp(8, 64);
    let letters = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let numbers = b"23456789";
    let symbols = b"!@#$%^&*_-+=?";
    let mut alphabet = letters.to_vec();
    if options.include_numbers {
        alphabet.extend_from_slice(numbers);
    }
    if options.include_symbols {
        alphabet.extend_from_slice(symbols);
    }

    let mut rng = rand::thread_rng();
    let mut password = Vec::with_capacity(length);
    if options.include_numbers {
        password.push(
            *numbers
                .choose(&mut rng)
                .ok_or_else(|| "Failed to generate password".to_string())?,
        );
    }
    if options.include_symbols {
        password.push(
            *symbols
                .choose(&mut rng)
                .ok_or_else(|| "Failed to generate password".to_string())?,
        );
    }
    while password.len() < length {
        let index = rng.gen_range(0..alphabet.len());
        password.push(alphabet[index]);
    }
    password.shuffle(&mut rng);
    String::from_utf8(password).map_err(|err| err.to_string())
}

#[tauri::command]
fn copy_text(value: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|err| err.to_string())?;
    clipboard.set_text(value).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_quick_access_shortcut() -> ShortcutPreference {
    read_quick_access_shortcut()
}

#[tauri::command]
fn set_quick_access_shortcut<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    shortcut: ShortcutPreference,
) -> Result<ShortcutPreference, String> {
    let previous_shortcut = read_quick_access_shortcut();
    if let Err(err) = register_quick_access_shortcut(&app, &shortcut) {
        let _ = register_quick_access_shortcut(&app, &previous_shortcut);
        return Err(err);
    }
    write_quick_access_shortcut(&shortcut)?;
    Ok(shortcut)
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_global_shortcut::Builder::new().build())
                .map_err(|err| Box::<dyn std::error::Error>::from(err.to_string()))?;
            let shortcut = read_quick_access_shortcut();
            if let Err(err) = register_quick_access_shortcut(app.handle(), &shortcut) {
                eprintln!("Failed to register quick access shortcut: {err}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            initialize_vault,
            unlock_vault,
            lock_vault,
            list_items,
            get_item,
            create_login,
            create_password,
            update_item,
            set_item_favorite,
            generate_password,
            copy_text,
            get_quick_access_shortcut,
            set_quick_access_shortcut
        ])
        .run(tauri::generate_context!())
        .expect("error while running CaptainPassword");
}
