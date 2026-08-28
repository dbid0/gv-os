"use client";

import Image from "next/image";
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
  ChevronRight,
  FileText,
  NotebookText,
  Plus,
  Trash2,
} from "lucide-react";

import { createPage, deletePage, updatePage } from "@/app/(app)/workspace/actions";
import { ClientLogo } from "@/components/clients/client-logo";
import { PageEditor, type Crumb } from "@/components/workspace/page-editor";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  flattenTree,
  pageBreadcrumb,
  type PageNode,
  type WorkspacePageLite,
} from "@/lib/workspace/tree";
import { cn } from "@/lib/utils";

/** The teamspace-with-tree shape the server hands down (structural). */
export interface TeamspaceView {
  clientId: string | null;
  slug: string | null;
  name: string;
  accent: string;
  pages: PageNode[];
}

type Override = { title?: string; icon?: string | null };

const teamspaceKey = (clientId: string | null) => clientId ?? "agency";

function TeamspaceIcon({ ts }: { ts: TeamspaceView }) {
  if (ts.slug) {
    return (
      <ClientLogo
        slug={ts.slug}
        name={ts.name}
        accent={ts.accent}
        size={22}
        radius="md"
      />
    );
  }
  return (
    <span className="bg-card grid size-[22px] shrink-0 place-items-center rounded-md border">
      <Image
        src="/brand/gv-mark-white.png"
        alt=""
        width={14}
        height={14}
        className="size-3.5 object-contain"
      />
    </span>
  );
}

