import { Plan } from "@prisma/client";

export interface PlanLimits {
  members: number;
  documents: number;
  storageBytes: bigint;
}

export const planCatalog: Readonly<Record<Plan, PlanLimits>> = {
  [Plan.FREE]: {
    members: 5,
    documents: 100,
    storageBytes: 100n * 1024n * 1024n,
  },
  [Plan.PRO]: {
    members: 25,
    documents: 1_000,
    storageBytes: 5n * 1024n * 1024n * 1024n,
  },
  [Plan.TEAM]: {
    members: 250,
    documents: 10_000,
    storageBytes: 100n * 1024n * 1024n * 1024n,
  },
};
