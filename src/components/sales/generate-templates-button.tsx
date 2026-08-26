"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { generateDefaultTemplates } from "@/lib/sales/actions";

/**
 * Seeds the standard EOD template for every team-role that has reps but no
 * template yet. One click; idempotent on the server.
 */
export function GenerateTemplatesButton({ missing }: { missing: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant={missing > 0 ? "default" : "outline"}
      disabled={pending}
      className="gap-2"
      onClick={() =>
        start(async () => {
          try {
            const { created } = await generateDefaultTemplates();
            toast({
              tone: created > 0 ? "success" : "info",
              title:
                created > 0
                  ? `Created ${created} default template${created === 1 ? "" : "s"}.`
                  : "Every team-role already has a template.",
            });
            router.refresh();
          } catch (e) {
            toast({
              tone: "error",
              title: e instanceof Error ? e.message : "Could not generate templates.",
            });
          }
        })
      }
    >
      <Wand2 className="size-3.5" />
      {pending ? "Generating…" : "Generate defaults"}
    </Button>
  );
}
