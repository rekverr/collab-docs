"use client";

import { useCallback, useEffect, useState } from "react";
import { billingApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { BillingPlan, WorkspaceSubscription } from "../../lib/api/types";
import { useSession } from "../auth/session-provider";

const plans: ReadonlyArray<{
  plan: BillingPlan;
  label: string;
  summary: string;
}> = [
  { plan: "FREE", label: "Free", summary: "5 members · 100 documents · 100 MB" },
  { plan: "PRO", label: "Pro", summary: "25 members · 1,000 documents · 5 GB" },
  { plan: "TEAM", label: "Team", summary: "250 members · 10,000 documents · 100 GB" },
];

export function BillingSettings({
  workspaceId,
  canManage,
}: Readonly<{ workspaceId: string; canManage: boolean }>) {
  const { withAccessToken } = useSession();
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null>(null);
  const [pendingPlan, setPendingPlan] = useState<BillingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSubscription(await withAccessToken((token) => billingApi.current(token, workspaceId)));
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    }
  }, [withAccessToken, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changePlan(plan: BillingPlan) {
    setPendingPlan(plan);
    setError(null);
    try {
      const result = await withAccessToken((token) =>
        billingApi.checkout(token, workspaceId, plan),
      );
      setSubscription(result.subscription);
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setPendingPlan(null);
    }
  }

  if (subscription === null && error === null) {
    return (
      <section className="dashboard-card billing-card" aria-label="Loading billing settings">
        <span className="skeleton-line short" />
        <span className="skeleton-line" />
        <span className="skeleton-line medium" />
      </section>
    );
  }

  return (
    <section className="dashboard-card billing-card">
      <div className="billing-heading">
        <h2>Plan and usage</h2>
        {subscription !== null && <span className="dashboard-badge">{subscription.plan}</span>}
      </div>

      {subscription !== null && (
        <div className="billing-usage" aria-label="Workspace usage">
          <Usage
            label="Documents"
            used={subscription.documents.used}
            limit={subscription.documents.limit}
          />
          <Usage
            label="Members"
            used={subscription.members.used}
            limit={subscription.members.limit}
          />
          <Usage
            label="Storage"
            used={formatBytes(subscription.storage.usedBytes)}
            limit={formatBytes(subscription.storage.limitBytes)}
          />
        </div>
      )}

      {canManage ? (
        <div className="billing-plans" aria-label="Available plans">
          {plans.map((option) => {
            const current = subscription?.plan === option.plan;
            return (
              <div className={current ? "billing-plan current" : "billing-plan"} key={option.plan}>
                <div>
                  <strong>{option.label}</strong>
                  <span>{option.summary}</span>
                </div>
                <button
                  className="button secondary"
                  disabled={current || pendingPlan !== null}
                  type="button"
                  onClick={() => void changePlan(option.plan)}
                >
                  {current ? "Current" : pendingPlan === option.plan ? "Changing…" : "Choose"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted small">Only the workspace owner can manage billing.</p>
      )}

      {error !== null && (
        <div className="billing-error" role="alert">
          <p className="error-message small">{error}</p>
          {subscription === null && (
            <button className="text-button" type="button" onClick={() => void load()}>
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Usage({
  label,
  used,
  limit,
}: Readonly<{ label: string; used: number | string; limit: number | string }>) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {used} / {limit}
      </strong>
    </div>
  );
}

function formatBytes(value: string): string {
  const bytes = BigInt(value);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  let amount = bytes;
  while (amount >= 1024n && unit < units.length - 1) {
    amount /= 1024n;
    unit += 1;
  }
  return `${amount.toString()} ${units[unit]}`;
}
