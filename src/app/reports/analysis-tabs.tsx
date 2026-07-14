"use client";

import { Calculator, FileText } from "lucide-react";
import { TaxClient } from "@/app/tax/tax-client";
import type { TaxPageData } from "@/app/tax/types";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ReportsClient } from "./reports-client";
import type { ReportPageData } from "./types";

export function AnalysisTabs({
  report,
  tax,
  initialView,
}: {
  report: ReportPageData;
  tax: TaxPageData;
  initialView: "reports" | "tax";
}) {
  return (
    <Tabs className="space-y-5" defaultValue={initialView}>
      <TabsList className="grid w-full max-w-sm grid-cols-2">
        <TabsTrigger className="gap-2" value="reports">
          <FileText className="size-4" aria-hidden="true" />
          보고서
        </TabsTrigger>
        <TabsTrigger className="gap-2" value="tax">
          <Calculator className="size-4" aria-hidden="true" />
          연말정산
        </TabsTrigger>
      </TabsList>

      <TabsContent value="reports">
        <ReportsClient {...report} />
      </TabsContent>
      <TabsContent value="tax">
        <TaxClient {...tax} />
      </TabsContent>
    </Tabs>
  );
}
