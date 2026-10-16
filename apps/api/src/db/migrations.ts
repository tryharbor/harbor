import { init0001 } from './migrations/0001_init.ts';
import { publishing0002 } from './migrations/0002_publishing.ts';
import { studio0003 } from './migrations/0003_studio.ts';

export interface Migration {
  /** Never rename or edit a migration once it has run anywhere; add a new one instead. */
  id: string;
  statements: string[];
}

/** Applied in order by migrate() in client.ts. */
export const MIGRATIONS: Migration[] = [init0001, publishing0002, studio0003];
