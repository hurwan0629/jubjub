import { getManagedPark, getParkChangeRequests } from '@/api/parks';

import { useApi } from './useApi';

export const useManagedPark = () => useApi(getManagedPark, [], { refreshMs: 5000 });
export const useParkChanges = () => useApi(getParkChangeRequests, [], { refreshMs: 5000 });
