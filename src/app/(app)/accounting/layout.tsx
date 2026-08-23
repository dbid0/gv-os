import type { ReactNode } from "react";

import { AccountingTabs } from "@/components/accounting/accounting-tabs";

/**
 * Accounting shell: the two big lenses (Agency · Gross clients) mounted once,
 * so switching sides swaps only the content and the active tab glides.
 */
export default function AccountingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <AccountingTabs />
      {children}
    </div>
  );
}
