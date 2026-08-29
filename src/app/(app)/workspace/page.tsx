import { redirect } from "next/navigation";

/**
 * Workspace is no longer a top-level section — each client IS their workspace,
 * so docs live under the client (/clients/[slug]/workspace) and the agency's own
 * templates live at /clients/workspace. This legacy path just forwards there so
 * old links and prefetches don't dead-end.
 */
export default function WorkspaceRedirect() {
  redirect("/clients/workspace");
}
