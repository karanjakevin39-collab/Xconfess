import { registerAs } from '@nestjs/config';

const DEFAULT_STALE_THRESHOLD_MINUTES = 30;

export default registerAs('tipping', () => ({
  tipVerificationStaleThresholdMinutes: parseInt(
    process.env.TIP_VERIFICATION_STALE_THRESHOLD_MINUTES ??
      String(DEFAULT_STALE_THRESHOLD_MINUTES),
    10,
  ),
}));
