const { queryRef, executeQuery, validateArgsWithOptions, mutationRef, executeMutation, validateArgs, makeMemoryCacheProvider } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'the-hub-hackathon-service',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;
const dataConnectSettings = {
  cacheSettings: {
    cacheProvider: makeMemoryCacheProvider()
  }
};
exports.dataConnectSettings = dataConnectSettings;

const insertNamedFloorPlanRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertNamedFloorPlan', inputVars);
}
insertNamedFloorPlanRef.operationName = 'InsertNamedFloorPlan';
exports.insertNamedFloorPlanRef = insertNamedFloorPlanRef;

exports.insertNamedFloorPlan = function insertNamedFloorPlan(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertNamedFloorPlanRef(dcInstance, inputVars));
}
;

const updateFloorPlanDataRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateFloorPlanData', inputVars);
}
updateFloorPlanDataRef.operationName = 'UpdateFloorPlanData';
exports.updateFloorPlanDataRef = updateFloorPlanDataRef;

exports.updateFloorPlanData = function updateFloorPlanData(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateFloorPlanDataRef(dcInstance, inputVars));
}
;

const setFloorPlanDeployedRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'SetFloorPlanDeployed', inputVars);
}
setFloorPlanDeployedRef.operationName = 'SetFloorPlanDeployed';
exports.setFloorPlanDeployedRef = setFloorPlanDeployedRef;

exports.setFloorPlanDeployed = function setFloorPlanDeployed(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(setFloorPlanDeployedRef(dcInstance, inputVars));
}
;

const deleteFloorPlanByIdRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteFloorPlanById', inputVars);
}
deleteFloorPlanByIdRef.operationName = 'DeleteFloorPlanById';
exports.deleteFloorPlanByIdRef = deleteFloorPlanByIdRef;

exports.deleteFloorPlanById = function deleteFloorPlanById(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteFloorPlanByIdRef(dcInstance, inputVars));
}
;

const deleteAllFloorPlansRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteAllFloorPlans');
}
deleteAllFloorPlansRef.operationName = 'DeleteAllFloorPlans';
exports.deleteAllFloorPlansRef = deleteAllFloorPlansRef;

exports.deleteAllFloorPlans = function deleteAllFloorPlans(dc) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dc, undefined);
  return executeMutation(deleteAllFloorPlansRef(dcInstance, inputVars));
}
;

const getAllFloorPlansMetaRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetAllFloorPlansMeta');
}
getAllFloorPlansMetaRef.operationName = 'GetAllFloorPlansMeta';
exports.getAllFloorPlansMetaRef = getAllFloorPlansMetaRef;

exports.getAllFloorPlansMeta = function getAllFloorPlansMeta(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getAllFloorPlansMetaRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const getFloorPlanByIdRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetFloorPlanById', inputVars);
}
getFloorPlanByIdRef.operationName = 'GetFloorPlanById';
exports.getFloorPlanByIdRef = getFloorPlanByIdRef;

exports.getFloorPlanById = function getFloorPlanById(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(getFloorPlanByIdRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const getDeployedFloorPlanRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetDeployedFloorPlan');
}
getDeployedFloorPlanRef.operationName = 'GetDeployedFloorPlan';
exports.getDeployedFloorPlanRef = getDeployedFloorPlanRef;

exports.getDeployedFloorPlan = function getDeployedFloorPlan(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getDeployedFloorPlanRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const getAllFloorPlansRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetAllFloorPlans');
}
getAllFloorPlansRef.operationName = 'GetAllFloorPlans';
exports.getAllFloorPlansRef = getAllFloorPlansRef;

exports.getAllFloorPlans = function getAllFloorPlans(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getAllFloorPlansRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;
