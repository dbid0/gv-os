"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  createPage,
  deletePage,
  duplicatePage,
  movePage,
  updatePage,
} from "@/app/(app)/workspace/actions";
import { ClientLogo } from "@/components/clients/client-logo";
import { ConfirmDeleteDialog } from "@/components/workspace/confirm-delete-dialog";
import { PageEditor, type Crumb } from "@/components/workspace/page-editor";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import {
  buildPageTree,
  collectSubtreeIds,
  flattenTree,
  pageBreadcrumb,
  planMove,
  type PageNode,
  type WorkspacePageLite,
} from "@/lib/workspace/tree";
import { cn } from "@/lib/utils";

/** The single teamspace this scoped view renders (a client, or the agency). */
export interface TeamspaceView {
  clientId: string | null;
  slug: string | null;
  name: string;
  accent: string;
  pages: PageNode[];
}

type Override = { title?: string; icon?: string | null };

/** Where a drop lands relative to the row it is over. */
type DropMode = "before" | "after" | "inside";
type DropHint = { id: string; mode: DropMode };
type DeleteTarget = { id: string; parentId: string | null; title: string };

function TeamspaceIcon({ ts, size = 20 }: { ts: TeamspaceView; size?: number }) {
  if (ts.slug) {
    return (
      <ClientLogo
        slug={ts.slug}
        name={ts.name}
        accent={ts.accent}
        size={size}
        radius="md"
      />
    );
  }
  return (
    <span
      className="bg-card grid shrink-0 place-items-center rounded-[5px] border"
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/gv-mark-white.png"
        alt=""
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        className="object-contain"
        style={{ width: size * 0.62, height: size * 0.62 }}
      />
    </span>
  );
}

/**
 * The Workspace, scoped to ONE teamspace (a client, or the Global Ventures
 * agency templates space) — the fold-under-clients model, where a client IS
 * their workspace. The skin is a faithful Notion replica: a flush, slightly
 * lighter sidebar with a neutral page tree, and a flat, borderless, doc-centric
 * page pane.
 *
 * The tree is fully editable in place: rows drag to reorder, nest, and un-nest
 * (optimistically, then reconciled against the server); every row has a
 * right-click menu and a `•••`; delete goes through a clean in-app confirm, not
 * the browser's native popup.
 */
