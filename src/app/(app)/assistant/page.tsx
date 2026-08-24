import { PageHeader } from "@/components/shell/page-header";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { resolveAiViewer } from "@/lib/ai/context";
import { recentConversation } from "@/lib/ai/conversations";
import { aiFace } from "@/lib/ai/roles";
import { starterQuestionsForRole } from "@/lib/ai/starter-questions";

export const metadata = { title: "Assistant - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The AI assistant — ONE engine, the viewer's face.
 *
 * Scope is resolved from the app's existing role model + View-as (see
 * `resolveAiViewer`). Phase 1 is key-free: the starter chips pull straight from
 * the live read layers, and free-text falls back to an honest go-live state.
 * This route lives entirely outside the dashboard/sales/settings areas.
 */
export default async function AssistantPage() {
  const viewer = await resolveAiViewer();
  const face = aiFace(viewer.role);
  const starters = starterQuestionsForRole(viewer.role);
  const history = await recentConversation(viewer.profileId, viewer.role);

  const initialMessages = history.map((m) => {
    const results = m.toolResults as { headline?: string; details?: string[] } | null;
    return {
      id: m.id,
      role: m.role,
      headline:
        m.role === "assistant" && results?.headline ? results.headline : m.content,
      details:
        m.role === "assistant" && Array.isArray(results?.details)
          ? results.details
          : [],
    };
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={`Meet ${face.name}.`}
        highlight=""
        description={face.tagline}
      />
      <AssistantPanel
        faceName={face.name}
        role={viewer.role}
        starters={starters.map((s) => ({ toolId: s.toolId, prompt: s.prompt }))}
        initialMessages={initialMessages}
        previewing={viewer.previewing}
        repIsFallback={viewer.repIsFallback}
        repName={viewer.repName}
      />
    </div>
  );
}
