import { queryRef, executeQuery, validateArgsWithOptions, mutationRef, executeMutation, validateArgs, makeMemoryCacheProvider } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'the-hub-hackathon-service',
  location: 'us-east4'
};
export const dataConnectSettings = {
  cacheSettings: {
    cacheProvider: makeMemoryCacheProvider()
  }
};
export const insertNamedFloorPlanRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertNamedFloorPlan', inputVars);
}
insertNamedFloorPlanRef.operationName = 'InsertNamedFloorPlan';

export function insertNamedFloorPlan(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertNamedFloorPlanRef(dcInstance, inputVars));
}

export const updateFloorPlanDataRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateFloorPlanData', inputVars);
}
updateFloorPlanDataRef.operationName = 'UpdateFloorPlanData';

export function updateFloorPlanData(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateFloorPlanDataRef(dcInstance, inputVars));
}

export const setFloorPlanDeployedRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'SetFloorPlanDeployed', inputVars);
}
setFloorPlanDeployedRef.operationName = 'SetFloorPlanDeployed';

export function setFloorPlanDeployed(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(setFloorPlanDeployedRef(dcInstance, inputVars));
}

export const deleteFloorPlanByIdRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteFloorPlanById', inputVars);
}
deleteFloorPlanByIdRef.operationName = 'DeleteFloorPlanById';

export function deleteFloorPlanById(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteFloorPlanByIdRef(dcInstance, inputVars));
}

export const deleteAllFloorPlansRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteAllFloorPlans');
}
deleteAllFloorPlansRef.operationName = 'DeleteAllFloorPlans';

export function deleteAllFloorPlans(dc) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dc, undefined);
  return executeMutation(deleteAllFloorPlansRef(dcInstance, inputVars));
}

export const getAllFloorPlansMetaRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetAllFloorPlansMeta');
}
getAllFloorPlansMetaRef.operationName = 'GetAllFloorPlansMeta';

export function getAllFloorPlansMeta(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getAllFloorPlansMetaRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}

export const getFloorPlanByIdRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetFloorPlanById', inputVars);
}
getFloorPlanByIdRef.operationName = 'GetFloorPlanById';

export function getFloorPlanById(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(getFloorPlanByIdRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}

export const getDeployedFloorPlanRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetDeployedFloorPlan');
}
getDeployedFloorPlanRef.operationName = 'GetDeployedFloorPlan';

export function getDeployedFloorPlan(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getDeployedFloorPlanRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}

export const getAllFloorPlansRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetAllFloorPlans');
}
getAllFloorPlansRef.operationName = 'GetAllFloorPlans';

export function getAllFloorPlans(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getAllFloorPlansRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}

