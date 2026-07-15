"use client";

import type { ReactNode } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export type HubTab = {
  value: string;
  icon: ReactNode;
  label: string;
  content: ReactNode;
};

// 두 화면을 탭으로 묶는 공용 허브. 자산·부채 / 정기지출 / 예산·목표 / 분석이
// 모두 이 한 컴포넌트를 써요.
export function TabHub({
  initialValue,
  tabs,
}: {
  initialValue: string;
  tabs: HubTab[];
}) {
  return (
    <Tabs className="space-y-5" defaultValue={initialValue}>
      <TabsList className="grid w-full max-w-sm grid-cols-2">
        {tabs.map((tab) => (
          <TabsTrigger className="gap-2" key={tab.value} value={tab.value}>
            {tab.icon}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
