import "server-only";

import type { ExecuteGraphqlResponse } from "firebase-admin/data-connect";

import { getDataConnectAdmin } from "./data-connect-admin";
import type { HubInfoRow } from "./types";

export type { HubInfoRow } from "./types";

const LIST_HUBS_GQL = `
  query ListHubInfosForApp {
    hubInfos {
      id
      name
      hoursOfOperation
      description
      location
      createdAt
      updatedAt
    }
  }
`;

const UPDATE_HUB_GQL = `
  mutation AdminUpdateHubInfo(
    $id: UUID!
    $name: String!
    $hoursOfOperation: String!
    $description: String
    $location: String
  ) {
    hubInfo_update(
      first: { where: { id: { eq: $id } } }
      data: {
        name: $name
        hoursOfOperation: $hoursOfOperation
        description: $description
        location: $location
        updatedAt_expr: "request.time"
      }
    )
  }
`;

type ListHubsData = { hubInfos: HubInfoRow[] };

export async function listHubInfos(): Promise<HubInfoRow[]> {
  const dc = getDataConnectAdmin();
  const res: ExecuteGraphqlResponse<ListHubsData> =
    await dc.executeGraphqlRead(LIST_HUBS_GQL, {
      operationName: "ListHubInfosForApp",
    });
  return res.data?.hubInfos ?? [];
}

export type UpdateHubInfoInput = {
  id: string;
  name: string;
  hoursOfOperation: string;
  description?: string | null;
  location?: string | null;
};

/**
 * Privileged update: called only after the API route has verified a staff `User` row.
 * Uses the Admin service GraphQL endpoint (no `@auth` evaluation — authorization is enforced in Next.js first).
 */
export async function adminUpdateHubInfo(input: UpdateHubInfoInput): Promise<void> {
  const dc = getDataConnectAdmin();
  await dc.executeGraphql(UPDATE_HUB_GQL, {
    operationName: "AdminUpdateHubInfo",
    variables: {
      id: input.id,
      name: input.name,
      hoursOfOperation: input.hoursOfOperation,
      description: input.description ?? null,
      location: input.location ?? null,
    },
  });
}
