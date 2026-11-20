// A token bucket: `burst` events at once, refilled at `ratePerSec`. One per socket per event type,
// so a misbehaving client can't flood its friends with typing or live events.
export function createBucket({ ratePerSec, burst }, now = Date.now) {
  let tokens = burst;
  let last = now();
  return function take() {
    const t = now();
    tokens = Math.min(burst, tokens + ((t - last) / 1000) * ratePerSec);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
