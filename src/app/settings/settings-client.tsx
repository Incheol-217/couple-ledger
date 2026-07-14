"use client";

import {
  Bot,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LinkIcon,
  Pencil,
  Plus,
  Tags,
  Trash2,
  UserRoundPlus,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import type { CategoryRow } from "@/app/m/new/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
  toggleCategoryActiveAction,
  updateDisplayNameAction,
  updateHouseholdNameAction,
  type CategoryActionResult,
} from "./actions";

const settingsTabs = [
  {
    description: "함께 쓰는 사람을 확인해요.",
    icon: UserRoundPlus,
    label: "멤버",
    value: "members",
  },
  {
    description: "지출과 수입을 나눠 봐요.",
    icon: Tags,
    label: "카테고리",
    value: "categories",
  },
  {
    description: "카드값이 빠져나갈 계좌를 정해요.",
    icon: WalletCards,
    label: "계좌 기본값",
    value: "accounts",
  },
  {
    description: "iPhone에서 바로 저장해요.",
    icon: LinkIcon,
    label: "단축어 연결",
    value: "shortcuts",
  },
  {
    description: "AI 소비 조언에 필요한 설정이에요.",
    icon: Bot,
    label: "AI 조언 설정",
    value: "ai",
  },
  {
    description: "서버 작업과 단축어에 써요.",
    icon: KeyRound,
    label: "비밀값",
    value: "secrets",
  },
] as const;

