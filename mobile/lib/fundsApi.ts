// Wires the fund client to the real network and the host chosen in Settings.
import { ENDPOINTS } from '@/constants/endpoints';
import { fetchJSON } from '@/lib/holdingsStore';
import { makeFundsApi } from '@/lib/fundsClient';

export const fundsApi = makeFundsApi({ fetchJSON, base: () => ENDPOINTS.aryaAI });
