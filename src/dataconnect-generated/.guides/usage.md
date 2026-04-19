# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useInsertNamedFloorPlan, useUpdateFloorPlanData, useSetFloorPlanDeployed, useDeleteFloorPlanById, useDeleteAllFloorPlans, useGetAllFloorPlansMeta, useGetFloorPlanById, useGetDeployedFloorPlan, useGetAllFloorPlans } from '@dataconnect/generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useInsertNamedFloorPlan(insertNamedFloorPlanVars);

const { data, isPending, isSuccess, isError, error } = useUpdateFloorPlanData(updateFloorPlanDataVars);

const { data, isPending, isSuccess, isError, error } = useSetFloorPlanDeployed(setFloorPlanDeployedVars);

const { data, isPending, isSuccess, isError, error } = useDeleteFloorPlanById(deleteFloorPlanByIdVars);

const { data, isPending, isSuccess, isError, error } = useDeleteAllFloorPlans();

const { data, isPending, isSuccess, isError, error } = useGetAllFloorPlansMeta();

const { data, isPending, isSuccess, isError, error } = useGetFloorPlanById(getFloorPlanByIdVars);

const { data, isPending, isSuccess, isError, error } = useGetDeployedFloorPlan();

const { data, isPending, isSuccess, isError, error } = useGetAllFloorPlans();

```

Here's an example from a different generated SDK:

```ts
import { useListAllMovies } from '@dataconnect/generated/react';

function MyComponent() {
  const { isLoading, data, error } = useListAllMovies();
  if(isLoading) {
    return <div>Loading...</div>
  }
  if(error) {
    return <div> An Error Occurred: {error} </div>
  }
}

// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyComponent from './my-component';

function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
}
```



## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { insertNamedFloorPlan, updateFloorPlanData, setFloorPlanDeployed, deleteFloorPlanById, deleteAllFloorPlans, getAllFloorPlansMeta, getFloorPlanById, getDeployedFloorPlan, getAllFloorPlans } from '@dataconnect/generated';


// Operation InsertNamedFloorPlan:  For variables, look at type InsertNamedFloorPlanVars in ../index.d.ts
const { data } = await InsertNamedFloorPlan(dataConnect, insertNamedFloorPlanVars);

// Operation UpdateFloorPlanData:  For variables, look at type UpdateFloorPlanDataVars in ../index.d.ts
const { data } = await UpdateFloorPlanData(dataConnect, updateFloorPlanDataVars);

// Operation SetFloorPlanDeployed:  For variables, look at type SetFloorPlanDeployedVars in ../index.d.ts
const { data } = await SetFloorPlanDeployed(dataConnect, setFloorPlanDeployedVars);

// Operation DeleteFloorPlanById:  For variables, look at type DeleteFloorPlanByIdVars in ../index.d.ts
const { data } = await DeleteFloorPlanById(dataConnect, deleteFloorPlanByIdVars);

// Operation DeleteAllFloorPlans: 
const { data } = await DeleteAllFloorPlans(dataConnect);

// Operation GetAllFloorPlansMeta: 
const { data } = await GetAllFloorPlansMeta(dataConnect);

// Operation GetFloorPlanById:  For variables, look at type GetFloorPlanByIdVars in ../index.d.ts
const { data } = await GetFloorPlanById(dataConnect, getFloorPlanByIdVars);

// Operation GetDeployedFloorPlan: 
const { data } = await GetDeployedFloorPlan(dataConnect);

// Operation GetAllFloorPlans: 
const { data } = await GetAllFloorPlans(dataConnect);


```