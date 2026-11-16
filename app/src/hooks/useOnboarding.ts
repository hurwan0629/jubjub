import { getManagedPark } from '@/api/parks';

import { useApi } from './useApi';

export const useManagedPark = () => useApi(getManagedPark, []);
