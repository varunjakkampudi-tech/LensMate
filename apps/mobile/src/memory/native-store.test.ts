import {
  createNativeMemoryStore,
  MEMORY_DB_NAME,
  MEMORY_KEY_NAME,
  type KeyStorage,
  type NativeMemoryDeps,
  type SqlDatabase,
} from "./native-store";

/**
 * A stand-in for the phone's SQLCipher file and secure storage. The file behaves like a keyed database: once a key
 * is set, a connection with any other key cannot read it, and an unkeyed connection cannot read it either. Nothing is
 * written to the file unless SQLCipher is active, so the "no plaintext" tests below check real behaviour of the store.
 */
interface FakeFile {
  key?: string;
  schema: boolean;
  items: Map<string, { createdAt: number; body: string }>;
}

interface World {
  files: Map<string, FakeFile>;
  keys: Map<string, string>;
  statements: string[];
  cipher: boolean;
  unavailable: boolean;
  deps(randomKey: string): NativeMemoryDeps;
}

const HEX_KEY_A = "a".repeat(64);
const HEX_KEY_B = "b".repeat(64);

function makeWorld(options: { cipher?: boolean } = {}): World {
  const files = new Map<string, FakeFile>();
  const keys = new Map<string, string>();
  const world: World = {
    files,
    keys,
    statements: [],
    cipher: options.cipher ?? true,
    unavailable: false,
    deps(randomKey) {
      const keyStorage: KeyStorage = {
        getItemAsync: async (key) => keys.get(key) ?? null,
        setItemAsync: async (key, value) => {
          keys.set(key, value);
        },
        deleteItemAsync: async (key) => {
          keys.delete(key);
        },
      };
      return {
        keys: keyStorage,
        openDatabase: async (name) => {
          if (world.unavailable) {
            throw new Error("no database");
          }
          return connect(world, name);
        },
        deleteDatabase: async (name) => {
          files.delete(name);
        },
        randomKeyHex: async () => randomKey,
      };
    },
  };
  return world;
}

