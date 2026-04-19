import { InsertNamedFloorPlanData, InsertNamedFloorPlanVariables, UpdateFloorPlanDataData, UpdateFloorPlanDataVariables, SetFloorPlanDeployedData, SetFloorPlanDeployedVariables, DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables, DeleteAllFloorPlansData, GetAllFloorPlansMetaData, GetFloorPlanByIdData, GetFloorPlanByIdVariables, GetDeployedFloorPlanData, GetAllFloorPlansData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useInsertNamedFloorPlan(options?: useDataConnectMutationOptions<InsertNamedFloorPlanData, FirebaseError, InsertNamedFloorPlanVariables>): UseDataConnectMutationResult<InsertNamedFloorPlanData, InsertNamedFloorPlanVariables>;
export function useInsertNamedFloorPlan(dc: DataConnect, options?: useDataConnectMutationOptions<InsertNamedFloorPlanData, FirebaseError, InsertNamedFloorPlanVariables>): UseDataConnectMutationResult<InsertNamedFloorPlanData, InsertNamedFloorPlanVariables>;

export function useUpdateFloorPlanData(options?: useDataConnectMutationOptions<UpdateFloorPlanDataData, FirebaseError, UpdateFloorPlanDataVariables>): UseDataConnectMutationResult<UpdateFloorPlanDataData, UpdateFloorPlanDataVariables>;
export function useUpdateFloorPlanData(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateFloorPlanDataData, FirebaseError, UpdateFloorPlanDataVariables>): UseDataConnectMutationResult<UpdateFloorPlanDataData, UpdateFloorPlanDataVariables>;

export function useSetFloorPlanDeployed(options?: useDataConnectMutationOptions<SetFloorPlanDeployedData, FirebaseError, SetFloorPlanDeployedVariables>): UseDataConnectMutationResult<SetFloorPlanDeployedData, SetFloorPlanDeployedVariables>;
export function useSetFloorPlanDeployed(dc: DataConnect, options?: useDataConnectMutationOptions<SetFloorPlanDeployedData, FirebaseError, SetFloorPlanDeployedVariables>): UseDataConnectMutationResult<SetFloorPlanDeployedData, SetFloorPlanDeployedVariables>;

export function useDeleteFloorPlanById(options?: useDataConnectMutationOptions<DeleteFloorPlanByIdData, FirebaseError, DeleteFloorPlanByIdVariables>): UseDataConnectMutationResult<DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables>;
export function useDeleteFloorPlanById(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteFloorPlanByIdData, FirebaseError, DeleteFloorPlanByIdVariables>): UseDataConnectMutationResult<DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables>;

export function useDeleteAllFloorPlans(options?: useDataConnectMutationOptions<DeleteAllFloorPlansData, FirebaseError, void>): UseDataConnectMutationResult<DeleteAllFloorPlansData, undefined>;
export function useDeleteAllFloorPlans(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteAllFloorPlansData, FirebaseError, void>): UseDataConnectMutationResult<DeleteAllFloorPlansData, undefined>;

export function useGetAllFloorPlansMeta(options?: useDataConnectQueryOptions<GetAllFloorPlansMetaData>): UseDataConnectQueryResult<GetAllFloorPlansMetaData, undefined>;
export function useGetAllFloorPlansMeta(dc: DataConnect, options?: useDataConnectQueryOptions<GetAllFloorPlansMetaData>): UseDataConnectQueryResult<GetAllFloorPlansMetaData, undefined>;

export function useGetFloorPlanById(vars: GetFloorPlanByIdVariables, options?: useDataConnectQueryOptions<GetFloorPlanByIdData>): UseDataConnectQueryResult<GetFloorPlanByIdData, GetFloorPlanByIdVariables>;
export function useGetFloorPlanById(dc: DataConnect, vars: GetFloorPlanByIdVariables, options?: useDataConnectQueryOptions<GetFloorPlanByIdData>): UseDataConnectQueryResult<GetFloorPlanByIdData, GetFloorPlanByIdVariables>;

export function useGetDeployedFloorPlan(options?: useDataConnectQueryOptions<GetDeployedFloorPlanData>): UseDataConnectQueryResult<GetDeployedFloorPlanData, undefined>;
export function useGetDeployedFloorPlan(dc: DataConnect, options?: useDataConnectQueryOptions<GetDeployedFloorPlanData>): UseDataConnectQueryResult<GetDeployedFloorPlanData, undefined>;

export function useGetAllFloorPlans(options?: useDataConnectQueryOptions<GetAllFloorPlansData>): UseDataConnectQueryResult<GetAllFloorPlansData, undefined>;
export function useGetAllFloorPlans(dc: DataConnect, options?: useDataConnectQueryOptions<GetAllFloorPlansData>): UseDataConnectQueryResult<GetAllFloorPlansData, undefined>;
