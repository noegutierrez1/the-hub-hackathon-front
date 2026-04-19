import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise, DataConnectSettings } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;
export const dataConnectSettings: DataConnectSettings;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface DeleteAllFloorPlansData {
  floorPlan_deleteMany: number;
}

export interface DeleteFloorPlanByIdData {
  floorPlan_delete?: FloorPlan_Key | null;
}

export interface DeleteFloorPlanByIdVariables {
  id: UUIDString;
}

export interface EventCheckIn_Key {
  eventId: UUIDString;
  studentId: UUIDString;
  __typename?: 'EventCheckIn_Key';
}

export interface Event_Key {
  id: UUIDString;
  __typename?: 'Event_Key';
}

export interface FloorPlanShelf_Key {
  id: UUIDString;
  __typename?: 'FloorPlanShelf_Key';
}

export interface FloorPlan_Key {
  id: UUIDString;
  __typename?: 'FloorPlan_Key';
}

export interface GetAllFloorPlansData {
  floorPlans: ({
    id: UUIDString;
    name?: string | null;
    isDeployed?: boolean | null;
    shelves?: unknown | null;
    walls?: unknown | null;
    markers?: unknown | null;
    updatedAt?: TimestampString | null;
  } & FloorPlan_Key)[];
}

export interface GetAllFloorPlansMetaData {
  floorPlans: ({
    id: UUIDString;
    name?: string | null;
    isDeployed?: boolean | null;
    updatedAt?: TimestampString | null;
  } & FloorPlan_Key)[];
}

export interface GetDeployedFloorPlanData {
  floorPlans: ({
    id: UUIDString;
    name?: string | null;
    shelves?: unknown | null;
    walls?: unknown | null;
    markers?: unknown | null;
  } & FloorPlan_Key)[];
}

export interface GetFloorPlanByIdData {
  floorPlan?: {
    id: UUIDString;
    name?: string | null;
    isDeployed?: boolean | null;
    shelves?: unknown | null;
    walls?: unknown | null;
    markers?: unknown | null;
    updatedAt?: TimestampString | null;
  } & FloorPlan_Key;
}

export interface GetFloorPlanByIdVariables {
  id: UUIDString;
}

export interface HubInfo_Key {
  id: UUIDString;
  __typename?: 'HubInfo_Key';
}

export interface InsertNamedFloorPlanData {
  floorPlan_insert: FloorPlan_Key;
}

export interface InsertNamedFloorPlanVariables {
  name: string;
  shelves?: unknown | null;
  walls?: unknown | null;
  markers?: unknown | null;
}

export interface InventoryItem_Key {
  id: UUIDString;
  __typename?: 'InventoryItem_Key';
}

export interface SetFloorPlanDeployedData {
  floorPlan_update?: FloorPlan_Key | null;
}

export interface SetFloorPlanDeployedVariables {
  id: UUIDString;
  isDeployed: boolean;
}

export interface ShelfPhoto_Key {
  id: UUIDString;
  __typename?: 'ShelfPhoto_Key';
}

export interface Shelf_Key {
  id: UUIDString;
  __typename?: 'Shelf_Key';
}

export interface UpdateFloorPlanDataData {
  floorPlan_update?: FloorPlan_Key | null;
}

export interface UpdateFloorPlanDataVariables {
  id: UUIDString;
  shelves?: unknown | null;
  walls?: unknown | null;
  markers?: unknown | null;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface InsertNamedFloorPlanRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertNamedFloorPlanVariables): MutationRef<InsertNamedFloorPlanData, InsertNamedFloorPlanVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertNamedFloorPlanVariables): MutationRef<InsertNamedFloorPlanData, InsertNamedFloorPlanVariables>;
  operationName: string;
}
export const insertNamedFloorPlanRef: InsertNamedFloorPlanRef;

export function insertNamedFloorPlan(vars: InsertNamedFloorPlanVariables): MutationPromise<InsertNamedFloorPlanData, InsertNamedFloorPlanVariables>;
export function insertNamedFloorPlan(dc: DataConnect, vars: InsertNamedFloorPlanVariables): MutationPromise<InsertNamedFloorPlanData, InsertNamedFloorPlanVariables>;

interface UpdateFloorPlanDataRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateFloorPlanDataVariables): MutationRef<UpdateFloorPlanDataData, UpdateFloorPlanDataVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateFloorPlanDataVariables): MutationRef<UpdateFloorPlanDataData, UpdateFloorPlanDataVariables>;
  operationName: string;
}
export const updateFloorPlanDataRef: UpdateFloorPlanDataRef;

