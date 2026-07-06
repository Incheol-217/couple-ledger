"use client";

import {
  Bot,
  KeyRound,
  LinkIcon,
  Tags,
  UserRoundPlus,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const settingsTabs = [
  {
    description: "부부가 함께 쓰는 household 멤버를 확인합니다.",
    icon: UserRoundPlus,
    label: "부부 멤버",
    value: "members",
  },
  {
    description: "지출과 수입을 묶어 볼 기준입니다.",
    icon: Tags,
    label: "카테고리",
    value: "categories",
  },
  {
    description: "기본 결제수단과 카드 출금 계좌를 관리합니다.",
    icon: WalletCards,
    label: "계좌 기본값",
    value: "accounts",
  },
  {
    description: "iPhone 단축어에서 거래를 저장할 때 사용합니다.",
    icon: LinkIcon,
    label: "iOS Shortcuts webhook",
    value: "shortcuts",
  },
  {
    description: "소비 조언 생성에 필요한 AI 설정입니다.",
    icon: Bot,
    label: "AI 조언 설정",
    value: "ai",
  },
  {
    description: "서버 작업과 단축어 인증에 쓰는 비밀값입니다.",
    icon: KeyRound,
    label: "비밀키",
    value: "secrets",
  },
] as const;

function SettingPanel({
  action,
  children,
  description,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function InfoList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 text-sm text-muted-foreground">
      {items.map((item) => (
        <li className="rounded-md border bg-muted/20 px-4 py-3" key={item}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function SettingsClient() {
  return (
    <Tabs
      className="grid gap-4 lg:grid-cols-[280px_1fr]"
      defaultValue="members"
    >
      <TabsList className="h-auto w-full flex-col items-stretch gap-1 rounded-lg border bg-card p-1 text-left shadow-sm">
        {settingsTabs.map((item) => {
          const Icon = item.icon;

          return (
            <TabsTrigger
              className="h-auto w-full justify-start gap-3 rounded-md px-3 py-3 text-left"
              key={item.value}
              value={item.value}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-medium">{item.label}</span>
                <span className="mt-1 block whitespace-normal text-xs font-normal text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="members">
        <SettingPanel
          description="초대와 권한 관리는 다음 버전에서 화면으로 연결할 예정입니다."
          title="부부 멤버"
        >
          <InfoList
            items={[
              "현재 데이터는 household 단위로 분리됩니다.",
              "household_members에 속한 사용자만 계좌, 거래, 반복 항목을 볼 수 있습니다.",
              "새 멤버 초대 UI는 아직 준비 중입니다.",
            ]}
          />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="categories">
        <SettingPanel
          description="모바일 입력과 대시보드 차트에서 함께 사용됩니다."
          title="카테고리"
        >
          <InfoList
            items={[
              "모바일 입력이나 Shortcuts webhook에서 새 카테고리를 만들 수 있습니다.",
              "같은 household 안에서 같은 타입과 이름의 카테고리는 중복 생성되지 않습니다.",
              "전용 카테고리 관리 화면은 다음 단계에서 추가하면 됩니다.",
            ]}
          />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="accounts">
        <SettingPanel
          action={
            <Button asChild variant="outline">
              <Link href="/accounts">
                <WalletCards className="size-4" aria-hidden="true" />
                계좌 관리
              </Link>
            </Button>
          }
          description="카드의 기본 출금 계좌와 표시 순서를 관리합니다."
          title="계좌 기본값"
        >
          <InfoList
            items={[
              "계좌와 결제수단은 /accounts 화면에서 추가하고 수정합니다.",
              "카드 계좌는 기본 출금 계좌를 선택할 수 있습니다.",
              "비활성화한 계좌는 새 거래 입력 목록에서 제외됩니다.",
            ]}
          />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="shortcuts">
        <SettingPanel
          description="iPhone에서 빠르게 거래를 보내는 webhook 설정입니다."
          title="iOS Shortcuts webhook"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">POST</Badge>
              <Badge variant="outline">/api/shortcuts/transactions</Badge>
            </div>
            <InfoList
              items={[
                "Vercel 환경변수 SHORTCUTS_WEBHOOK_SECRET과 단축어의 shortcut_secret이 같아야 합니다.",
                "요청에는 household_id, user_id, amount, type, account가 필요합니다.",
                "카테고리 이름이 없으면 미분류로 저장되고, 이름이 있는데 없으면 새로 생성됩니다.",
              ]}
            />
          </div>
        </SettingPanel>
      </TabsContent>

      <TabsContent value="ai">
        <SettingPanel
          description="AI에는 원본 거래가 아니라 요약 데이터만 전달합니다."
          title="AI 조언 설정"
        >
          <InfoList
            items={[
              "Vercel 환경변수 OPENAI_API_KEY가 있어야 AI 조언 API가 동작합니다.",
              "OPENAI_MODEL 기본값은 gpt-4o-mini입니다.",
              "AI 조언은 투자, 대출, 세금, 법률 조언을 하지 않도록 제한되어 있습니다.",
            ]}
          />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="secrets">
        <SettingPanel
          description="서버 작업에 필요한 비밀값입니다."
          title="비밀키"
        >
          <InfoList
            items={[
              "JOB_SECRET은 반복 거래 생성 작업을 수동 실행할 때 사용합니다.",
              "SHORTCUTS_WEBHOOK_SECRET과 JOB_SECRET은 서로 다른 긴 문자열로 두는 편이 안전합니다.",
              "비밀키는 GitHub에 올리지 말고 Vercel 환경변수에만 저장하세요.",
            ]}
          />
        </SettingPanel>
      </TabsContent>
    </Tabs>
  );
}
