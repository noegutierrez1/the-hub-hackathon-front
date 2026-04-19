# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetAllFloorPlansMeta*](#getallfloorplansmeta)
  - [*GetFloorPlanById*](#getfloorplanbyid)
  - [*GetDeployedFloorPlan*](#getdeployedfloorplan)
  - [*GetAllFloorPlans*](#getallfloorplans)
- [**Mutations**](#mutations)
  - [*InsertNamedFloorPlan*](#insertnamedfloorplan)
  - [*UpdateFloorPlanData*](#updatefloorplandata)
  - [*SetFloorPlanDeployed*](#setfloorplandeployed)
  - [*DeleteFloorPlanById*](#deletefloorplanbyid)
  - [*DeleteAllFloorPlans*](#deleteallfloorplans)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetAllFloorPlansMeta
You can execute the `GetAllFloorPlansMeta` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getAllFloorPlansMeta(options?: ExecuteQueryOptions): QueryPromise<GetAllFloorPlansMetaData, undefined>;

interface GetAllFloorPlansMetaRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetAllFloorPlansMetaData, undefined>;
}
export const getAllFloorPlansMetaRef: GetAllFloorPlansMetaRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getAllFloorPlansMeta(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetAllFloorPlansMetaData, undefined>;

interface GetAllFloorPlansMetaRef {
  ...
  (dc: DataConnect): QueryRef<GetAllFloorPlansMetaData, undefined>;
}
export const getAllFloorPlansMetaRef: GetAllFloorPlansMetaRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getAllFloorPlansMetaRef:
```typescript
const name = getAllFloorPlansMetaRef.operationName;
console.log(name);
```

### Variables
The `GetAllFloorPlansMeta` query has no variables.
### Return Type
Recall that executing the `GetAllFloorPlansMeta` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetAllFloorPlansMetaData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetAllFloorPlansMetaData {
  floorPlans: ({
    id: UUIDString;
    name?: string | null;
    isDeployed?: boolean | null;
    updatedAt?: TimestampString | null;
  } & FloorPlan_Key)[];
}
```
### Using `GetAllFloorPlansMeta`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getAllFloorPlansMeta } from '@dataconnect/generated';


// Call the `getAllFloorPlansMeta()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getAllFloorPlansMeta();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getAllFloorPlansMeta(dataConnect);

console.log(data.floorPlans);

// Or, you can use the `Promise` API.
getAllFloorPlansMeta().then((response) => {
  const data = response.data;
  console.log(data.floorPlans);
});
```

### Using `GetAllFloorPlansMeta`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getAllFloorPlansMetaRef } from '@dataconnect/generated';


// Call the `getAllFloorPlansMetaRef()` function to get a reference to the query.
const ref = getAllFloorPlansMetaRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getAllFloorPlansMetaRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.floorPlans);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.floorPlans);
});
```

## GetFloorPlanById
You can execute the `GetFloorPlanById` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getFloorPlanById(vars: GetFloorPlanByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetFloorPlanByIdData, GetFloorPlanByIdVariables>;

interface GetFloorPlanByIdRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetFloorPlanByIdVariables): QueryRef<GetFloorPlanByIdData, GetFloorPlanByIdVariables>;
}
export const getFloorPlanByIdRef: GetFloorPlanByIdRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getFloorPlanById(dc: DataConnect, vars: GetFloorPlanByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetFloorPlanByIdData, GetFloorPlanByIdVariables>;

interface GetFloorPlanByIdRef {
  ...
  (dc: DataConnect, vars: GetFloorPlanByIdVariables): QueryRef<GetFloorPlanByIdData, GetFloorPlanByIdVariables>;
}
export const getFloorPlanByIdRef: GetFloorPlanByIdRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getFloorPlanByIdRef:
```typescript
const name = getFloorPlanByIdRef.operationName;
console.log(name);
```

### Variables
The `GetFloorPlanById` query requires an argument of type `GetFloorPlanByIdVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetFloorPlanByIdVariables {
  id: UUIDString;
}
```
### Return Type
Recall that executing the `GetFloorPlanById` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetFloorPlanByIdData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetFloorPlanById`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getFloorPlanById, GetFloorPlanByIdVariables } from '@dataconnect/generated';

// The `GetFloorPlanById` query requires an argument of type `GetFloorPlanByIdVariables`:
const getFloorPlanByIdVars: GetFloorPlanByIdVariables = {
  id: ..., 
};

// Call the `getFloorPlanById()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getFloorPlanById(getFloorPlanByIdVars);
// Variables can be defined inline as well.
const { data } = await getFloorPlanById({ id: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getFloorPlanById(dataConnect, getFloorPlanByIdVars);

console.log(data.floorPlan);

// Or, you can use the `Promise` API.
getFloorPlanById(getFloorPlanByIdVars).then((response) => {
  const data = response.data;
  console.log(data.floorPlan);
});
```

### Using `GetFloorPlanById`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getFloorPlanByIdRef, GetFloorPlanByIdVariables } from '@dataconnect/generated';

// The `GetFloorPlanById` query requires an argument of type `GetFloorPlanByIdVariables`:
const getFloorPlanByIdVars: GetFloorPlanByIdVariables = {
  id: ..., 
};

// Call the `getFloorPlanByIdRef()` function to get a reference to the query.
const ref = getFloorPlanByIdRef(getFloorPlanByIdVars);
// Variables can be defined inline as well.
const ref = getFloorPlanByIdRef({ id: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getFloorPlanByIdRef(dataConnect, getFloorPlanByIdVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.floorPlan);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.floorPlan);
});
```

## GetDeployedFloorPlan
You can execute the `GetDeployedFloorPlan` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getDeployedFloorPlan(options?: ExecuteQueryOptions): QueryPromise<GetDeployedFloorPlanData, undefined>;

interface GetDeployedFloorPlanRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetDeployedFloorPlanData, undefined>;
}
export const getDeployedFloorPlanRef: GetDeployedFloorPlanRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getDeployedFloorPlan(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetDeployedFloorPlanData, undefined>;

interface GetDeployedFloorPlanRef {
  ...
  (dc: DataConnect): QueryRef<GetDeployedFloorPlanData, undefined>;
}
export const getDeployedFloorPlanRef: GetDeployedFloorPlanRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getDeployedFloorPlanRef:
```typescript
const name = getDeployedFloorPlanRef.operationName;
console.log(name);
```

### Variables
The `GetDeployedFloorPlan` query has no variables.
### Return Type
Recall that executing the `GetDeployedFloorPlan` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetDeployedFloorPlanData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetDeployedFloorPlanData {
  floorPlans: ({
    id: UUIDString;
    name?: string | null;
    shelves?: unknown | null;
    walls?: unknown | null;
    markers?: unknown | null;
  } & FloorPlan_Key)[];
}
```
### Using `GetDeployedFloorPlan`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getDeployedFloorPlan } from '@dataconnect/generated';


// Call the `getDeployedFloorPlan()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getDeployedFloorPlan();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getDeployedFloorPlan(dataConnect);

console.log(data.floorPlans);

// Or, you can use the `Promise` API.
getDeployedFloorPlan().then((response) => {
  const data = response.data;
  console.log(data.floorPlans);
});
```

### Using `GetDeployedFloorPlan`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getDeployedFloorPlanRef } from '@dataconnect/generated';


// Call the `getDeployedFloorPlanRef()` function to get a reference to the query.
const ref = getDeployedFloorPlanRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getDeployedFloorPlanRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.floorPlans);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.floorPlans);
});
```

## GetAllFloorPlans
You can execute the `GetAllFloorPlans` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getAllFloorPlans(options?: ExecuteQueryOptions): QueryPromise<GetAllFloorPlansData, undefined>;

interface GetAllFloorPlansRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetAllFloorPlansData, undefined>;
}
export const getAllFloorPlansRef: GetAllFloorPlansRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getAllFloorPlans(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetAllFloorPlansData, undefined>;

interface GetAllFloorPlansRef {
  ...
  (dc: DataConnect): QueryRef<GetAllFloorPlansData, undefined>;
}
export const getAllFloorPlansRef: GetAllFloorPlansRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getAllFloorPlansRef:
```typescript
const name = getAllFloorPlansRef.operationName;
console.log(name);
```

### Variables
The `GetAllFloorPlans` query has no variables.
### Return Type
Recall that executing the `GetAllFloorPlans` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetAllFloorPlansData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetAllFloorPlans`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getAllFloorPlans } from '@dataconnect/generated';


// Call the `getAllFloorPlans()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getAllFloorPlans();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getAllFloorPlans(dataConnect);

console.log(data.floorPlans);

// Or, you can use the `Promise` API.
getAllFloorPlans().then((response) => {
  const data = response.data;
  console.log(data.floorPlans);
});
```

### Using `GetAllFloorPlans`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getAllFloorPlansRef } from '@dataconnect/generated';


// Call the `getAllFloorPlansRef()` function to get a reference to the query.
const ref = getAllFloorPlansRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getAllFloorPlansRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.floorPlans);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.floorPlans);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## InsertNamedFloorPlan
You can execute the `InsertNamedFloorPlan` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
insertNamedFloorPlan(vars: InsertNamedFloorPlanVariables): MutationPromise<InsertNamedFloorPlanData, InsertNamedFloorPlanVariables>;

interface InsertNamedFloorPlanRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertNamedFloorPlanVariables): MutationRef<InsertNamedFloorPlanData, InsertNamedFloorPlanVariables>;
}
export const insertNamedFloorPlanRef: InsertNamedFloorPlanRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertNamedFloorPlan(dc: DataConnect, vars: InsertNamedFloorPlanVariables): MutationPromise<InsertNamedFloorPlanData, InsertNamedFloorPlanVariables>;

interface InsertNamedFloorPlanRef {
  ...
  (dc: DataConnect, vars: InsertNamedFloorPlanVariables): MutationRef<InsertNamedFloorPlanData, InsertNamedFloorPlanVariables>;
}
export const insertNamedFloorPlanRef: InsertNamedFloorPlanRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertNamedFloorPlanRef:
```typescript
const name = insertNamedFloorPlanRef.operationName;
console.log(name);
```

### Variables
The `InsertNamedFloorPlan` mutation requires an argument of type `InsertNamedFloorPlanVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertNamedFloorPlanVariables {
  name: string;
  shelves?: unknown | null;
  walls?: unknown | null;
  markers?: unknown | null;
}
```
### Return Type
Recall that executing the `InsertNamedFloorPlan` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertNamedFloorPlanData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertNamedFloorPlanData {
  floorPlan_insert: FloorPlan_Key;
}
```
### Using `InsertNamedFloorPlan`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertNamedFloorPlan, InsertNamedFloorPlanVariables } from '@dataconnect/generated';

// The `InsertNamedFloorPlan` mutation requires an argument of type `InsertNamedFloorPlanVariables`:
const insertNamedFloorPlanVars: InsertNamedFloorPlanVariables = {
  name: ..., 
  shelves: ..., // optional
  walls: ..., // optional
  markers: ..., // optional
};

// Call the `insertNamedFloorPlan()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertNamedFloorPlan(insertNamedFloorPlanVars);
// Variables can be defined inline as well.
const { data } = await insertNamedFloorPlan({ name: ..., shelves: ..., walls: ..., markers: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertNamedFloorPlan(dataConnect, insertNamedFloorPlanVars);

console.log(data.floorPlan_insert);

// Or, you can use the `Promise` API.
insertNamedFloorPlan(insertNamedFloorPlanVars).then((response) => {
  const data = response.data;
  console.log(data.floorPlan_insert);
});
```

### Using `InsertNamedFloorPlan`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertNamedFloorPlanRef, InsertNamedFloorPlanVariables } from '@dataconnect/generated';

// The `InsertNamedFloorPlan` mutation requires an argument of type `InsertNamedFloorPlanVariables`:
const insertNamedFloorPlanVars: InsertNamedFloorPlanVariables = {
  name: ..., 
  shelves: ..., // optional
  walls: ..., // optional
  markers: ..., // optional
};

// Call the `insertNamedFloorPlanRef()` function to get a reference to the mutation.
const ref = insertNamedFloorPlanRef(insertNamedFloorPlanVars);
// Variables can be defined inline as well.
const ref = insertNamedFloorPlanRef({ name: ..., shelves: ..., walls: ..., markers: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertNamedFloorPlanRef(dataConnect, insertNamedFloorPlanVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.floorPlan_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.floorPlan_insert);
});
```

## UpdateFloorPlanData
You can execute the `UpdateFloorPlanData` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateFloorPlanData(vars: UpdateFloorPlanDataVariables): MutationPromise<UpdateFloorPlanDataData, UpdateFloorPlanDataVariables>;

interface UpdateFloorPlanDataRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateFloorPlanDataVariables): MutationRef<UpdateFloorPlanDataData, UpdateFloorPlanDataVariables>;
}
export const updateFloorPlanDataRef: UpdateFloorPlanDataRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateFloorPlanData(dc: DataConnect, vars: UpdateFloorPlanDataVariables): MutationPromise<UpdateFloorPlanDataData, UpdateFloorPlanDataVariables>;

interface UpdateFloorPlanDataRef {
  ...
  (dc: DataConnect, vars: UpdateFloorPlanDataVariables): MutationRef<UpdateFloorPlanDataData, UpdateFloorPlanDataVariables>;
}
export const updateFloorPlanDataRef: UpdateFloorPlanDataRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateFloorPlanDataRef:
```typescript
const name = updateFloorPlanDataRef.operationName;
console.log(name);
```

### Variables
The `UpdateFloorPlanData` mutation requires an argument of type `UpdateFloorPlanDataVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateFloorPlanDataVariables {
  id: UUIDString;
  shelves?: unknown | null;
  walls?: unknown | null;
  markers?: unknown | null;
}
```
### Return Type
Recall that executing the `UpdateFloorPlanData` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateFloorPlanDataData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateFloorPlanDataData {
  floorPlan_update?: FloorPlan_Key | null;
}
```
### Using `UpdateFloorPlanData`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateFloorPlanData, UpdateFloorPlanDataVariables } from '@dataconnect/generated';

// The `UpdateFloorPlanData` mutation requires an argument of type `UpdateFloorPlanDataVariables`:
const updateFloorPlanDataVars: UpdateFloorPlanDataVariables = {
  id: ..., 
  shelves: ..., // optional
  walls: ..., // optional
  markers: ..., // optional
};

// Call the `updateFloorPlanData()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateFloorPlanData(updateFloorPlanDataVars);
// Variables can be defined inline as well.
const { data } = await updateFloorPlanData({ id: ..., shelves: ..., walls: ..., markers: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateFloorPlanData(dataConnect, updateFloorPlanDataVars);

console.log(data.floorPlan_update);

// Or, you can use the `Promise` API.
updateFloorPlanData(updateFloorPlanDataVars).then((response) => {
  const data = response.data;
  console.log(data.floorPlan_update);
});
```

### Using `UpdateFloorPlanData`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateFloorPlanDataRef, UpdateFloorPlanDataVariables } from '@dataconnect/generated';

// The `UpdateFloorPlanData` mutation requires an argument of type `UpdateFloorPlanDataVariables`:
const updateFloorPlanDataVars: UpdateFloorPlanDataVariables = {
  id: ..., 
  shelves: ..., // optional
  walls: ..., // optional
  markers: ..., // optional
};

// Call the `updateFloorPlanDataRef()` function to get a reference to the mutation.
const ref = updateFloorPlanDataRef(updateFloorPlanDataVars);
// Variables can be defined inline as well.
const ref = updateFloorPlanDataRef({ id: ..., shelves: ..., walls: ..., markers: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateFloorPlanDataRef(dataConnect, updateFloorPlanDataVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.floorPlan_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.floorPlan_update);
});
```

## SetFloorPlanDeployed
You can execute the `SetFloorPlanDeployed` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
setFloorPlanDeployed(vars: SetFloorPlanDeployedVariables): MutationPromise<SetFloorPlanDeployedData, SetFloorPlanDeployedVariables>;

interface SetFloorPlanDeployedRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: SetFloorPlanDeployedVariables): MutationRef<SetFloorPlanDeployedData, SetFloorPlanDeployedVariables>;
}
export const setFloorPlanDeployedRef: SetFloorPlanDeployedRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
setFloorPlanDeployed(dc: DataConnect, vars: SetFloorPlanDeployedVariables): MutationPromise<SetFloorPlanDeployedData, SetFloorPlanDeployedVariables>;

interface SetFloorPlanDeployedRef {
  ...
  (dc: DataConnect, vars: SetFloorPlanDeployedVariables): MutationRef<SetFloorPlanDeployedData, SetFloorPlanDeployedVariables>;
}
export const setFloorPlanDeployedRef: SetFloorPlanDeployedRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the setFloorPlanDeployedRef:
```typescript
const name = setFloorPlanDeployedRef.operationName;
console.log(name);
```

### Variables
The `SetFloorPlanDeployed` mutation requires an argument of type `SetFloorPlanDeployedVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface SetFloorPlanDeployedVariables {
  id: UUIDString;
  isDeployed: boolean;
}
```
### Return Type
Recall that executing the `SetFloorPlanDeployed` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `SetFloorPlanDeployedData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface SetFloorPlanDeployedData {
  floorPlan_update?: FloorPlan_Key | null;
}
```
### Using `SetFloorPlanDeployed`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, setFloorPlanDeployed, SetFloorPlanDeployedVariables } from '@dataconnect/generated';

// The `SetFloorPlanDeployed` mutation requires an argument of type `SetFloorPlanDeployedVariables`:
const setFloorPlanDeployedVars: SetFloorPlanDeployedVariables = {
  id: ..., 
  isDeployed: ..., 
};

// Call the `setFloorPlanDeployed()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await setFloorPlanDeployed(setFloorPlanDeployedVars);
// Variables can be defined inline as well.
const { data } = await setFloorPlanDeployed({ id: ..., isDeployed: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await setFloorPlanDeployed(dataConnect, setFloorPlanDeployedVars);

console.log(data.floorPlan_update);

// Or, you can use the `Promise` API.
setFloorPlanDeployed(setFloorPlanDeployedVars).then((response) => {
  const data = response.data;
  console.log(data.floorPlan_update);
});
```

### Using `SetFloorPlanDeployed`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, setFloorPlanDeployedRef, SetFloorPlanDeployedVariables } from '@dataconnect/generated';

// The `SetFloorPlanDeployed` mutation requires an argument of type `SetFloorPlanDeployedVariables`:
const setFloorPlanDeployedVars: SetFloorPlanDeployedVariables = {
  id: ..., 
  isDeployed: ..., 
};

// Call the `setFloorPlanDeployedRef()` function to get a reference to the mutation.
const ref = setFloorPlanDeployedRef(setFloorPlanDeployedVars);
// Variables can be defined inline as well.
const ref = setFloorPlanDeployedRef({ id: ..., isDeployed: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = setFloorPlanDeployedRef(dataConnect, setFloorPlanDeployedVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.floorPlan_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.floorPlan_update);
});
```

## DeleteFloorPlanById
You can execute the `DeleteFloorPlanById` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteFloorPlanById(vars: DeleteFloorPlanByIdVariables): MutationPromise<DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables>;

interface DeleteFloorPlanByIdRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteFloorPlanByIdVariables): MutationRef<DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables>;
}
export const deleteFloorPlanByIdRef: DeleteFloorPlanByIdRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteFloorPlanById(dc: DataConnect, vars: DeleteFloorPlanByIdVariables): MutationPromise<DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables>;

interface DeleteFloorPlanByIdRef {
  ...
  (dc: DataConnect, vars: DeleteFloorPlanByIdVariables): MutationRef<DeleteFloorPlanByIdData, DeleteFloorPlanByIdVariables>;
}
export const deleteFloorPlanByIdRef: DeleteFloorPlanByIdRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteFloorPlanByIdRef:
```typescript
const name = deleteFloorPlanByIdRef.operationName;
console.log(name);
```

### Variables
The `DeleteFloorPlanById` mutation requires an argument of type `DeleteFloorPlanByIdVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteFloorPlanByIdVariables {
  id: UUIDString;
}
```
### Return Type
Recall that executing the `DeleteFloorPlanById` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteFloorPlanByIdData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteFloorPlanByIdData {
  floorPlan_delete?: FloorPlan_Key | null;
}
```
### Using `DeleteFloorPlanById`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteFloorPlanById, DeleteFloorPlanByIdVariables } from '@dataconnect/generated';

// The `DeleteFloorPlanById` mutation requires an argument of type `DeleteFloorPlanByIdVariables`:
const deleteFloorPlanByIdVars: DeleteFloorPlanByIdVariables = {
  id: ..., 
};

// Call the `deleteFloorPlanById()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteFloorPlanById(deleteFloorPlanByIdVars);
// Variables can be defined inline as well.
const { data } = await deleteFloorPlanById({ id: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteFloorPlanById(dataConnect, deleteFloorPlanByIdVars);

console.log(data.floorPlan_delete);

// Or, you can use the `Promise` API.
deleteFloorPlanById(deleteFloorPlanByIdVars).then((response) => {
  const data = response.data;
  console.log(data.floorPlan_delete);
});
```

### Using `DeleteFloorPlanById`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteFloorPlanByIdRef, DeleteFloorPlanByIdVariables } from '@dataconnect/generated';

// The `DeleteFloorPlanById` mutation requires an argument of type `DeleteFloorPlanByIdVariables`:
const deleteFloorPlanByIdVars: DeleteFloorPlanByIdVariables = {
  id: ..., 
};

// Call the `deleteFloorPlanByIdRef()` function to get a reference to the mutation.
const ref = deleteFloorPlanByIdRef(deleteFloorPlanByIdVars);
// Variables can be defined inline as well.
const ref = deleteFloorPlanByIdRef({ id: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteFloorPlanByIdRef(dataConnect, deleteFloorPlanByIdVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.floorPlan_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.floorPlan_delete);
});
```

## DeleteAllFloorPlans
You can execute the `DeleteAllFloorPlans` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteAllFloorPlans(): MutationPromise<DeleteAllFloorPlansData, undefined>;

interface DeleteAllFloorPlansRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): MutationRef<DeleteAllFloorPlansData, undefined>;
}
export const deleteAllFloorPlansRef: DeleteAllFloorPlansRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteAllFloorPlans(dc: DataConnect): MutationPromise<DeleteAllFloorPlansData, undefined>;

interface DeleteAllFloorPlansRef {
  ...
  (dc: DataConnect): MutationRef<DeleteAllFloorPlansData, undefined>;
}
export const deleteAllFloorPlansRef: DeleteAllFloorPlansRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteAllFloorPlansRef:
```typescript
const name = deleteAllFloorPlansRef.operationName;
console.log(name);
```

### Variables
The `DeleteAllFloorPlans` mutation has no variables.
### Return Type
Recall that executing the `DeleteAllFloorPlans` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteAllFloorPlansData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteAllFloorPlansData {
  floorPlan_deleteMany: number;
}
```
### Using `DeleteAllFloorPlans`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteAllFloorPlans } from '@dataconnect/generated';


// Call the `deleteAllFloorPlans()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteAllFloorPlans();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteAllFloorPlans(dataConnect);

console.log(data.floorPlan_deleteMany);

// Or, you can use the `Promise` API.
deleteAllFloorPlans().then((response) => {
  const data = response.data;
  console.log(data.floorPlan_deleteMany);
});
```

### Using `DeleteAllFloorPlans`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteAllFloorPlansRef } from '@dataconnect/generated';


// Call the `deleteAllFloorPlansRef()` function to get a reference to the mutation.
const ref = deleteAllFloorPlansRef();

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteAllFloorPlansRef(dataConnect);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.floorPlan_deleteMany);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.floorPlan_deleteMany);
});
```