export function updateFloorPlanData(vars: UpdateFloorPlanDataVariables): MutationPromise<UpdateFloorPlanDataData, UpdateFloorPlanDataVariables>;
export function updateFloorPlanData(dc: DataConnect, vars: UpdateFloorPlanDataVariables): MutationPromise<UpdateFloorPlanDataData, UpdateFloorPlanDataVariables>;

interface SetFloorPlanDeployedRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: SetFloorPlanDeployedVariables): MutationRef<SetFloorPlanDeployedData, SetFloorPlanDeployedVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: SetFloorPlanDeployedVariables): MutationRef<SetFloorPlanDeployedData, SetFloorPlanDeployedVariables>;
  operationName: string;
}
export const setFloorPlanDeployedRef: SetFloorPlanDeployedRef;

export function setFloorPlanDeployed(vars: SetFloorPlanDeployedVariables): MutationPromise<SetFloorPlanDeployedData, SetFloorPlanDeployedVariables>;
export function setFloorPlanDeployed(dc: DataConnect, vars: SetFloorPlanDeployedVariables): MutationPromise<SetFloorPlanDeployedData, SetFloorPlanDeployedVariables>;

interface DeleteFloorPlanByIdRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteFloorPlanByIdVariables): MutationRef<DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteFloorPlanByIdVariables): MutationRef<DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables>;
  operationName: string;
}
export const deleteFloorPlanByIdRef: DeleteFloorPlanByIdRef;

export function deleteFloorPlanById(vars: DeleteFloorPlanByIdVariables): MutationPromise<DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables>;
export function deleteFloorPlanById(dc: DataConnect, vars: DeleteFloorPlanByIdVariables): MutationPromise<DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables>;

interface DeleteAllFloorPlansRef {
  /* Allow users to create refs without passing in DataConnect */
  (): MutationRef<DeleteAllFloorPlansData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): MutationRef<DeleteAllFloorPlansData, undefined>;
  operationName: string;
}
export const deleteAllFloorPlansRef: DeleteAllFloorPlansRef;

export function deleteAllFloorPlans(): MutationPromise<DeleteAllFloorPlansData, undefined>;
export function deleteAllFloorPlans(dc: DataConnect): MutationPromise<DeleteAllFloorPlansData, undefined>;

interface GetAllFloorPlansMetaRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetAllFloorPlansMetaData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetAllFloorPlansMetaData, undefined>;
  operationName: string;
}
export const getAllFloorPlansMetaRef: GetAllFloorPlansMetaRef;

export function getAllFloorPlansMeta(options?: ExecuteQueryOptions): QueryPromise<GetAllFloorPlansMetaData, undefined>;
export function getAllFloorPlansMeta(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetAllFloorPlansMetaData, undefined>;

interface GetFloorPlanByIdRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetFloorPlanByIdVariables): QueryRef<GetFloorPlanByIdData, GetFloorPlanByIdVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetFloorPlanByIdVariables): QueryRef<GetFloorPlanByIdData, GetFloorPlanByIdVariables>;
  operationName: string;
}
export const getFloorPlanByIdRef: GetFloorPlanByIdRef;

export function getFloorPlanById(vars: GetFloorPlanByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetFloorPlanByIdData, GetFloorPlanByIdVariables>;
export function getFloorPlanById(dc: DataConnect, vars: GetFloorPlanByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetFloorPlanByIdData, GetFloorPlanByIdVariables>;

interface GetDeployedFloorPlanRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetDeployedFloorPlanData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetDeployedFloorPlanData, undefined>;
  operationName: string;
}
export const getDeployedFloorPlanRef: GetDeployedFloorPlanRef;

export function getDeployedFloorPlan(options?: ExecuteQueryOptions): QueryPromise<GetDeployedFloorPlanData, undefined>;
export function getDeployedFloorPlan(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetDeployedFloorPlanData, undefined>;

interface GetAllFloorPlansRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetAllFloorPlansData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetAllFloorPlansData, undefined>;
  operationName: string;
}
export const getAllFloorPlansRef: GetAllFloorPlansRef;

export function getAllFloorPlans(options?: ExecuteQueryOptions): QueryPromise<GetAllFloorPlansData, undefined>;
export function getAllFloorPlans(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetAllFloorPlansData, undefined>;

