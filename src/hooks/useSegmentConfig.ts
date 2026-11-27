import { useMemo } from 'react';
import {
  getSegmentConfig,
  resolveTenantSegment,
} from '../services/segmentEngine';
import type { TenantContext } from '../types/finance';
import type { BusinessSegment, SegmentConfig } from '../types/segments';

export function useSegmentConfig(
  tenant?: Pick<TenantContext, 'businessSegment'> | null,
): {
  segment: BusinessSegment;
  config: SegmentConfig;
} {
  const segment = resolveTenantSegment(tenant);
  const config = useMemo(() => getSegmentConfig(segment), [segment]);
  return { segment, config };
}