export function WorkspaceApp({
  teamspace,
  initialPageId,
  homeHref,
  agencyHref = null,
}: {
  teamspace: TeamspaceView;
  initialPageId: string | null;
  /** The client (or /clients) this teamspace belongs to — back link + root crumb. */
  homeHref: string;
  /** Optional link to the agency templates space, shown only in client views. */
  agencyHref?: string | null;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const basePath = usePathname();
  const [pending, start] = useTransition();

  // The render source is a LOCAL copy of the tree, so a drag can reorder it
  // optimistically before the server round-trips. It re-syncs whenever the
  // server sends a fresh tree (below).
  const [pages, setPages] = useState<PageNode[]>(teamspace.pages);

  const allPages = useMemo(() => flattenTree(pages), [pages]);
  const byId = useMemo(() => new Map(allPages.map((p) => [p.id, p])), [allPages]);
  const firstPageId = allPages[0]?.id ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(
    initialPageId && allPages.some((p) => p.id === initialPageId)
      ? initialPageId
      : firstPageId,
  );
  const [newPageId, setNewPageId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [teamspaceOpen, setTeamspaceOpen] = useState(true);
  const [openPages, setOpenPages] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (selectedId) {
      for (const crumb of pageBreadcrumb(allPages, selectedId)) initial.add(crumb.id);
    }
    return initial;
  });
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);

  // Drag state. The active id lives in a ref so the frequently-fired dragover
  // handler always reads the live value; `dragId` in state only drives the
  // dimmed look of the row being dragged.
  const dragIdRef = useRef<string | null>(null);
  const dragDescendants = useRef<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

  // A fresh server tree replaces the optimistic copy, drops live overrides (the
  // sidebar now reads saved values), and keeps the selection valid if its page
  // was deleted.
  const serverPagesRef = useRef(teamspace.pages);
  useEffect(() => {
    if (serverPagesRef.current === teamspace.pages) return;
    serverPagesRef.current = teamspace.pages;
    setPages(teamspace.pages);
    setOverrides(new Map());
    const serverFlat = flattenTree(teamspace.pages);
    const serverIds = new Set(serverFlat.map((p) => p.id));
    setSelectedId((cur) =>
      cur && serverIds.has(cur) ? cur : (serverFlat[0]?.id ?? null),
    );
  }, [teamspace.pages]);

  const labelOf = useCallback(
    (node: WorkspacePageLite) => ({
      title: overrides.get(node.id)?.title ?? node.title,
      icon: overrides.get(node.id)?.icon ?? node.icon,
    }),
    [overrides],
  );

  const revealAndSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setOpenPages((prev) => {
        const next = new Set(prev);
        for (const crumb of pageBreadcrumb(allPages, id)) next.add(crumb.id);
        return next;
      });
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `${window.location.pathname}?page=${id}`);
      }
    },
    [allPages],
  );

  const selectNode = useCallback(
    (id: string) => {
      setNewPageId(null);
      revealAndSelect(id);
    },
    [revealAndSelect],
  );

  const persist = useCallback(
    (id: string, patch: { title?: string; icon?: string | null; content?: string }) => {
      start(async () => {
        try {
          await updatePage(id, patch);
          router.refresh();
        } catch (e) {
          toast({
            tone: "error",
            title: "Couldn't save the page",
            detail: e instanceof Error ? e.message : undefined,
          });
        }
      });
    },
    [router, toast],
  );

  const addPage = useCallback(
    (parentId: string | null) => {
      start(async () => {
        try {
          const { id } = await createPage({
            clientId: teamspace.clientId,
            parentId,
            title: "Untitled",
          });
          setSelectedId(id);
          setNewPageId(id);
          setTeamspaceOpen(true);
          if (parentId) setOpenPages((prev) => new Set(prev).add(parentId));
          router.refresh();
        } catch (e) {
          toast({
            tone: "error",
            title: "Couldn't create the page",
            detail: e instanceof Error ? e.message : undefined,
          });
        }
      });
    },
    [router, toast, teamspace.clientId],
  );

  const duplicate = useCallback(
    (node: PageNode) => {
      start(async () => {
        try {
          const { id } = await duplicatePage(node.id);
          setSelectedId(id);
          if (node.parentId) setOpenPages((prev) => new Set(prev).add(node.parentId!));
          router.refresh();
        } catch (e) {
          toast({
            tone: "error",
            title: "Couldn't duplicate the page",
            detail: e instanceof Error ? e.message : undefined,
          });
        }
      });
    },
    [router, toast],
  );

  const requestRename = useCallback(
    (node: PageNode) => {
      setNewPageId(node.id);
      setFocusNonce((n) => n + 1);
      revealAndSelect(node.id);
    },
    [revealAndSelect],
  );

  const requestDelete = useCallback(
    (node: PageNode) => {
      setPendingDelete({
        id: node.id,
        parentId: node.parentId,
        title: overrides.get(node.id)?.title ?? node.title,
      });
    },
    [overrides],
  );

  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    if (!target) return;
    start(async () => {
      try {
        await deletePage(target.id);
        // Land on the parent, or the teamspace root if there was none.
        setSelectedId((cur) => (cur === target.id ? (target.parentId ?? null) : cur));
        setPendingDelete(null);
        router.refresh();
      } catch (e) {
        setPendingDelete(null);
        toast({
          tone: "error",
          title: "Couldn't delete the page",
          detail: e instanceof Error ? e.message : undefined,
        });
      }
    });
  }, [pendingDelete, router, toast]);

  const toggleOpen = (id: string) =>
    setOpenPages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // --- Drag and drop ------------------------------------------------------

  const handleDragStart = useCallback(
    (node: PageNode) => {
      dragIdRef.current = node.id;
      dragDescendants.current = new Set(collectSubtreeIds(allPages, node.id));
      setDragId(node.id);
    },
    [allPages],
  );

  const handleDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDragId(null);
    setDropHint(null);
  }, []);

  const handleDragOver = useCallback((node: PageNode, mode: DropMode) => {
    if (!dragIdRef.current) return;
    // Never onto itself or its own subtree — that would orphan the branch.
    if (dragDescendants.current.has(node.id)) {
      setDropHint((prev) => (prev ? null : prev));
      return;
    }
    setDropHint((prev) =>
      prev && prev.id === node.id && prev.mode === mode ? prev : { id: node.id, mode },
    );
  }, []);

  const performMove = useCallback(
    (draggingId: string, target: PageNode, mode: DropMode) => {
      let newParentId: string | null;
      let beforeId: string | null;
      if (mode === "inside") {
        newParentId = target.id;
        beforeId = null;
      } else {
        newParentId = target.parentId ?? null;
        const siblings = (
          newParentId == null ? pages : (byId.get(newParentId)?.children ?? [])
        ).filter((n) => n.id !== draggingId);
        const idx = siblings.findIndex((n) => n.id === target.id);
        beforeId =
          mode === "before"
            ? (siblings[idx]?.id ?? null)
            : (siblings[idx + 1]?.id ?? null);
      }

      const plan = planMove(allPages, draggingId, newParentId, beforeId);
      if (!plan) return;

      // Optimistic: apply the same plan the server will, then rebuild the tree.
      const orderMap = new Map(plan.updates.map((u) => [u.id, u.sortOrder]));
      const nextLite: WorkspacePageLite[] = allPages.map((n) => ({
        id: n.id,
        clientId: n.clientId,
        parentId: n.id === draggingId ? plan.parentId : n.parentId,
        title: n.title,
        icon: n.icon,
        content: n.content,
        sortOrder: orderMap.get(n.id) ?? n.sortOrder,
        updatedAt: n.updatedAt,
      }));
      setPages(buildPageTree(nextLite));
      if (newParentId) setOpenPages((prev) => new Set(prev).add(newParentId!));

      start(async () => {
        try {
          await movePage(draggingId, { parentId: newParentId, beforeId });
          router.refresh();
        } catch (e) {
          toast({
            tone: "error",
            title: "Couldn't move the page",
            detail: e instanceof Error ? e.message : undefined,
          });
          router.refresh(); // resync from the server on failure
        }
      });
    },
    [pages, byId, allPages, router, toast],
  );

  const handleDrop = useCallback(
    (node: PageNode, mode: DropMode) => {
      const draggingId = dragIdRef.current;
      if (draggingId && !dragDescendants.current.has(node.id)) {
        performMove(draggingId, node, mode);
      }
      handleDragEnd();
    },
    [performMove, handleDragEnd],
  );

  // ------------------------------------------------------------------------

  const selectedNode = selectedId ? byId.get(selectedId) : undefined;
  const ancestors: Crumb[] = selectedNode
    ? pageBreadcrumb(allPages, selectedNode.id)
        .slice(0, -1)
        .map((p) => ({ id: p.id, ...labelOf(p) }))
    : [];
  const subpages: Crumb[] = selectedNode
    ? selectedNode.children.map((c) => ({ id: c.id, ...labelOf(c) }))
    : [];

  return (
    <div className="-m-4 flex h-[calc(100dvh-3.5rem)] overflow-hidden md:-m-6">
      {/* LEFT — flush sidebar, a touch lighter than the page. */}
      <aside className="bg-card flex w-60 shrink-0 flex-col overflow-hidden border-r">
        <Link
          href={homeHref}
          className="group text-muted-foreground hover:bg-secondary/50 flex h-11 shrink-0 items-center gap-2 px-3 transition-colors"
        >
          <TeamspaceIcon ts={teamspace} size={20} />
          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
            {teamspace.name}
          </span>
          <ChevronLeft className="text-faint size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <p className="text-faint px-2 pt-3 pb-1 text-[0.6875rem] font-medium tracking-wider uppercase">
            Teamspaces
          </p>

          {/* The teamspace section header. */}
          <div className="group/ts hover:bg-secondary/40 flex items-center gap-1 rounded-md px-1 py-1 transition-colors">
            <button
              type="button"
              onClick={() => setTeamspaceOpen((v) => !v)}
              className="text-faint hover:text-foreground grid size-5 shrink-0 place-items-center rounded"
              aria-label={teamspaceOpen ? "Collapse teamspace" : "Expand teamspace"}
            >
              {teamspaceOpen ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
            <TeamspaceIcon ts={teamspace} size={18} />
            <span className="text-foreground min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
              {teamspace.name}
            </span>
            <button
              type="button"
              onClick={() => addPage(null)}
              disabled={pending}
              className="text-faint hover:text-foreground hover:bg-secondary grid size-5 shrink-0 place-items-center rounded opacity-0 transition-all group-hover/ts:opacity-100"
              aria-label={`Add a page to ${teamspace.name}`}
              title="Add a page"
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          {teamspaceOpen && (
            <div className="mt-0.5">
              {pages.length === 0 ? (
                <button
                  type="button"
                  onClick={() => addPage(null)}
                  disabled={pending}
                  className="text-faint hover:text-foreground hover:bg-secondary/40 flex w-full items-center gap-1.5 rounded-md py-1 pl-8 text-[0.8125rem] transition-colors"
                >
                  <Plus className="size-3.5" /> Add a page
                </button>
              ) : (
                <>
                  {pages.map((node) => (
                    <TreeRow
                      key={node.id}
                      node={node}
                      selectedId={selectedId}
                      openPages={openPages}
                      pending={pending}
                      dragId={dragId}
                      dropHint={dropHint}
                      labelOf={labelOf}
                      onToggle={toggleOpen}
                      onSelect={selectNode}
                      onAddChild={(n) => addPage(n.id)}
                      onRename={requestRename}
                      onDuplicate={duplicate}
                      onDelete={requestDelete}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => addPage(null)}
                    disabled={pending}
                    className="text-faint hover:text-foreground hover:bg-secondary/40 mt-0.5 flex w-full items-center gap-1.5 rounded-md py-1 pl-8 text-[0.8125rem] transition-colors"
                  >
                    <Plus className="size-3.5" /> Add a page
                  </button>
                </>
              )}
            </div>
          )}

          {agencyHref && (
            <div className="border-border/60 mt-4 border-t pt-3">
              <Link
                href={agencyHref}
                className="text-faint hover:text-foreground hover:bg-secondary/40 flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.8125rem] transition-colors"
              >
                <span className="bg-card grid size-[18px] shrink-0 place-items-center rounded-[5px] border">
                  <Image
                    src="/brand/gv-mark-white.png"
                    alt=""
                    width={11}
                    height={11}
                    className="size-[11px] object-contain"
                  />
                </span>
                <span className="truncate">Agency templates</span>
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT — the flat, borderless document. */}
      <section className="bg-background min-w-0 flex-1">
        {selectedNode ? (
          <PageEditor
            key={selectedNode.id}
            page={{
              id: selectedNode.id,
              title: selectedNode.title,
              icon: selectedNode.icon,
              content: selectedNode.content,
              updatedAt: selectedNode.updatedAt,
            }}
            teamspaceName={teamspace.name}
            teamspaceHref={homeHref}
            ancestors={ancestors}
            subpages={subpages}
            saving={pending}
            autoFocusTitle={selectedNode.id === newPageId}
            focusNonce={focusNonce}
            basePath={basePath}
            onSave={(patch) => {
              if (patch.title !== undefined || patch.icon !== undefined) {
                setOverrides((prev) => {
                  const next = new Map(prev);
                  next.set(selectedNode.id, {
                    ...next.get(selectedNode.id),
                    ...(patch.title !== undefined ? { title: patch.title } : {}),
                    ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
                  });
                  return next;
                });
              }
              persist(selectedNode.id, patch);
            }}
            onDraftChange={(patch) =>
              setOverrides((prev) => {
                const next = new Map(prev);
                next.set(selectedNode.id, { ...next.get(selectedNode.id), ...patch });
                return next;
              })
            }
            onSelect={selectNode}
            onDuplicate={() => duplicate(selectedNode)}
            onDelete={() => requestDelete(selectedNode)}
          />
        ) : (
          <EmptyState onCreate={() => addPage(null)} />
        )}
      </section>

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        title={pendingDelete?.title ?? ""}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function TreeRow({
  node,
  selectedId,
  openPages,
  pending,
  dragId,
  dropHint,
  labelOf,
  onToggle,
  onSelect,
  onAddChild,
  onRename,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  node: PageNode;
  selectedId: string | null;
  openPages: Set<string>;
  pending: boolean;
  dragId: string | null;
  dropHint: DropHint | null;
  labelOf: (n: WorkspacePageLite) => { title: string; icon: string | null };
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAddChild: (n: PageNode) => void;
  onRename: (n: PageNode) => void;
  onDuplicate: (n: PageNode) => void;
  onDelete: (n: PageNode) => void;
  onDragStart: (n: PageNode) => void;
  onDragOver: (n: PageNode, mode: DropMode) => void;
  onDrop: (n: PageNode, mode: DropMode) => void;
  onDragEnd: () => void;
}) {
  const active = node.id === selectedId;
  const open = openPages.has(node.id);
  const hasChildren = node.children.length > 0;
  const { title, icon } = labelOf(node);
  const isDragging = dragId === node.id;
  const dropMode = dropHint?.id === node.id ? dropHint.mode : null;

  const modeFor = (e: DragEvent<HTMLElement>): DropMode => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < rect.height * 0.3) return "before";
    if (y > rect.height * 0.7) return "after";
    return "inside";
  };

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            try {
              e.dataTransfer.setData("text/plain", node.id);
            } catch {
              // Some browsers reject setData outside a user drag; harmless.
            }
            onDragStart(node);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            onDragOver(node, modeFor(e));
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(node, modeFor(e));
          }}
          onDragEnd={onDragEnd}
          className={cn(
            "group/row relative flex items-center gap-0.5 rounded-md pr-1 transition-colors",
            // Notion selection is a NEUTRAL gray fill — no brand bar, no wash.
            active ? "bg-secondary/70" : "hover:bg-secondary/40",
            isDragging && "opacity-40",
            dropMode === "inside" && "bg-brand/10 ring-brand/50 ring-1 ring-inset",
          )}
          style={{ paddingLeft: `${0.25 + node.depth * 0.85}rem` }}
        >
          {dropMode === "before" && (
            <span className="bg-brand pointer-events-none absolute inset-x-1 -top-px z-10 h-0.5 rounded-full" />
          )}
          {dropMode === "after" && (
            <span className="bg-brand pointer-events-none absolute inset-x-1 -bottom-px z-10 h-0.5 rounded-full" />
          )}

          <button
            type="button"
            onClick={() => hasChildren && onToggle(node.id)}
            className={cn(
              "text-faint hover:text-foreground grid size-5 shrink-0 place-items-center rounded",
              !hasChildren && "pointer-events-none opacity-0",
            )}
            aria-label={open ? "Collapse" : "Expand"}
            tabIndex={hasChildren ? 0 : -1}
          >
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          >
            <span className="grid size-4 shrink-0 place-items-center text-[0.8125rem]">
              {icon ?? <FileText className="text-faint size-3.5" />}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[0.8125rem]",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {title || "Untitled"}
            </span>
          </button>

          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/row:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={pending}
                aria-label="Page options"
                className="text-faint hover:text-foreground hover:bg-secondary grid size-5 place-items-center rounded"
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => onRename(node)}>
                  <Pencil className="size-4" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddChild(node)}>
                  <Plus className="size-4" /> Add sub-page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(node)}>
                  <Copy className="size-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(node)}>
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={() => onAddChild(node)}
              disabled={pending}
              className="text-faint hover:text-foreground hover:bg-secondary grid size-5 place-items-center rounded"
              aria-label="Add a nested page"
              title="Add a nested page"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuItem onClick={() => onRename(node)}>
            <Pencil className="size-4" /> Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onAddChild(node)}>
            <Plus className="size-4" /> Add sub-page
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onDuplicate(node)}>
            <Copy className="size-4" /> Duplicate
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => onDelete(node)}>
            <Trash2 className="size-4" /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {open &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            selectedId={selectedId}
            openPages={openPages}
            pending={pending}
            dragId={dragId}
            dropHint={dropHint}
            labelOf={labelOf}
            onToggle={onToggle}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="bg-background grid h-full place-items-center p-8">
      <div className="max-w-sm text-center">
        <span className="text-5xl">📄</span>
        <h2 className="text-foreground mt-4 text-lg font-semibold tracking-tight">
          No page open
        </h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          Pick a page on the left, or create a new one to start writing.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="bg-primary text-primary-foreground press mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
        >
          <Plus className="size-4" /> New page
        </button>
      </div>
    </div>
  );
}
