import { connectSandbox } from '../actions';
import { PLATFORM_NAME } from '../ui';
import { Select } from './select';

/** Practice accounts for sandbox mode: no OAuth, no real platform. */
export function SandboxConnect({ brandId, returnTo, preselect }: { brandId: string; returnTo: string; preselect?: string }) {
  return (
    <form action={connectSandbox} className="card stack staging">
      <div className="spread">
        <span className="label">Sandbox account</span>
        <span className="tag">No real platform</span>
      </div>
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="field">
          <label htmlFor="sbx-platform">Platform</label>
          <Select id="sbx-platform" name="platform" defaultValue={preselect ?? 'x'} options={Object.entries(PLATFORM_NAME).map(([k, v]) => ({ value: k, label: v }))} />
        </div>
        <div className="field">
          <label htmlFor="sbx-handle">Handle</label>
          <input id="sbx-handle" name="handle" required placeholder="@yourbrand" />
        </div>
      </div>
      <div><button className="primary" type="submit">Connect sandbox account</button></div>
    </form>
  );
}
