import type { CalcDef } from './types.ts';
import { INVEST } from './invest.ts';
import { LOANS } from './loans.ts';
import { BANKING } from './banking.ts';
import { RETIRE } from './retire.ts';
import { HEALTH } from './health.ts';
import { THINK } from './think.ts';
import { TAX } from './tax.ts';
import { TRADE } from './trade.ts';
import { DESI } from './desi.ts';

export * from './types.ts';
export const CALCS: CalcDef[] = [...INVEST, ...LOANS, ...BANKING, ...RETIRE, ...HEALTH, ...THINK, ...TAX, ...TRADE, ...DESI];
export const byId = (id: string) => CALCS.find(c => c.id === id);
