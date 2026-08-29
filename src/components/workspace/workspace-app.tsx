"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
  FileText,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";

import { createPage, deletePage, updatePage } from "@/app/(app)/workspace/actions";
import { ClientLogo } from "@/components/clients/client-logo";
import { PageEditor, type Crumb } from "@/components/workspace/page-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import {
  flattenTree,
  pageBreadcrumb,
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
  const [pending, start] = useTransition();

  const allPages = useMemo(() => flattenTree(teamspace.pages), [teamspace.pages]);
  const byId = useMemo(() => new Map(allPages.map((p) => [p.id, p])), [allPages]);
  const firstPageId = allPages[0]?.id ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(
    initialPageId && byId.has(initialPageId) ? initialPageId : firstPageId,
  );
  const [newPageId, setNewPageId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [teamspaceOpen, setTeamspaceOpen] = useState(true);
  const [openPages, setOpenPages] = useState<Set<string>>(() => {
    const start = new Set<string>();
    if (selectedId) {
      for (const crumb of pageBreadcrumb(allPages, selectedId)) start.add(crumb.id);
    }
    return start;
  });

  // Server data refreshed → drop live overrides (the sidebar now reads the saved
  // values) and keep the selection valid if its page was deleted.
  const pagesRef = useRef(teamspace.pages);
  useEffect(() => {
    if (pagesRef.current === teamspace.pages) return;
    pagesRef.current = teamspace.pages;
    setOverrides(new Map());
    setSelectedId((cur) => (cur && byId.has(cur) ? cur : firstPageId));
  }, [teamspace.pages, byId, firstPageId]);

  const labelOf = (node: WorkspacePageLite) => ({
    title: overrides.get(node.id)?.title ?? node.title,
    icon: overrides.get(node.id)?.icon ?? node.icon,
  });

  const selectNode = useCallback(
    (id: string) => {
      setSelectedId(id);
      setNewPageId(null);
      setOpenPages((prev) => {
        const next = new Set(prev);
        for (const crumb of pageBreadcrumb(allPages, id)) next.add(crumb.id);
        return next;
      });
    },
    [allPages],
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

  const removePage = useCallback(
    (node: PageNode) => {
      const title = overrides.get(node.id)?.title ?? node.title;
      const kids = node.children.length;
      const msg =
        kids > 0
          ? `Delete "${title}" and its ${kids} nested page${kids > 1 ? "s" : ""}?`
          : `Delete "${title}"?`;
      if (!window.confirm(msg)) return;
      start(async () => {
        try {
          await deletePage(node.id);
          setSelectedId((cur) => (cur === node.id ? (node.parentId ?? null) : cur));
          router.refresh();
        } catch (e) {
          toast({
            tone: "error",
            title: "Couldn't delete the page",
            detail: e instanceof Error ? e.message : undefined,
          });
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, toast],
  );

  const toggleOpen = (id: string) =>
    setOpenPages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedNode = selectedId ? byId.get(selectedId) : undefined;
  const ancestors: Crumb[] = selectedNode
    ? pageBreadcrumb(allPages, selectedNode.id)
        .slice(0, -1)
        .map((p) => ({ id: p.id, ...labelOf(p) }))
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
              {teamspace.pages.length === 0 ? (
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
                  {teamspace.pages.map((node) => (
                    <TreeRow
                      key={node.id}
                      node={node}
                      selectedId={selectedId}
                      openPages={openPages}
                      pending={pending}
                      labelOf={labelOf}
                      onToggle={toggleOpen}
                      onSelect={selectNode}
                      onAddChild={(n) => addPage(n.id)}
                      onDelete={removePage}
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
            saving={pending}
            autoFocusTitle={selectedNode.id === newPageId}
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
          />
        ) : (
          <EmptyState onCreate={() => addPage(null)} />
        )}
      </section>
    </div>
  );
}

function TreeRow({
  node,
  selectedId,
  openPages,
  pending,
  labelOf,
  onToggle,
  onSelect,
  onAddChild,
  onDelete,
}: {
  node: PageNode;
  selectedId: string | null;
  openPages: Set<string>;
  pending: boolean;
  labelOf: (n: WorkspacePageLite) => { title: string; icon: string | null };
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAddChild: (n: PageNode) => void;
  onDelete: (n: PageNode) => void;
}) {
  const active = node.id === selectedId;
  const open = openPages.has(node.id);
  const hasChildren = node.children.length > 0;
  const { title, icon } = labelOf(node);

  return (
    <div>
      <div
        className={cn(
          "group/row relative flex items-center gap-0.5 rounded-md pr-1 transition-colors",
          // Notion selection is a NEUTRAL gray fill — no brand bar, no wash.
          active ? "bg-secondary/70" : "hover:bg-secondary/40",
        )}
        style={{ paddingLeft: `${0.25 + node.depth * 0.85}rem` }}
      >
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
              <DropdownMenuItem onClick={() => onAddChild(node)}>
                <Plus className="size-4" /> Add page inside
              </DropdownMenuItem>
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
      </div>

      {open &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            selectedId={selectedId}
            openPages={openPages}
            pending={pending}
            labelOf={labelOf}
            onToggle={onToggle}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onDelete={onDelete}
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
