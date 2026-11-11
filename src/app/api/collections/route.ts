export const runtime = "nodejs";

import { readCache, updateCache } from "@/lib/cache";
import type { Collection } from "@/lib/types";

type CollectionsAction =
  | "create"
  | "rename"
  | "delete"
  | "addGroups"
  | "removeGroups"
  | "setGroups";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `col-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function GET() {
  const cache = await readCache();
  return Response.json(cache.collections);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      id?: string;
      name?: string;
      groupIds?: string[];
    } | null;

    const action = body?.action as CollectionsAction | undefined;
    const id = body?.id;
    const name = body?.name?.trim();
    const groupIds = Array.isArray(body?.groupIds) ? body!.groupIds : undefined;

    const cache = await readCache();
    const collections = cache.collections;
    const collection = id ? collections.find((c) => c.id === id) : undefined;

    if (!action) {
      return Response.json({ error: "action is required" }, { status: 400 });
    }

    if (action === "create") {
      if (!name) {
        return Response.json(
          { error: "Collection name is required" },
          { status: 400 }
        );
      }
      if (collections.some((c) => c.name === name)) {
        return Response.json(
          { error: "A collection with this name already exists" },
          { status: 409 }
        );
      }
      const created: Collection = { id: newId(), name, groupIds: [] };
      const updated = await updateCache({
        collections: [...collections, created],
      });
      return Response.json(updated, { status: 201 });
    }

    if (!collection) {
      return Response.json({ error: "Collection not found" }, { status: 404 });
    }

    if (action === "rename") {
      if (!name) {
        return Response.json(
          { error: "Collection name is required" },
          { status: 400 }
        );
      }
      if (
        collections.some((c) => c.id !== collection.id && c.name === name)
      ) {
        return Response.json(
          { error: "A collection with this name already exists" },
          { status: 409 }
        );
      }
      const updated = await updateCache({
        collections: collections.map((c) =>
          c.id === collection.id ? { ...c, name } : c
        ),
      });
      return Response.json(updated);
    }

    if (action === "delete") {
      const updated = await updateCache({
        collections: collections.filter((c) => c.id !== collection.id),
      });
      return Response.json(updated);
    }

    if (action === "addGroups" || action === "removeGroups") {
      if (!groupIds || groupIds.length === 0) {
        return Response.json(
          { error: "groupIds is required" },
          { status: 400 }
        );
      }
      const memberSet = new Set(collection.groupIds);
      if (action === "addGroups") {
        groupIds.forEach((g) => memberSet.add(g));
      } else {
        groupIds.forEach((g) => memberSet.delete(g));
      }
      const updated = await updateCache({
        collections: collections.map((c) =>
          c.id === collection.id ? { ...c, groupIds: [...memberSet] } : c
        ),
      });
      return Response.json(updated);
    }

    if (action === "setGroups") {
      if (!groupIds) {
        return Response.json({ error: "groupIds is required" }, { status: 400 });
      }
      // Preserve collection order: keep existing members not in the new set
      // first, then append any newly added groups in their given order.
      const newSet = new Set(groupIds);
      const kept = collection.groupIds.filter((g) => newSet.has(g));
      const added = groupIds.filter((g) => !kept.includes(g));
      const updated = await updateCache({
        collections: collections.map((c) =>
          c.id === collection.id ? { ...c, groupIds: [...kept, ...added] } : c
        ),
      });
      return Response.json(updated);
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update collections";
    return Response.json({ error: message }, { status: 500 });
  }
}
