"use client";

import { useState, useTransition } from "react";

import { saveOfferModel } from "@/app/(app)/clients/[slug]/actions";
import {
  OFFER_MODELS,
  OFFER_MODEL_LABEL,
  offerModelOf,
} from "@/lib/clients/offer-model";
import { useToast } from "@/components/ui/toast";

/**
 * What kind of offer this is.
 *
 * Asked at setup because it changes what the offer shows, not just how it is
 * labelled: a Base 44 offer never books a call, so its call tabs and the middle
 * of its funnel are not empty — they do not apply.
 */
export function OfferModelField({
  slug,
  model,
}: {
  slug: string;
  model: string | null;
}) {
  const [value, setValue] = useState(offerModelOf(model));
  const [pending, start] = useTransition();
  const { toast } = useToast();

  return (
    <div className="space-y-1.5">
      <label className="text-muted-foreground text-xs font-medium">Offer type</label>
      <select
        className="border-input h-9 w-full max-w-md rounded-md border bg-transparent px-3 text-sm"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = offerModelOf(e.target.value);
          setValue(next);
          start(async () => {
            try {
              await saveOfferModel(slug, next);
              toast({
                tone: "success",
                title: `Offer set to ${OFFER_MODEL_LABEL[next]}`,
              });
            } catch (err) {
              setValue(offerModelOf(model));
              toast({
                tone: "error",
                title: err instanceof Error ? err.message : "Could not save.",
              });
            }
          });
        }}
      >
        {OFFER_MODELS.map((m) => (
          <option key={m} value={m}>
            {OFFER_MODEL_LABEL[m]}
          </option>
        ))}
      </select>
      <p className="text-faint text-xs">
        Base 44 is sold without a call, so it tracks through the new-sale forms only —
        no booked calls, no end-of-call reports, and a funnel that runs straight from
        signing up to paying.
      </p>
    </div>
  );
}