export function WorkspaceApp({
  teamspaces,
  initialPageId,
}: {
  teamspaces: TeamspaceView[];
  initialPageId: string | null;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const allPages = useMemo(
    () => teamspaces.flatMap((ts) => flattenTree(ts.pages)),
    [teamspaces],
  );
  const byId = useMemo(() => new Map(allPages.map((p) => [p.id, p])), [allPages]);
  const firstPageId = allPages[0]?.id ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(
    initialPageId && byId.has(initialPageId) ? initialPageId : firstPageId,
  );
  const [newPageId, setNewPageId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());

  const [openTeamspaces, setOpenTeamspaces] = useState<Set<string>>(
    () => new Set(teamspaces.map((ts) => teamspaceKey(ts.clientId))),
  );
  const [openPages, setOpenPages] = useState<Set<string>>(() => {
    const start = new Set<string>();
    if (selectedId) {
      for (const crumb of pageBreadcrumb(allPages, selectedId)) start.add(crumb.id);
    }
    return start;
  });

  // Server data refreshed → drop live overrides (the sidebar now reads the saved
  // values) and keep the selection valid if its page was deleted.
  const teamspacesRef = useRef(teamspaces);
  useEffect(() => {
    if (teamspacesRef.current === teamspaces) return;
    teamspacesRef.current = teamspaces;
    setOverrides(new Map());
    setSelectedId((cur) => (cur && byId.has(cur) ? cur : firstPageId));
  }, [teamspaces, byId, firstPageId]);

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
    (clientId: string | null, parentId: string | null) => {
      start(async () => {
        try {
          const { id } = await createPage({ clientId, parentId, title: "Untitled" });
          setSelectedId(id);
          setNewPageId(id);
          setOpenTeamspaces((prev) => new Set(prev).add(teamspaceKey(clientId)));
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
    [router, toast],
  );

  const removePage = useCallback(
    (node: PageNode) => {
      const { title } = labelOf(node);
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
    // labelOf reads overrides/byId but the confirm text tolerates a stale title.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, toast],
  );

  const selectedNode = selectedId ? byId.get(selectedId) : undefined;
  const selectedTeamspace = selectedNode
    ? teamspaces.find((ts) => ts.clientId === selectedNode.clientId)
    : undefined;
  const ancestors: Crumb[] = selectedNode
    ? pageBreadcrumb(allPages, selectedNode.id)
        .slice(0, -1)
        .map((p) => ({ id: p.id, ...labelOf(p) }))
    : [];

  const totalPages = allPages.length;

  return (
    <div className="flex h-[calc(100dvh-7rem)] gap-3">
      {/* LEFT — teamspaces + page tree */}
      <aside className="card-grad flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border sm:w-72">
        <div className="flex items-center gap-2 border-b px-3.5 py-3">
          <NotebookText className="text-brand size-4" />
          <span className="text-sm font-semibold tracking-tight">Workspace</span>
          <span className="text-faint ml-auto text-[11px]">
            {totalPages} {totalPages === 1 ? "page" : "pages"}
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
          {teamspaces.map((ts) => {
            const key = teamspaceKey(ts.clientId);
            const open = openTeamspaces.has(key);
            return (
              <div key={key}>
                <div className="group/ts hover:bg-secondary/60 flex items-center gap-1 rounded-lg px-1.5 py-1.5 transition-colors">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenTeamspaces((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                    className="text-faint hover:text-foreground grid size-4 shrink-0 place-items-center"
                    aria-label={open ? "Collapse teamspace" : "Expand teamspace"}
                  >
                    {open ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                  </button>
                  <TeamspaceIcon ts={ts} />
                  <span className="text-foreground min-w-0 flex-1 truncate text-[13px] font-medium">
                    {ts.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => addPage(ts.clientId, null)}
                    disabled={pending}
                    className="text-faint hover:text-foreground hover:bg-secondary grid size-5 shrink-0 place-items-center rounded opacity-0 transition-all group-hover/ts:opacity-100"
                    aria-label={`Add a page to ${ts.name}`}
                    title="Add a page"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                {open && (
                  <div className="mt-0.5">
                    {ts.pages.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => addPage(ts.clientId, null)}
                        disabled={pending}
                        className="text-faint hover:text-foreground flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 pl-7 text-xs transition-colors"
                      >
                        <Plus className="size-3" /> Add a page
                      </button>
                    ) : (
                      ts.pages.map((node) => (
                        <TreeRow
                          key={node.id}
                          node={node}
                          selectedId={selectedId}
                          openPages={openPages}
                          pending={pending}
                          labelOf={labelOf}
                          onToggle={(id) =>
                            setOpenPages((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            })
                          }
                          onSelect={selectNode}
                          onAddChild={(n) => addPage(n.clientId, n.id)}
                          onDelete={removePage}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* RIGHT — the selected page */}
      <section className="card-grad flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
        {selectedNode && selectedTeamspace ? (
          <PageEditor
            key={selectedNode.id}
            page={{
              id: selectedNode.id,
              title: selectedNode.title,
              icon: selectedNode.icon,
              content: selectedNode.content,
            }}
            teamspaceName={selectedTeamspace.name}
            ancestors={ancestors}
            saving={pending}
            initialEditing={selectedNode.id === newPageId}
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
          <EmptyState hasAny={totalPages > 0} onCreate={() => addPage(null, null)} />
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
          "group/row relative flex items-center gap-1 rounded-md pr-1.5 transition-colors",
          active ? "bg-secondary text-foreground" : "hover:bg-secondary/60",
        )}
        style={{ paddingLeft: `${0.375 + node.depth * 0.85}rem` }}
      >
        {active && (
          <span className="bg-brand absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full" />
        )}
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          className={cn(
            "text-faint hover:text-foreground grid size-4 shrink-0 place-items-center",
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
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
        >
          <span className="grid size-4 shrink-0 place-items-center text-[13px]">
            {icon ?? <FileText className="text-faint size-3.5" />}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {title || "Untitled"}
          </span>
        </button>

        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/row:opacity-100">
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
          <button
            type="button"
            onClick={() => onDelete(node)}
            disabled={pending}
            className="text-faint hover:text-destructive hover:bg-secondary grid size-5 place-items-center rounded"
            aria-label="Delete page"
            title="Delete page"
          >
            <Trash2 className="size-3.5" />
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

function EmptyState({ hasAny, onCreate }: { hasAny: boolean; onCreate: () => void }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-sm text-center">
        <span className="bg-secondary/60 mx-auto grid size-14 place-items-center rounded-2xl border">
          <NotebookText className="text-faint size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">
          {hasAny ? "Select a page" : "Your workspace is empty"}
        </h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          {hasAny
            ? "Pick a page from the left, or create a new one to start writing."
            : "Create your first page in the Global Ventures teamspace, or in any client's teamspace on the left."}
        </p>
        {!hasAny && (
          <Button onClick={onCreate} className="mt-4">
            <Plus className="size-4" /> Create your first page
          </Button>
        )}
      </div>
    </div>
  );
}
