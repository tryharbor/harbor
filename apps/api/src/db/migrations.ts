import { init0001 } from './migrations/0001_init.ts';
import { publishing0002 } from './migrations/0002_publishing.ts';
import { studio0003 } from './migrations/0003_studio.ts';
import { canvas0004 } from './migrations/0004_canvas.ts';
import { insights0005 } from './migrations/0005_insights.ts';
import { agents0006 } from './migrations/0006_agents.ts';
import { learning0007 } from './migrations/0007_learning.ts';

export interface Migration {
  /** Never rename or edit a migration once it has run anywhere; add a new one instead. */
  id: string;
  statements: string[];
}

/** Applied in order by migrate() in client.ts. */
export const MIGRATIONS: Migration[] = [init0001, publishing0002, studio0003, canvas0004, insights0005, agents0006, learning0007];