function SettingPanel({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
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

const categoryTypeLabels: Record<"expense" | "income", string> = {
  expense: "지출",
  income: "수입",
};

function resultClassName(result: CategoryActionResult | null) {
  if (!result) {
    return "hidden";
  }

  return result.ok
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-destructive/20 bg-destructive/10 text-destructive";
}

function CategoryRowItem({
  category,
  householdId,
  onResult,
}: {
  category: CategoryRow;
  householdId: string;
  onResult: (result: CategoryActionResult) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(category.name);
  const [isPending, startTransition] = useTransition();

  function runRename() {
    const trimmed = name.trim();

    if (!trimmed || trimmed === category.name) {
      setEditing(false);
      setName(category.name);
      return;
    }

    const formData = new FormData();
    formData.set("household_id", householdId);
    formData.set("category_id", category.id);
    formData.set("name", trimmed);

    startTransition(async () => {
      const result = await renameCategoryAction(formData);
      onResult(result);
      if (result.ok) {
        setEditing(false);
      }
    });
  }

  function runToggle() {
    const formData = new FormData();
    formData.set("household_id", householdId);
    formData.set("category_id", category.id);
    formData.set("is_active", category.is_active ? "false" : "true");

    startTransition(async () => {
      onResult(await toggleCategoryActiveAction(formData));
    });
  }

  function runDelete() {
    const formData = new FormData();
    formData.set("household_id", householdId);
    formData.set("category_id", category.id);

    startTransition(async () => {
      onResult(await deleteCategoryAction(formData));
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2",
        !category.is_active && "opacity-60",
      )}
    >
      {editing ? (
        <>
          <Input
            autoFocus
            className="h-8"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                runRename();
              }
              if (event.key === "Escape") {
                setEditing(false);
                setName(category.name);
              }
            }}
            value={name}
          />
          <Button
            aria-label="이름 저장"
            disabled={isPending}
            onClick={runRename}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Check className="size-4" aria-hidden="true" />
          </Button>
          <Button
            aria-label="취소"
            onClick={() => {
              setEditing(false);
              setName(category.name);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {category.name}
          </span>
          {!category.is_active ? (
            <Badge variant="outline">숨김</Badge>
          ) : null}
          <Button
            aria-label="이름 바꾸기"
            disabled={isPending}
            onClick={() => setEditing(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button
            aria-label={category.is_active ? "숨기기" : "다시 켜기"}
            disabled={isPending}
            onClick={runToggle}
            size="icon"
            type="button"
            variant="ghost"
          >
            {category.is_active ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </Button>
          {confirmingDelete ? (
            <>
              <Button
                disabled={isPending}
                onClick={runDelete}
                size="sm"
                type="button"
                variant="destructive"
              >
                정말 지울까요?
              </Button>
              <Button
                aria-label="지우기 취소"
                onClick={() => setConfirmingDelete(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <Button
              aria-label="지우기"
              disabled={isPending}
              onClick={() => setConfirmingDelete(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-4 text-destructive" aria-hidden="true" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function CategoryManager({
  categories,
  householdId,
}: {
  categories: CategoryRow[];
  householdId: string | null;
}) {
  const [result, setResult] = useState<CategoryActionResult | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"expense" | "income">("expense");
  const [isPending, startTransition] = useTransition();

  if (!householdId) {
    return (
      <InfoList
        items={["가계부 멤버 연결을 마치면 카테고리를 관리할 수 있어요."]}
      />
    );
  }

  function runCreate() {
    const trimmed = newName.trim();

    if (!trimmed) {
      setResult({ ok: false, message: "카테고리 이름을 입력해 주세요." });
      return;
    }

    const formData = new FormData();
    formData.set("household_id", householdId as string);
    formData.set("name", trimmed);
    formData.set("type", newType);

    startTransition(async () => {
      const actionResult = await createCategoryAction(formData);
      setResult(actionResult);
      if (actionResult.ok) {
        setNewName("");
      }
    });
  }

  const expenseCategories = categories.filter(
    (category) => category.type === "expense",
  );
  const incomeCategories = categories.filter(
    (category) => category.type === "income",
  );

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "rounded-md border px-3 py-2 text-sm",
          resultClassName(result),
        )}
      >
        {result?.message}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          aria-label="카테고리 종류"
          className="sm:w-32"
          onChange={(event) =>
            setNewType(event.target.value as "expense" | "income")
          }
          value={newType}
        >
          <option value="expense">지출</option>
          <option value="income">수입</option>
        </Select>
        <Input
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runCreate();
            }
          }}
          placeholder="새 카테고리 이름 (예: 용돈)"
          value={newName}
        />
        <Button disabled={isPending} onClick={runCreate} type="button">
          <Plus className="size-4" aria-hidden="true" />
          추가
        </Button>
      </div>

      {(["expense", "income"] as const).map((type) => {
        const list = type === "expense" ? expenseCategories : incomeCategories;

        return (
          <div className="space-y-2" key={type}>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">
                {categoryTypeLabels[type]} 카테고리
              </h3>
              <Badge variant="secondary">{list.length}개</Badge>
            </div>
            {list.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((category) => (
                  <CategoryRowItem
                    category={category}
                    householdId={householdId}
                    key={category.id}
                    onResult={setResult}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                아직 {categoryTypeLabels[type]} 카테고리가 없어요. 위에서
                추가해 보세요.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SavableTextSetting({
  action,
  defaultValue,
  description,
  disabled,
  householdId,
  id,
  label,
  placeholder,
}: {
  action: (formData: FormData) => Promise<CategoryActionResult>;
  defaultValue: string;
  description?: string;
  disabled?: boolean;
  householdId: string;
  id: string;
  label: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [result, setResult] = useState<CategoryActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const trimmed = value.trim();

    if (!trimmed) {
      setResult({ ok: false, message: "값을 입력해 주세요." });
      return;
    }

    const formData = new FormData();
    formData.set("household_id", householdId);
    formData.set("name", trimmed);

    startTransition(async () => {
      setResult(await action(formData));
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          disabled={disabled || isPending}
          id={id}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
        <Button
          disabled={disabled || isPending}
          onClick={submit}
          type="button"
        >
          저장
        </Button>
      </div>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      {result ? (
        <p
          className={cn(
            "text-xs",
            result.ok ? "text-primary" : "text-destructive",
          )}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근이 막히면 조용히 무시해요.
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
          {value}
        </code>
        <Button onClick={copy} size="sm" type="button" variant="outline">
          {copied ? "복사됨" : "복사"}
        </Button>
      </div>
    </div>
  );
}

export function SettingsClient({
  categories,
  displayName,
  householdId,
  householdName,
  isAdmin,
  memberLabel,
  userId,
}: {
  categories: CategoryRow[];
  displayName: string | null;
  householdId: string | null;
  householdName: string | null;
  isAdmin: boolean;
  memberLabel: "husband" | "wife" | null;
  userId: string | null;
}) {
  return (
    <Tabs
      className="grid gap-4 lg:grid-cols-[280px_1fr]"
      defaultValue="members"
    >
      <TabsList className="h-auto w-full flex-col items-stretch gap-1 rounded-lg border bg-card p-1 text-left text-foreground shadow-sm">
        {settingsTabs.map((item) => {
          const Icon = item.icon;

          return (
            <TabsTrigger
              className="group h-auto w-full justify-start gap-3 rounded-md px-3 py-3 text-left text-foreground/80 hover:bg-muted/45 hover:text-foreground aria-selected:text-primary-foreground"
              key={item.value}
              value={item.value}
            >
              <Icon
                className="size-4 shrink-0 text-foreground/70 group-aria-selected:text-primary-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block font-medium text-foreground group-aria-selected:text-primary-foreground">
                  {item.label}
                </span>
                <span className="mt-1 block whitespace-normal text-xs font-normal text-muted-foreground group-aria-selected:text-primary-foreground/75">
                  {item.description}
                </span>
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="members">
        <SettingPanel
          description="가계부 이름과 내 표시 이름을 정해요."
          title="가계부 · 이름"
        >
          {householdId ? (
            <div className="space-y-5">
              <SavableTextSetting
                action={updateHouseholdNameAction}
                defaultValue={householdName ?? ""}
                description={
                  isAdmin
                    ? "부부 공용 가계부 이름이에요. 상단 로고 옆과 여러 화면에 보여요."
                    : "가계부 이름은 관리자 계정에서 바꿀 수 있어요."
                }
                disabled={!isAdmin}
                householdId={householdId}
                id="household-name"
                label="가계부 이름"
                placeholder="우리집 공동 가계부"
              />
              <SavableTextSetting
                action={updateDisplayNameAction}
                defaultValue={displayName ?? ""}
                description={`거래 담당자 등에 표시되는 내 이름이에요.${
                  memberLabel
                    ? ` (기본값: ${memberLabel === "husband" ? "남편" : "아내"})`
                    : ""
                }`}
                householdId={householdId}
                id="display-name"
                label="내 표시 이름"
                placeholder="이름을 입력하세요"
              />
            </div>
          ) : (
            <InfoList
              items={["가계부 멤버 연결을 마치면 이름을 설정할 수 있어요."]}
            />
          )}
        </SettingPanel>
      </TabsContent>

      <TabsContent value="categories">
        <SettingPanel
          description="지출·수입 카테고리를 추가하고, 이름을 바꾸거나 숨기고 지울 수 있어요."
          title="카테고리"
        >
          <CategoryManager categories={categories} householdId={householdId} />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="accounts">
        <SettingPanel
          action={
            <Button asChild variant="outline">
              <Link href="/accounts">
                <WalletCards className="size-4" aria-hidden="true" />
                계좌 보러 가기
              </Link>
            </Button>
          }
          description="카드값이 빠지는 계좌와 순서를 정해요."
          title="계좌 기본값"
        >
          <InfoList
            items={[
              "계좌와 카드는 계좌 화면에서 추가하고 고칠 수 있어요.",
              "카드는 카드값이 빠지는 계좌를 고를 수 있어요.",
              "숨긴 계좌는 새 거래 입력 목록에서 빠져요.",
            ]}
          />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="shortcuts">
        <SettingPanel
          description="iPhone에서 거래를 빠르게 보내는 설정이에요."
          title="단축어 연결"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">POST</Badge>
              <Badge variant="outline">/api/shortcuts/transactions</Badge>
            </div>
            {householdId && userId ? (
              <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
                <p className="text-sm font-medium">단축어에 넣을 값</p>
                <CopyField label="household_id" value={householdId} />
                <CopyField label="user_id (내 계정)" value={userId} />
                <p className="text-xs text-muted-foreground">
                  이 값은 비밀번호가 아니에요. shortcut_secret만 별도로 안전하게
                  넣어주세요.
                </p>
              </div>
            ) : null}
            <InfoList
              items={[
                "Vercel의 SHORTCUTS_WEBHOOK_SECRET과 단축어의 shortcut_secret을 같게 넣어주세요.",
                "요청에는 household_id, user_id, amount, type, account가 필요해요.",
                "새 카테고리 이름이 오면 바로 만들어요.",
              ]}
            />
          </div>
        </SettingPanel>
      </TabsContent>

      <TabsContent value="ai">
        <SettingPanel
          description="AI에는 요약 데이터만 보내요."
          title="AI 조언 설정"
        >
          <InfoList
            items={[
              "Vercel에 OPENAI_API_KEY를 넣으면 AI 조언을 만들 수 있어요.",
              "OPENAI_MODEL 기본값은 gpt-4o-mini예요.",
              "AI 조언은 투자, 대출, 세금, 법률 조언을 하지 않아요.",
            ]}
          />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="secrets">
        <SettingPanel
          description="서버 작업에 필요한 비밀값이에요."
          title="비밀값"
        >
          <InfoList
            items={[
              "JOB_SECRET은 반복 거래를 직접 만들 때 써요.",
              "SHORTCUTS_WEBHOOK_SECRET과 JOB_SECRET은 서로 다르게 두는 편이 안전해요.",
              "비밀값은 GitHub에 올리지 말고 Vercel 환경변수에만 저장해요.",
            ]}
          />
        </SettingPanel>
      </TabsContent>
    </Tabs>
  );
}
