'use client';

import { useEffect, useState } from 'react';

/** The viewer's timezone offset (minutes, like getTimezoneOffset), so the server reads a datetime-local value as their wall clock. */
export function TzInput() {
  const [tz, setTz] = useState('');
  useEffect(() => setTz(String(new Date().getTimezoneOffset())), []);
  return <input type="hidden" name="tz" value={tz} />;
}
