// Draft post persistence.
// The draft text lives in localStorage; the attached image is stored as a
// File in IndexedDB (a raw File can't be JSON-serialized into localStorage).

const CONTENT_KEY = "draftContent"
const DB_NAME = "guerilla-kit-drafts"
const DB_VERSION = 1
const STORE_NAME = "draft"
const IMAGE_KEY = "image"

export function loadDraftContent(): string {
  try {
    return window.localStorage.getItem(CONTENT_KEY) ?? ""
  } catch {
    // localStorage unavailable — no saved draft
    return ""
  }
}

export function saveDraftContent(content: string) {
  try {
    window.localStorage.setItem(CONTENT_KEY, content)
  } catch {
    // localStorage unavailable — draft text just won't persist
  }
}

function openDraftDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

export async function loadDraftImage(): Promise<File | null> {
  const db = await openDraftDb()
  if (!db) return null
  const file = await new Promise<File | null>((resolve) => {
    try {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(IMAGE_KEY)
      request.onsuccess = () => {
        const value = request.result
        if (value instanceof File) {
          resolve(value)
        } else if (value instanceof Blob) {
          // some browsers store a plain Blob — rewrap so callers always get a File
          resolve(new File([value], "attached-image", { type: value.type }))
        } else {
          resolve(null)
        }
      }
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  db.close()
  return file
}

export async function saveDraftImage(file: File | null): Promise<void> {
  const db = await openDraftDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite")
      if (file) {
        tx.objectStore(STORE_NAME).put(file, IMAGE_KEY)
      } else {
        tx.objectStore(STORE_NAME).delete(IMAGE_KEY)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
  db.close()
}