function connect(world: World, name: string): SqlDatabase {
  let key: string | undefined;
  if (!world.files.has(name)) {
    world.files.set(name, { schema: false, items: new Map() });
  }
  const file = world.files.get(name) as FakeFile;

  // Every statement that reads or writes the file must be keyed with the file's key.
  const touch = (sql: string) => {
    world.statements.push(sql);
    if (key === undefined || (file.key !== undefined && file.key !== key)) {
      throw new Error("file is not a database");
    }
  };

  const claim = () => {
    file.key ??= key;
  };

  const rows = (sql: string): unknown[] => {
    if (sql.startsWith("PRAGMA cipher_version")) {
      return world.cipher ? [{ cipher_version: "4.17.0" }] : [{ cipher_version: null }];
    }
    if (sql.startsWith("SELECT lower(hex(randomblob(16)))")) {
      return [{ id: "c".repeat(32) }];
    }
    if (sql.startsWith("SELECT count(*)")) {
      touch(sql);
      return [{ n: file.schema ? 1 : 0 }];
    }
    if (sql.startsWith("SELECT body FROM items")) {
      touch(sql);
      return [...file.items.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((item) => ({ body: item.body }));
    }
    throw new Error(`unexpected query: ${sql}`);
  };

  return {
    async execAsync(source) {
      const pragma = /^PRAGMA key = "x'([0-9a-f]{64})'";$/.exec(source);
      if (pragma !== null) {
        world.statements.push(source);
        key = pragma[1];
        return;
      }
      touch(source);
      claim();
      file.schema = true;
    },
    async runAsync(source, params) {
      if (source.startsWith("INSERT OR REPLACE INTO items")) {
        touch(source);
        claim();
        file.items.set(String(params[0]), {
          createdAt: Number(params[1]),
          body: String(params[2]),
        });
        return;
      }
      if (source.startsWith("DELETE FROM items WHERE id = ?")) {
        touch(source);
        file.items.delete(String(params[0]));
        return;
      }
      throw new Error(`unexpected write: ${source}`);
    },
    async getFirstAsync<T>(source: string) {
      const [first] = rows(source);
      return (first ?? null) as T | null;
    },
    async getAllAsync<T>(source: string) {
      return rows(source) as T[];
    },
    async closeAsync() {
      key = undefined;
    },
  };
}

describe("encrypted native memory store", () => {
  it("keys the database first and stores the key in secure storage", async () => {
    const world = makeWorld();
    const store = createNativeMemoryStore(world.deps(HEX_KEY_A));

    await store.save({ id: "1", createdAt: 1, body: "{}" });

    expect(world.statements[0]).toBe(`PRAGMA key = "x'${HEX_KEY_A}'";`);
    expect(world.keys.get(MEMORY_KEY_NAME)).toBe(HEX_KEY_A);
    expect(world.files.get(MEMORY_DB_NAME)?.key).toBe(HEX_KEY_A);
  });

  it("refuses to write when SQLCipher is not active, so nothing is stored as plaintext", async () => {
    const world = makeWorld({ cipher: false });
    const store = createNativeMemoryStore(world.deps(HEX_KEY_A));

    await expect(store.list()).rejects.toMatchObject({ failure: "NOT_ENCRYPTED" });
    await expect(store.save({ id: "1", createdAt: 1, body: "secret" })).rejects.toMatchObject({
      failure: "NOT_ENCRYPTED",
    });

    expect(world.files.get(MEMORY_DB_NAME)?.schema).toBe(false);
    expect(world.files.get(MEMORY_DB_NAME)?.items.size).toBe(0);
    expect(world.keys.has(MEMORY_KEY_NAME)).toBe(false);
  });

  it("recovers saved items after a restart with the same key", async () => {
    const world = makeWorld();
    await createNativeMemoryStore(world.deps(HEX_KEY_A)).save({
      id: "1",
      createdAt: 5,
      body: "kept",
    });

    const afterRestart = createNativeMemoryStore(world.deps(HEX_KEY_B));

    expect(await afterRestart.list()).toEqual(["kept"]);
    expect(world.keys.get(MEMORY_KEY_NAME)).toBe(HEX_KEY_A);
  });

  it("reports a lost key without overwriting the file or the key", async () => {
    const world = makeWorld();
    await createNativeMemoryStore(world.deps(HEX_KEY_A)).save({
      id: "1",
      createdAt: 1,
      body: "kept",
    });
    world.keys.delete(MEMORY_KEY_NAME);

    const store = createNativeMemoryStore(world.deps(HEX_KEY_B));

    await expect(store.list()).rejects.toMatchObject({ failure: "KEY_LOST" });
    expect(world.keys.has(MEMORY_KEY_NAME)).toBe(false);
    expect(world.files.get(MEMORY_DB_NAME)?.items.size).toBe(1);
  });

  it("treats a malformed stored key as lost rather than using it", async () => {
    const world = makeWorld();
    world.keys.set(MEMORY_KEY_NAME, "not-a-key");

    await expect(createNativeMemoryStore(world.deps(HEX_KEY_A)).list()).rejects.toMatchObject({
      failure: "KEY_LOST",
    });
  });

  it("lists newest first and removes one item", async () => {
    const world = makeWorld();
    const store = createNativeMemoryStore(world.deps(HEX_KEY_A));
    await store.save({ id: "old", createdAt: 1, body: "old" });
    await store.save({ id: "new", createdAt: 2, body: "new" });

    expect(await store.list()).toEqual(["new", "old"]);

    await store.remove("new");
    expect(await store.list()).toEqual(["old"]);
  });

  it("deletes the file and its key together, and a fresh key starts empty", async () => {
    const world = makeWorld();
    const store = createNativeMemoryStore(world.deps(HEX_KEY_A));
    await store.save({ id: "1", createdAt: 1, body: "gone" });

    await store.removeAll();

    expect(world.files.has(MEMORY_DB_NAME)).toBe(false);
    expect(world.keys.has(MEMORY_KEY_NAME)).toBe(false);
    expect(await createNativeMemoryStore(world.deps(HEX_KEY_B)).list()).toEqual([]);
  });

  it("deletes everything even when the key is lost", async () => {
    const world = makeWorld();
    await createNativeMemoryStore(world.deps(HEX_KEY_A)).save({ id: "1", createdAt: 1, body: "x" });
    world.keys.delete(MEMORY_KEY_NAME);

    const store = createNativeMemoryStore(world.deps(HEX_KEY_B));
    await store.removeAll();

    expect(world.files.has(MEMORY_DB_NAME)).toBe(false);
    expect(await createNativeMemoryStore(world.deps(HEX_KEY_B)).list()).toEqual([]);
  });

  it("creates row ids from SQLite's random source", async () => {
    const store = createNativeMemoryStore(makeWorld().deps(HEX_KEY_A));

    expect(await store.newId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("reports unavailable storage as a fixed code", async () => {
    const world = makeWorld();
    world.unavailable = true;

    await expect(createNativeMemoryStore(world.deps(HEX_KEY_A)).list()).rejects.toMatchObject({
      failure: "UNAVAILABLE",
    });
  });
});

describe("refusals are not retried (Expo Go and lost keys)", () => {
  it("fails at once after a lasting refusal, without reopening the database", async () => {
    const world = makeWorld({ cipher: false });
    const store = createNativeMemoryStore(world.deps(HEX_KEY_A));

    await expect(store.list()).rejects.toMatchObject({ failure: "NOT_ENCRYPTED" });
    const keyedBefore = world.statements.filter((s) => s.startsWith("PRAGMA key")).length;
    await expect(store.list()).rejects.toMatchObject({ failure: "NOT_ENCRYPTED" });
    await expect(store.save({ id: "1", createdAt: 1, body: "x" })).rejects.toMatchObject({
      failure: "NOT_ENCRYPTED",
    });

    expect(world.statements.filter((s) => s.startsWith("PRAGMA key")).length).toBe(keyedBefore);
  });

  it("clears the refusal after delete-all, so a fresh start can try again", async () => {
    const world = makeWorld({ cipher: false });
    const store = createNativeMemoryStore(world.deps(HEX_KEY_A));
    await expect(store.list()).rejects.toMatchObject({ failure: "NOT_ENCRYPTED" });

    world.cipher = true;
    await store.removeAll();

    await expect(store.list()).resolves.toEqual([]);
  });
});
